import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Accepts any of these and turns them into the HTTPS form, which works with
 * `gh auth setup-git` and needs no SSH keys or host-key prompts:
 *   owner/repo
 *   github.com/owner/repo
 *   git@github.com:owner/repo.git
 *   https://github.com/owner/repo(.git)
 */
export function normalizeRepoUrl(url) {
  const u = String(url || '').trim().replace(/\/+$/, '');
  if (/^[\w.-]+\/[\w.-]+$/.test(u)) return `https://github.com/${u}`;
  const ssh = u.match(/^git@github\.com:(.+)$/);
  if (ssh) return `https://github.com/${ssh[1].replace(/\.git$/, '')}`;
  if (/^github\.com\//.test(u)) return `https://${u}`;
  return u;
}

/** Git runs hidden. On Windows a background process would otherwise open a console window per call. */
const QUIET = { encoding: 'utf8', windowsHide: true };

/**
 * Git-backed message bus. Clones the private bus repo locally and syncs it.
 * Layout inside the bus repo:
 *   inbox/      tasks waiting to run        (written by you / your AI)
 *   approvals/  approvals for sensitive tasks (written by you)
 *   processing/ tasks the agent has claimed
 *   outbox/     results                      (written by the agent)
 */
export class Bus {
  constructor(repoUrl, dir = 'bus') {
    this.repoUrl = normalizeRepoUrl(repoUrl);
    this.dir = dir;
  }

  #git(args) {
    return execFileSync('git', args, { ...QUIET, cwd: this.dir }).trim();
  }

  init() {
    // A clone that failed part-way leaves a folder with no .git inside. Clear it and retry.
    if (existsSync(this.dir) && !existsSync(join(this.dir, '.git'))) {
      rmSync(this.dir, { recursive: true, force: true });
    }
    if (!existsSync(this.dir)) {
      try {
        execFileSync('git', ['clone', this.repoUrl, this.dir], QUIET);
      } catch (err) {
        throw new Error(
          `Could not clone the bus repo ${this.repoUrl}. ` +
          'Check that BUS_REPO points to your repo and that this GitHub account can read it. ' +
          'Run "gh auth login" and make sure the repo is shared with this account.'
        );
      }
    }
    for (const d of ['inbox', 'approvals', 'processing', 'outbox']) {
      mkdirSync(join(this.dir, d), { recursive: true });
    }
  }

  sync() {
    try {
      this.#git(['pull', '--rebase', '--autostash']);
    } catch (err) {
      console.error('[bus] pull failed (will retry next cycle):', err.message);
    }
  }

  /** List pending task files in inbox/, parsed. */
  pendingTasks() {
    const dir = join(this.dir, 'inbox');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          return { file: f, ...JSON.parse(readFileSync(join(dir, f), 'utf8')) };
        } catch {
          return { file: f, _invalid: true };
        }
      });
  }

  /** True if a matching approval file exists for a sensitive task id. */
  isApproved(taskId) {
    return existsSync(join(this.dir, 'approvals', `${taskId}.approve`));
  }

  /** Move a task from inbox/ to processing/ so it is not picked up twice. */
  claim(file) {
    const from = join(this.dir, 'inbox', file);
    const to = join(this.dir, 'processing', file);
    renameSync(from, to);
    this.#commit(`claim ${file}`);
  }

  /** Write a result to outbox/ and remove the task from processing/. */
  complete(file, result) {
    const out = join(this.dir, 'outbox', file.replace(/\.json$/, '.result.json'));
    writeFileSync(out, JSON.stringify(result, null, 2));
    const proc = join(this.dir, 'processing', file);
    if (existsSync(proc)) renameSync(proc, proc + '.done');
    this.#commit(`result ${file}`);
  }

  #commit(message) {
    try {
      this.#git(['add', '-A']);
      this.#git(['commit', '-m', `tetherless: ${message}`]);
      this.#git(['push']);
    } catch (err) {
      console.error('[bus] commit/push failed:', err.message);
    }
  }
}
