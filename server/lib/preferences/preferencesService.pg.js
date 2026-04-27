'use strict';

/**
 * Postgres-backed user preferences service.
 *
 * Validation (allowed revenue methods, explanation styles, boolean shape) is
 * identical to the file-store version — DB stores values as plain TEXT, app
 * layer owns the allowed-value set so adding a new value doesn't need a
 * migration.
 */

const { PREF_DEFAULTS } = require('./preferencesService');

const ALLOWED_REVENUE_METHODS = new Set([
  'invoiced',
  'effort_based',
  'cost_based',
  'time_and_materials',
]);

const ALLOWED_EXPLANATION_STYLES = new Set(['default', 'concise', 'detailed']);

function rowToPrefs(row) {
  return {
    preferredRevenueMethod: row && row.preferred_revenue_method != null
      ? row.preferred_revenue_method
      : PREF_DEFAULTS.preferredRevenueMethod,
    explanationStyle: row && row.explanation_style != null
      ? row.explanation_style
      : PREF_DEFAULTS.explanationStyle,
    nativeReportsFirst: row && typeof row.native_reports_first === 'boolean'
      ? row.native_reports_first
      : PREF_DEFAULTS.nativeReportsFirst,
    name: null,
    displayName: null,
  };
}

function validatePatch(patch) {
  if (!patch || typeof patch !== 'object') {
    const err = new Error('INVALID_PATCH');
    err.code = 'INVALID_PATCH';
    throw err;
  }
  if ('preferredRevenueMethod' in patch) {
    const v = patch.preferredRevenueMethod;
    if (v !== null && v !== undefined && !ALLOWED_REVENUE_METHODS.has(v)) {
      const err = new Error('INVALID_REVENUE_METHOD');
      err.code = 'INVALID_REVENUE_METHOD';
      throw err;
    }
  }
  if ('explanationStyle' in patch) {
    const v = patch.explanationStyle;
    if (v !== null && v !== undefined && !ALLOWED_EXPLANATION_STYLES.has(v)) {
      const err = new Error('INVALID_EXPLANATION_STYLE');
      err.code = 'INVALID_EXPLANATION_STYLE';
      throw err;
    }
  }
  if ('nativeReportsFirst' in patch) {
    const v = patch.nativeReportsFirst;
    if (v !== undefined && typeof v !== 'boolean') {
      const err = new Error('INVALID_NATIVE_REPORTS_FIRST');
      err.code = 'INVALID_NATIVE_REPORTS_FIRST';
      throw err;
    }
  }
  // name and displayName are accepted but not persisted in the Postgres column;
  // they are gracefully ignored here so the file-store path works without errors.
}

/** @param {import('pg').Pool} pool */
function createPgPreferencesService(pool) {
  const svc = {
    PREF_DEFAULTS,

    async getForUserId(userId) {
      if (!userId) return { ...PREF_DEFAULTS };
      const { rows } = await pool.query(
        `SELECT preferred_revenue_method, explanation_style, native_reports_first
         FROM user_preferences
         WHERE user_id = $1`,
        [userId],
      );
      return rowToPrefs(rows[0]);
    },

    async patchUserPreferences(userId, patch) {
      if (!userId) {
        const err = new Error('INVALID_PATCH');
        err.code = 'INVALID_PATCH';
        throw err;
      }
      validatePatch(patch);

      const cur = await svc.getForUserId(userId);
      const next = { ...cur };
      if ('preferredRevenueMethod' in patch) {
        next.preferredRevenueMethod = patch.preferredRevenueMethod === undefined
          ? cur.preferredRevenueMethod
          : patch.preferredRevenueMethod;
      }
      if ('explanationStyle' in patch) {
        next.explanationStyle = patch.explanationStyle === undefined
          ? cur.explanationStyle
          : patch.explanationStyle;
      }
      if ('nativeReportsFirst' in patch && typeof patch.nativeReportsFirst === 'boolean') {
        next.nativeReportsFirst = patch.nativeReportsFirst;
      }
      // name and displayName are not persisted to DB — handled by file-store path only.
      if ('name' in patch) {
        const v = patch.name;
        next.name = (v === null || v === undefined) ? null : String(v).slice(0, 100);
      }
      if ('displayName' in patch) {
        const v = patch.displayName;
        next.displayName = (v === null || v === undefined) ? null : String(v).slice(0, 100);
      }

      await pool.query(
        `INSERT INTO user_preferences
           (user_id, preferred_revenue_method, explanation_style, native_reports_first, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           preferred_revenue_method = EXCLUDED.preferred_revenue_method,
           explanation_style        = EXCLUDED.explanation_style,
           native_reports_first     = EXCLUDED.native_reports_first,
           updated_at               = NOW()`,
        [userId, next.preferredRevenueMethod, next.explanationStyle, next.nativeReportsFirst],
      );
      return next;
    },
  };
  return svc;
}

module.exports = { createPgPreferencesService };
