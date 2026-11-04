"""Read-only SQLite queries and material-grain API responses."""

from collections import Counter, defaultdict
from pathlib import Path
from datetime import date, timedelta
import json
import sqlite3

from core.policy import recommend


# Five deliberately distinct stories. IDs are exact curated material-master IDs.
FOCUS = [
    ('4100091472', 'Urgent replenishment', 'Zero on-hand stock, repeated issues and a short supplier planning interval.'),
    ('4100073394', 'Long lead exposure', 'No stock and a long PR-to-promised-date interval make early review visible.'),
    ('4100000924', 'Overstock review', 'On-hand quantity is far above the existing maximum despite sparse issues.'),
    ('4200004671', 'Active demand', 'Frequent issues while stock remains inside the existing policy band.'),
    ('4100028090', 'Cold start', 'No observed issue; the what-if page requires an explicit demand assumption.'),
]

# Demonstration-only evaluation inputs, not columns of the supplied workbooks.
DEMO_VENDOR_EVALUATIONS = {
    'GEMILANG TEKNIK LESTARI PT': (4.4, 'Responsive quotation follow-up; verify with procurement'),
    'PRIMA TEKNOLOGI PERSADA PT': (4.1, 'Technical documentation reviewed in demo; verify'),
    'ANUGRAH INSTRUMEN SENTOSA PT': (3.9, 'Past collaboration assumed satisfactory; verify'),
    'KARYA INSTRUMEN SENTOSA PT': (4.6, 'Strong demo cooperation record; verify'),
    'SAMUDRA SEJAHTERA PERSADA PT': (4.0, 'Demo supply continuity record; verify'),
}


def _connect(path):
    db = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    return db


def overview(db_path, report_path):
    with _connect(db_path) as db:
        counts = dict(db.execute('select table_name,row_count from source_counts'))
        stock = db.execute("""select
            sum(case when mrp_type='Stock Item' and stock<min_qty then 1 else 0 end) as below_min,
            sum(case when mrp_type='Stock Item' and stock>max_qty then 1 else 0 end) as above_max,
            sum(case when mrp_type='Non Stock' and stock>0 then 1 else 0 end) as nonstock_positive
            from materials""").fetchone()
        history_materials = db.execute('select count(*) from material_forecasts where issue_days>0').fetchone()[0]
        monthly = [dict(row) for row in db.execute("""select substr(posting_date,1,7) as month,
            count(*) as issue_events, count(distinct material_id) as active_materials
            from issues group by substr(posting_date,1,7) order by month""")]
        categories = Counter((row['description'] or 'Unclassified').split(',')[0].strip().title()
                             for row in db.execute('select description from materials'))
        criticality = [dict(row) for row in db.execute("""select coalesce(criticality,'Unclassified') as code,
            count(*) as locations from locations group by coalesce(criticality,'Unclassified') order by code""")]
        candidates = []
        for row in db.execute("""select m.material_id,m.description,m.unit,m.stock,m.min_qty,m.max_qty,m.mrp_type,
            f.forecast_30d,f.probability_any_30d,f.lead_days_proxy,f.issue_days,f.days_since_issue
            from materials m join material_forecasts f on m.material_id=f.material_id where f.issue_days>0"""):
            item = dict(row)
            expected_lead = item['forecast_30d'] * (item['lead_days_proxy'] or 30) / 30
            item['expected_lead_demand'] = round(expected_lead, 2)
            item['exposure_ratio'] = round(expected_lead / max(item['stock'], 1), 2)
            item['review_score'] = (item['probability_any_30d'] or 0) * expected_lead / max(item['stock'], 1)
            if item['mrp_type'] == 'Stock Item' and item['stock'] < item['min_qty']:
                item['review_score'] *= 1.5
            candidates.append(item)
        queue = sorted(candidates, key=lambda r: r['review_score'], reverse=True)[:20]
        for item in queue:
            item['review_score'] = round(item['review_score'], 2)
        report = json.loads(Path(report_path).read_text(encoding='utf-8'))
        procurement = dict(db.execute("""select count(*) pr_lines,
            count(distinct supplier) suppliers,
            sum(case when currency='IDR' then 1 else 0 end) idr_lines
            from procurement""").fetchone())
        return {
            'as_of': report['as_of'], 'synthetic': True,
            'catalog_materials': counts['materials'], 'history_materials': history_materials,
            'without_issue_history': counts['materials'] - history_materials,
            'stock_health': {'below_min': stock['below_min'], 'above_max': stock['above_max'],
                             'nonstock_positive': stock['nonstock_positive']},
            'monthly_issues': monthly,
            'top_categories': [{'category': name, 'materials': value} for name, value in categories.most_common(8)],
            'criticality_distribution': criticality,
            'review_queue': queue,
            'focus_scenarios': _focus_scenarios(db),
            'procurement_health': procurement,
            'source_counts': counts,
            'model': {key: report[key] for key in ('selected', 'test_comparators', 'sample_counts',
                                                   'duplicate_issue_sensitivity', 'metric_definitions',
                                                   'test_cutoffs', 'source_notes')},
        }


def _focus_scenarios(db):
    result = []
    for material_id, story, rationale in FOCUS:
        row = db.execute("""select m.material_id,m.description,m.unit,m.stock,m.min_qty,m.max_qty,
            m.mrp_type,f.forecast_30d,f.probability_any_30d,f.issue_days,f.lead_days_proxy,
            (select count(distinct p.supplier) from procurement p where p.material_id=m.material_id) as supplier_count
            from materials m join material_forecasts f on f.material_id=m.material_id
            where m.material_id=?""", (material_id,)).fetchone()
        if row is None:
            raise ValueError(f'Featured material missing: {material_id}')
        result.append({**dict(row), 'story': story, 'rationale': rationale})
    return result


def focus_scenarios(db_path):
    with _connect(db_path) as db:
        return _focus_scenarios(db)


def _percentile(values, q):
    ordered = sorted(values)
    position = (len(ordered) - 1) * q
    lower = int(position)
    fraction = position - lower
    return ordered[lower] * (1 - fraction) + ordered[min(lower + 1, len(ordered) - 1)] * fraction


def supplier_advice(db_path, material_id, decision_date='2026-09-30', action='Monitor'):
    """Same-material procurement evidence plus explicitly synthetic vendor evaluation."""
    day = date.fromisoformat(decision_date)
    with _connect(db_path) as db:
        if not db.execute('select 1 from materials where material_id=?', (material_id,)).fetchone():
            raise KeyError(material_id)
        rows = [dict(r) for r in db.execute("""select pr_id,pr_date,po_delivery_date,unit_price,currency,supplier
            from procurement where material_id=? and pr_date<=? order by pr_date""", (material_id, decision_date))]
    idr = [r for r in rows if r['currency']=='IDR' and r['unit_price'] is not None and r['unit_price']>0]
    suppliers = sorted({r['supplier'] for r in idr if r['supplier']})
    incumbent = max(suppliers, key=lambda name: sum(r['supplier']==name for r in idr)) if suppliers else None
    prices = [r['unit_price'] for r in idr]
    intervals = [(date.fromisoformat(r['po_delivery_date']) - date.fromisoformat(r['pr_date'])).days
                 for r in rows if r['pr_date'] and r['po_delivery_date'] and r['po_delivery_date']>=r['pr_date']]
    window = None
    if action == 'Reorder now':
        window = {'start': (day+timedelta(days=1)).isoformat(),
                  'end': (day+timedelta(days=3)).isoformat(), 'basis': 'Demo planning heuristic: start RFQ within three days of the case decision date.'}
    elif action == 'Monitor':
        window = {'start': (day+timedelta(days=1)).isoformat(),
                  'end': (day+timedelta(days=7)).isoformat(), 'basis': 'Demo planning heuristic for an optional price check, not a procurement deadline.'}
    rating = DEMO_VENDOR_EVALUATIONS.get(incumbent)
    return {
        'material_id': material_id, 'decision_date': decision_date,
        'recommendation_type': 'Historical incumbent to quote' if incumbent else 'Request new supplier qualification',
        'supplier_count': len(suppliers), 'supplier': {'name': incumbent, 'demo_rating': rating[0] if rating else None,
            'demo_collaboration_note': rating[1] if rating else None} if incumbent else None,
        'rating_status': 'Demo assumption' if rating else 'Not supplied',
        'idr_price_rows': len(idr), 'total_pr_rows': len(rows),
        'target_unit_price_idr': {'low': round(_percentile(prices, .25)), 'high': round(_percentile(prices, .5)),
            'observed_min': round(min(prices)), 'observed_max': round(max(prices))} if len(prices)>=3 else None,
        'historical_pr_to_promised_days': round(_percentile(intervals, .5), 1) if intervals else None,
        'negotiation_window': window,
        'caveat': 'No actual delivery performance or formal vendor rating supplied; demo rating is an assumed input. One incumbent per material is not a competitive comparison. Obtain alternative RFQs and verify current availability.',
    }


def continuity(db_path):
    """Record-level exception queue from source transactions, not a daily replay."""
    with _connect(db_path) as db:
        invalid = [dict(r) for r in db.execute("""select pr_id,pr_item,material_id,pr_date,po_delivery_date
            from procurement where po_delivery_date<pr_date order by pr_id,pr_item""")]
        early = [dict(r) for r in db.execute("""select pr_id,pr_item,material_id,pr_date,requested_date
            from procurement where requested_date<pr_date order by pr_id,pr_item limit 5""")]
        repeats = [dict(r) for r in db.execute("""select material_id,posting_date,qty,unit,order_id,
            count(*) as rows, min(source_row) as first_row,group_concat(source_row) as source_rows
            from issues group by material_id,posting_date,qty,unit,order_id having count(*)>1
            order by count(*) desc, material_id limit 5""")]
        repeat_count = db.execute("""select coalesce(sum(n-1),0) from
            (select count(*) n from issues group by material_id,posting_date,qty,unit,order_id having count(*)>1)""").fetchone()[0]
        early_count = db.execute('select count(*) from procurement where requested_date<pr_date').fetchone()[0]
        missing = db.execute("select count(*) from locations where criticality is null or trim(criticality)='' ").fetchone()[0]
        missing_rows = [dict(r) for r in db.execute("""select location_id,description from locations
            where criticality is null or trim(criticality)='' order by location_id limit 3""")]
    records = []
    for r in invalid:
        records.append({'type': 'Promised date before PR', 'severity': 'Investigate',
                        'record_id': f"{r['pr_id']}/{r['pr_item']}", 'material_id': r['material_id'],
                        'evidence': f"PR {r['pr_date']} · promised {r['po_delivery_date']}",
                        'impact': 'Exclude this interval from lead-time proxy; verify source dates.'})
    for r in repeats:
        records.append({'type': 'Possible exact-repeat issue', 'severity': 'Review',
                        'record_id': f"movement rows {r['source_rows']}", 'material_id': r['material_id'],
                        'evidence': f"{r['posting_date']} · {r['rows']} identical {r['qty']} {r['unit']} issues",
                        'impact': 'Do not auto-delete; compare original transactions before changing the forecast.'})
    for r in early:
        records.append({'type': 'Requested date before PR', 'severity': 'Review',
                        'record_id': f"{r['pr_id']}/{r['pr_item']}", 'material_id': r['material_id'],
                        'evidence': f"Requested {r['requested_date']} · PR {r['pr_date']}",
                        'impact': 'May be late PR creation rather than an error; confirm workflow chronology.'})
    for r in missing_rows:
        records.append({'type': 'Missing location criticality', 'severity': 'Review',
                        'record_id': r['location_id'], 'material_id': 'Location context',
                        'evidence': r['description'] or 'No location description',
                        'impact': 'Keep severity unclassified; do not invent an A/B/C/S ranking.'})
    return {'counts': {'promised_before_pr': len(invalid), 'requested_before_pr': early_count,
                       'exact_repeat_extras': repeat_count, 'missing_criticality': missing},
            'records': records, 'source': 'Curated PR/PO, movement, and functional-location Excel tabs'}


def search_materials(db_path, query='', limit=20):
    query = (query or '').strip()
    limit = max(1, min(int(limit), 50))
    with _connect(db_path) as db:
        pattern = '%' + query.replace('%', '').replace('_', '') + '%'
        rows = db.execute("""select m.material_id,m.description,m.unit,m.stock,m.min_qty,m.max_qty,m.mrp_type,
            f.forecast_30d,f.probability_any_30d,f.issue_days,f.days_since_issue
            from materials m join material_forecasts f on m.material_id=f.material_id
            where m.material_id like ? or m.description like ?
            order by case when m.material_id=? then 0 else 1 end,m.material_id limit ?""",
                          (pattern, pattern, query, limit)).fetchall()
        return [dict(row) for row in rows]


def material_detail(db_path, material_id):
    with _connect(db_path) as db:
        item = db.execute("""select m.*,f.forecast_30d,f.probability_any_30d,f.issue_days,
            f.last_issue_date,f.days_since_issue,f.lead_days_proxy,f.unit_price_idr,
            f.price_status,f.duplicate_sensitivity_pct
            from materials m join material_forecasts f on m.material_id=f.material_id
            where m.material_id=?""", (material_id,)).fetchone()
        if item is None:
            raise KeyError(material_id)
        data = dict(item)
        data['issue_rows'] = db.execute('select count(*) from issues where material_id=?', (material_id,)).fetchone()[0]
        issue_days = db.execute("""select posting_date,sum(qty) as qty from issues where material_id=?
            group by posting_date order by posting_date""", (material_id,)).fetchall()
        data['issue_day_sizes'] = [r['qty'] for r in issue_days]
        data['monthly_demand'] = [dict(r) for r in db.execute("""select substr(posting_date,1,7) as month,
            sum(qty) as qty,count(*) as issue_rows from issues where material_id=?
            group by substr(posting_date,1,7) order by month""", (material_id,))]
        data['locations'] = [dict(r) for r in db.execute("""select b.location_id,l.description,
            l.criticality,b.installed_qty from bom_map b left join locations l on b.location_id=l.location_id
            where b.material_id=? order by b.location_id limit 20""", (material_id,))]
        data['maintenance_context_count'] = db.execute("""select count(distinct p.maintenance_item)
            from bom_map b join maintenance p on p.location_id=b.location_id
            where b.material_id=?""", (material_id,)).fetchone()[0]
        return data


def simulate(db_path, material_id, scenario):
    detail = material_detail(db_path, material_id)
    return recommend(detail, scenario)
