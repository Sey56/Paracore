/**
 * rap-auth on Cloudflare Workers.
 *
 * Drop-in replacement for the Railway FastAPI auth server, reduced to the only two
 * things the desktop app actually needs:
 *
 *   POST /auth/verify-google-code   { code, redirect_uri }  -> { access_token, user }
 *   GET  /auth/public-key                                  -> { public_key }
 *
 * No database. Access is a hard-coded Gmail allowlist (env ALLOWED_EMAILS), and the
 * session token is the same RS256 JWT the app already validates — signed with the
 * same `jwt_private.pem`, so nothing downstream changes.
 *
 * ⚠ The JWT claims and the user object must keep the exact shape below:
 *   - rap-server/server/auth.py decodes RS256 with `int(payload["user_id"])`
 *     and rejects `user_id == 0` (0 is the "offline / free tier" sentinel).
 *   - rap-web derives `isEnterprise = isAuthenticated && cloudToken !== "rap-local-token"`,
 *     and that is what unlocks the takeoff extension methods.
 */

const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // matches ACCESS_TOKEN_EXPIRE_MINUTES=43200
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

// Modeled on the server-side shape the app was written against. `activeRole` is read by
// rap-server (e.g. the admin-only migration endpoint), so it must stay present.
function userPayload(userId, email, name, picture) {
  return {
    id: userId,
    email,
    name: name || email,
    picture_url: picture || '',
    memberships: [{ team_id: 0, team_name: 'Personal', role: 'owner', owner_id: userId }],
    activeTeam: 0,
    activeRole: 'owner',
  };
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      ...extraHeaders,
    },
  });
}

// ── base64url ────────────────────────────────────────────────────────────────────
function bytesToBinary(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  // Chunked so a long DER blob cannot blow the argument limit of String.fromCharCode.
  for (let i = 0; i < arr.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
  }
  return binary;
}

function base64UrlEncode(bytes) {
  return btoa(bytesToBinary(bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecodeToString(value) {
  let s = value.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}

function base64DecodeBytes(value) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// ── RSA key handling ─────────────────────────────────────────────────────────────
function pemToDer(pem) {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return base64DecodeBytes(body);
}

function derLength(n) {
  if (n < 0x80) return [n];
  const bytes = [];
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}

function derWrap(tag, content) {
  const out = new Uint8Array(1 + derLength(content.length).length + content.length);
  out.set([tag, ...derLength(content.length)], 0);
  out.set(content, 1 + derLength(content.length).length);
  return out;
}

function concatBytes(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// WebCrypto's importKey only understands PKCS#8. `openssl genrsa` output (and the older
// `BEGIN RSA PRIVATE KEY` header) is PKCS#1, so wrap it: PKCS#8 is just
// SEQUENCE { INTEGER 0, AlgorithmIdentifier(rsaEncryption), OCTET STRING(pkcs1) }.
const RSA_ALGORITHM_IDENTIFIER = new Uint8Array([
  0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
]);

function toPkcs8(pem) {
  if (/BEGIN RSA PRIVATE KEY/.test(pem)) {
    const pkcs1 = pemToDer(pem);
    return derWrap(
      0x30,
      concatBytes([new Uint8Array([0x02, 0x01, 0x00]), RSA_ALGORITHM_IDENTIFIER, derWrap(0x04, pkcs1)])
    );
  }
  if (/BEGIN PRIVATE KEY/.test(pem)) return pemToDer(pem);
  throw new Error('Unsupported private key: expected BEGIN PRIVATE KEY (PKCS#8) or BEGIN RSA PRIVATE KEY (PKCS#1)');
}

let cachedSigningKey = null;

async function getSigningKey(env) {
  if (cachedSigningKey) return cachedSigningKey;
  if (!env.JWT_PRIVATE_KEY) throw new Error('JWT_PRIVATE_KEY secret is not set');
  cachedSigningKey = await crypto.subtle.importKey(
    'pkcs8',
    toPkcs8(env.JWT_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return cachedSigningKey;
}

function normalizePem(pem) {
  // Cloudflare's secret input can strip newlines (replacing them with spaces) and
  // add surrounding quotes. python-jose needs a real PEM with newlines every 64 chars.
  let s = String(pem || '').trim();
  // Strip surrounding quotes if the secret was pasted with them.
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  // If newlines survived, return as-is.
  if (s.includes('\n')) return s;
  // Otherwise, reconstruct: extract header / footer / base64 body.
  const headerMatch = s.match(/-----BEGIN[^-]+-----/);
  const footerMatch = s.match(/-----END[^-]+-----/);
  if (!headerMatch || !footerMatch) return s;
  const header = headerMatch[0];
  const footer = footerMatch[0];
  const body = s.slice(headerMatch.index + header.length, footerMatch.index).replace(/\s+/g, '');
  // Re-wrap at 64 chars per line.
  const lines = [];
  for (let i = 0; i < body.length; i += 64) {
    lines.push(body.slice(i, i + 64));
  }
  return `${header}\n${lines.join('\n')}\n${footer}\n`;
}

// ── JWT ──────────────────────────────────────────────────────────────────────────
function stableUserId(email) {
  // FNV-1a over the lowercased address: deterministic across sign-ins and deployments,
  // so the local SQLite user keeps its scripts/presets. Never 0 — that is the sentinel
  // get_optional_current_user() uses for "not signed in".
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(email.toLowerCase())) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % 2147483646) + 1;
}

async function mintToken(env, user) {
  const encoder = new TextEncoder();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    sub: user.email,
    user_id: user.id,
    email: user.email,
    name: user.name,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };

  const signingInput =
    `${base64UrlEncode(encoder.encode(JSON.stringify(header)))}.` +
    `${base64UrlEncode(encoder.encode(JSON.stringify(payload)))}`;

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    await getSigningKey(env),
    encoder.encode(signingInput)
  );

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

// ── Google ───────────────────────────────────────────────────────────────────────
function tokenError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function decodeJwtPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw tokenError('malformed id_token');
  return JSON.parse(base64UrlDecodeToString(parts[1]));
}

function assertGoogleClaims(claims, env) {
  if (!claims || !claims.email) throw tokenError('Google token has no email');
  if (GOOGLE_ISSUERS.indexOf(claims.iss) === -1) throw tokenError(`unexpected issuer: ${claims.iss}`);
  if (claims.aud !== env.GOOGLE_CLIENT_ID) throw tokenError('Google token was issued for another client');
  if (claims.exp && Number(claims.exp) * 1000 < Date.now() - 60_000) throw tokenError('Google token expired');
  // Google returns a boolean, but older tokens carry the string "true".
  if (claims.email_verified === false || claims.email_verified === 'false') {
    throw tokenError('Google account email is not verified');
  }
}

function allowedEmails(env) {
  return String(env.ALLOWED_EMAILS || '')
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowed(env, email) {
  const allowlist = allowedEmails(env);
  return allowlist.length > 0 && allowlist.indexOf(String(email).trim().toLowerCase()) !== -1;
}

async function exchangeCodeForClaims(code, redirectUri, env) {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    // Surface Google's own description: "invalid_grant" after a reused code is by far
    // the most common failure, and it is not the same thing as "you are not allowed".
    throw tokenError(`Google token exchange failed: ${await response.text()}`);
  }

  const tokens = await response.json();
  if (!tokens.id_token) throw tokenError('Google returned no id_token');
  const claims = decodeJwtPayload(tokens.id_token);
  assertGoogleClaims(claims, env);
  return claims;
}

async function verifyIdTokenClaims(idToken, env) {
  // Unlike the code flow (where the id_token arrives straight from Google over TLS),
  // this path trusts a token supplied by the caller, so it goes through Google's own
  // verifier — signature and expiry included.
  const url = `${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`;
  const response = await fetch(url);
  if (!response.ok) throw tokenError('Google rejected the supplied id_token', 401);
  const claims = await response.json();
  assertGoogleClaims(claims, env);
  return claims;
}

// ── Routes ───────────────────────────────────────────────────────────────────────
async function handleVerifyGoogleCode(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ detail: 'Invalid JSON body' }, 400);
  }

  if (!body || !body.code) return jsonResponse({ detail: 'Missing code' }, 400);
  if (!body.redirect_uri) return jsonResponse({ detail: 'Missing redirect_uri' }, 400);

  let claims;
  try {
    claims = await exchangeCodeForClaims(body.code, body.redirect_uri, env);
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.status || 502);
  }

  const email = String(claims.email).trim();
  if (!isAllowed(env, email)) {
    // 403 mirrors FastAPI's behaviour so rap-server's raise_for_status() passes it through.
    return jsonResponse({ detail: `${email} is not on the allowlist` }, 403);
  }

  const user = userPayload(
    stableUserId(email),
    email,
    claims.name,
    claims.picture
  );
  const token = await mintToken(env, user);

  // `access_token` is what AuthProvider reads; `token` is what the older
  // /auth/google-verify consumer reads. Both, so either caller works unchanged.
  return jsonResponse({ access_token: token, token, user });
}

async function handleVerifyGoogleToken(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ detail: 'Invalid JSON body' }, 400);
  }
  if (!body || !body.token) return jsonResponse({ detail: 'Missing token' }, 400);

  let claims;
  try {
    claims = await verifyIdTokenClaims(body.token, env);
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.status || 401);
  }

  const email = String(claims.email).trim();
  if (!isAllowed(env, email)) return jsonResponse({ detail: `${email} is not on the allowlist` }, 403);

  const user = userPayload(stableUserId(email), email, claims.name, claims.picture);
  const token = await mintToken(env, user);
  return jsonResponse({ access_token: token, token, user });
}

async function handlePublicKey(env) {
  if (!env.JWT_PUBLIC_KEY) return jsonResponse({ detail: 'JWT_PUBLIC_KEY secret is not set' }, 500);
  return jsonResponse({ public_key: normalizePem(env.JWT_PUBLIC_KEY) });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'authorization,content-type',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
        },
      });
    }

    try {
      if (pathname === '/health') {
        const clientId = String(env.GOOGLE_CLIENT_ID || '');
        const clientSecret = String(env.GOOGLE_CLIENT_SECRET || '');
        return jsonResponse({
          status: 'ok',
          allowlist_size: allowedEmails(env).length,
          signing_key: Boolean(env.JWT_PRIVATE_KEY),
          google_client_id_set: Boolean(env.GOOGLE_CLIENT_ID),
          google_client_id_preview: clientId ? `${clientId.slice(0, 12)}...` : '(not set)',
          google_client_secret_set: Boolean(env.GOOGLE_CLIENT_SECRET),
        });
      }

      if (pathname === '/auth/public-key' && request.method === 'GET') {
        return handlePublicKey(env);
      }

      if (pathname === '/auth/verify-google-code' && request.method === 'POST') {
        return await handleVerifyGoogleCode(request, env);
      }

      if (pathname === '/auth/verify-google-token' && request.method === 'POST') {
        return await handleVerifyGoogleToken(request, env);
      }

      return jsonResponse({ detail: 'Not found' }, 404);
    } catch (error) {
      return jsonResponse({ detail: `Auth worker error: ${error.message}` }, 500);
    }
  },
};
