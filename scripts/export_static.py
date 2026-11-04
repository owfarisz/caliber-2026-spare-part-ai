"""Export the five-source-backed demo cases for public, static GitHub Pages."""

from pathlib import Path
import json

from api.service import overview, material_detail, supplier_advice, continuity


ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / 'data/caliber.sqlite'
REPORT = ROOT / 'data/model_report.json'
OUT = ROOT / 'web/public/case-data.json'


def export():
    overview_data = overview(DB, REPORT)
    ids = [row['material_id'] for row in overview_data['focus_scenarios']]
    actions = ('Reorder now', 'Monitor', 'Review above existing maximum')
    payload = {
        'export_as_of': overview_data['as_of'],
        'scope': 'Five curated demonstration materials; aggregates cover all curated Excel rows.',
        'overview': overview_data,
        'materials': {mid: material_detail(DB, mid) for mid in ids},
        'suppliers': {mid: {action: supplier_advice(DB, mid, overview_data['as_of'], action)
                            for action in actions} for mid in ids},
        'continuity': continuity(DB),
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    print(f'{OUT}: {OUT.stat().st_size:,} bytes, {len(ids)} material details')


if __name__ == '__main__':
    export()
