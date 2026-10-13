#!/usr/bin/env node
import 'dotenv/config';
import { Bus } from './bus.js';
import { audit } from './audit.js';
import { runCommand } from './runners/command.js';
import { runHttp } from './runners/http.js';
import { resolvePlan } from './plan.js';
import { loadProRunners } from './pro-loader.js';
import { getInstallId } from './install-id.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const env = process.env;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const USAGE = 'data/usage.json';

// Runners in the public core. Paid runners come from the private Pro package.
const CORE_RUNNERS = { command: runCommand, http: runHttp };
const PAID_RUNNERS = ['browser', 'facebook'];
// Browser actions that change state on a site. These make a task need approval.
const MUTATING_ACTIONS = ['click', 'type', 'submit', 'upload'];
// Commands that act on the device (open things, take photos). Always need approval.
// `am` starts Android activities, so every run of it needs approval too.
const SENSITIVE_COMMANDS = new Set(['termux-open', 'termux-open-url', 'termux-camera-photo', 'am']);

let bus; // set in main()
let runners = { ...CORE_RUNNERS };
let proAttempted = false;

function bumpDailyUsage() {
  const today = new Date().toISOString().slice(0, 10);
  let u = { date: today, count: 0 };
  try { if (existsSync(USAGE)) u = JSON.parse(readFileSync(USAGE, 'utf8')); } catch {}
  if (u.date !== today) u = { date: today, count: 0 };
  u.count += 1;
  try { mkdirSync('data', { recursive: true }); writeFileSync(USAGE, JSON.stringify(u)); } catch {}
  return u.count;
}

/**
 * A task is sensitive if it declares itself so, or if it changes state:
 * browser clicks/typing, or any http call that is not GET/HEAD.
 */
function isSensitive(task) {
  if (task.sensitive === true) return true;
  // Device actions always need approval, whatever the task says about itself.
  if (task.type === 'command' && SENSITIVE_COMMANDS.has(task.command)) return true;
  if (task.type === 'browser') {
    return (task.steps || []).some((s) => MUTATING_ACTIONS.includes(s.action));
  }
  if (task.type === 'http') {
    return !['GET', 'HEAD'].includes(String(task.method || 'GET').toUpperCase());
  }
  return false;
}

function approvalPath(id) {
  return join(bus.dir, 'approvals', `${id}.approve`);
}

/** Each approval is good for one run. Consume it so it cannot unlock a later task. */
function consumeApproval(id) {
  const used = join(bus.dir, 'approvals', 'used');
  mkdirSync(used, { recursive: true });
  renameSync(approvalPath(id), join(used, `${id}.${Date.now()}.approve`));
}

async function handle(task, plan) {
  if (task._invalid) {
    audit('task_invalid', { file: task.file });
    bus.complete(task.file, { ok: false, error: 'invalid JSON' });
    return;
  }

  if (!ID_RE.test(String(task.id || ''))) {
    bus.claim(task.file);
    bus.complete(task.file, { ok: false, error: 'task id must be 1-64 chars: letters, digits, _ or -' });
    audit('task_rejected', { file: task.file });
    return;
  }

  // --- Plan gating for paid runners ---
  if (PAID_RUNNERS.includes(task.type) && !plan.runners.includes(task.type)) {
    bus.claim(task.file);
    bus.complete(task.file, { ok: false, error: `runner "${task.type}" requires the Trial or Pro plan` });
    audit('plan_blocked', { id: task.id, type: task.type, plan: plan.id });
    return;
  }

  const runner = runners[task.type];
  if (!runner) {
    bus.claim(task.file);
    const error = PAID_RUNNERS.includes(task.type)
      ? `runner "${task.type}" is not installed (Pro package missing or license invalid)`
      : `unknown task type: ${task.type}`;
    bus.complete(task.file, { ok: false, error });
    audit('task_refused', { id: task.id, type: task.type });
    return;
  }

  const sensitive = isSensitive(task);
  if (sensitive && !existsSync(approvalPath(task.id))) {
    audit('awaiting_approval', { id: task.id, file: task.file });
    return; // leave it in inbox until an approval file appears
  }

  const used = bumpDailyUsage();
  if (used > plan.maxTasksPerDay) {
    bus.claim(task.file);
    bus.complete(task.file, { ok: false, error: `daily task limit reached (${plan.maxTasksPerDay}) on ${plan.name} plan` });
    audit('plan_limit', { id: task.id, used, plan: plan.id });
    return;
  }

  bus.claim(task.file);
  if (sensitive) consumeApproval(task.id);
  audit('task_start', { id: task.id, type: task.type });
  try {
    const result = await runner(task, env);
    bus.complete(task.file, { ok: true, agent: env.AGENT_ID, finishedAt: new Date().toISOString(), result });
    audit('task_done', { id: task.id });
  } catch (err) {
    bus.complete(task.file, { ok: false, agent: env.AGENT_ID, error: err.message });
    audit('task_error', { id: task.id, error: err.message });
  }
}

async function cycle(plan) {
  bus.sync();
  if (plan.license && !proAttempted) {
    proAttempted = true; // load once per start; a new key takes effect on restart
    runners = { ...CORE_RUNNERS, ...(await loadProRunners(env)) };
  }
  for (const task of bus.pendingTasks()) {
    await handle(task, plan);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Print this install's ID for license requests, then exit.
  if (process.argv.includes('--install-id')) {
    console.log(getInstallId());
    return;
  }

  if (!env.BUS_REPO) {
    console.error('Set BUS_REPO in .env (your private bus repo). See .env.example.');
    process.exit(1);
  }
  bus = new Bus(env.BUS_REPO);
  bus.init();

  const installId = getInstallId();
  const first = resolvePlan(env);
  audit('agent_up', { id: env.AGENT_ID || 'agent', plan: first.name, install: installId });
  console.log(`Tetherless on the ${first.name} plan. Install ID: ${installId}`);

  if (process.argv.includes('--once')) { await cycle(first); return; }

  const requested = Number(env.POLL_INTERVAL) || 30;
  for (;;) {
    const plan = resolvePlan(env); // re-check each cycle so expiry takes effect
    await cycle(plan).catch((e) => audit('cycle_error', { error: e.message }));
    await sleep(Math.max(requested, plan.pollFloorSec) * 1000);
  }
}

main();
