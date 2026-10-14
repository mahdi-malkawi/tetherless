#!/usr/bin/env node
// One entry point for everything. Paths (.env, bus/, data/) are always resolved from the project folder.
import { existsSync } from 'node:fs';
import { ROOT, startBackground, stopBackground, isRunning, installAutostart } from './service.js';
import { getInstallId } from './install-id.js';

process.chdir(ROOT);

const command = process.argv[2];

switch (command) {
  case 'setup': {
    const { runSetup } = await import('./setup.js');
    await runSetup();
    break;
  }
  case 'start': {
    if (!existsSync('.env')) {
      console.log('No .env yet. Run:  npm run setup');
      process.exit(1);
    }
    const { started, pid } = startBackground();
    console.log(started ? `Tetherless started in the background (pid ${pid}).`
      : `Tetherless is already running (pid ${pid}).`);
    break;
  }
  case 'stop': {
    console.log(stopBackground() ? 'Tetherless stopped.' : 'Tetherless was not running.');
    break;
  }
  case 'status': {
    console.log(isRunning() ? 'Tetherless is running.' : 'Tetherless is not running.');
    break;
  }
  case 'autostart': {
    const r = installAutostart();
    console.log(r.ok ? `Start-on-login enabled: ${r.msg}` : r.msg);
    break;
  }
  case 'install-id': {
    console.log(getInstallId());
    break;
  }
  case 'run':
  case undefined: {
    // "run" = foreground, for debugging. No command = setup on first use, otherwise start in the background.
    if (command === 'run') {
      if (isRunning()) {
        console.log('Tetherless is already running in the background. Run "npm run stop" first.');
        process.exit(0);
      }
      await import('./agent.js');
      break;
    }
    if (!existsSync('.env')) {
      const { runSetup } = await import('./setup.js');
      await runSetup();
    } else {
      const { started, pid } = startBackground();
      console.log(started ? `Tetherless started in the background (pid ${pid}).`
        : `Tetherless is already running (pid ${pid}).`);
    }
    break;
  }
  default:
    console.log(`Unknown command "${command}". Use: setup | start | stop | status | autostart | run | install-id`);
    process.exit(1);
}
