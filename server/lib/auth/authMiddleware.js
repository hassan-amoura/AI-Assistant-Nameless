'use strict';

const { readSessionToken } = require('./sessionCookie');

/**
 * Attaches req.authUser = { id, email } when a valid session cookie is present.
 * Does not block — use requireAuthenticated after public routes.
 *
 * @param {ReturnType<import('./sessionRepository').createSessionRepository>} sessions
 * @param {ReturnType<import('./userRepository').createUserRepository>} users
 */
function createAttachUserMiddleware(sessions, users) {
  return async function attachUser(req, res, next) {
    req.authUser = null;
    req.sessionToken = undefined;
    const token = readSessionToken(req);
    if (!token) return next();
    req.sessionToken = token;
    try {
      const row = await sessions.findValidSession(token);
      if (!row) {
        req.sessionToken = undefined;
        return next();
      }
      const user = await users.findById(row.userId);
      if (!user) {
        req.sessionToken = undefined;
        return next();
      }
      req.authUser = { id: user.id, email: user.email };
    } catch (_) {
      req.authUser = null;
      req.sessionToken = undefined;
    }
    next();
  };
}

function requireAuthenticatedPage(req, res, next) {
  if (req.authUser) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Session expired — please log in.' });
  }
  return res.redirect('/login');
}

module.exports = { createAttachUserMiddleware, requireAuthenticatedPage };
