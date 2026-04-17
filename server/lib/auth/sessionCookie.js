'use strict';

const SESSION_COOKIE = 'pw_session';

function parseCookies(req) {
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx < 1) return;
    cookies[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return cookies;
}

function readSessionToken(req) {
  return parseCookies(req)[SESSION_COOKIE] || '';
}

function sessionCookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
    ...(process.env.NODE_ENV === 'production' && { secure: true }),
  };
}

module.exports = {
  SESSION_COOKIE,
  parseCookies,
  readSessionToken,
  sessionCookieOptions,
};
