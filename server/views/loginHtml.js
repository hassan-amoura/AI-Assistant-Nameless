'use strict';

/**
 * Server-rendered login / sign-up page (no dependency on authenticated static assets).
 * FUTURE: i18n, SSO-only mode, branded tenant themes.
 */

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ERR_MSG = {
  invalid: 'Enter a valid email and password.',
  credentials: 'That email or password is not correct.',
};

const SIGNUP_ERR_MSG = {
  email: 'Enter a valid email address.',
  weak: 'Password must be at least 8 characters.',
  mismatch: 'Passwords did not match.',
  not_allowed: 'That email is not eligible for sign-up. Use your Projectworks address or ask for pilot access.',
  exists: 'An account with that email already exists. Sign in instead.',
  server: 'Something went wrong. Please try again.',
};

function buildLoginPageHtml({ err, signupErr, tab }) {
  const errMsg = ERR_MSG[err] || (err ? 'Could not sign you in.' : '');
  const signupErrMsg = SIGNUP_ERR_MSG[signupErr] || (signupErr ? 'Could not create account.' : '');
  const showSignin = tab !== 'signup';
  const signinActive = showSignin ? ' is-active' : '';
  const signupActive = !showSignin ? ' is-active' : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PW Report Builder — Sign in</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/login.css" />
</head>
<body class="login-body">
  <div class="login-card">
    <div class="login-logo-wrap">
      <svg class="login-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2792 376.92" fill="currentColor" aria-label="Projectworks">
        <defs><style>.cls-1{fill-rule:evenodd;}</style></defs>
        <path d="M712.06,181.9c19.73,0,31.71-10.92,31.71-28.32s-11.99-28.8-31.71-28.8h-32.49v57.12h32.49Zm-32.49,27.54v71.9h-31.13V97.24h68.36c35.39,0,58.69,23.87,58.69,56.05s-23.4,56.05-58.69,56.05h-37.23v.1Z"/>
        <path d="M1057.35,255.64c31.13,0,61.88-22.04,61.88-66.49s-30.65-66.49-61.88-66.49-61.59,22.04-61.59,66.49,30.65,66.49,61.59,66.49Zm0-162.27c48.35,0,93.79,35.57,93.79,95.87s-45.45,96.07-93.79,96.07-93.5-35.57-93.5-96.07,45.16-95.87,93.5-95.87Z"/>
        <rect x="0" y="91.61" width="77.81" height="285.31"/>
        <rect x="228.25" y="91.61" width="72.62" height="191.94"/>
        <polygon class="cls-1" points="451.31 53.04 529.12 0 529.12 283.54 451.31 283.54 451.31 53.04"/>
        <polygon class="cls-1" points="337.19 130.83 415 77.79 415 283.54 337.19 283.54 337.19 130.83"/>
        <polygon class="cls-1" points="114.12 91.61 191.94 91.61 191.94 229.83 114.12 282.87 114.12 91.61"/>
      </svg>
    </div>
    <p class="login-subtitle">Report Builder</p>

    <nav class="login-tabs" aria-label="Account">
      <a href="/login" class="login-tab${signinActive}">Sign in</a>
      <a href="/login?tab=signup" class="login-tab${signupActive}">Create account</a>
    </nav>

    <div class="login-panel" id="panel-signin" ${showSignin ? '' : 'hidden'}>
      ${errMsg ? `<p class="login-error" role="alert">${esc(errMsg)}</p>` : ''}
      <form method="POST" action="/auth/login" class="login-form">
        <label for="email-in">Email</label>
        <input type="email" id="email-in" name="email" autocomplete="username" required placeholder="you@projectworks.com" />
        <label for="pw-in">Password</label>
        <input type="password" id="pw-in" name="password" autocomplete="current-password" required placeholder="Password" />
        <button type="submit" class="login-btn-primary">Sign in</button>
      </form>
    </div>

    <div class="login-panel" id="panel-signup" ${showSignin ? 'hidden' : ''}>
      ${signupErrMsg ? `<p class="login-error" role="alert">${esc(signupErrMsg)}</p>` : ''}
      <form method="POST" action="/auth/signup" class="login-form">
        <label for="email-up">Email</label>
        <input type="email" id="email-up" name="email" autocomplete="username" required placeholder="you@projectworks.com" />
        <label for="pw-up">Password</label>
        <input type="password" id="pw-up" name="password" autocomplete="new-password" required placeholder="At least 8 characters" minlength="8" />
        <label for="pw-up2">Confirm password</label>
        <input type="password" id="pw-up2" name="password_confirm" autocomplete="new-password" required placeholder="Confirm password" minlength="8" />
        <button type="submit" class="login-btn-primary">Create account</button>
      </form>
    </div>

    <div class="login-divider"><span>or</span></div>

    <button type="button" class="login-btn-sso" disabled aria-disabled="true" title="Coming soon">
      Login with Projectworks
      <span class="login-coming-soon">Coming soon</span>
    </button>
    <p class="login-hint">Single sign-on with your Projectworks account will be available here.</p>
  </div>
</body>
</html>`;
}

module.exports = { buildLoginPageHtml };
