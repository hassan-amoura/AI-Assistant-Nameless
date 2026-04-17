'use strict';

/**
 * Report "families" drive which reporting.* tables we keep in context.
 * Lines are matched with: - **reporting.TableName**
 *
 * Unknown / general → keep full schema (safe, same as before slicing).
 */
const FAMILY_TABLES = {
  general: null, // null = no filtering
  utilization: new Set([
    'Resource', 'Capacity', 'Person', 'TimeEntry', 'Posting', 'Leave', 'Timesheet',
  ]),
  revenue: new Set([
    'Invoice', 'InvoiceLine', 'Company', 'Project', 'Forecast', 'Budget', 'Person',
  ]),
  margin: new Set([
    'Invoice', 'InvoiceLine', 'TimeEntry', 'Expense', 'Project', 'Budget', 'Company',
  ]),
  projects: new Set([
    'Project', 'Budget', 'TimeEntry', 'Resource', 'Forecast', 'Invoice', 'Company',
  ]),
  people: new Set([
    'Person', 'Posting', 'Capacity', 'TimeEntry', 'Resource', 'Cost', 'Leave',
  ]),
  time: new Set([
    'TimeEntry', 'Timesheet', 'Timecode', 'TimecodeAssignment', 'Budget', 'Project', 'Person',
  ]),
  expenses: new Set(['Expense', 'Project', 'Budget', 'InvoiceLine', 'Company', 'Person']),
  forecast: new Set(['Forecast', 'Project', 'Budget', 'Company', 'Resource']),
  invoicing: new Set(['Invoice', 'InvoiceLine', 'InvoicePayment', 'Project', 'Company']),
};

/**
 * @param {string} schemaBlock  Full "## PROJECTWORKS REPORTING SCHEMA ..." section (static or live)
 * @param {string} family       Key from intake / templates
 * @returns {string}             Filtered schema or original if slice would drop everything
 */
function sliceSchemaSection(schemaBlock, family) {
  if (!schemaBlock || !schemaBlock.trim()) return schemaBlock || '';
  const allow = FAMILY_TABLES[family];
  if (!allow) return schemaBlock;

  const lines = schemaBlock.split('\n');
  const kept = lines.filter(line => {
    const m = line.match(/\*\*reporting\.(\w+)\*\*/);
    if (!m) return true; // keep headers / blank lines that do not reference a table
    return allow.has(m[1]);
  });

  const body = kept.join('\n').trim();
  // Never return empty — fall back to full schema for safety
  if (!body.replace(/^#+\s.*/m, '').trim()) return schemaBlock;
  return kept.join('\n');
}

/** One line per table name for cheap advisor context (no column lists). */
function schemaTableOverview(schemaBlock) {
  const names = new Set();
  const re = /\*\*reporting\.(\w+)\*\*/g;
  let m;
  while ((m = re.exec(schemaBlock))) names.add(m[1]);
  const list = [...names].sort().join(', ');
  return `## Reporting tables (names only)\nreporting schema includes: ${list || '(none parsed)'}\n`;
}

module.exports = { sliceSchemaSection, schemaTableOverview, FAMILY_TABLES };
