import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const LOG = 'data/audit.log';

/** Append a timestamped, structured line to the local audit log. */
export function audit(event, detail = {}) {
  try {
    mkdirSync(dirname(LOG), { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), event, ...detail });
    appendFileSync(LOG, line + '\n');
  } catch (err) {
    // Logging must never crash the agent.
    console.error('[audit] failed:', err.message);
  }
  console.log(`[${event}]`, JSON.stringify(detail));
}
