#!/usr/bin/env node
// Entry point. `tetherless setup` runs the first-run wizard. Anything else starts the agent
// (flags such as --once and --install-id are handled by agent.js).
const command = process.argv[2];

if (command === 'setup') {
  const { runSetup } = await import('./setup.js');
  await runSetup();
} else {
  await import('./agent.js');
}
