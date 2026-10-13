// Generate a vendor Ed25519 keypair. Run ONCE, privately.
// Keep tetherless-private.pem SECRET. Paste the public PEM into src/license.js.
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
writeFileSync('tetherless-private.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }));
const pub = publicKey.export({ type: 'spki', format: 'pem' });
writeFileSync('tetherless-public.pem', pub);
console.log('Wrote tetherless-private.pem (KEEP SECRET) and tetherless-public.pem');
console.log('Paste this into PUBLIC_KEY_PEM in src/license.js:\n' + pub);
