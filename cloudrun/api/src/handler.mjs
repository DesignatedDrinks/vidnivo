/**
 * Native clients send Firebase Authentication ID tokens to this HTTPS API.
 * Cloud Run is publicly invokable to support mobile clients, but user
 * endpoints fail closed unless the Admin SDK validates a Firebase ID token.
 * This module is dependency-injected so security checks can run offline.
 */
const MAX_BYTES = 8192;
const API_VERSION = 1;

function json(res, code, payload) {
  if (res.headersSent) return;
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}
function isValidUid(uid) {
  return typeof uid === 'string' && uid.length >= 1 && uid.length <= 128 &&
    !/[\x00-\x1f\x7f]/.test(uid);
}
async function parseSmallJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) {
      const error = new Error('Request body too large.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  let object;
  try { object = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { const error = new Error('Request body is not valid JSON.'); error.statusCode = 400; throw error; }
  if (!object || typeof object !== 'object' || Array.isArray(object)) {
    const error = new Error('Expected a JSON object.'); error.statusCode = 400; throw error;
  }
  return object;
}
function normalizeName(value) {
  if (typeof value !== 'string') {
    const error = new Error('displayName must be text.'); error.statusCode = 400; throw error;
  }
  const name = value.trim();
  if (name.length < 1 || name.length > 80 || /[\x00-\x1f\x7f]/.test(name)) {
    const error = new Error('displayName must be 1–80 printable characters.');
    error.statusCode = 400;
    throw error;
  }
  return name;
}
function normalizePath(req) {
  try {
    const value = new URL(req.url || '/', 'https://vidnivo.invalid');
    if (value.search) return null;
    return value.pathname;
  } catch { return null; }
}

export function createApiHandler({ verifyIdToken, readProfile, updateProfile, allowedOrigins = [],
   now = () => new Date().toISOString() }) {
  if (typeof verifyIdToken !== 'function' || typeof readProfile !== 'function' ||
      typeof updateProfile !== 'function') throw Error('Auth and profile adapters are required.');
  const origins = new Set(allowedOrigins.filter(x => typeof x === 'string' && x.startsWith('https://')));
  return async function api(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Vary', 'Origin');
    try {
      const origin = req.headers.origin;
      if (origin && !origins.has(origin)) return json(res, 403, {error:'Origin is not authorized.'});
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
        res.setHeader('Access-Control-Max-Age', '600');
      }
      if (req.method === 'OPTIONS') return json(res, 204, {});
      const path = normalizePath(req);
      if (!path) return json(res, 400, {error:'Invalid route.'});
      if (req.method === 'GET' && path === '/healthz') {
        return json(res, 200, {ok:true,service:'vidnivo-api',version:API_VERSION});
      }
      if (path !== '/v1/me') return json(res, 404, {error:'Not found.'});
      if (req.method !== 'GET' && req.method !== 'PUT') {
        res.setHeader('Allow', 'GET, PUT, OPTIONS');
        return json(res, 405, {error:'Method not allowed.'});
      }
      const authHeader = req.headers.authorization;
      if (typeof authHeader !== 'string' || !/^Bearer [A-Za-z0-9._~+/-]{20,8192}={0,2}$/.test(authHeader))
        return json(res, 401, {error:'Firebase sign-in required.'});
      const token = authHeader.slice(7);
      let claims;
      try { claims = await verifyIdToken(token); }
      catch { return json(res, 401, {error:'Session expired or invalid. Sign in again.'}); }
      if (!claims || !isValidUid(claims.uid)) return json(res, 401, {error:'Invalid Firebase identity.'});
      const uid = claims.uid;
      if (req.method === 'GET') {
        const profile = await readProfile(uid);
        return json(res, 200, {uid,profile:profile ? {
          displayName:profile.displayName || '',
          createdAt:profile.createdAt || null,
          updatedAt:profile.updatedAt || null
        } : null});
      }
      if (req.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json')
        return json(res, 415, {error:'Content-Type must be application/json.'});
      const body = await parseSmallJson(req);
      if (Object.keys(body).length !== 1 || !Object.prototype.hasOwnProperty.call(body,'displayName'))
        return json(res, 400, {error:'Only displayName may be edited.'});
      const displayName = normalizeName(body.displayName);
      const updatedAt = now();
      await updateProfile(uid, {displayName, updatedAt});
      return json(res, 200, {uid,profile:{displayName,updatedAt}});
    } catch (error) {
      if (error && Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 500)
        return json(res, error.statusCode, {error:error.message});
      // Never reflect SDK errors, database names, token strings or service secrets to clients.
      return json(res, 503, {error:'The service is temporarily unavailable. Try again later.'});
    }
  };
}
