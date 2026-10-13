// Mint a signed license key bound to one install. Run privately, in the vendor folder
// that holds tetherless-private.pem.
// Usage: node scripts/make-license.mjs <trial|pro> <days> <customerEmail> <installId>
//   e.g. node scripts/make-license.mjs pro 365 buyer@example.com TL-0123456789ABCDEF
// The customer gets their installId by running: node src/agent.js --install-id
import { sign, createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [plan, days, sub, iid] = process.argv.slice(2);
if (!['trial', 'pro'].includes(plan)) { console.error('plan must be "trial" or "pro"'); process.exit(1); }
if (!(Number(days) > 0)) { console.error('days must be a positive number'); process.exit(1); }
if (!sub || !sub.includes('@')) { console.error('customer email is required'); process.exit(1); }
if (!/^TL-[0-9A-F]{16}$/.test(iid || '')) { console.error('installId is required, format TL-XXXXXXXXXXXXXXXX'); process.exit(1); }

const priv = createPrivateKey(readFileSync('tetherless-private.pem'));
const payload = {
  plan,
  sub,
  iid,
  iss: 'tetherless',
  exp: Math.floor(Date.now() / 1000) + Number(days) * 86400,
};
const payloadBuf = Buffer.from(JSON.stringify(payload));
const sig = sign(null, payloadBuf, priv);
const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const key = `TLP.${b64url(payloadBuf)}.${b64url(sig)}`;
console.log(`License for ${sub} (${plan}, ${days}d, install ${iid}):\n${key}`);
