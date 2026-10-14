import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, openSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

/**
 * Runs the agent in the background with no terminal window and no extra tools
 * (no pm2). Keeps its process id in data/agent.pid so start/stop/status work.
 * Auto-start on sign-in / boot is set up per OS by installAutostart().
 */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const PID_FILE = join(DATA, 'agent.pid');
const LOG_FILE = join(DATA, 'agent.log');
const CLI = join(ROOT, 'src', 'cli.js');
const quiet = { stdio: 'ignore', windowsHide: true };

function readPid() {
  try {
    const pid = Number(readFileSync(PID_FILE, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function isRunning() {
  const pid = readPid();
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function startBackground() {
  if (isRunning()) return { started: false, pid: readPid() };
  mkdirSync(DATA, { recursive: true });
  const log = openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [join(ROOT, 'src', 'agent.js')], {
    cwd: ROOT,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log, log],
  });
  child.unref();
  writeFileSync(PID_FILE, String(child.pid));
  return { started: true, pid: child.pid };
}

export function stopBackground() {
  const pid = readPid();
  if (!isRunning()) {
    try { unlinkSync(PID_FILE); } catch {}
    return false;
  }
  try { process.kill(pid); } catch {}
  try { unlinkSync(PID_FILE); } catch {}
  return true;
}

/** Sets up start-on-sign-in (Windows, macOS) or start-on-boot (Linux) for this user. */
export function installAutostart() {
  switch (process.platform) {
    case 'win32': return installWindows();
    case 'darwin': return installMac();
    case 'linux': return installLinux();
    default: return { ok: false, msg: 'Auto-start is not supported on this OS. Run "npm start" after each reboot.' };
  }
}

/** Windows: hidden script in the user's Startup folder. No admin rights needed. */
function installWindows() {
  const dir = join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'Tetherless.vbs');
  const script = [
    'Set sh = CreateObject("WScript.Shell")',
    `sh.CurrentDirectory = "${ROOT}"`,
    `sh.Run """${process.execPath}"" ""${CLI}"" start", 0, False`,
  ].join('\r\n') + '\r\n';
  writeFileSync(file, script, 'ascii');
  return { ok: true, msg: `Start-on-login enabled: ${file}` };
}

/** macOS: a LaunchAgent that runs "cli start" at login. */
function installMac() {
  const dir = join(homedir(), 'Library', 'LaunchAgents');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'com.tetherless.agent.plist');
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.tetherless.agent</string>
  <key>ProgramArguments</key>
  <array><string>${process.execPath}</string><string>${CLI}</string><string>start</string></array>
  <key>WorkingDirectory</key><string>${ROOT}</string>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${LOG_FILE}</string>
  <key>StandardErrorPath</key><string>${LOG_FILE}</string>
</dict></plist>
`;
  writeFileSync(file, plist);
  spawnSync('launchctl', ['unload', file], quiet);
  const loaded = spawnSync('launchctl', ['load', '-w', file], quiet);
  if (loaded.status !== 0) return { ok: false, msg: `Wrote ${file} but could not load it. Run: launchctl load -w "${file}"` };
  return { ok: true, msg: `Start-on-login enabled: ${file}` };
}

/** Linux: a systemd user service. Falls back to a crontab line if systemd is not available. */
function installLinux() {
  const dir = join(homedir(), '.config', 'systemd', 'user');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'tetherless.service');
  const unit = `[Unit]
Description=Tetherless agent
After=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${ROOT}
ExecStart=${process.execPath} ${CLI} start
ExecStop=${process.execPath} ${CLI} stop

[Install]
WantedBy=default.target
`;
  writeFileSync(file, unit);
  spawnSync('systemctl', ['--user', 'daemon-reload'], quiet);
  const enabled = spawnSync('systemctl', ['--user', 'enable', 'tetherless.service'], quiet);
  if (enabled.status !== 0) {
    return {
      ok: false,
      msg: `systemd is not available. Add this line with "crontab -e":\n@reboot cd ${ROOT} && ${process.execPath} ${CLI} start`,
    };
  }
  spawnSync('systemctl', ['--user', 'start', 'tetherless.service'], quiet);
  return { ok: true, msg: `Start-on-boot enabled: ${file}` };
}
