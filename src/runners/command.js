import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

/**
 * Run an allow-listed shell command. The binary (task.command) must appear in
 * COMMAND_ALLOWLIST; anything else is refused. Args are passed as an array, so
 * there is no shell interpolation / injection.
 *
 * task = { type:"command", command:"df", args:["-h"] }
 */
export async function runCommand(task, env) {
  const allow = (env.COMMAND_ALLOWLIST || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!allow.includes(task.command)) {
    throw new Error(`command "${task.command}" is not in COMMAND_ALLOWLIST`);
  }
  const { stdout, stderr } = await exec(task.command, task.args || [], {
    timeout: (task.timeoutSec || 120) * 1000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true, // no console window per command on Windows
  });
  return { stdout, stderr };
}
