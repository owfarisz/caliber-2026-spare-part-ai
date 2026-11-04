"""Read-only audit to select explainable demonstration materials."""

from pathlib import Path
import sqlite3


DB = Path(__file__).resolve().parents[1] / 'data/caliber.sqlite'
db = sqlite3.connect(DB)
db.row_factory = sqlite3.Row
rows = db.execute("""
    select m.material_id, m.description, m.unit, m.stock, m.min_qty, m.max_qty,
           m.mrp_type, f.forecast_30d, f.probability_any_30d, f.issue_days,
           f.lead_days_proxy, f.duplicate_sensitivity_pct,
           count(distinct case when p.currency='IDR' then p.supplier end) as idr_suppliers,
           sum(case when p.currency='IDR' then 1 else 0 end) as idr_lines,
           count(p.pr_id) as pr_lines
    from materials m join material_forecasts f on f.material_id=m.material_id
    left join procurement p on p.material_id=m.material_id
    group by m.material_id
""").fetchall()


def show(label, candidates, n=12):
    print('\n' + label)
    for r in candidates[:n]:
        print(dict(r))


show('Below min, supplier, issue history', sorted(
    [r for r in rows if r['mrp_type']=='Stock Item' and r['stock']<r['min_qty'] and r['idr_suppliers']>=1 and r['issue_days']>=3],
    key=lambda r: (r['forecast_30d'] or 0) * (r['probability_any_30d'] or 0), reverse=True))
show('Above max, issue history', sorted(
    [r for r in rows if r['mrp_type']=='Stock Item' and r['stock']>r['max_qty'] and r['issue_days']>=2],
    key=lambda r: r['stock']/max(r['max_qty'], 1), reverse=True))
show('Within policy, IDR supplier', sorted(
    [r for r in rows if r['mrp_type']=='Stock Item' and r['min_qty']<=r['stock']<=r['max_qty'] and r['idr_suppliers']>=1 and r['issue_days']>=3],
    key=lambda r: r['pr_lines'], reverse=True))
show('No issue history with stock and IDR supplier', sorted(
    [r for r in rows if r['issue_days']==0 and r['idr_suppliers']>=1 and r['stock']>0],
    key=lambda r: r['pr_lines'], reverse=True))
show('Duplicate-sensitive', sorted(
    [r for r in rows if r['duplicate_sensitivity_pct'] and r['issue_days']>=3],
    key=lambda r: r['duplicate_sensitivity_pct'], reverse=True))

print('\nProcurement currencies', [tuple(x) for x in db.execute('select currency,count(*) from procurement group by currency order by count(*) desc')])
print('Date anomalies', [tuple(x) for x in db.execute("select 'promised_before_pr',count(*) from procurement where po_delivery_date<pr_date union all select 'requested_before_pr',count(*) from procurement where requested_date<pr_date")])
print('Multi-vendor materials', db.execute("select count(*) from (select material_id from procurement where currency='IDR' group by material_id having count(distinct supplier)>1)").fetchone()[0])
