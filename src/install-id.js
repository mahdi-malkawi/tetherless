import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

/**
 * A random ID created once per install and kept in data/install-id. Licenses are
 * bound to it, so a key only works on the install it was issued for. The customer
 * sends this ID when they buy; it is printed at startup and via `--install-id`.
 */
const FILE = 'data/install-id';
const FORMAT = /^TL-[0-9A-F]{16}$/;

export function getInstallId() {
  try {
    if (existsSync(FILE)) {
      const id = readFileSync(FILE, 'utf8').trim();
      if (FORMAT.test(id)) return id;
    }
  } catch {}
  const id = 'TL-' + randomBytes(8).toString('hex').toUpperCase();
  try {
    mkdirSync('data', { recursive: true });
    writeFileSync(FILE, id + '\n');
  } catch {}
  return id;
}

export { FORMAT as INSTALL_ID_FORMAT };
