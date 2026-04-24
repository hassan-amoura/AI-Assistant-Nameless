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

const LOGO_LOCKUP = `<div style="text-align:center; margin-bottom:32px; overflow:visible">
  <svg width="100%" style="max-width:220px; overflow:visible" viewBox="0 0 2700 323" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
  @media (prefers-color-scheme: dark) { .pw { fill: #ffffff; } }
  .pw { fill: #000000; }
  </style>
  <g class="pw">
  <path d="M66.5723 78.3661H0V322.464H66.5723V78.3661Z"/>
  <path d="M257.422 78.3661H195.288V242.578H257.422V78.3661Z"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M386.12 45.3766L452.693 0V242.57H386.12V45.3766Z"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M288.493 111.913L355.066 66.5366V242.569H288.493V111.913Z"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M97.6453 78.3661H164.218V196.636L97.6453 242.012V78.3661Z"/>
  <path d="M587.685 179.211V243.148H560V79.4375H620.787C652.256 79.4375 672.977 100.664 672.977 129.281C672.977 157.898 652.17 179.125 620.787 179.125H587.685V179.211ZM616.574 154.719C634.114 154.719 644.776 145.008 644.776 129.539C644.776 114.07 634.114 103.93 616.574 103.93H587.685V154.719H616.574Z"/>
  <path d="M751.476 178.523H731.099V243.148H703.156V79.4375H766.006C797.647 79.4375 817.336 101.352 817.336 129.109C817.336 152.398 803.235 170.188 780.365 175.773L817.336 243.234H785.868L751.476 178.609V178.523ZM760.934 154.031C778.044 154.031 789.135 144.063 789.135 129.109C789.135 114.156 778.044 103.93 760.934 103.93H731.099V154.031H760.934Z"/>
  <path d="M923.607 76C966.596 76 1007.01 107.625 1007.01 161.25C1007.01 214.875 966.596 246.672 923.607 246.672C880.617 246.672 840.465 215.047 840.465 161.25C840.465 107.453 880.617 76 923.607 76ZM923.607 220.289C951.292 220.289 978.633 200.695 978.633 161.164C978.633 121.633 951.378 102.039 923.607 102.039C895.835 102.039 868.838 121.633 868.838 161.164C868.838 200.695 896.093 220.289 923.607 220.289Z"/>
  <path d="M1021.28 183.164L1048.28 177.578V192.789C1048.28 211.953 1059.11 220.461 1073.47 220.461C1087.83 220.461 1097.46 210.492 1097.46 193.906V79.4375H1125.14V193.305C1125.14 222.438 1104.85 246.672 1073.64 246.672C1042.43 246.672 1021.19 225.703 1021.19 193.82V183.164H1021.28Z"/>
  <path d="M1162.63 243.148V79.4375H1263.83V105.305H1190.4V148.703H1256.95V173.883H1190.4V217.281H1263.83V243.148H1162.63Z"/>
  <path d="M1291.08 161.422C1291.08 108.055 1331.06 76 1373.54 76C1416.01 76 1439.83 100.492 1447.22 129.109L1421.08 137.875C1416.27 118.023 1400.96 102.039 1373.45 102.039C1345.94 102.039 1319.37 121.633 1319.37 161.422C1319.37 201.211 1345.68 220.117 1373.62 220.117C1401.57 220.117 1416.87 202.586 1422.37 184.109L1447.82 192.445C1440.43 220.117 1415.49 246.672 1373.62 246.672C1329.52 246.672 1290.91 214.789 1290.91 161.422H1291.08Z"/>
  <path d="M1543.26 105.563V243.148H1515.57V105.563H1462.44V79.4375H1596.65V105.563H1543.26Z"/>
  <path d="M1812.2 79.4375H1840.83L1794.84 243.148H1766.2L1726.48 119.398L1686.76 243.148H1658.3L1611.87 79.4375H1641.02L1673.86 199.063L1712.12 79.4375H1741.01L1780.05 200.008L1812.2 79.4375Z"/>
  <path d="M1935.5 76C1978.49 76 2018.9 107.625 2018.9 161.25C2018.9 214.875 1978.49 246.672 1935.5 246.672C1892.51 246.672 1852.36 215.047 1852.36 161.25C1852.36 107.453 1892.51 76 1935.5 76ZM1935.5 220.289C1963.18 220.289 1990.52 200.695 1990.52 161.164C1990.52 121.633 1963.27 102.039 1935.5 102.039C1907.73 102.039 1880.73 121.633 1880.73 161.164C1880.73 200.695 1907.98 220.289 1935.5 220.289Z"/>
  <path d="M2096.45 178.523H2076.07V243.148H2048.13V79.4375H2110.98C2142.62 79.4375 2162.31 101.352 2162.31 129.109C2162.31 152.398 2148.21 170.188 2125.34 175.773L2162.31 243.234H2130.84L2096.45 178.609V178.523ZM2105.91 154.031C2123.02 154.031 2134.11 144.063 2134.11 129.109C2134.11 114.156 2123.02 103.93 2105.91 103.93H2076.07V154.031H2105.91Z"/>
  <path d="M2245.88 172.336L2224.13 196.141V243.234H2196.44V79.4375H2224.13V157.984L2294.63 79.4375H2331.17L2264.88 151.711L2331.86 243.148H2296.95L2245.88 172.25V172.336Z"/>
  <path d="M2439.25 125.672C2437.62 115.531 2429.1 100.492 2407.18 100.492C2390.59 100.492 2378.98 111.578 2378.98 124.039C2378.98 134.438 2385.43 142.258 2398.15 145.094L2421.71 149.906C2450.6 155.664 2466.08 173.883 2466.08 197C2466.08 222.438 2445.53 246.672 2408.13 246.672C2366.51 246.672 2347.34 219.859 2344.85 196.313L2370.72 188.922C2372.36 206.023 2384.57 221.75 2408.13 221.75C2427.73 221.75 2437.96 211.781 2437.96 199.148C2437.96 188.492 2430.14 179.984 2416.04 176.977L2392.91 172.164C2367.97 167.094 2351.29 150.68 2351.29 126.188C2351.29 98.6875 2376.49 76.0859 2407.01 76.0859C2445.61 76.0859 2460.57 99.6328 2464.27 117.852L2439.34 125.672H2439.25Z"/>
  <path d="M2527 243.148L2580 79.4375H2612L2665 243.148H2636L2622.5 200H2569.5L2556 243.148H2527ZM2577 176H2615L2596 113L2577 176Z"/>
  <path d="M2686 79.4375H2714V243.148H2686V79.4375Z"/>
  </g>
  </svg>
</div>`;

function buildLoginPageHtml({ err, signupErr, tab, resetSuccess }) {
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
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/login.css" />
  <script>
    // Clear the tab-session marker so the next app load always starts fresh.
    // Runs on every visit to the login page (logout, session expiry, first visit).
    try {
      for (var _i = sessionStorage.length - 1; _i >= 0; _i--) {
        var _k = sessionStorage.key(_i);
        if (_k && _k.startsWith('pw_tab_session_started')) sessionStorage.removeItem(_k);
      }
    } catch (_) {}
  </script>
</head>
<body class="login-body">
  <div class="login-card">
    ${LOGO_LOCKUP}

    <nav class="login-tabs" aria-label="Account">
      <a href="/login" class="login-tab${signinActive}">Sign in</a>
      <a href="/login?tab=signup" class="login-tab${signupActive}">Create account</a>
    </nav>

    <div class="login-panel" id="panel-signin" ${showSignin ? '' : 'hidden'}>
      ${resetSuccess ? `<p class="login-success" role="status">Password updated. Sign in with your new password.</p>` : ''}
      ${errMsg ? `<p class="login-error" role="alert">${esc(errMsg)}</p>` : ''}
      <form method="POST" action="/auth/login" class="login-form">
        <label for="email-in">Email</label>
        <input type="email" id="email-in" name="email" autocomplete="username" required placeholder="you@projectworks.com" />
        <label for="pw-in">Password</label>
        <input type="password" id="pw-in" name="password" autocomplete="current-password" required placeholder="Password" onkeydown="if(event.key==='Enter'){event.preventDefault();this.form.requestSubmit();}" />
        <button type="submit" class="login-btn-primary">Sign in</button>
        <a href="/auth/forgot-password" class="login-forgot-link">Forgot your password?</a>
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
        <input type="password" id="pw-up2" name="password_confirm" autocomplete="new-password" required placeholder="Confirm password" minlength="8" onkeydown="if(event.key==='Enter'){event.preventDefault();this.form.requestSubmit();}" />
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

function buildForgotPasswordPageHtml({ sent, err } = {}) {
  const errMsg = err === 'invalid' ? 'Enter a valid email address.' : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PW Report Builder — Reset password</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/login.css" />
</head>
<body class="login-body">
  <div class="login-card">
    ${LOGO_LOCKUP}
    <h2 class="login-page-title">Reset your password</h2>
    ${sent
      ? `<p class="login-success" role="status">If an account exists for that email, a reset link has been logged to the server console. Check there to get your link.</p>
         <a href="/login" class="login-back-link">Back to sign in</a>`
      : `${errMsg ? `<p class="login-error" role="alert">${esc(errMsg)}</p>` : ''}
         <form method="POST" action="/auth/forgot-password" class="login-form">
           <label for="email-fp">Email</label>
           <input type="email" id="email-fp" name="email" autocomplete="username" required placeholder="you@projectworks.com" />
           <button type="submit" class="login-btn-primary">Send reset link</button>
         </form>
         <a href="/login" class="login-back-link">Back to sign in</a>`
    }
  </div>
</body>
</html>`;
}

function buildResetPasswordPageHtml({ token, err } = {}) {
  const errMsgs = {
    invalid: 'This reset link is invalid or has expired. Please request a new one.',
    weak: 'Password must be at least 8 characters.',
    mismatch: 'Passwords did not match.',
    server: 'Something went wrong. Please try again.',
  };
  const errMsg = errMsgs[err] || (err ? 'Could not reset password.' : '');

  if (err === 'invalid') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PW Report Builder — Reset password</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/login.css" />
</head>
<body class="login-body">
  <div class="login-card">
    ${LOGO_LOCKUP}
    <h2 class="login-page-title">Reset your password</h2>
    <p class="login-error" role="alert">${esc(errMsg)}</p>
    <a href="/auth/forgot-password" class="login-back-link">Request a new reset link</a>
  </div>
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PW Report Builder — Set new password</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/login.css" />
</head>
<body class="login-body">
  <div class="login-card">
    ${LOGO_LOCKUP}
    <h2 class="login-page-title">Set a new password</h2>
    ${errMsg ? `<p class="login-error" role="alert">${esc(errMsg)}</p>` : ''}
    <form method="POST" action="/auth/reset-password" class="login-form">
      <input type="hidden" name="token" value="${esc(token || '')}" />
      <label for="pw-r">New password</label>
      <input type="password" id="pw-r" name="password" autocomplete="new-password" required placeholder="At least 8 characters" minlength="8" />
      <label for="pw-r2">Confirm new password</label>
      <input type="password" id="pw-r2" name="password_confirm" autocomplete="new-password" required placeholder="Confirm password" minlength="8" />
      <button type="submit" class="login-btn-primary">Set new password</button>
    </form>
  </div>
</body>
</html>`;
}

module.exports = { buildLoginPageHtml, buildForgotPasswordPageHtml, buildResetPasswordPageHtml };
