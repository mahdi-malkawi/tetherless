import { verifyLicenseKey } from './license.js';
import { getInstallId } from './install-id.js';

/**
 * Plans come ONLY from a signed LICENSE_KEY bound to this install. There is no
 * PLAN env var. A missing, invalid, expired, or foreign key runs Free.
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

let warnedBadKey = false;

/** Resolve the active plan. Called every cycle so expiry takes effect. */
export function resolvePlan(env) {
  const key = env.LICENSE_KEY || '';
  const lic = verifyLicenseKey(key, getInstallId());
  if (!lic) {
    if (key && !warnedBadKey) {
      console.warn('[plan] LICENSE_KEY is invalid, expired, or issued for another install → running on Free.');
      warnedBadKey = true;
    }
    return { ...PLANS.free, license: null };
  }
  return { ...PLANS[lic.plan], license: lic };
}
