import { createInterface } from 'node:readline/promises';
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { getInstallId } from './install-id.js';
import { normalizeRepoUrl } from './bus.js';
import { installAutostart, startBackground, isRunning, ROOT } from './service.js';

const HTTPS_REPO = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+$/;
const quiet = { stdio: 'ignore', windowsHide: true };
const noPrompt = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
const BUS_NAME = 'tetherless-bus';
const BUS_FOLDERS = ['inbox', 'approvals', 'processing', 'outbox'];

/**
 * Reads answers one line at a time. This works the same for a terminal and for
 * piped input, and the line reader is closed around the browser sign-in.
 */
function openPrompt() {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  const lines = rl[Symbol.asyncIterator]();
  return {
    async ask(label, def = '') {
      process.stdout.write(def ? `${label} [${def}]: ` : `${label}: `);
      const { value, done } = await lines.next();
      if (done) {
        rl.close();
        console.log('\nSetup stopped: no more input.');
        process.exit(1);
      }
      return String(value).trim() || def;
    },
    close() { rl.close(); },
  };
}

/**
 * One-time setup. With GitHub CLI installed it does everything on the user's
 * own account: signs in, creates a private bus repo under that account, and
 * fills in .env. Without it (or if that fails), it asks for a bus repo by hand.
 */
export async function runSetup() {
  console.log('\nTetherless setup\n');
  let prompt = openPrompt();

  if (existsSync('.env')) {
    const overwrite = (await prompt.ask('.env already exists. Replace it? (y/N)', 'N')).toLowerCase();
    if (overwrite !== 'y') {
      prompt.close();
      console.log('Kept your existing .env.');
      return finish();
    }
  }

  // Step 1: GitHub CLI and sign-in.
  const hasGh = spawnSync('gh', ['--version'], quiet).status === 0;
  let login = '';
  if (hasGh) {
    const signedIn = spawnSync('gh', ['auth', 'status'], quiet).status === 0;
    if (!signedIn) {
      prompt.close(); // the browser sign-in needs the terminal
      console.log('Signing in to GitHub. Follow the browser steps shown below.\n');
      spawnSync('gh', ['auth', 'login', '--web', '-h', 'github.com', '-p', 'https'], { stdio: 'inherit', windowsHide: true });
      prompt = openPrompt();
    }
    spawnSync('gh', ['auth', 'setup-git'], quiet);
    login = spawnSync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8', windowsHide: true }).stdout.trim();
  } else {
    console.log('GitHub CLI (gh) is not installed, so the bus repo has to be set up by hand.');
    console.log('Install it from https://cli.github.com and run setup again to do it automatically.\n');
  }

  // Step 2: the bus repo. Created automatically on this account if possible, otherwise entered by hand.
  let repo = '';
  if (login) {
    const auto = (await prompt.ask(`Create your private bus repo "${login}/${BUS_NAME}" automatically? (Y/n)`, 'Y')).toLowerCase();
    if (auto !== 'n') {
      repo = createOwnBus(login);
      if (!repo) console.log('The automatic setup did not finish. Enter a bus repo by hand instead.\n');
    }
  }
  while (!repo) {
    const candidate = normalizeRepoUrl(await prompt.ask('Your PRIVATE bus repo (owner/repo)'));
    if (HTTPS_REPO.test(candidate)) repo = candidate;
    else console.log('  Enter it as owner/repo, or a github.com URL.');
  }

  const agentId = await prompt.ask('Name for this computer', hostname() || 'my-agent');
  const licenseKey = await prompt.ask('License key (press Enter to run on Free)', '');
  prompt.close();

  const reachable = spawnSync('git', ['ls-remote', repo], { encoding: 'utf8', windowsHide: true, env: noPrompt });
  console.log(reachable.status === 0
    ? 'Bus repo is reachable.'
    : 'Could not reach the bus repo yet. Check the name and that this GitHub account has access to it.');

  const env = [
    '# Written by `npm run setup`. Keep this file private.',
    `BUS_REPO=${repo}`,
    `AGENT_ID=${agentId}`,
    'POLL_INTERVAL=60',
    `LICENSE_KEY=${licenseKey}`,
    'COMMAND_ALLOWLIST=echo,ls,df,uptime',
    'HTTP_ALLOW_HOSTS=',
    'HTTP_TOKEN_ENVS=',
    '',
  ].join('\n');
  writeFileSync('.env', env, { mode: 0o600 });
  console.log('\nWrote .env');

  return finish();
}

/**
 * Makes sure <login>/tetherless-bus exists, is private, and has the folder layout
 * the agent expects. Returns the repo URL, or '' if anything failed.
 */
function createOwnBus(login) {
  const full = `${login}/${BUS_NAME}`;
  const url = `https://github.com/${full}`;

  const exists = spawnSync('gh', ['repo', 'view', full], quiet).status === 0;
  if (exists) {
    console.log(`Using your existing repo ${full}.`);
  } else {
    const created = spawnSync('gh', ['repo', 'create', full, '--private', '--description', 'Tetherless message bus'],
      { encoding: 'utf8', windowsHide: true, env: noPrompt });
    if (created.status !== 0) {
      console.log((created.stderr || created.stdout || 'Could not create the repo.').trim());
      return '';
    }
    console.log(`Created your private bus repo: ${full}`);
  }

  // Already has branches? Then it is set up, leave it alone.
  const heads = spawnSync('git', ['ls-remote', '--heads', `${url}.git`], { encoding: 'utf8', windowsHide: true, env: noPrompt });
  if (heads.status === 0 && heads.stdout.trim()) return url;

  return seedBus(url) ? url : '';
}

/** Pushes the folder layout (with .keep files) and a short README to an empty repo. */
function seedBus(url) {
  const seed = join(ROOT, 'data', 'seed');
  rmSync(seed, { recursive: true, force: true });
  mkdirSync(seed, { recursive: true });
  try {
    for (const d of BUS_FOLDERS) {
      mkdirSync(join(seed, d));
      writeFileSync(join(seed, d, '.keep'), '');
    }
    writeFileSync(join(seed, 'README.md'),
      '# Tetherless bus\n\nPrivate message bus for your Tetherless agents.\n' +
      '- inbox/: tasks to run\n- approvals/: approvals for sensitive tasks\n' +
      '- outbox/: results written by the agent\n');
    const git = (args) => execFileSync('git', [
      '-c', 'user.name=Tetherless', '-c', 'user.email=tetherless@localhost', ...args,
    ], { cwd: seed, encoding: 'utf8', windowsHide: true, env: noPrompt, stdio: ['ignore', 'pipe', 'pipe'] });
    git(['init', '-b', 'main']);
    git(['add', '-A']);
    git(['commit', '-m', 'Initial bus layout']);
    git(['remote', 'add', 'origin', `${url}.git`]);
    git(['push', '-u', 'origin', 'main']);
    return true;
  } catch (err) {
    const why = String(err.stderr || err.message).split('\n').find((l) => l.trim()) || err.message;
    console.log(`Could not set up the bus folders in ${url}: ${why.trim()}`);
    return false;
  } finally {
    rmSync(seed, { recursive: true, force: true });
  }
}

function finish() {
  const id = getInstallId();
  console.log(`\nYour install ID: ${id}`);
  console.log('Send this ID to the vendor to get a license key for this install.');

  const auto = installAutostart();
  console.log(auto.msg);

  const { started, pid } = startBackground();
  console.log(started ? `Tetherless is running in the background (pid ${pid}).`
    : (isRunning() ? `Tetherless is already running (pid ${pid}).` : 'Could not start Tetherless.'));
  console.log('Check it with:  npm run status      Stop it with:  npm run stop\n');
}
