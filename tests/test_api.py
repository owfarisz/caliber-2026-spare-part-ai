import unittest
from pathlib import Path

from api.service import overview, search_materials, material_detail, simulate, focus_scenarios, supplier_advice, continuity


ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / 'data' / 'caliber.sqlite'
REPORT = ROOT / 'data' / 'model_report.json'


class APIServiceTests(unittest.TestCase):
    def test_overview_uses_material_grain_and_exposes_model_evidence(self):
        result = overview(DB, REPORT)
        self.assertEqual(result['catalog_materials'], 7481)
        self.assertEqual(result['history_materials'], 1930)
        self.assertEqual(result['model']['selected']['name'], 'hybrid')
        self.assertEqual(result['source_counts']['issues'], 17518)
        self.assertGreater(len(result['monthly_issues']), 10)

    def test_search_and_detail_keep_material_unit(self):
        matches = search_materials(DB, '4100000129', 10)
        self.assertEqual(matches[0]['material_id'], '4100000129')
        detail = material_detail(DB, '4100000129')
        self.assertEqual(detail['unit'], 'EA')
        self.assertEqual(detail['issue_rows'], 289)
        self.assertIsNotNone(detail['forecast_30d'])

    def test_simulator_uses_selected_material_and_validates_input(self):
        result = simulate(DB, '4100000129', {'stock': 0, 'lead_days': 30})
        self.assertTrue(result['available'])
        self.assertEqual(result['unit'], 'EA')
        with self.assertRaises(KeyError):
            simulate(DB, 'not-a-material', {})

    def test_five_focus_scenarios_are_excel_materials_with_distinct_stories(self):
        stories = focus_scenarios(DB)
        self.assertEqual(len(stories), 5)
        self.assertEqual(len({row['material_id'] for row in stories}), 5)
        self.assertEqual({row['story'] for row in stories},
                         {'Urgent replenishment', 'Long lead exposure', 'Overstock review',
                          'Active demand', 'Cold start'})
        self.assertTrue(all(row['description'] and row['unit'] for row in stories))

    def test_supplier_advice_uses_single_material_idr_only(self):
        advice = supplier_advice(DB, '4100091472', '2026-09-30', 'Reorder now')
        self.assertEqual(advice['rating_status'], 'Demo assumption')
        self.assertGreater(advice['supplier']['demo_rating'], 0)
        self.assertEqual(advice['supplier_count'], 1)
        self.assertGreater(advice['idr_price_rows'], 2)
        self.assertLessEqual(advice['target_unit_price_idr']['low'], advice['target_unit_price_idr']['high'])
        self.assertEqual(advice['negotiation_window']['start'], '2026-10-01')
        self.assertEqual(advice['recommendation_type'], 'Historical incumbent to quote')
        self.assertIsNone(supplier_advice(DB, '4100062652', '2026-09-30', 'Monitor')['target_unit_price_idr'])

    def test_continuity_returns_record_anomalies_not_daily_replay(self):
        result = continuity(DB)
        self.assertGreater(result['counts']['exact_repeat_extras'], 0)
        self.assertEqual(result['counts']['promised_before_pr'], 2)
        self.assertTrue(result['records'])
        self.assertTrue(all(row.get('record_id') and row.get('type') for row in result['records']))


if __name__ == '__main__':
    unittest.main()
