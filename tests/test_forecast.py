import unittest
from datetime import date

from pipeline.forecast import make_examples, trailing_forecast, tsb_forecast, score_predictions


class ForecastTests(unittest.TestCase):
    def test_future_issues_do_not_enter_cutoff_features(self):
        events = {'A': [(date(2026, 1, 1), 2.0), (date(2026, 2, 5), 80.0)]}
        rows = make_examples(events, [date(2026, 2, 1)], date(2026, 1, 1), 30)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['avg_size'], 2.0)
        self.assertEqual(rows[0]['features']['qty_30'], 0.0)
        self.assertEqual(rows[0]['actual_qty'], 80.0)

    def test_new_material_is_not_backtested_before_first_issue(self):
        events = {'A': [(date(2026, 2, 5), 4.0)]}
        self.assertEqual(make_examples(events, [date(2026, 2, 1)], date(2026, 1, 1), 30), [])

    def test_tsb_probability_decays_after_long_no_issue_period(self):
        events = [(date(2026, 1, 1), 2.0)]
        early = tsb_forecast(events, date(2026, 1, 31), date(2026, 1, 1), 30, 0.1, 0.2)
        late = tsb_forecast(events, date(2026, 3, 1), date(2026, 1, 1), 30, 0.1, 0.2)
        self.assertGreater(early['qty'], late['qty'])
        self.assertGreater(early['prob_any'], late['prob_any'])

    def test_trailing_rate_uses_only_past_days(self):
        events = [(date(2026, 1, 1), 2.0), (date(2026, 1, 31), 40.0)]
        forecast = trailing_forecast(events, date(2026, 1, 31), 30, 30)
        self.assertEqual(forecast['qty'], 2.0)

    def test_metrics_do_not_hide_all_zero_predictions(self):
        rows = [{'actual_qty': 2.0, 'avg_size': 2.0}, {'actual_qty': 0.0, 'avg_size': 1.0}]
        metrics = score_predictions(rows, [{'qty': 0.0, 'prob_any': 0.0}, {'qty': 0.0, 'prob_any': 0.0}])
        self.assertEqual(metrics['normalized_mae'], 0.5)
        self.assertEqual(metrics['brier'], 0.5)
        self.assertEqual(metrics['recall_at_50pct'], 0.0)


if __name__ == '__main__':
    unittest.main()
