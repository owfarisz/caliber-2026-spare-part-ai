"""Import the verified curated case sheets at their native business grains."""

from datetime import datetime, timedelta
from pathlib import Path
import sqlite3

from .xlsx_stream import iter_sheet


def excel_date(value):
    if value in (None, ''):
        return None
    return (datetime(1899, 12, 30) + timedelta(days=float(value))).date().isoformat()


def number(value):
    return float(value) if value not in (None, '') else None


def integer(value):
    return int(float(value)) if value not in (None, '') else None


def _source(directory, fragment):
    paths = list(Path(directory).glob(f'*{fragment}*.xlsx'))
    if len(paths) != 1:
        raise ValueError(f'Expected one {fragment} workbook, found {len(paths)}')
    return paths[0]


SCHEMA = """
create table materials (material_id text primary key, description text, unit text, min_qty real, max_qty real, stock real, mrp_type text, location_count integer, policy_status text);
create table bom_map (location_id text, material_id text, installed_qty real, primary key(location_id,material_id));
create table issues (source_row integer primary key, posting_date text, material_id text, description text, qty real, unit text, order_id text);
create table procurement (pr_id text, pr_item text, material_id text, pr_date text, requested_date text, po_delivery_date text, pr_qty real, unit_price real, currency text, supplier text, primary key(pr_id,pr_item));
create table locations (location_id text primary key, description text, criticality text, criticality_status text);
create table maintenance (maintenance_item text primary key, location_id text, plan_id text, item_text text, cycle text, cycle_start text, priority text);
create table notifications (notification_id text primary key, notification_date text, order_id text, location_id text, priority text, status text, notification_type text);
create table source_counts (table_name text primary key, source_file text, row_count integer);
create index idx_issue_material_date on issues(material_id,posting_date);
create index idx_proc_material on procurement(material_id);
create index idx_bom_material on bom_map(material_id);
create index idx_notif_order on notifications(order_id);
"""


def build_database(dataset_dir: Path, db_path: Path):
    dataset_dir, db_path = Path(dataset_dir), Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()
    sources = {
        'materials': (_source(dataset_dir, 'BoM'), 'CURATED_MATERIAL_STOCK'),
        'bom_map': (_source(dataset_dir, 'BoM'), 'CURATED_BOM_MAP'),
        'issues': (_source(dataset_dir, 'Movement Material'), 'CURATED_MOVEMENT'),
        'procurement': (_source(dataset_dir, 'PR PO'), 'CURATED_PR_PO'),
        'locations': (_source(dataset_dir, 'FuncLoc'), 'CURATED_FUNCLOC'),
        'maintenance': (_source(dataset_dir, 'Mitem & Mplan'), 'CURATED_MPLAN'),
        'notifications': (_source(dataset_dir, 'Notif History'), 'CURATED_NOTIF'),
    }
    with sqlite3.connect(db_path) as db:
        db.executescript(SCHEMA)
        for table, (path, sheet) in sources.items():
            rows = iter_sheet(path, sheet)
            if table == 'materials':
                values = ((r['Material No'], r['Material Desc.'], r['Unit'], number(r['Min.Qty']), number(r['Max.Qty']), number(r['Stock']), r['MRP Type'], integer(r['LOCATION_COUNT']), r['INVENTORY_POLICY_STATUS']) for r in rows)
                sql = 'insert into materials values (?,?,?,?,?,?,?,?,?)'
            elif table == 'bom_map':
                values = ((r['Functional Loc.'], r['Material No'], number(r['Installed Qty'])) for r in rows)
                sql = 'insert into bom_map values (?,?,?)'
            elif table == 'issues':
                values = ((integer(r['SOURCE_ROW']), excel_date(r['Posting Date']), r['Material Number'], r['Material Descriptions'], number(r['Quantity']), r['Base Unit'], r['Order']) for r in rows)
                sql = 'insert into issues values (?,?,?,?,?,?,?)'
            elif table == 'procurement':
                values = ((r['Purchase Requisition'], r['PR-Item'], r['PR-Material'], excel_date(r['PR-Date']), excel_date(r['PR-Delivery Date']), excel_date(r['PO-Delivery Date']), number(r['PR-Quantity']), number(r['PO-Item Amount']), r['PO-Currency'], r['PO-Supplier Name']) for r in rows)
                sql = 'insert into procurement values (?,?,?,?,?,?,?,?,?,?)'
            elif table == 'locations':
                values = ((r['Functional Location'], r['FunctLocDescrip.'], r['FuncLoc Criticallity'], r['CRITICALITY_STATUS']) for r in rows)
                sql = 'insert into locations values (?,?,?,?)'
            elif table == 'maintenance':
                values = ((r['Maintenance Item'], r['Functional Location'], r['Maintenance Plan'], r['Maint. item text'], r['Cycle Descriptions'], excel_date(r['Start of cycle']), r['Priority']) for r in rows)
                sql = 'insert into maintenance values (?,?,?,?,?,?,?)'
            else:
                values = ((r['Notification'], excel_date(r['Notification Date']), r['Order'], r['Functional Location'], r['Priority'], r['Status'], r['Notification Type']) for r in rows)
                sql = 'insert into notifications values (?,?,?,?,?,?,?)'
            db.executemany(sql, values)
            count = db.execute(f'select count(*) from {table}').fetchone()[0]
            db.execute('insert into source_counts values (?,?,?)', (table, path.name, count))
        counts = dict(db.execute('select table_name,row_count from source_counts'))
        if counts != {'materials': 7481, 'bom_map': 20423, 'issues': 17518, 'procurement': 6189, 'locations': 14484, 'maintenance': 10153, 'notifications': 5795}:
            raise ValueError(f'Curated source reconciliation failed: {counts}')
        if db.execute('select count(*) from issues i left join materials m on i.material_id=m.material_id where m.material_id is null').fetchone()[0]:
            raise ValueError('Issue material missing from master')
        return counts


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    print(build_database(root / 'dataset', root / 'data' / 'caliber.sqlite'))
