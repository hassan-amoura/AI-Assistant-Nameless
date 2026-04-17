'use strict';

const {
  SESSION_COOKIE, sessionCookieOptions, readSessionToken,
} = require('./sessionCookie');
const { hashPassword, verifyPassword } = require('./passwordService');
const { isSignupAllowedForEmail, normalizeEmail } = require('./accessPolicy');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function redirectLogin(res, query) {
  const q = query ? `?${query}` : '';
  res.redirect(`/login${q}`);
}

/**
 * @param {object} deps
 * @param {ReturnType<import('./userRepository').createUserRepository>} deps.users
 * @param {ReturnType<import('./sessionRepository').createSessionRepository>} deps.sessions
 * @param {ReturnType<import('../preferences/preferencesService').createPreferencesService>} deps.preferences
 * @param {number} deps.sessionMaxAgeMs
 */
function createHttpAuthHandlers(deps) {
  const {
    users, sessions, preferences, sessionMaxAgeMs,
  } = deps;

  async function handleGetLogin(req, res) {
    if (req.authUser) return res.redirect('/');
    const err = req.query.err || '';
    const signupErr = req.query.signup_err || '';
    const tab = req.query.tab === 'signup' ? 'signup' : 'signin';
    const { buildLoginPageHtml } = require('../../views/loginHtml');
    res.type('html');
    res.send(buildLoginPageHtml({ err, signupErr, tab }));
  }

  async function handlePostLogin(req, res) {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    if (!EMAIL_RE.test(email) || password.length < 1) {
      return redirectLogin(res, 'err=invalid');
    }
    const user = await users.findByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return redirectLogin(res, 'err=credentials');
    }
    const { token } = await sessions.createSession(user.id, Date.now() + sessionMaxAgeMs);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(sessionMaxAgeMs));
    return res.redirect('/');
  }

  async function handlePostSignup(req, res) {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const confirm = String(req.body.password_confirm || '');
    if (!EMAIL_RE.test(email)) return redirectLogin(res, 'signup_err=email&tab=signup');
    if (password.length < 8) return redirectLogin(res, 'signup_err=weak&tab=signup');
    if (password !== confirm) return redirectLogin(res, 'signup_err=mismatch&tab=signup');
    if (!isSignupAllowedForEmail(email)) {
      return redirectLogin(res, 'signup_err=not_allowed&tab=signup');
    }
    try {
      const hash = await hashPassword(password);
      const user = await users.createUser(email, hash);
      const { token } = await sessions.createSession(user.id, Date.now() + sessionMaxAgeMs);
      res.cookie(SESSION_COOKIE, token, sessionCookieOptions(sessionMaxAgeMs));
      return res.redirect('/');
    } catch (e) {
      if (e && e.code === 'EMAIL_EXISTS') {
        return redirectLogin(res, 'signup_err=exists&tab=signup');
      }
      return redirectLogin(res, 'signup_err=server&tab=signup');
    }
  }

  async function handleGetLogout(req, res) {
    const token = readSessionToken(req);
    if (token) await sessions.revokeSession(token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return res.redirect('/login');
  }

  function handleGetMe(req, res) {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const prefs = preferences.getForUserId(req.authUser.id);
    return res.json({
      user: { id: req.authUser.id, email: req.authUser.email },
      preferences: prefs,
    });
  }

  async function handlePatchPreferences(req, res) {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const next = await preferences.patchUserPreferences(req.authUser.id, req.body || {});
      return res.json({ preferences: next });
    } catch (e) {
      const code = e && e.code;
      if (code === 'INVALID_REVENUE_METHOD' || code === 'INVALID_EXPLANATION_STYLE'
        || code === 'INVALID_NATIVE_REPORTS_FIRST' || code === 'INVALID_PATCH') {
        return res.status(400).json({ error: 'Invalid preference value' });
      }
      return res.status(500).json({ error: 'Could not save preferences' });
    }
  }

  return {
    handleGetLogin,
    handlePostLogin,
    handlePostSignup,
    handleGetLogout,
    handleGetMe,
    handlePatchPreferences,
  };
}

module.exports = { createHttpAuthHandlers };
