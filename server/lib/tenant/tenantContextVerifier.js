'use strict';

/**
 * Tenant Context Verification
 *
 * This module handles verification of tenant context (orgID) in requests.
 *
 * MODES OF OPERATION:
 *
 * 1. INTERNAL SINGLE-TENANT MODE (current default)
 *    - REQUIRE_SIGNED_ORG_ID is not set or is '0'
 *    - Raw orgID from query string is accepted (for demo/internal use)
 *    - This is UNSAFE for multi-tenant or embedded use — anyone can claim any org
 *    - Acceptable for internal staging where all users are trusted
 *
 * 2. SIGNED TENANT MODE (production/multi-tenant)
 *    - REQUIRE_SIGNED_ORG_ID=1
 *    - Requires a signed JWT token (pw_org_token query param)
 *    - Token must be signed with SIGNED_ORG_CONTEXT_SECRET
 *    - Token payload must include: orgID, exp
 *    - Optional payload fields: tenantName, userEmail, issuedBy
 *    - If orgID query param and token orgID both present, they must match
 *    - Prefer token orgID over query string orgID
 *
 * WHY RAW QUERY STRING ORGID IS UNSAFE:
 * When this app is embedded as an iframe in Projectworks, the parent page
 * passes ?orgID=<tenant_id> to establish context. Without signature verification,
 * any page embedding this app (or any direct request) can claim to be any tenant.
 * In multi-tenant mode, this would allow User A to see User B's tenant data.
 *
 * FUTURE EXTENSIBILITY:
 * This module is designed to be replaceable. When Projectworks implements:
 * - Azure AD claims-based auth
 * - OAuth with tenant scope
 * - Projectworks session-based tenant claims
 * ...this verifier can be swapped out without changing server.js routing.
 */

const crypto = require('crypto');

/**
 * Simple JWT-like token structure using HMAC-SHA256.
 * Format: base64url(header).base64url(payload).base64url(signature)
 *
 * This is intentionally simple and does not implement full JWT spec.
 * Replace with a proper JWT library (jsonwebtoken) if needed.
 */

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str) {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

/**
 * Verifies a signed tenant token.
 *
 * @param {string} token - The signed token (pw_org_token)
 * @param {string} secret - The shared secret (SIGNED_ORG_CONTEXT_SECRET)
 * @returns {{ valid: boolean, payload?: object, error?: string }}
 */
function verifyTenantToken(token, secret) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'missing_token' };
  }
  if (!secret || typeof secret !== 'string' || secret.length < 16) {
    return { valid: false, error: 'invalid_secret_config' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'malformed_token' };
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Verify signature
  const signatureInput = `${headerB64}.${payloadB64}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signatureInput)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // Constant-time comparison to prevent timing attacks
  const actualSigBuf = Buffer.from(signatureB64);
  const expectedSigBuf = Buffer.from(expectedSignature);

  if (actualSigBuf.length !== expectedSigBuf.length ||
      !crypto.timingSafeEqual(actualSigBuf, expectedSigBuf)) {
    return { valid: false, error: 'invalid_signature' };
  }

  // Parse payload
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch {
    return { valid: false, error: 'invalid_payload' };
  }

  // Check required fields
  if (!payload.orgID || typeof payload.orgID !== 'string') {
    return { valid: false, error: 'missing_org_id' };
  }

  // Check expiration
  if (!payload.exp || typeof payload.exp !== 'number') {
    return { valid: false, error: 'missing_expiration' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    return { valid: false, error: 'token_expired' };
  }

  return { valid: true, payload };
}

/**
 * Creates a signed tenant token for testing/development.
 *
 * @param {object} payload - Token payload (must include orgID)
 * @param {string} secret - The shared secret
 * @param {number} [expiresInSeconds=3600] - Token lifetime
 * @returns {string} The signed token
 */
function createTenantToken(payload, secret, expiresInSeconds = 3600) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const fullPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    iat: Math.floor(Date.now() / 1000),
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const signatureInput = `${headerB64}.${payloadB64}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(signatureInput)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Extracts and verifies tenant context from a request.
 *
 * @param {object} req - Express request object
 * @param {object} options
 * @param {boolean} options.requireSigned - Whether to require signed tokens
 * @param {string} options.secret - The signing secret (required if requireSigned=true)
 * @returns {{ orgID: string|null, verified: boolean, error?: string, payload?: object }}
 */
function extractTenantContext(req, options = {}) {
  const { requireSigned = false, secret = '' } = options;

  const queryOrgID = typeof req.query.orgID === 'string' ? req.query.orgID.trim() : null;
  const token = typeof req.query.pw_org_token === 'string' ? req.query.pw_org_token.trim() : null;

  // Validate orgID format if present
  if (queryOrgID && !/^[a-zA-Z0-9_-]{1,64}$/.test(queryOrgID)) {
    return { orgID: null, verified: false, error: 'malformed_org_id' };
  }

  // SIGNED MODE: require valid token
  if (requireSigned) {
    if (!token) {
      return { orgID: null, verified: false, error: 'signed_token_required' };
    }

    const result = verifyTenantToken(token, secret);
    if (!result.valid) {
      return { orgID: null, verified: false, error: result.error };
    }

    const tokenOrgID = result.payload.orgID;

    // If both query orgID and token orgID present, they must match
    if (queryOrgID && queryOrgID !== tokenOrgID) {
      return { orgID: null, verified: false, error: 'org_id_mismatch' };
    }

    return {
      orgID: tokenOrgID,
      verified: true,
      payload: result.payload
    };
  }

  // UNSIGNED MODE: accept raw query string (internal/demo use only)
  if (queryOrgID) {
    return { orgID: queryOrgID, verified: false };
  }

  // No tenant context provided
  return { orgID: null, verified: false };
}

/**
 * Returns a user-friendly error message for tenant context errors.
 * Does not expose internal error codes to the browser.
 */
function friendlyTenantError(errorCode) {
  switch (errorCode) {
    case 'signed_token_required':
      return 'A signed Projectworks token is required to access this application.';
    case 'invalid_signature':
    case 'malformed_token':
    case 'invalid_payload':
      return 'The provided token is invalid. Please try loading the application again.';
    case 'token_expired':
      return 'Your session has expired. Please reload the application.';
    case 'org_id_mismatch':
      return 'Organisation context mismatch. Please reload the application.';
    case 'missing_org_id':
    case 'missing_expiration':
      return 'The provided token is incomplete. Please contact support.';
    case 'malformed_org_id':
      return 'Invalid organisation identifier.';
    default:
      return 'Unable to verify organisation context. Please try again.';
  }
}

module.exports = {
  verifyTenantToken,
  createTenantToken,
  extractTenantContext,
  friendlyTenantError,
};
