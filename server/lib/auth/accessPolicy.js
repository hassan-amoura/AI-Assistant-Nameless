'use strict';

/**
 * Who may self-register. Domains + explicit pilot allowlist are env-driven so
 * pilots can be added without code changes.
 *
 * FUTURE: tenant-aware rules, SSO-only signup, org invitations.
 */

const INTERNAL_SIGNUP_DOMAINS = (process.env.INTERNAL_SIGNUP_DOMAINS
  || 'projectworks.com,projectworks.io')
  .split(',')
  .map(d => d.trim().toLowerCase())
  .filter(Boolean);

/** Lowercased emails — EXTERNAL_PILOT_ALLOWLIST=a@x.com,b@y.com */
const EXTERNAL_PILOT_ALLOWLIST = (process.env.EXTERNAL_PILOT_ALLOWLIST || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function emailDomain(email) {
  const at = email.lastIndexOf('@');
  if (at < 1) return '';
  return email.slice(at + 1).toLowerCase();
}

function isAllowedInternalDomainSignup(email) {
  const domain = emailDomain(email);
  return !!domain && INTERNAL_SIGNUP_DOMAINS.includes(domain);
}

function isExternalPilotEmail(email) {
  return EXTERNAL_PILOT_ALLOWLIST.includes(normalizeEmail(email));
}

/** True if this email may create a new account (self sign-up). */
function isSignupAllowedForEmail(email) {
  const n = normalizeEmail(email);
  if (!n || !n.includes('@')) return false;
  if (isExternalPilotEmail(n)) return true;
  return isAllowedInternalDomainSignup(n);
}

module.exports = {
  normalizeEmail,
  emailDomain,
  isSignupAllowedForEmail,
  INTERNAL_SIGNUP_DOMAINS,
  EXTERNAL_PILOT_ALLOWLIST,
};
