'use strict';

/**
 * Per-user preferences — separate from auth/session code paths.
 * FUTURE: load defaults from org/tenant policy; sync with full memory layer.
 */

const PREF_DEFAULTS = {
  preferredRevenueMethod: null,
  explanationStyle: null,
  nativeReportsFirst: false,
  name: null,
  displayName: null,
};

const ALLOWED_REVENUE_METHODS = new Set([
  'invoiced',
  'effort_based',
  'cost_based',
  'time_and_materials',
]);

const ALLOWED_EXPLANATION_STYLES = new Set(['default', 'concise', 'detailed']);

function mergeDefaults(stored) {
  return {
    ...PREF_DEFAULTS,
    ...(stored && typeof stored === 'object' ? stored : {}),
  };
}

/** @param {import('../persistence/documentStore').DocumentStore} store */
function createPreferencesService(store) {
  return {
    PREF_DEFAULTS,

    // Async to match the Postgres-backed implementation so callers don't
    // branch on backend. The underlying read is still synchronous.
    async getForUserId(userId) {
      const doc = store.readSnapshot();
      const row = doc.preferences[userId];
      return mergeDefaults(row);
    },

    /**
     * @param {string} userId
     * @param {Record<string, unknown>} patch
     * @returns {Promise<typeof PREF_DEFAULTS>}
     */
    async patchUserPreferences(userId, patch) {
      if (!userId || typeof patch !== 'object' || patch === null) {
        const err = new Error('INVALID_PATCH');
        err.code = 'INVALID_PATCH';
        throw err;
      }
      await store.mutate(doc => {
        const cur = mergeDefaults(doc.preferences[userId]);
        const next = { ...cur };

        if ('preferredRevenueMethod' in patch) {
          const v = patch.preferredRevenueMethod;
          if (v !== null && v !== undefined && !ALLOWED_REVENUE_METHODS.has(v)) {
            const err = new Error('INVALID_REVENUE_METHOD');
            err.code = 'INVALID_REVENUE_METHOD';
            throw err;
          }
          next.preferredRevenueMethod = v === undefined ? cur.preferredRevenueMethod : v;
        }
        if ('explanationStyle' in patch) {
          const v = patch.explanationStyle;
          if (v !== null && v !== undefined && !ALLOWED_EXPLANATION_STYLES.has(v)) {
            const err = new Error('INVALID_EXPLANATION_STYLE');
            err.code = 'INVALID_EXPLANATION_STYLE';
            throw err;
          }
          next.explanationStyle = v === undefined ? cur.explanationStyle : v;
        }
        if ('nativeReportsFirst' in patch) {
          const v = patch.nativeReportsFirst;
          if (v !== undefined && typeof v !== 'boolean') {
            const err = new Error('INVALID_NATIVE_REPORTS_FIRST');
            err.code = 'INVALID_NATIVE_REPORTS_FIRST';
            throw err;
          }
          if (typeof v === 'boolean') next.nativeReportsFirst = v;
        }
        if ('name' in patch) {
          const v = patch.name;
          next.name = (v === null || v === undefined) ? null : String(v).slice(0, 100);
        }
        if ('displayName' in patch) {
          const v = patch.displayName;
          next.displayName = (v === null || v === undefined) ? null : String(v).slice(0, 100);
        }

        doc.preferences[userId] = next;
      });
      return await this.getForUserId(userId);
    },
  };
}

module.exports = {
  createPreferencesService,
  PREF_DEFAULTS,
};
