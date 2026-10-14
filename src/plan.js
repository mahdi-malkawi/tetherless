import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { verifyLicenseKey } from './license.js';
import { getInstallId } from './install-id.js';

/**
 * Plans come ONLY from a signed LICENSE_KEY bound to this install. There is no
 * PLAN env var. Without a valid key, the install gets a 3-day Free trial
 * (started on the first run, stored in data/trial-start). After that, nothing runs
 * until a license key is added.
 */
export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    runners: ['command', 'http'],
    pollFloorSec: 60,
    maxTasksPerDay: 50,
  },
  trial: {
    id: 'trial',
    name: 'Trial',
    runners: ['command', 'http', 'browser', 'facebook'],
    pollFloorSec: 5,
    maxTasksPerDay: 200,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    runners: ['command', 'http', 'browser', 'facebook'],
    pollFloorSec: 5,
    maxTasksPerDay: Infinity,
  },
};

export const FREE_TRIAL_DAYS = 3;
const TRIAL_FILE = join('data', 'trial-start');
const DAY_MS = 24 * 60 * 60 * 1000;

let warnedBadKey = false;

/** When the free trial started on this install. Written once, on the first run. */
function trialStart() {
  try {
    if (existsSync(TRIAL_FILE)) {
      const t = Number(readFileSync(TRIAL_FILE, 'utf8').trim());
      if (Number.isFinite(t) && t > 0) return t;
    }
  } catch {}
  const now = Date.now();
  try {
    mkdirSync('data', { recursive: true });
    writeFileSync(TRIAL_FILE, String(now));
  } catch {}
  return now;
}

/** Resolve the active plan. Called every cycle so expiry takes effect. */
export function resolvePlan(env) {
  const key = env.LICENSE_KEY || '';
  const lic = verifyLicenseKey(key, getInstallId());
  if (lic) return { ...PLANS[lic.plan], license: lic };

  if (key && !warnedBadKey) {
    console.warn('[plan] LICENSE_KEY is invalid, expired, or issued for another install.');
    warnedBadKey = true;
  }

  const left = trialStart() + FREE_TRIAL_DAYS * DAY_MS - Date.now();
  if (left > 0) {
    const daysLeft = Math.ceil(left / DAY_MS);
    return { ...PLANS.free, name: `Free trial (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)`, license: null };
  }
  // Trial is over and there is no valid license: nothing runs until one is added.
  return { ...PLANS.free, id: 'expired', name: 'Expired', runners: [], maxTasksPerDay: 0, license: null };
}
