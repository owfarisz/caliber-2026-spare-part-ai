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
const readable = (value) => value ? value.replace(/,\s*/g, ', ') : '—';

function App() {
  const [page, setPage] = useState(location.hash.replace('#/', '') || 'overview');
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('caliber-demo-drafts') || '[]'); } catch { return []; }
  });
  useEffect(() => { sessionStorage.setItem('caliber-demo-drafts', JSON.stringify(drafts)); }, [drafts]);
  useEffect(() => {
    const onHash = () => setPage(location.hash.replace('#/', '') || 'overview');
    window.addEventListener('hashchange', onHash);
    api('overview').then(setOverview).catch((e) => setError(e.message));
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    if (!overview || sessionStorage.getItem('caliber-drafts-seeded')) return;
    sessionStorage.setItem('caliber-drafts-seeded', '1');
    Promise.all(['4100091472', '4100073394'].map(material_id => api('scenario', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ material_id, scenario: {} })
    }).then(result => ({ material_id, result })))).then(results => {
      setDrafts(existing => existing.length ? existing : results.filter(x => x.result.available && x.result.review_draft_qty > 0).map((x, i) => ({
        id: `DEMO-PR-00${i+1}`, material_id: x.material_id, quantity: x.result.review_draft_qty,
        unit: x.result.unit, action: x.result.action, risk: x.result.stockout_risk_lead,
        forecast: x.result.forecast_30d, status: 'Pending inventory review', origin: 'Model-generated demo example',
        decision_date: overview.as_of, policy_conflict: x.result.policy_conflict,
        model_order_qty: x.result.order_qty, existing_max_qty: x.result.existing_max_qty
      })));
    }).catch(() => sessionStorage.removeItem('caliber-drafts-seeded'));
  }, [overview]);
  const createDraft = (draft) => { setDrafts(existing => [{ ...draft, id: `DEMO-PR-${String(existing.length+1).padStart(3,'0')}` }, ...existing]); location.hash = '#/inventory'; };
  const reviewDraft = (id, status) => setDrafts(existing => existing.map(d => d.id === id ? { ...d, status } : d));
  const current = ['overview', 'scenario', 'inventory', 'continuity', 'graph', 'method'].includes(page) ? page : 'overview';
  const nav = [
    ['overview', 'Overview'], ['scenario', 'Predictive monitoring'], ['inventory', 'Inventory review'], ['graph', 'Insight graph'], ['continuity', 'Data continuity'], ['method', 'Model & evidence']
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
        {overview && current === 'scenario' && <ScenarioStudio data={overview} onCreateDraft={createDraft} />}
        {overview && current === 'inventory' && <InventoryReview data={overview} drafts={drafts} onReview={reviewDraft} />}
        {overview && current === 'graph' && <InsightGraph data={overview} />}
        {overview && current === 'continuity' && <Continuity />}
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
  const items = matches ?? data.focus_scenarios;
  const historyShare = data.history_materials / data.catalog_materials;
  return <div className="page">
    <div className="page-intro"><div><h1>Five materials.<br /><em>One clear decision path.</em></h1><p>Excel-backed inventory signals and model-based demand scenarios, from technician request to inventory review.</p></div><a href="#/scenario" className="primary-link">Open predictive monitoring <span>↗</span></a></div>
    <div className="notice"><strong>Synthetic case data</strong><span>Forecasts describe material issues, not proven failures or measured downtime. Current stock has no source timestamp.</span></div>
    <div className="metric-strip" aria-label="Case snapshot">
      <Metric label="Materials in catalog" value={compact(data.catalog_materials)} note="One stock record per material" />
      <Metric label="With issue history" value={compact(data.history_materials)} note="Eligible for model forecast" />
      <Metric label="Below existing Min" value={compact(data.stock_health.below_min)} note="Stock Items · review" tone="warm" />
      <Metric label="Above existing Max" value={compact(data.stock_health.above_max)} note="Stock Items · review" tone="warm" />
    </div>
    <section className="focus-section"><div className="section-head"><div><h2>Five representative case stories</h2><p>Curated demonstrations from the material master, not a statistical sample of the catalog</p></div><span className="panel-tag">EXCEL + MODEL</span></div><div className="focus-cards">{data.focus_scenarios.map(item => <a key={item.material_id} href="#/scenario" onClick={() => sessionStorage.setItem('caliber-material', item.material_id)} className="focus-card"><span>{item.story}</span><strong>{readable(item.description)}</strong><small>{item.material_id} · {compact(item.stock, 2)} {item.unit} on hand</small><em>{item.rationale}</em></a>)}</div></section>
    <div className="section-grid overview-grid">
      <section className="panel monthly-panel"><div className="section-head"><div><h2>Issue activity over time</h2><p>Number of recorded issue rows per month · no mixed-unit quantity totals</p></div><span className="panel-tag">MAY 2025 — SEP 2026</span></div><MonthlyBars rows={data.monthly_issues} /></section>
      <section className="panel coverage-panel"><div className="section-head"><div><h2>Forecast coverage</h2><p>Materials with observed issue history</p></div></div><div className="coverage-body"><div className="donut" style={{ '--share': `${historyShare * 100}%` }} role="img" aria-label={`${Math.round(historyShare * 100)} percent of materials have issue history`}><div><strong>{Math.round(historyShare * 100)}%</strong><small>modeled</small></div></div><div className="coverage-copy"><div><span className="swatch teal" /> <strong>{compact(data.history_materials)}</strong> observed</div><div><span className="swatch sand" /> <strong>{compact(data.without_issue_history)}</strong> without history</div><p>No observed issue in this window does not prove zero future demand or obsolete stock.</p></div></div></section>
    </div>
    <div className="section-grid lower-grid">
      <section className="panel stock-panel"><div className="section-head"><div><h2>Inventory policy exceptions</h2><p>Existing Min–Max fields at material grain</p></div></div><HorizontalBars rows={[['Below Min', data.stock_health.below_min, 'risk'], ['Above Max', data.stock_health.above_max, 'amber'], ['Non Stock with on-hand', data.stock_health.nonstock_positive, 'blue']]} /><p className="chart-note">“Above Max” is a review candidate, not an automatic disposal instruction. Non Stock items can legitimately have physical inventory.</p></section>
      <section className="insights"><h2>AI decision brief</h2><p className="ai-caption">✦ AI-assisted, explainable recommendation</p><Insight number="01" title="Focus the technician handoff" text={`${compact(data.stock_health.below_min)} Stock Items sit below their existing Min. The five focus stories surface urgent, long-lead, overstock, active and cold-start conditions for review.`} /><Insight number="02" title="Procurement has evidence, not a winner" text={`${compact(data.procurement_health.pr_lines)} PR/PO lines and ${compact(data.procurement_health.suppliers)} supplier names come from Excel. Demo vendor ratings are assumed separately and must be validated.`} /><Insight number="03" title="Investigate repeated transactions" text={`${compact(data.model.duplicate_issue_sensitivity.affected_materials)} modeled materials change under hypothetical exact-repeat removal; source rows remain untouched. Open data continuity for the actual records.`} /></section>
    </div>
    <div className="section-grid lower-grid"><section className="panel"><div className="section-head"><div><h2>Material families</h2><p>Top descriptions by catalog count · curated BoM master</p></div></div><HorizontalBars rows={data.top_categories.slice(0, 5).map(r => [r.category, r.materials, 'blue'])} /></section><section className="panel"><div className="section-head"><div><h2>Source coverage by module</h2><p>Curated Excel rows · each at its native business grain</p></div></div><div className="source-list">{Object.entries(data.source_counts).map(([key, value]) => <div key={key}><span>{key.replaceAll('_',' ')}</span><strong>{compact(value)}</strong></div>)}</div></section></div>
    <section className="panel queue-panel"><div className="section-head queue-head"><div><h2>{matches ? 'Catalog search' : 'The five focus materials'}</h2><p>{matches ? 'Other source materials remain searchable for audit' : 'Material-level stock and forecast. Different units are never summed.'}</p></div><label className="search-box"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search any material ID or description" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search materials" /></label></div>{searchError && <p role="alert">Search failed: {searchError}</p>}<div className="table-wrap"><table><thead><tr><th>Material</th><th>Policy</th><th>On hand</th><th>30-day forecast</th><th>Any-issue chance</th><th>Next step</th></tr></thead><tbody>{items.map(item => <tr key={item.material_id}><td><a href="#/scenario" onClick={() => sessionStorage.setItem('caliber-material', item.material_id)}><strong>{item.material_id}</strong><small>{item.description}</small></a></td><td><StatusPill item={item} /></td><td>{compact(item.stock, 2)} <small>{item.unit}</small></td><td>{item.forecast_30d == null ? 'Needs assumption' : `${compact(item.forecast_30d, 2)} ${item.unit}`}</td><td>{pct(item.probability_any_30d)}</td><td><a className="table-action" href="#/scenario" onClick={() => sessionStorage.setItem('caliber-material', item.material_id)}>Simulate ↗</a></td></tr>)}</tbody></table>{items.length === 0 && <div className="empty-state">No materials match this search. Try a material number or a shorter description.</div>}</div></section>
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

function ScenarioStudio({ data, onCreateDraft }) {
  const [materialId, setMaterialId] = useState(sessionStorage.getItem('caliber-material') || data.focus_scenarios[0].material_id);
  const [detail, setDetail] = useState(null);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [inputs, setInputs] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requestQty, setRequestQty] = useState('');
  useEffect(() => { if (result?.available) setRequestQty(result.review_draft_qty); }, [result]);
  useEffect(() => {
    let active = true;
    setError(''); setDetail(null); setResult(null);
    api(`material&id=${encodeURIComponent(materialId)}`).then(item => {
      if (!active) return;
      setDetail(item);
      setInputs({ stock: item.stock, lead_days: item.lead_days_proxy || 30, review_days: 30,
        service_target: 0.95, demand_multiplier: 1, known_lead_demand: 0,
        known_review_demand: 0, unit_cost_idr: item.unit_price_idr ?? '',
        annual_holding_rate: 0.2, stockout_cost_idr: '',
        ...(item.forecast_30d == null ? { forecast_30d_override: 2, probability_any_30d_override: 0.35 } : {}) });
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
  const sendRequest = () => {
    if (!result?.available || result.action === 'Review above existing maximum' || !Number.isFinite(Number(requestQty)) || Number(requestQty) <= 0 ||
        (result.policy_conflict && Number(requestQty) > result.review_draft_qty)) return;
    onCreateDraft({ material_id: detail.material_id,
      quantity: Number(requestQty), unit: detail.unit, action: result.action,
      risk: result.stockout_risk_lead, forecast: result.forecast_30d,
      status: 'Pending inventory review', origin: result.action === 'Reorder now' ? 'Technician what-if simulation' : 'Technician manual override',
      decision_date: data.as_of, assumptions: inputs, policy_conflict: result.policy_conflict,
      model_order_qty: result.order_qty, existing_max_qty: result.existing_max_qty });
  };
  return <div className="page scenario-page"><div className="page-intro scenario-intro"><div><h1>Predictive monitoring</h1><p>Choose a case material, test demand and lead-time assumptions, then hand a model-backed material request to inventory.</p></div><span className="method-badge">30-DAY MODEL · {data.model.selected.name.toUpperCase()}</span></div>
    <div className="notice"><strong>Decision twin, not a live plant replica</strong><span>Scenarios use a read-only stock snapshot and modeled issue demand. No actual stockouts, receipt dates or downtime costs were supplied.</span></div>
    <div className="scenario-tabs" aria-label="Featured materials">{data.focus_scenarios.map(item => <button key={item.material_id} type="button" className={materialId===item.material_id?'selected':''} onClick={() => select(item)}><strong>{item.story}</strong><small>{item.material_id}</small></button>)}</div>
    <div className="material-picker"><div><label htmlFor="material-search">Material to simulate</label><div className="picker-input"><input id="material-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by material ID or description" autoComplete="off" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button>}</div>{matches.length > 0 && <div className="picker-results">{matches.map(item => <button type="button" key={item.material_id} onClick={() => select(item)}><strong>{item.material_id}</strong><span>{readable(item.description)}</span></button>)}</div>}</div>{detail && <div className="selected-material"><span>SELECTED MATERIAL</span><strong>{detail.material_id}</strong><p>{readable(detail.description)}</p><small>{detail.mrp_type} · {detail.unit} · {detail.location_count} mapped locations</small></div>}</div>
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
      {detail.forecast_30d == null && <><Field label={`Estimated 30-day demand (${detail.unit})`} name="forecast_30d_override" value={inputs.forecast_30d_override ?? ''} onChange={set} min="0" step="any" note="Demo assumption: no observed issue history. Replace before use." /><Field label="Estimated any-issue chance" name="probability_any_30d_override" value={inputs.probability_any_30d_override ?? ''} onChange={set} min="0" max="0.999" step="0.01" note="Demo assumption: 0.35 chance of any issue." /></>}
    </div><div className="control-note">Stock is assumed available now. Open purchase orders and minimum order quantities are not in this dataset.</div></section>
      <div className="result-column"><section className="result-hero"><div className="result-top"><span>RECOMMENDED ACTION</span>{loading && <span className="updating">Updating…</span>}</div>{result?.available ? <><h2>{result.action}</h2><p>For material {detail.material_id}, under the conditions at left.</p><div className="result-key"><div><span>Order quantity</span><strong>{compact(result.order_qty, 2)} <small>{detail.unit}</small></strong></div><div><span>Lead-time stockout risk</span><strong>{pct(result.stockout_risk_lead)}</strong></div></div></> : <><h2>Input needed</h2><p>{result?.reason || 'Calculating the scenario…'}</p></>}</section>
      {result?.available && <section className="decision-brief"><div className="brief-heading"><div><h2>AI decision brief</h2><p>✦ AI-assisted, explainable recommendation</p></div><span>{result.basis}</span></div><p>{result.action === 'Reorder now' ? `Current stock of ${compact(result.stock, 2)} ${detail.unit} is at or below the modeled reorder point of ${compact(result.reorder_point, 2)} ${detail.unit}. The 30-day forecast is ${compact(result.forecast_30d, 2)} ${detail.unit}; lead-period shortage risk is ${pct(result.stockout_risk_lead)} under this simulation.` : result.action === 'Review above existing maximum' ? `On-hand stock exceeds the existing maximum. Avoid an automatic purchase request; review the policy and physical count first.` : `Stock is above the modeled reorder point. Continue monitoring or change assumptions to test an upcoming job.`}</p>
        {result.policy_conflict && <p className="policy-conflict"><strong>Policy conflict:</strong> Model target is {compact(result.order_up_to,2)} {detail.unit}, above current Max of {compact(result.existing_max_qty,2)} {detail.unit}. Draft quantity defaults to {compact(result.review_draft_qty,2)} {detail.unit} within the existing Max; this does not claim the modeled service target is met.</p>}
        <div className="request-row"><label>Material request quantity <span>({detail.unit})</span><input aria-label="Material request quantity" type="number" min="0" max={result.policy_conflict ? result.review_draft_qty : undefined} step={['EA','SET','CAN','ASS','RL','SHT'].includes(detail.unit)?'1':'any'} value={requestQty} onChange={e => setRequestQty(e.target.value)} /></label><button type="button" onClick={sendRequest} disabled={loading || result.action === 'Review above existing maximum' || Number(requestQty)<=0 || (result.policy_conflict && Number(requestQty)>result.review_draft_qty)}>Send PR draft to inventory ↗</button></div><small>{result.action === 'Review above existing maximum' ? 'Purchasing is held while stock exceeds the existing Max.' : result.action === 'Monitor' ? 'A positive manual request would be labeled as a technician override for inventory review.' : 'Prototype handoff only. Inventory reviews quantity, incumbent vendor and negotiation guidance before any real ERP PR.'}</small></section>}
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

function InventoryReview({ data, drafts, onReview }) {
  const [selectedId, setSelectedId] = useState(null);
  const [details, setDetails] = useState({});
  const [advice, setAdvice] = useState({});
  const [loadError, setLoadError] = useState('');
  const selected = drafts.find(d => d.id === selectedId) || drafts[0];
  useEffect(() => { if (drafts.length && !selectedId) setSelectedId(drafts[0].id); }, [drafts, selectedId]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setLoadError('');
    Promise.all([
      api(`material&id=${encodeURIComponent(selected.material_id)}`),
      api(`supplier&id=${encodeURIComponent(selected.material_id)}&decision_date=${selected.decision_date}&action=${encodeURIComponent(selected.action)}`)
    ]).then(([material, supplier]) => { if (active) { setDetails(previous => ({ ...previous, [selected.material_id]: material })); setAdvice(previous => ({ ...previous, [selected.material_id]: supplier })); } })
      .catch(e => { if (active) setLoadError(e.message); });
    return () => { active = false; };
  }, [selected?.id, selected?.material_id]);
  const material = selected && details[selected.material_id];
  const supplier = selected && advice[selected.material_id];
  return <div className="page inventory-page"><div className="page-intro"><div><h1>Inventory review</h1><p>Technician requests meet source-backed procurement evidence before the inventory team authorizes a real PR.</p></div><a href="#/scenario" className="primary-link">Create request from monitoring <span>↗</span></a></div>
    <div className="notice"><strong>Demo workflow</strong><span>Example and new PR drafts stay in this browser session. Nothing is written to SAP or the source workbooks. Vendor ratings below are synthetic evaluation assumptions.</span></div>
    <div className="metric-strip inventory-metrics"><Metric label="PR/PO source lines" value={compact(data.procurement_health.pr_lines)} note="Curated Excel transactions" /><Metric label="Supplier names" value={compact(data.procurement_health.suppliers)} note="Across different materials" /><Metric label="IDR price rows" value={compact(data.procurement_health.idr_lines)} note="No currency conversion" /><Metric label="Demo drafts" value={compact(drafts.length)} note="Model-generated or technician-created" /></div>
    <div className="inventory-layout"><section className="panel draft-list"><div className="section-head"><div><h2>Material requests</h2><p>Choose a draft to see its decision brief and sourcing evidence</p></div></div>{drafts.length ? drafts.map(d => <button type="button" key={d.id} className={`draft-item ${selected?.id===d.id?'selected':''}`} onClick={() => setSelectedId(d.id)}><span><strong>{d.id}</strong><small>{d.status}</small></span><b>{d.material_id}</b><em>{compact(d.quantity,2)} {d.unit} requested</em></button>) : <div className="empty-state">Generating model-backed examples… Open predictive monitoring to create a draft.</div>}</section>
    <div className="inventory-detail">{selected && <><section className="decision-brief inventory-brief"><div className="brief-heading"><div><h2>AI decision brief</h2><p>✦ AI-assisted, explainable recommendation</p></div><span>{selected.origin}</span></div><h3>{material?.description ? readable(material.description) : selected.material_id}</h3><div className="brief-figures"><div><span>Request</span><strong>{compact(selected.quantity,2)} {selected.unit}</strong></div><div><span>30-day demand</span><strong>{compact(selected.forecast,2)} {selected.unit}</strong></div><div><span>Lead risk</span><strong>{pct(selected.risk)}</strong></div></div><p>Technician proposes {compact(selected.quantity,2)} {selected.unit} from the {selected.action.toLowerCase()} simulation. Inventory should verify physical stock, open orders, lot sizes and the current need before release.</p>{selected.policy_conflict && <p className="policy-conflict"><strong>Policy review required:</strong> The model's {compact(selected.model_order_qty,2)} {selected.unit} order target exceeds existing Max {compact(selected.existing_max_qty,2)} {selected.unit}. This draft is capped under current policy; it does not meet the simulated service target.</p>}</section>
      {loadError && <div className="error-banner" role="alert">Could not load sourcing evidence: {loadError}. Select the request again to retry.</div>}
      <section className="panel sourcing-panel"><div className="section-head"><div><h2>Supplier and negotiation recommendation</h2><p>Same-material PR/PO history from Excel + explicitly assumed demo vendor evaluation</p></div></div>{supplier ? <><div className="supplier-lead"><div><small>RECOMMENDED QUOTE CANDIDATE</small><strong>{supplier.supplier?.name || 'Qualify a new supplier'}</strong><span>{supplier.recommendation_type}</span></div><div className="rating-demo"><strong>{supplier.supplier?.demo_rating ? `${supplier.supplier.demo_rating}/5` : '—'}</strong><span>Demo vendor rating<br />assumed input</span></div></div><p className="supplier-note">{supplier.supplier?.demo_collaboration_note || 'No incumbent supplier observed for this material.'}</p><div className="source-facts"><div><span>Same-material PR/PO lines</span><strong>{compact(supplier.total_pr_rows)}</strong></div><div><span>Comparable IDR price rows</span><strong>{compact(supplier.idr_price_rows)}</strong></div><div><span>Historical planning interval</span><strong>{supplier.historical_pr_to_promised_days == null ? 'Unavailable' : `${compact(supplier.historical_pr_to_promised_days,1)} days`}</strong></div></div><div className="negotiation-grid"><div><span>Suggested unit-price negotiation band</span><strong>{supplier.target_unit_price_idr ? `${money(supplier.target_unit_price_idr.low)} – ${money(supplier.target_unit_price_idr.high)}` : 'Needs a new quote'}</strong><small>{supplier.target_unit_price_idr ? 'Historical IDR lower quartile to median; not a guaranteed quote.' : 'Fewer than 3 comparable IDR observations.'}</small></div><div><span>Proposed negotiation window</span><strong>{supplier.negotiation_window ? `${supplier.negotiation_window.start} → ${supplier.negotiation_window.end}` : 'No purchase suggested'}</strong><small>{supplier.negotiation_window?.basis || 'Review excess stock before starting procurement.'}</small></div></div><p className="chart-note">{supplier.caveat}</p></> : <div className="loading-page small">Loading same-material procurement evidence…</div>}</section>
      <section className="panel review-actions"><div><h2>Inventory decision</h2><p>Update the demonstration review state. A real ERP integration would require authenticated approval and fresh operational data.</p></div><div><button type="button" className="primary-button" onClick={() => onReview(selected.id,'Ready for procurement check')}>Mark ready for procurement check</button><button type="button" className="secondary-button" onClick={() => onReview(selected.id,'Returned to technician')}>Return to technician</button></div></section></>}</div></div>
  </div>;
}

function Continuity() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('continuity').then(setData).catch(e => setError(e.message)); }, []);
  return <div className="page continuity-page"><div className="page-intro"><div><h1>Data continuity</h1><p>Only records that need human attention: anomalous chronology, possible repeated movements and missing context.</p></div><span className="method-badge">SOURCE RECORD EXCEPTIONS</span></div><div className="notice"><strong>Review, do not erase</strong><span>These flags come from curated Excel records. A requested date before PR may reflect late entry; identical issue rows may be legitimate separate transactions.</span></div>{error && <div className="error-banner">Could not load exceptions: {error}</div>}{data ? <><div className="metric-strip"><Metric label="Promised before PR" value={compact(data.counts.promised_before_pr)} note="Invalid planning intervals excluded" tone="warm" /><Metric label="Requested before PR" value={compact(data.counts.requested_before_pr)} note="Chronology to verify" /><Metric label="Exact-repeat extras" value={compact(data.counts.exact_repeat_extras)} note="Sensitivity only; retained" /><Metric label="Missing criticality" value={compact(data.counts.missing_criticality)} note="Functional location records" /></div><section className="panel"><div className="section-head"><div><h2>Flagged source records</h2><p>{data.source} · most instructive examples, with source identifiers</p></div></div><div className="anomaly-list">{data.records.map((r,i) => <article key={`${r.type}-${r.record_id}-${i}`}><div><span className={r.severity==='Investigate'?'anomaly-pill severe':'anomaly-pill'}>{r.severity}</span><strong>{r.type}</strong><small>{r.record_id}</small></div><div><b>{r.material_id}</b><p>{r.evidence}</p><small>{r.impact}</small></div></article>)}</div></section></> : !error && <div className="loading-page">Inspecting exception records…</div>}</div>;
}

function InsightGraph({ data }) {
  const [playing, setPlaying] = useState(true);
  const [stage, setStage] = useState(0);
  useEffect(() => { if (!playing) return; const timer = setInterval(() => setStage(s => (s+1)%5), 2100); return () => clearInterval(timer); }, [playing]);
  const focus = data.focus_scenarios[0];
  const steps = [
    { title: 'Source rows', detail: `${compact(data.source_counts.materials)} material master rows, ${compact(data.source_counts.issues)} issue movements, ${compact(data.source_counts.procurement)} PR/PO lines, and equipment records are read from curated Excel.` },
    { title: 'Material join', detail: `Material ${focus.material_id} links stock, movement and procurement by exact material ID. BoM links to locations, maintenance and notifications add context without multiplying shared stock or proving a failure.` },
    { title: 'Demand model', detail: `Past issues become a ${compact(focus.forecast_30d,1)} ${focus.unit} 30-day forecast with ${pct(focus.probability_any_30d)} chance of any issue.` },
    { title: 'Inventory decision', detail: `The forecast, current ${compact(focus.stock)} ${focus.unit} stock and ${compact(focus.lead_days_proxy,1)}-day planning interval feed the what-if stock policy.` },
    { title: 'Human handoff', detail: `A technician can send a PR draft. Inventory checks historical price and an assumed demo vendor rating before any operational decision.` },
  ];
  const positions = [[82,178],[292,54],[292,178],[292,302],[510,178],[730,178],[930,178]];
  const edges = [[0,1],[0,2],[0,3],[1,4],[2,4],[3,4],[4,5],[5,6]];
  const labels = ['Excel sources','Material master','Issue + PR/PO','Equipment context','Joined signals','Model + policy','PR + vendor review'];
  const values = [compact(data.source_counts.materials),`${compact(data.catalog_materials)} IDs`,`${compact(data.source_counts.issues)} / ${compact(data.source_counts.procurement)}`,`${compact(data.source_counts.locations)} locations`,focus.material_id,`${compact(focus.forecast_30d,1)} ${focus.unit}`,`${focus.supplier_count} incumbent`];
  return <div className="page graph-page"><div className="page-intro"><div><h1>How data becomes a decision</h1><p>An animated evidence graph traces the exact material join and the human review path.</p></div><button className="secondary-button" type="button" onClick={() => setPlaying(p => !p)}>{playing ? 'Pause flow' : 'Play flow'}</button></div><div className="notice"><strong>Live explanation of a static case</strong><span>Nodes show Excel-derived counts and one featured model output. Motion illustrates data lineage; it is not a real-time plant feed.</span></div><section className="graph-surface"><svg viewBox="0 0 1020 360" role="img" aria-label="Animated graph from Excel source rows to material join, demand model, inventory decision and PR vendor review"><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#72949a" /></marker></defs>{edges.map(([a,b],i) => <g key={i}><line x1={positions[a][0]+60} y1={positions[a][1]} x2={positions[b][0]-65} y2={positions[b][1]} className={`graph-edge ${playing?'flowing':''}`} markerEnd="url(#arrow)" /><circle r="5" className={`graph-pulse ${playing?'moving':''}`}><animateMotion dur={`${3+i*.25}s`} repeatCount="indefinite" path={`M ${positions[a][0]+60} ${positions[a][1]} L ${positions[b][0]-65} ${positions[b][1]}`} /></circle></g>)}{positions.map(([x,y],i) => <g key={i} className={`graph-node ${i <= stage+2?'lit':''}`}><rect x={x-66} y={y-42} width="132" height="84" rx="12" /><text x={x} y={y-10} textAnchor="middle" className="graph-node-label">{labels[i]}</text><text x={x} y={y+17} textAnchor="middle" className="graph-node-value">{values[i]}</text></g>)}</svg><div className="graph-stage"><span>STEP {stage+1} / 5</span><h2>{steps[stage].title}</h2><p>{steps[stage].detail}</p></div></section><div className="graph-steps">{steps.map((item,i) => <button key={item.title} type="button" className={stage===i?'active':''} onClick={() => { setStage(i); setPlaying(false); }}><span>{i+1}</span><strong>{item.title}</strong></button>)}</div><section className="panel graph-guardrail"><h2>What changes the outcome?</h2><p>On <a href="#/scenario">Predictive monitoring</a>, the technician can change stock, lead time, service target and known demand. The model forecast and supplier history remain source-backed; the changed assumptions alter only the what-if policy and resulting PR draft.</p></section></div>;
}

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
