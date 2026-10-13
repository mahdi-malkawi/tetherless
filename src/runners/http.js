/**
 * HTTP/API runner. Two lists in the LOCAL .env control what it may do, so a
 * task on the bus cannot aim a token at an arbitrary server:
 *   HTTP_ALLOW_HOSTS   hosts this runner may call (https only)
 *   HTTP_TOKEN_ENVS    env var names that may be sent as tokens
 *
 * task = {
 *   type:"http", method:"GET",
 *   url:"https://graph.facebook.com/v21.0/...",
 *   query:{ fields:"campaign_name,spend" },
 *   tokenEnv:"FB_ACCESS_TOKEN",   // must be listed in HTTP_TOKEN_ENVS
 *   tokenAs:"query" | "bearer"    // default bearer
 * }
 */
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
const FORBIDDEN_HEADER = /^(authorization|cookie|proxy-authorization)$/i;

export async function runHttp(task, env) {
  const url = new URL(task.url);
  if (url.protocol !== 'https:') throw new Error('http runner only calls https URLs');
  if (!list(env.HTTP_ALLOW_HOSTS).includes(url.hostname)) {
    throw new Error(`host "${url.hostname}" is not in HTTP_ALLOW_HOSTS`);
  }
  for (const [k, v] of Object.entries(task.query || {})) url.searchParams.set(k, v);

  const headers = { Accept: 'application/json' };
  for (const [k, v] of Object.entries(task.headers || {})) {
    if (FORBIDDEN_HEADER.test(k)) throw new Error(`header "${k}" cannot be set by a task`);
    headers[k] = String(v);
  }

  if (task.tokenEnv) {
    if (!list(env.HTTP_TOKEN_ENVS).includes(task.tokenEnv)) {
      throw new Error(`token "${task.tokenEnv}" is not in HTTP_TOKEN_ENVS`);
    }
    const token = env[task.tokenEnv];
    if (!token) throw new Error(`missing token in env: ${task.tokenEnv}`);
    if (task.tokenAs === 'query') url.searchParams.set('access_token', token);
    else headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: String(task.method || 'GET').toUpperCase(),
    headers,
    redirect: 'error', // never follow redirects with a token attached
    body: task.body ? JSON.stringify(task.body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return { status: res.status, data };
}
