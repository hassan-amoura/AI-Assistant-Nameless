'use strict';

const crypto = require('crypto');
const {
  SESSION_COOKIE, sessionCookieOptions, readSessionToken,
} = require('./sessionCookie');
const { hashPassword, verifyPassword } = require('./passwordService');
const { isSignupAllowedForEmail, normalizeEmail } = require('./accessPolicy');

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function sendResetEmail(email, resetUrl) {
  // Stub: log the link to the server console so admins can retrieve it manually.
  // Replace this function body with real SMTP (Nodemailer, SendGrid, etc.) when ready.
  // Required env vars to add: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
  console.log(`[password-reset] Reset link for ${email}:\n  ${resetUrl}`);
}

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
    const resetSuccess = req.query.reset === '1';
    const { buildLoginPageHtml } = require('../../views/loginHtml');
    res.type('html');
    res.send(buildLoginPageHtml({ err, signupErr, tab, resetSuccess }));
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
    return res.redirect('/?fresh=1');
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
      return res.redirect('/?fresh=1');
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

  async function handleGetMe(req, res) {
    if (!req.authUser) {
      return res.status(401).json({ error: "We couldn't verify your session. Please sign in again." });
    }
    const prefs = await preferences.getForUserId(req.authUser.id);
    return res.json({
      user: { id: req.authUser.id, email: req.authUser.email },
      preferences: prefs,
    });
  }

  async function handlePatchPreferences(req, res) {
    if (!req.authUser) {
      return res.status(401).json({ error: "We couldn't verify your session. Please sign in again." });
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

  async function handleGetForgotPassword(req, res) {
    if (req.authUser) return res.redirect('/');
    const { buildForgotPasswordPageHtml } = require('../../views/loginHtml');
    const sent = req.query.sent === '1';
    const err = req.query.err || '';
    res.type('html');
    res.send(buildForgotPasswordPageHtml({ sent, err }));
  }

  async function handlePostForgotPassword(req, res) {
    const email = normalizeEmail(req.body.email);
    if (!EMAIL_RE.test(email)) {
      return res.redirect('/auth/forgot-password?err=invalid');
    }
    const user = await users.findByEmail(email);
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
      await users.setResetToken(user.id, token, expiresAt);
      const baseUrl = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
      const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;
      sendResetEmail(email, resetUrl);
    }
    // Always show the same message to avoid leaking whether the email exists
    return res.redirect('/auth/forgot-password?sent=1');
  }

  async function handleGetResetPassword(req, res) {
    const { buildResetPasswordPageHtml } = require('../../views/loginHtml');
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    const err = req.query.err || '';
    if (!token && !err) return res.redirect('/auth/forgot-password');
    res.type('html');
    res.send(buildResetPasswordPageHtml({ token, err }));
  }

  async function handlePostResetPassword(req, res) {
    const token = typeof req.body.token === 'string' ? req.body.token.trim() : '';
    const password = String(req.body.password || '');
    const confirm = String(req.body.password_confirm || '');

    if (!token) return res.redirect('/auth/forgot-password');
    if (password.length < 8) return res.redirect(`/auth/reset-password?token=${encodeURIComponent(token)}&err=weak`);
    if (password !== confirm) return res.redirect(`/auth/reset-password?token=${encodeURIComponent(token)}&err=mismatch`);

    const user = await users.findByResetToken(token);
    const expired = !user || !user.resetTokenExpiresAt || new Date(user.resetTokenExpiresAt) < new Date();
    if (!user || expired) {
      return res.redirect('/auth/reset-password?err=invalid');
    }

    try {
      const newHash = await hashPassword(password);
      await users.updatePasswordHash(user.id, newHash);
      await users.clearResetToken(user.id);
      return res.redirect('/login?reset=1');
    } catch {
      return res.redirect(`/auth/reset-password?token=${encodeURIComponent(token)}&err=server`);
    }
  }

  return {
    handleGetLogin,
    handlePostLogin,
    handlePostSignup,
    handleGetLogout,
    handleGetMe,
    handlePatchPreferences,
    handleGetForgotPassword,
    handlePostForgotPassword,
    handleGetResetPassword,
    handlePostResetPassword,
  };
}

module.exports = { createHttpAuthHandlers };
