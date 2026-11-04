import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const api = async (route, options) => {
  const response = await fetch(`/api?route=${route}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
};

const compact = (value, digits = 0) => value == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
const pct = (value, digits = 1) => value == null ? '—' : `${(value * 100).toFixed(digits)}%`;
const money = (value) => value == null ? '—' : `IDR ${compact(value, 0)}`;

function App() {
  const [page, setPage] = useState(location.hash.replace('#/', '') || 'overview');
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const onHash = () => setPage(location.hash.replace('#/', '') || 'overview');
    window.addEventListener('hashchange', onHash);
    api('overview').then(setOverview).catch((e) => setError(e.message));
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const current = ['overview', 'scenario', 'method'].includes(page) ? page : 'overview';
  const nav = [
    ['overview', 'Overview'], ['scenario', 'Scenario studio'], ['method', 'Model & evidence']
  ];
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#/overview" aria-label="CALIBER overview"><span className="brand-mark">C</span><span><strong>CALIBER</strong><small>SPARE PART INTELLIGENCE</small></span></a>
      <nav aria-label="Main navigation">{nav.map(([id, label]) => <a key={id} href={`#/${id}`} className={current === id ? 'nav-link active' : 'nav-link'} aria-current={current === id ? 'page' : undefined}>{label}<span aria-hidden="true">↗</span></a>)}</nav>
      <div className="sidebar-foot"><span className="status-dot" /> Synthetic case workspace<br /><small>Model as of 30 Sep 2026</small></div>
    </aside>
    <div className="main-area">
      <header className="topbar"><span>Inventory planning workspace</span><div><span className="topbar-sep" /><span>CASE 03</span><span className="topbar-date">30 SEP 2026</span></div></header>
      <main>
        {error && <div className="error-banner" role="alert">Could not load the case data: {error}. Refresh to try again.</div>}
        {!overview && !error && <div className="loading-page"><span className="loading-pulse" /> Loading case evidence…</div>}
        {overview && current === 'overview' && <Overview data={overview} />}
        {overview && current === 'scenario' && <ScenarioStudio data={overview} />}
        {overview && current === 'method' && <Methodology data={overview} />}
      </main>
      <footer className="footer"><span>CALIBER 2026 · Synthetic case data</span><span>Decision support prototype · not a live plant system</span></footer>
    </div>
  </div>;
}

function Overview({ data }) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState(null);
  const [searchError, setSearchError] = useState('');
  useEffect(() => {
    if (!query.trim()) { setMatches(null); setSearchError(''); return; }
    const timeout = setTimeout(() => api(`materials&q=${encodeURIComponent(query)}&limit=20`).then(setMatches).catch(e => setSearchError(e.message)), 220);
    return () => clearTimeout(timeout);
  }, [query]);
  const items = matches ?? data.review_queue;
  const historyShare = data.history_materials / data.catalog_materials;
  return <div className="page">
    <div className="page-intro"><div><h1>Inventory decisions,<br /><em>with uncertainty in view.</em></h1><p>Material-level demand signals and stock recommendations from the CALIBER synthetic case. Review the evidence before changing a policy.</p></div><a href="#/scenario" className="primary-link">Open scenario studio <span>↗</span></a></div>
    <div className="notice"><strong>Synthetic case data</strong><span>Forecasts describe material issues, not proven failures or measured downtime. Current stock has no source timestamp.</span></div>
    <div className="metric-strip" aria-label="Case snapshot">
      <Metric label="Materials in catalog" value={compact(data.catalog_materials)} note="One stock record per material" />
      <Metric label="With issue history" value={compact(data.history_materials)} note="Eligible for model forecast" />
      <Metric label="Below existing Min" value={compact(data.stock_health.below_min)} note="Stock Items · review" tone="warm" />
      <Metric label="Above existing Max" value={compact(data.stock_health.above_max)} note="Stock Items · review" tone="warm" />
    </div>
    <div className="section-grid overview-grid">
      <section className="panel monthly-panel"><div className="section-head"><div><h2>Issue activity over time</h2><p>Number of recorded issue rows per month · no mixed-unit quantity totals</p></div><span className="panel-tag">MAY 2025 — SEP 2026</span></div><MonthlyBars rows={data.monthly_issues} /></section>
      <section className="panel coverage-panel"><div className="section-head"><div><h2>Forecast coverage</h2><p>Materials with observed issue history</p></div></div><div className="coverage-body"><div className="donut" style={{ '--share': `${historyShare * 100}%` }} role="img" aria-label={`${Math.round(historyShare * 100)} percent of materials have issue history`}><div><strong>{Math.round(historyShare * 100)}%</strong><small>modeled</small></div></div><div className="coverage-copy"><div><span className="swatch teal" /> <strong>{compact(data.history_materials)}</strong> observed</div><div><span className="swatch sand" /> <strong>{compact(data.without_issue_history)}</strong> without history</div><p>No observed issue in this window does not prove zero future demand or obsolete stock.</p></div></div></section>
    </div>
    <div className="section-grid lower-grid">
      <section className="panel stock-panel"><div className="section-head"><div><h2>Inventory policy exceptions</h2><p>Existing Min–Max fields at material grain</p></div></div><HorizontalBars rows={[['Below Min', data.stock_health.below_min, 'risk'], ['Above Max', data.stock_health.above_max, 'amber'], ['Non Stock with on-hand', data.stock_health.nonstock_positive, 'blue']]} /><p className="chart-note">“Above Max” is a review candidate, not an automatic disposal instruction. Non Stock items can legitimately have physical inventory.</p></section>
      <section className="insights"><h2>Signals to investigate</h2><Insight number="01" title="A narrow observed-demand footprint" text={`${compact(data.without_issue_history)} materials have no issue in the 513-day observation window. The simulator requires explicit estimates for those items.`} /><Insight number="02" title="Current rules pull in both directions" text={`${compact(data.stock_health.below_min)} Stock Items sit below Min while ${compact(data.stock_health.above_max)} sit above Max. Review material by material before changing controls.`} /><Insight number="03" title="Repeat rows matter" text={`${compact(data.model.duplicate_issue_sensitivity.affected_materials)} modeled materials change under a hypothetical exact-repeat removal; ${compact(data.model.duplicate_issue_sensitivity.materials_changed_at_least_10pct)} shift by at least 10%. These rows remain in the authoritative data.`} /></section>
    </div>
    <section className="panel queue-panel"><div className="section-head queue-head"><div><h2>{matches ? 'Material search' : 'Priority review queue'}</h2><p>{matches ? 'Search results from the material master' : 'Ranked by modeled demand exposure relative to current stock; a screening score, not stockout probability'}</p></div><label className="search-box"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search material ID or description" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search materials" /></label></div>{searchError && <p role="alert">Search failed: {searchError}</p>}<div className="table-wrap"><table><thead><tr><th>Material</th><th>Policy</th><th>On hand</th><th>30-day forecast</th><th>Any-issue chance</th><th>Next step</th></tr></thead><tbody>{items.map(item => <tr key={item.material_id}><td><a href="#/scenario" onClick={() => sessionStorage.setItem('caliber-material', item.material_id)}><strong>{item.material_id}</strong><small>{item.description}</small></a></td><td><StatusPill item={item} /></td><td>{compact(item.stock, 2)} <small>{item.unit}</small></td><td>{item.forecast_30d == null ? 'Insufficient history' : `${compact(item.forecast_30d, 2)} ${item.unit}`}</td><td>{pct(item.probability_any_30d)}</td><td><a className="table-action" href="#/scenario" onClick={() => sessionStorage.setItem('caliber-material', item.material_id)}>Simulate ↗</a></td></tr>)}</tbody></table>{items.length === 0 && <div className="empty-state">No materials match this search. Try a material number or a shorter description.</div>}</div></section>
  </div>;
}

function Metric({ label, value, note, tone }) { return <div className={`metric ${tone || ''}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }
function Insight({ number, title, text }) { return <article className="insight"><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></article>; }
function StatusPill({ item }) { const state = item.mrp_type === 'Stock Item' && item.stock < item.min_qty ? 'Below Min' : item.mrp_type === 'Stock Item' && item.stock > item.max_qty ? 'Above Max' : item.mrp_type === 'Non Stock' ? 'Non Stock' : 'Within policy'; return <span className={`pill ${state.toLowerCase().replaceAll(' ', '-')}`}>{state}</span>; }

function MonthlyBars({ rows }) {
  const max = Math.max(...rows.map(r => r.issue_events));
  return <div className="monthly-chart" role="img" aria-label="Monthly recorded issue event bar chart"><div className="chart-grid"><span>{compact(max)}</span><span>{compact(max / 2)}</span><span>0</span></div><div className="bars">{rows.map((r, i) => <div className="bar-group" key={r.month}><div className="bar-track"><div className="bar" style={{ height: `${r.issue_events / max * 100}%` }} title={`${r.month}: ${compact(r.issue_events)} issue rows, ${compact(r.active_materials)} materials`} /></div><span>{i % 2 === 0 || i === rows.length - 1 ? r.month.slice(2).replace('-', '/') : ''}</span></div>)}</div></div>;
}
function HorizontalBars({ rows }) { const max = Math.max(...rows.map(r => r[1])); return <div className="horizontal-bars">{rows.map(([label, value, tone]) => <div className="horizontal-row" key={label}><div><span>{label}</span><strong>{compact(value)}</strong></div><div className="horizontal-track"><span className={tone} style={{ width: `${value / max * 100}%` }} /></div></div>)}</div>; }

function ScenarioStudio({ data }) {
  const [materialId, setMaterialId] = useState(sessionStorage.getItem('caliber-material') || '4100000129');
  const [detail, setDetail] = useState(null);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [inputs, setInputs] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setError(''); setDetail(null); setResult(null);
    api(`material&id=${encodeURIComponent(materialId)}`).then(item => {
      if (!active) return;
      setDetail(item);
      setInputs({ stock: item.stock, lead_days: item.lead_days_proxy || 30, review_days: 30,
        service_target: 0.95, demand_multiplier: 1, known_lead_demand: 0,
        known_review_demand: 0, unit_cost_idr: item.unit_price_idr ?? '',
        annual_holding_rate: 0.2, stockout_cost_idr: '' });
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [materialId]);
  useEffect(() => {
    if (!query.trim()) { setMatches([]); return; }
    const timeout = setTimeout(() => api(`materials&q=${encodeURIComponent(query)}&limit=8`).then(setMatches).catch(() => setMatches([])), 160);
    return () => clearTimeout(timeout);
  }, [query]);
  useEffect(() => {
    if (!detail) return;
    let active = true;
    const timeout = setTimeout(() => {
      setLoading(true); setError('');
      const scenario = Object.fromEntries(Object.entries(inputs).filter(([, v]) => v !== ''));
      api('scenario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ material_id: detail.material_id, scenario }) })
        .then(value => { if (active) setResult(value); })
        .catch(e => { if (active) setError(e.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => { active = false; clearTimeout(timeout); };
  }, [detail, inputs]);
  const set = (name, value) => setInputs(prev => ({ ...prev, [name]: value }));
  const select = (item) => { sessionStorage.setItem('caliber-material', item.material_id); setMaterialId(item.material_id); setQuery(''); setMatches([]); };
  return <div className="page scenario-page"><div className="page-intro scenario-intro"><div><h1>Scenario studio</h1><p>Change one material’s assumptions to see how demand, availability and holding cost reshape the suggested policy.</p></div><span className="method-badge">30-DAY MODEL · {data.model.selected.name.toUpperCase()}</span></div>
    <div className="notice"><strong>Decision twin, not a live plant replica</strong><span>Scenarios use a read-only stock snapshot and modeled issue demand. No actual stockouts, receipt dates or downtime costs were supplied.</span></div>
    <div className="material-picker"><div><label htmlFor="material-search">Material to simulate</label><div className="picker-input"><input id="material-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by material ID or description" autoComplete="off" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button>}</div>{matches.length > 0 && <div className="picker-results">{matches.map(item => <button type="button" key={item.material_id} onClick={() => select(item)}><strong>{item.material_id}</strong><span>{item.description}</span></button>)}</div>}</div>{detail && <div className="selected-material"><span>SELECTED MATERIAL</span><strong>{detail.material_id}</strong><p>{detail.description}</p><small>{detail.mrp_type} · {detail.unit} · {detail.location_count} mapped locations</small></div>}</div>
    {error && <div className="error-banner" role="alert">Scenario error: {error}. Check the inputs and try again.</div>}
    {!detail && !error && <div className="loading-page">Loading material details…</div>}
    {detail && <><div className="studio-grid"><section className="panel controls-panel"><div className="section-head"><div><h2>Set the conditions</h2><p>Every editable value is an assumption for this scenario</p></div></div><div className="field-grid">
      <Field label={`On-hand stock (${detail.unit})`} name="stock" value={inputs.stock} onChange={set} min="0" step="any" />
      <Field label="Lead time (days)" name="lead_days" value={inputs.lead_days} onChange={set} min="1" max="365" step="1" note={detail.lead_days_proxy ? `Default: ${compact(detail.lead_days_proxy)} days, PR to promised PO date` : 'Default: 30-day assumption; no usable PR proxy'} />
      <Field label="Review period (days)" name="review_days" value={inputs.review_days} onChange={set} min="0" max="90" step="1" />
      <Field label="Target cycle service" name="service_target" value={inputs.service_target} onChange={set} min="0.5" max="0.999" step="0.01" note="0.95 means a modeled 95% no-shortage target" />
      <Field label="Demand intensity multiplier" name="demand_multiplier" value={inputs.demand_multiplier} onChange={set} min="0" max="5" step="0.1" />
      <Field label={`Known demand during lead (${detail.unit})`} name="known_lead_demand" value={inputs.known_lead_demand} onChange={set} min="0" step="any" note="Enter only a confirmed part requirement" />
      <Field label={`Known demand during review (${detail.unit})`} name="known_review_demand" value={inputs.known_review_demand} onChange={set} min="0" step="any" />
      <Field label="Unit cost (IDR)" name="unit_cost_idr" value={inputs.unit_cost_idr} onChange={set} min="0" step="any" note={detail.price_status === 'IDR reference' ? 'Default: median observed IDR PO unit price' : 'No comparable IDR price; enter an assumption to see cost'} />
      <Field label="Annual holding rate" name="annual_holding_rate" value={inputs.annual_holding_rate} onChange={set} min="0" max="1" step="0.01" />
      <Field label="Cost per stockout event (IDR)" name="stockout_cost_idr" value={inputs.stockout_cost_idr} onChange={set} min="0" step="any" note="Optional assumption, not measured downtime loss" />
      {detail.forecast_30d == null && <><Field label={`Estimated 30-day demand (${detail.unit})`} name="forecast_30d_override" value={inputs.forecast_30d_override ?? ''} onChange={set} min="0" step="any" note="Required: no observed issue history" /><Field label="Estimated any-issue chance" name="probability_any_30d_override" value={inputs.probability_any_30d_override ?? ''} onChange={set} min="0" max="0.999" step="0.01" note="Required: enter a probability from 0 to 0.999" /></>}
    </div><div className="control-note">Stock is assumed available now. Open purchase orders and minimum order quantities are not in this dataset.</div></section>
      <div className="result-column"><section className="result-hero"><div className="result-top"><span>RECOMMENDED ACTION</span>{loading && <span className="updating">Updating…</span>}</div>{result?.available ? <><h2>{result.action}</h2><p>For material {detail.material_id}, under the conditions at left.</p><div className="result-key"><div><span>Order quantity</span><strong>{compact(result.order_qty, 2)} <small>{detail.unit}</small></strong></div><div><span>Lead-time stockout risk</span><strong>{pct(result.stockout_risk_lead)}</strong></div></div></> : <><h2>Input needed</h2><p>{result?.reason || 'Calculating the scenario…'}</p></>}</section>
      {result?.available && <><section className="panel policy-panel"><div className="section-head"><div><h2>Dynamic stock policy</h2><p>Modeled target at {pct(result.assumptions.service_target, 0)} cycle service</p></div></div><div className="policy-rows"><div><span>Expected lead demand</span><strong>{compact(result.mean_demand_lead, 2)} {detail.unit}</strong></div><div><span>Safety stock</span><strong>{compact(result.safety_stock, 2)} {detail.unit}</strong></div><div className="emphasis"><span>Reorder point</span><strong>{compact(result.reorder_point, 2)} {detail.unit}</strong></div><div><span>Order-up-to level</span><strong>{compact(result.order_up_to, 2)} {detail.unit}</strong></div></div><p className="chart-note">Count-unit policy levels and order quantities round up to whole units. Order quantity is before lot size, open-order and supplier constraints.</p></section><section className="panel scenario-risk"><div className="section-head"><div><h2>Cost and risk frontier</h2><p>As stock rises, modeled shortage risk falls and holding exposure can rise</p></div></div><RiskCurve curve={result.curve} /><div className="curve-summary"><div><span>Current stock · protection risk</span><strong>{pct(result.stockout_risk_protection)}</strong></div><div><span>Lowest-cost tested level</span><strong>{result.illustrative_lowest_cost_stock == null ? 'Add a stockout cost' : `${compact(result.illustrative_lowest_cost_stock, 2)} ${detail.unit}`}</strong></div></div><p className="chart-note">The frontier tests a small set of stock levels near the policy range. A cost comparison appears only when unit cost and an assumed stockout penalty are present.</p></section></>}
      </div></div>
      <div className="section-grid evidence-grid"><section className="panel"><div className="section-head"><div><h2>Demand evidence</h2><p>Observed issues for this material only · {detail.unit}</p></div></div>{detail.monthly_demand.length ? <MonthlyMaterial rows={detail.monthly_demand} unit={detail.unit} /> : <div className="empty-state">No observed issues. Enter estimates above to simulate a cold-start material.</div>}<div className="evidence-facts"><span>{compact(detail.issue_rows)} issue rows</span><span>{compact(detail.issue_days)} issue days</span><span>Last issue: {detail.last_issue_date || 'None observed'}</span></div></section><section className="panel"><div className="section-head"><div><h2>What this scenario knows</h2><p>Source-backed context and explicit gaps</p></div></div><ul className="context-list"><li><strong>{compact(detail.location_count)} mapped locations</strong><span>Shared material stock is counted once.</span></li><li><strong>{compact(detail.maintenance_context_count)} maintenance items at mapped locations</strong><span>Context only; these items do not specify this part.</span></li><li><strong>{detail.price_status}</strong><span>PO amount is a per-unit reference, not realized spend.</span></li><li><strong>{detail.duplicate_sensitivity_pct == null ? 'No sensitivity estimate' : `${compact(detail.duplicate_sensitivity_pct, 1)}% repeat-row sensitivity`}</strong><span>Alternative removal of identical issue rows; authoritative events remain unchanged.</span></li></ul></section></div>
      </>}
  </div>;
}

function Field({ label, name, value, onChange, note, ...rest }) { return <label className="field"><span>{label}</span><input type="number" value={value ?? ''} onChange={e => onChange(name, e.target.value)} {...rest} />{note && <small>{note}</small>}</label>; }
function RiskCurve({ curve }) {
  if (!curve?.length) return null;
  const w = 600, h = 225, l = 42, r = 20, t = 18, b = 34;
  const maxX = Math.max(1, ...curve.map(p => p.stock));
  const maxCost = Math.max(0, ...curve.map(p => p.total_cost_idr || 0));
  const x = value => l + value / maxX * (w - l - r);
  const yRisk = value => t + (1 - value) * (h - t - b);
  const yCost = value => t + (1 - value / Math.max(maxCost, 1)) * (h - t - b);
  const riskPath = curve.map((p, i) => `${i ? 'L' : 'M'}${x(p.stock)},${yRisk(p.stockout_risk)}`).join(' ');
  const costPath = maxCost ? curve.map((p, i) => `${i ? 'L' : 'M'}${x(p.stock)},${yCost(p.total_cost_idr || 0)}`).join(' ') : null;
  return <div className="curve-wrap"><svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Modeled stockout risk and optional total cost by stock level"><line x1={l} y1={t} x2={l} y2={h-b} className="axis" /><line x1={l} y1={h-b} x2={w-r} y2={h-b} className="axis" />{[0,0.25,0.5,0.75,1].map(v => <g key={v}><line x1={l} x2={w-r} y1={yRisk(v)} y2={yRisk(v)} className="gridline" /><text x={l-7} y={yRisk(v)+4} textAnchor="end">{Math.round(v*100)}%</text></g>)}<path d={riskPath} className="risk-line" />{costPath && <path d={costPath} className="cost-line" />}{curve.map((p,i) => <circle key={i} cx={x(p.stock)} cy={yRisk(p.stockout_risk)} r="4" className="risk-point"><title>{`${compact(p.stock,2)} units: ${pct(p.stockout_risk)} risk${p.total_cost_idr == null ? '' : `; ${money(p.total_cost_idr)} total cost`}`}</title></circle>)}<text x={w-r} y={h-6} textAnchor="end">STOCK LEVEL</text></svg><div className="curve-legend"><span><i className="line-swatch teal" /> Stockout risk</span>{costPath && <span><i className="line-swatch amber" /> Illustrative total cost (right scale)</span>}</div></div>;
}
function MonthlyMaterial({ rows, unit }) { const max = Math.max(...rows.map(r => r.qty)); return <div className="material-bars">{rows.map(r => <div key={r.month} title={`${r.month}: ${compact(r.qty, 2)} ${unit}`}><span style={{ height: `${Math.max(4, r.qty / max * 100)}%` }} /><small>{r.month.slice(2).replace('-', '/')}</small></div>)}</div>; }

function Methodology({ data }) {
  const model = data.model;
  const rows = [
    ['Selected hybrid', model.test_comparators.hybrid_tuned],
    ['Global hurdle only', model.test_comparators.hurdle_tuned],
    ['Tuned TSB', model.test_comparators.tsb_tuned],
    ['Trailing 90-day rate', model.test_comparators.trailing_90],
    ['Always zero', model.test_comparators.zero]
  ];
  return <div className="page method-page"><div className="page-intro"><div><h1>Model and evidence</h1><p>How the case data becomes a demand forecast, how the model was selected, and where the result must stop.</p></div><span className="method-badge">LAST TEST · AUGUST–SEPTEMBER 2026</span></div><div className="notice"><strong>Measured result, bounded claim</strong><span>These scores measure prediction of future material issues in synthetic data. They do not measure realized stockouts, savings or downtime.</span></div>
    <section className="panel method-feature"><div><span className="method-label">SELECTED MODEL</span><h2>Intermittent demand, two clear signals.</h2><p>A compact pooled tree model estimates 30-day issue quantity from prior issue patterns. Tuned TSB updates the chance of any issue, including long zero-demand gaps. The combination won the validation rule before the final two months were tested.</p></div><div className="model-figures"><div><span>Quantity error</span><strong>{model.selected.test.normalized_mae.toFixed(3)}</strong><small>normalized MAE · lower is better</small></div><div><span>Occurrence quality</span><strong>{model.selected.test.brier.toFixed(3)}</strong><small>Brier score · lower is better</small></div><div><span>Occurrence F1</span><strong>{model.selected.test.f1_at_50pct.toFixed(3)}</strong><small>50% threshold · diagnostic</small></div></div></section>
    <section className="panel comparison-panel"><div className="section-head"><div><h2>Untouched time-based test</h2><p>{compact(model.sample_counts.test)} material-cutoff examples · only materials with issue history before each cutoff</p></div></div><div className="table-wrap"><table><thead><tr><th>Candidate</th><th>Normalized MAE ↓</th><th>Brier ↓</th><th>F1 at 50% ↑</th><th>Bias</th></tr></thead><tbody>{rows.map(([label, m], i) => <tr key={label} className={i === 0 ? 'selected-row' : ''}><td><strong>{label}</strong>{i === 0 && <small>validation-selected</small>}</td><td>{m.normalized_mae.toFixed(3)}</td><td>{m.brier.toFixed(3)}</td><td>{m.f1_at_50pct.toFixed(3)}</td><td>{m.normalized_bias.toFixed(3)}</td></tr>)}</tbody></table></div><p className="chart-note">Normalized MAE is error divided by each material’s historical mean positive issue-day quantity. Brier scores the 30-day probability of at least one issue. Negative bias means underforecasting.</p></section>
    <div className="section-grid method-grid"><section className="panel"><div className="section-head"><div><h2>Time split and tuning</h2><p>Future observations never become prior features</p></div></div><div className="timeline"><div><span>TRAIN</span><strong>Nov 2025 – May 2026</strong><small>{compact(model.sample_counts.train)} examples</small></div><div><span>VALIDATE</span><strong>June – July 2026</strong><small>{compact(model.sample_counts.validation)} examples</small></div><div><span>TEST</span><strong>August – September 2026</strong><small>{compact(model.sample_counts.test)} examples</small></div></div><p className="chart-note">Validation chose tree size and TSB smoothing. The test period was used once to report final performance. Final model refits on all observed windows for the October forecast.</p></section><section className="panel"><div className="section-head"><div><h2>Data handoff</h2><p>Curated workbook tabs → SQLite, with source grains preserved</p></div></div><div className="source-list">{Object.entries(data.source_counts).map(([key, value]) => <div key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{compact(value)}</strong></div>)}</div></section></div>
    <section className="panel guardrails"><div className="section-head"><div><h2>Interpretation guardrails</h2><p>What the data can and cannot support</p></div></div><div className="guardrail-grid"><article><h3>Demand target</h3><p>Issue rows are retained as recorded, including 863 possible exact-repeat extras. Removing them is sensitivity analysis, not a correction. {compact(model.duplicate_issue_sensitivity.affected_materials)} material forecasts change in that scenario.</p></article><article><h3>Inventory and supply</h3><p>BoM stock is unique per material. The snapshot date is unknown. PR-to-promised-PO intervals are planning proxies, not actual receipts. Open orders and minimum lots are absent.</p></article><article><h3>Equipment context</h3><p>Functional-location A/B/C/S codes have no validated severity ordering. Maintenance plans do not list parts. Notifications do not prove failure or downtime.</p></article><article><h3>Cost and optimization</h3><p>PO price is per unit and currencies differ. The simulator uses an IDR reference only when comparable, and a user-entered stockout penalty before showing a cost-minimizing stock level.</p></article></div></section>
    <div className="reference-note">Method references: Teunter, Syntetos & Babai (2011), <a href="https://pure.rug.nl/ws/portalfiles/portal/145394864/Intermittent_demand_Linking_forecasting_to_inventory_obsolescence.pdf" target="_blank" rel="noreferrer">intermittent demand and TSB</a>; case source: <a href="/CALIBER%202026%20-%20Final%20Case%20Brief.pdf">CALIBER 2026 Final Case Brief</a>. All model results are from the supplied synthetic workbooks.</div>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
