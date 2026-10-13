import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Loads paid runners from the private tetherless-pro package (folder `pro/` by
 * default, or PRO_DIR). The package is NOT in this public repo. It checks the
 * license itself before exporting any runner, so this loader is not the only gate.
 */
export async function loadProRunners(env) {
  const entry = join(resolve(env.PRO_DIR || 'pro'), 'index.js');
  if (!existsSync(entry)) {
    console.warn(`[pro] no Pro package at ${entry}; paid runners are unavailable.`);
    return {};
  }
  try {
    const mod = await import(pathToFileURL(entry).href);
    return mod.runners || {};
  } catch (err) {
    console.warn(`[pro] failed to load Pro package: ${err.message}`);
    return {};
  }
}
