import { verify } from 'node:crypto';

/**
 * Offline license verification using Ed25519 signatures.
 *
 * A license key looks like:   TLP.<payloadB64url>.<sigB64url>
 * payload = JSON { plan, exp, iss, sub, iid }
 *   plan: "trial" or "pro"
 *   iid:  the install ID the key was issued for (see install-id.js)
 * Keys are signed with the VENDOR PRIVATE KEY (never shipped). The agent checks
 * them with the PUBLIC key below, so keys cannot be forged.
 *
 * Replace the public key below with your own from `node scripts/make-keypair.mjs`.
 *
 * Note: this is a local check. Anyone who edits this file can skip it. The
 * paid package checks the license again on its own.
 */
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAufNCFC40wL6sOYuDxXnDcb/H9/3H/5YN7zlnXRUEbDs=
-----END PUBLIC KEY-----`;

const VALID_PLANS = new Set(['trial', 'pro']);

function b64urlToBuf(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Returns the payload if the key is valid, unexpired, and bound to this install.
 * Otherwise returns null.
 */
export function verifyLicenseKey(key, installId) {
  try {
    if (!key || !key.startsWith('TLP.')) return null;
    const parts = key.split('.');
    if (parts.length !== 3) return null;
    const [, payloadB64, sigB64] = parts;

    const payloadBuf = b64urlToBuf(payloadB64);
    if (!verify(null, payloadBuf, PUBLIC_KEY_PEM, b64urlToBuf(sigB64))) return null;

    const payload = JSON.parse(payloadBuf.toString('utf8'));
    if (payload.iss !== 'tetherless') return null;
    if (!VALID_PLANS.has(payload.plan)) return null;
    if (!payload.exp || Date.now() > payload.exp * 1000) return null;
    if (!installId || payload.iid !== installId) return null; // bound to another install
    return payload;
  } catch {
    return null;
  }
}
