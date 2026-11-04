import unittest

from core.policy import recommend


BASE = {
    'material_id': 'A', 'unit': 'EA', 'stock': 1.0, 'min_qty': 1.0, 'max_qty': 5.0,
    'forecast_30d': 3.0, 'probability_any_30d': 0.7,
    'issue_day_sizes': [1.0, 2.0, 3.0], 'lead_days_proxy': 30,
    'unit_price_idr': 100.0,
}


class PolicyTests(unittest.TestCase):
    def test_more_stock_cannot_raise_lead_time_shortage_risk(self):
        low = recommend(BASE, {'stock': 0, 'lead_days': 30})
        high = recommend(BASE, {'stock': 10, 'lead_days': 30})
        self.assertGreaterEqual(low['stockout_risk_lead'], high['stockout_risk_lead'])
        self.assertEqual(high['order_qty'], 0.0)

    def test_more_demand_cannot_lower_reorder_point(self):
        base = recommend(BASE, {'demand_multiplier': 1.0})
        surge = recommend(BASE, {'demand_multiplier': 2.0})
        self.assertGreaterEqual(surge['reorder_point'], base['reorder_point'])
        self.assertGreater(surge['probability_any_30d'], base['probability_any_30d'])

    def test_known_lead_demand_is_added_to_reorder_point(self):
        base = recommend(BASE, {'known_lead_demand': 0})
        planned = recommend(BASE, {'known_lead_demand': 4})
        self.assertAlmostEqual(planned['reorder_point'] - base['reorder_point'], 4.0)

    def test_no_history_requires_explicit_manual_estimates(self):
        no_history = {**BASE, 'forecast_30d': None, 'probability_any_30d': None,
                      'issue_day_sizes': []}
        result = recommend(no_history, {})
        self.assertFalse(result['available'])
        manual = recommend(no_history, {'forecast_30d_override': 2, 'probability_any_30d_override': 0.4})
        self.assertTrue(manual['available'])
        self.assertEqual(manual['basis'], 'User estimates')

    def test_cost_optimum_requires_both_cost_inputs(self):
        no_cost = recommend({**BASE, 'unit_price_idr': None}, {})
        self.assertIsNone(no_cost['illustrative_lowest_cost_stock'])
        costed = recommend(BASE, {'stockout_cost_idr': 1000})
        self.assertIsNotNone(costed['illustrative_lowest_cost_stock'])

    def test_invalid_negative_stock_is_rejected(self):
        with self.assertRaises(ValueError):
            recommend(BASE, {'stock': -1})

    def test_count_units_have_whole_stock_actions(self):
        result = recommend({**BASE, 'forecast_30d': 3.3}, {'stock': 0})
        for key in ('safety_stock', 'reorder_point', 'order_up_to', 'order_qty'):
            self.assertEqual(result[key], int(result[key]))

    def test_large_current_stock_does_not_flatten_policy_frontier(self):
        result = recommend(BASE, {'stock': 500})
        self.assertEqual(result['stockout_risk_protection'], 0)
        self.assertLess(max(point['stock'] for point in result['curve']), 500)

    def test_draft_quantity_respects_existing_max_and_flags_model_conflict(self):
        result = recommend({**BASE, 'max_qty': 5.0}, {'stock': 0, 'demand_multiplier': 3})
        self.assertGreater(result['order_up_to'], 5)
        self.assertTrue(result['policy_conflict'])
        self.assertLessEqual(result['review_draft_qty'], 5)
        self.assertLessEqual(result['review_draft_qty'], result['order_qty'])


if __name__ == '__main__':
    unittest.main()
