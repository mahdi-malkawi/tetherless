import { createInterface } from 'node:readline/promises';
import { existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { getInstallId } from './install-id.js';

const REPO_URL = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+?(\.git)?$/;

/** Interactive first-run setup: writes .env and checks the bus repo is reachable. */
export async function runSetup() {
  // Read lines through an iterator so answers are never lost (works for a TTY and for piped input).
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (label, def = '') => {
    process.stdout.write(def ? `${label} [${def}]: ` : `${label}: `);
    const { value, done } = await lines.next();
    if (done) {
      rl.close();
      console.log('\nSetup stopped: no more input.');
      process.exit(1);
    }
    const answer = String(value).trim();
    return answer || def;
  };

  console.log('\nTetherless setup\n');

  if (existsSync('.env')) {
    const overwrite = (await ask('.env already exists. Overwrite it? (y/N)', 'N')).toLowerCase();
    if (overwrite !== 'y') {
      rl.close();
      console.log('Kept your existing .env.');
      return finish();
    }
  }

  let repo = '';
  while (!REPO_URL.test(repo)) {
    repo = await ask('Your PRIVATE bus repo URL (e.g. https://github.com/you/tetherless-bus)');
    if (!REPO_URL.test(repo)) console.log('  Please enter a https://github.com/owner/repo URL.');
  }
  const agentId = await ask('Name for this agent', 'my-agent');
  const licenseKey = await ask('License key (leave empty to run on Free)', '');
  const wantLogin = (await ask('Log in to GitHub now with the gh CLI? (Y/n)', 'Y')).toLowerCase();
  rl.close();

  if (wantLogin !== 'n') {
    const hasGh = spawnSync('gh', ['--version'], { stdio: 'ignore' }).status === 0;
    if (hasGh) {
      spawnSync('gh', ['auth', 'login', '--web', '-h', 'github.com', '-p', 'https'], { stdio: 'inherit' });
      spawnSync('gh', ['auth', 'setup-git'], { stdio: 'inherit' });
    } else {
      console.log('gh CLI not found. Install it from https://cli.github.com, or make sure git can push to your repo.');
    }
  }

  const reachable = spawnSync('git', ['ls-remote', repo], { encoding: 'utf8' });
  if (reachable.status === 0) {
    console.log('Bus repo is reachable.');
  } else {
    console.log('Could not reach the bus repo yet. Check the URL and your GitHub login, then run "npm start".');
  }

  const env = [
    '# Written by `tetherless setup`. Keep this file private.',
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

function finish() {
  const id = getInstallId();
  console.log(`\nYour install ID: ${id}`);
  console.log('Send this ID to the vendor to get a license key for this install.');
  console.log('Start the agent with:  npm start\n');
}
