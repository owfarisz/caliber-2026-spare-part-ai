// Offline policy mirror for the five curated GitHub Pages demo materials.
// The trained 30-day forecasts and all aggregates are exported by export_static.py.
const COUNT_UNITS = new Set(['EA', 'SET', 'CAN', 'ASS', 'RL', 'SHT']);
const DRAWS = 4000;

function number(value, label, low = 0, high = Infinity) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < low || parsed > high) throw new Error(`${label} must be between ${low} and ${high}`);
  return parsed;
}

function seededRandom() {
  let state = 271828;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return (state + 0.5) / 4294967296;
  };
}

function samples(days, rate, sizes, scale, planned) {
  const random = seededRandom();
  const values = [];
  for (let i = 0; i < DRAWS; i++) {
    let time = 0;
    let demand = planned;
    if (rate > 0) {
      while (true) {
        time += -Math.log(1 - random()) / rate;
        if (time >= days) break;
        demand += sizes[Math.floor(random() * sizes.length)] * scale;
      }
    }
    values.push(demand);
  }
  return values.sort((a, b) => a - b);
}

const quantile = (values, p) => values[Math.max(0, Math.min(values.length - 1, Math.ceil(p * values.length) - 1))];
const risk = (values, stock) => values.filter(value => value > stock).length / values.length;
const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;

export function simulateStatic(record, scenario = {}) {
  const forecastRaw = scenario.forecast_30d_override ?? record.forecast_30d;
  const probabilityRaw = scenario.probability_any_30d_override ?? record.probability_any_30d;
  if (forecastRaw == null || probabilityRaw == null) return { available: false, reason: 'No issue history. Enter both a 30-day quantity estimate and an any-issue probability to simulate.' };
  const forecast = number(forecastRaw, 'forecast_30d');
  const probability = number(probabilityRaw, 'probability_any_30d', 0, .999999);
  if ((forecast === 0) !== (probability === 0)) throw new Error('Forecast quantity and any-issue probability must both be zero or both be positive');
  const stock = number(scenario.stock ?? record.stock ?? 0, 'stock');
  const leadDays = number(scenario.lead_days ?? record.lead_days_proxy ?? 30, 'lead_days', 1, 365);
  const reviewDays = number(scenario.review_days ?? 30, 'review_days', 0, 90);
  const service = number(scenario.service_target ?? .95, 'service_target', .5, .999);
  const multiplier = number(scenario.demand_multiplier ?? 1, 'demand_multiplier', 0, 5);
  const knownLead = number(scenario.known_lead_demand ?? 0, 'known_lead_demand');
  const knownReview = number(scenario.known_review_demand ?? 0, 'known_review_demand');
  const unitCostRaw = scenario.unit_cost_idr ?? record.unit_price_idr;
  const unitCost = unitCostRaw == null || unitCostRaw === '' ? null : number(unitCostRaw, 'unit_cost_idr');
  const holdingRate = number(scenario.annual_holding_rate ?? .2, 'annual_holding_rate', 0, 1);
  const stockoutCost = scenario.stockout_cost_idr == null || scenario.stockout_cost_idr === '' ? null : number(scenario.stockout_cost_idr, 'stockout_cost_idr');
  const sizes = (record.issue_day_sizes || []).map(Number).filter(value => value > 0);
  if (!sizes.length) sizes.push(1);
  const baseRate = probability ? -Math.log(1 - probability) / 30 : 0;
  const rate = baseRate * multiplier;
  const meanSize = sizes.reduce((sum, value) => sum + value, 0) / sizes.length;
  const scale = baseRate && meanSize ? forecast / (baseRate * 30 * meanSize) : 0;
  const lead = samples(leadDays, rate, sizes, scale, knownLead);
  const protectionDays = leadDays + reviewDays;
  const protection = samples(protectionDays, rate, sizes, scale, knownLead + knownReview);
  const countUnit = COUNT_UNITS.has(record.unit);
  const policyLevel = value => countUnit ? Math.ceil(value) : round2(value);
  const reorderPoint = policyLevel(quantile(lead, service));
  const orderUpTo = policyLevel(quantile(protection, service));
  const rawOrder = stock <= reorderPoint ? Math.max(0, orderUpTo - stock) : 0;
  const orderQty = countUnit ? Math.ceil(rawOrder) : round2(rawOrder);
  const existingMax = record.mrp_type === 'Stock Item' ? record.max_qty : null;
  const policyConflict = existingMax != null && existingMax > 0 && orderUpTo > existingMax;
  const reviewDraftQty = policyConflict ? Math.min(orderQty, Math.max(0, existingMax - stock)) : orderQty;
  const meanLead = forecast * multiplier * leadDays / 30 + knownLead;
  const meanProtection = forecast * multiplier * protectionDays / 30 + knownLead + knownReview;
  const safetyStock = policyLevel(Math.max(0, reorderPoint - meanLead));
  const chartStock = stock <= Math.max(2 * orderUpTo, orderUpTo + 10) ? [stock] : [];
  const levels = [...new Set([0, reorderPoint, orderUpTo, ...chartStock,
    ...[.1, .25, .5, .75, .9, .95, .99].map(q => quantile(protection, q))].map(policyLevel))].sort((a, b) => a - b);
  const curve = levels.map(level => {
    const shortageRisk = risk(protection, level);
    const holding = unitCost == null ? null : unitCost * holdingRate * protectionDays / 365 *
      protection.reduce((sum, demand) => sum + Math.max(level - demand, 0), 0) / DRAWS;
    const shortage = stockoutCost == null ? null : stockoutCost * shortageRisk;
    return { stock: level, stockout_risk: round2(shortageRisk * 100) / 100,
      holding_cost_idr: holding == null ? null : round2(holding),
      stockout_cost_idr: shortage == null ? null : round2(shortage),
      total_cost_idr: holding == null || shortage == null ? null : round2(holding + shortage) };
  });
  const optimum = unitCost == null || stockoutCost == null ? null : curve.reduce((best, row) =>
    best == null || row.total_cost_idr < best.total_cost_idr ? row : best, null).stock;
  const action = stock <= reorderPoint ? 'Reorder now' : existingMax != null && stock > existingMax ? 'Review above existing maximum' : 'Monitor';
  return { available: true,
    basis: scenario.forecast_30d_override != null || scenario.probability_any_30d_override != null ? 'User estimates' : 'Historical issue model',
    unit: record.unit, action, stock, forecast_30d: round2(forecast * multiplier),
    probability_any_30d: Math.round((1 - Math.exp(-rate * 30)) * 10000) / 10000,
    mean_demand_lead: round2(meanLead), mean_demand_protection: round2(meanProtection),
    stockout_risk_lead: Math.round(risk(lead, stock) * 10000) / 10000,
    stockout_risk_protection: Math.round(risk(protection, stock) * 10000) / 10000,
    reorder_point: round2(reorderPoint), safety_stock: safetyStock, order_up_to: round2(orderUpTo),
    order_qty: round2(orderQty), review_draft_qty: countUnit ? Math.ceil(reviewDraftQty) : round2(reviewDraftQty),
    policy_conflict: policyConflict, existing_max_qty: existingMax,
    illustrative_lowest_cost_stock: optimum, curve,
    assumptions: { lead_days: leadDays, lead_source: scenario.lead_days != null ? 'User-entered' : record.lead_days_proxy != null ? 'PR-to-promised-PO proxy' : 'Default assumption',
      review_days: reviewDays, service_target: service, demand_multiplier: multiplier,
      known_lead_demand: knownLead, known_review_demand: knownReview,
      annual_holding_rate: holdingRate, unit_cost_idr: unitCost, stockout_cost_idr: stockoutCost,
      simulation_draws: DRAWS, method: 'Compound-Poisson approximation calibrated to model occurrence and mean; empirical positive issue-day sizes.',
      missing_inputs: 'No open orders, actual receipt dates, demand censoring, MOQ, or verified downtime costs.' } };
}

let snapshotPromise;
function snapshot() {
  if (!snapshotPromise) snapshotPromise = fetch(`${import.meta.env.BASE_URL}case-data.json`).then(response => {
    if (!response.ok) throw new Error('Static case snapshot could not be loaded');
    return response.json();
  });
  return snapshotPromise;
}

export async function staticApi(route, options) {
  const data = await snapshot();
  const params = new URLSearchParams(route);
  const name = params.get('route') || 'overview';
  if (name === 'overview') return data.overview;
  if (name === 'focus') return data.overview.focus_scenarios;
  if (name === 'materials') {
    const query = (params.get('q') || '').toLowerCase();
    const limit = Math.min(Number(params.get('limit') || 20), 50);
    return data.overview.focus_scenarios.filter(item =>
      item.material_id.includes(query) || item.description.toLowerCase().includes(query)).slice(0, limit);
  }
  if (name === 'material') {
    const item = data.materials[params.get('id')];
    if (!item) throw new Error('Only the five featured materials are included in this static demo');
    return item;
  }
  if (name === 'supplier') {
    const item = data.suppliers[params.get('id')]?.[params.get('action') || 'Monitor'];
    if (!item) throw new Error('Supplier evidence is unavailable for this material');
    return item;
  }
  if (name === 'continuity') return data.continuity;
  if (name === 'scenario') {
    const body = JSON.parse(options?.body || '{}');
    const item = data.materials[body.material_id];
    if (!item) throw new Error('Only the five featured materials are included in this static demo');
    return simulateStatic(item, body.scenario || {});
  }
  throw new Error('Unknown static demo route');
}
