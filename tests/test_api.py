import unittest
from pathlib import Path

from api.service import overview, search_materials, material_detail, simulate


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


if __name__ == '__main__':
    unittest.main()
