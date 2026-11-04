import unittest
from datetime import date

from pipeline.train import split_examples, combine_predictions, summarize_sensitivity


class TemporalSplitTests(unittest.TestCase):
    def test_training_targets_end_before_validation_and_test(self):
        rows = [{'cutoff': date(2026, 5, 1)}, {'cutoff': date(2026, 6, 1)},
                {'cutoff': date(2026, 7, 1)}, {'cutoff': date(2026, 8, 1)}]
        train, validation, test = split_examples(rows)
        self.assertEqual([r['cutoff'] for r in train], [date(2026, 5, 1)])
        self.assertEqual([r['cutoff'] for r in validation], [date(2026, 6, 1), date(2026, 7, 1)])
        self.assertEqual([r['cutoff'] for r in test], [date(2026, 8, 1)])

    def test_combined_forecast_keeps_quantity_and_occurrence_distinct(self):
        result = combine_predictions([{'qty': 4.0, 'prob_any': 0.1}],
                                     [{'qty': 10.0, 'prob_any': 0.8}])
        self.assertEqual(result, [{'qty': 4.0, 'prob_any': 0.8}])

    def test_sensitivity_summarizes_per_material_not_mixed_units(self):
        summary, per_material = summarize_sensitivity(
            [('EA-1', 10.0), ('KG-1', 100.0)],
            [('EA-1', 12.0), ('KG-1', 90.0)])
        self.assertEqual(summary['median_absolute_change_pct'], 15.0)
        self.assertEqual(per_material['EA-1'], 20.0)
        self.assertEqual(per_material['KG-1'], -10.0)


if __name__ == '__main__':
    unittest.main()
