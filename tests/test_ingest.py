import sqlite3
import tempfile
import unittest
from pathlib import Path

from pipeline.ingest import build_database
from pipeline.xlsx_stream import iter_sheet


ROOT = Path(__file__).resolve().parents[1]


class CuratedWorkbookTests(unittest.TestCase):
    def test_reader_keeps_blank_criticality_and_text_ids(self):
        path = next((ROOT / 'dataset').glob('*FuncLoc*.xlsx'))
        rows = iter_sheet(path, 'CURATED_FUNCLOC')
        first = next(rows)
        self.assertEqual(first['Functional Location'], 'SITE_PX_S01')
        self.assertEqual(first['FuncLoc Criticallity'], None)
        self.assertEqual(first['CRITICALITY_STATUS'], 'UNCLASSIFIED')

    def test_database_preserves_source_grains_and_repeat_issues(self):
        with tempfile.TemporaryDirectory() as temp:
            db = Path(temp) / 'case.sqlite'
            counts = build_database(ROOT / 'dataset', db)
            self.assertEqual(counts['materials'], 7481)
            self.assertEqual(counts['bom_map'], 20423)
            self.assertEqual(counts['issues'], 17518)
            self.assertEqual(counts['procurement'], 6189)
            with sqlite3.connect(db) as conn:
                stock = conn.execute("select stock from materials where material_id='4100033923'").fetchone()[0]
                mapped = conn.execute("select count(*) from bom_map where material_id='4100033923'").fetchone()[0]
                self.assertEqual(stock, 5.0)
                self.assertEqual(mapped, 2)
                n = conn.execute("select count(*) from issues where material_id='4100000129'").fetchone()[0]
                self.assertEqual(n, 289)
                self.assertEqual(conn.execute('select min(posting_date), max(posting_date) from issues').fetchone(), ('2025-05-06', '2026-09-30'))


if __name__ == '__main__':
    unittest.main()
