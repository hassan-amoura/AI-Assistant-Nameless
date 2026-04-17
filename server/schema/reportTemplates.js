'use strict';

/**
 * Lightweight template hints — stable instructions reused per family.
 * Keeps the main model from rediscovering the same join story every time.
 *
 * TODO: expand with example CTE skeletons once validated against real tenants.
 */
const TEMPLATES = [
  {
    id: 'revenue_by_client',
    family: 'revenue',
    keywords: ['revenue', 'client', 'company', 'invoice', 'invoiced'],
    hint:
      'Revenue-by-client reports usually aggregate reporting.Invoice (status-aware) or reporting.InvoiceLine joined to reporting.Company; confirm date field (InvoiceDate vs service period).',
  },
  {
    id: 'utilization_by_person',
    family: 'utilization',
    keywords: ['utilisation', 'utilization', 'capacity', 'billable', 'fte'],
    hint:
      'Utilisation vs capacity: prefer reporting.TimeEntry (Minutes/60.0) with reporting.Capacity.WorkHours for the denominator; confirm billable-only vs all hours.',
  },
  {
    id: 'projects_over_budget',
    family: 'projects',
    keywords: ['over budget', 'budget', 'variance', 'burn', 'phase'],
    hint:
      'Budget vs actual: confirm hours vs fees vs cost budget; reporting.Project vs reporting.Budget grain must match the question.',
  },
  {
    id: 'gross_profit_sector',
    family: 'margin',
    keywords: ['gross profit', 'margin', 'profit', 'sector', 'organisation'],
    hint:
      'Margin often pairs invoice-side revenue (status-filtered) with time cost from reporting.TimeEntry cost rates; watch currency and grain.',
  },
];

function findTemplateHint(text) {
  const t = (text || '').toLowerCase();
  for (const tpl of TEMPLATES) {
    const hit = tpl.keywords.some(kw => t.includes(kw));
    if (hit) return { ...tpl };
  }
  return null;
}

module.exports = { TEMPLATES, findTemplateHint };
