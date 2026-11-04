"""Read-only SQLite queries and material-grain API responses."""

from collections import Counter, defaultdict
from pathlib import Path
import json
import sqlite3

from core.policy import recommend


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
            'source_counts': counts,
            'model': {key: report[key] for key in ('selected', 'test_comparators', 'sample_counts',
                                                   'duplicate_issue_sensitivity', 'metric_definitions',
                                                   'test_cutoffs', 'source_notes')},
        }


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
