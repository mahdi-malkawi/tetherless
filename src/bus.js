import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

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
    this.repoUrl = repoUrl;
    this.dir = dir;
  }

  #git(args) {
    return execFileSync('git', args, { cwd: this.dir, encoding: 'utf8' }).trim();
  }

  init() {
    if (!existsSync(this.dir)) {
      execFileSync('git', ['clone', this.repoUrl, this.dir], { encoding: 'utf8' });
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
