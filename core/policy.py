"""Transparent, assumption-led inventory scenario calculations."""

from math import ceil, exp, log
from random import Random


SAMPLES = 4000
COUNT_UNITS = {'EA', 'SET', 'CAN', 'ASS', 'RL', 'SHT'}


def _number(value, name, minimum=0.0, maximum=None):
    try:
        result = float(value)
    except (TypeError, ValueError):
        raise ValueError(f'{name} must be a number')
    if result != result or result < minimum or (maximum is not None and result > maximum):
        raise ValueError(f'{name} must be between {minimum} and {maximum if maximum is not None else "infinity"}')
    return result


def _quantile(sorted_values, probability):
    return sorted_values[min(len(sorted_values) - 1, max(0, ceil(probability * len(sorted_values)) - 1))]


def _samples(days, rate, sizes, scale, planned):
    random = Random(271828)
    result = []
    for _ in range(SAMPLES):
        time = 0.0
        demand = planned
        if rate > 0:
            while True:
                time += random.expovariate(rate)
                if time >= days:
                    break
                demand += random.choice(sizes) * scale
        result.append(demand)
    return sorted(result)


def _risk(demand, stock):
    return sum(q > stock for q in demand) / len(demand)


def recommend(record, scenario):
    """Return a 30-day forecast-based (s,S) policy and cost-risk scenarios.

    The demand distribution is an explicit compound-Poisson approximation. It
    uses the model's occurrence probability and expected quantity, with
    empirical positive issue-day sizes when available. It is a decision aid,
    not a measured inventory service outcome.
    """
    scenario = scenario or {}
    forecast = scenario.get('forecast_30d_override', record.get('forecast_30d'))
    probability = scenario.get('probability_any_30d_override', record.get('probability_any_30d'))
    if forecast is None or probability is None:
        return {'available': False, 'reason': 'No issue history. Enter both a 30-day quantity estimate and an any-issue probability to simulate.'}
    forecast = _number(forecast, 'forecast_30d', 0)
    probability = _number(probability, 'probability_any_30d', 0, 0.999999)
    if (forecast == 0) != (probability == 0):
        raise ValueError('Forecast quantity and any-issue probability must both be zero or both be positive')
    stock = _number(scenario.get('stock', record.get('stock', 0)), 'stock', 0)
    lead_source = ('User-entered' if 'lead_days' in scenario else
                   'PR-to-promised-PO proxy' if record.get('lead_days_proxy') is not None else
                   'Default assumption')
    lead_days = _number(scenario.get('lead_days', record.get('lead_days_proxy') or 30), 'lead_days', 1, 365)
    review_days = _number(scenario.get('review_days', 30), 'review_days', 0, 90)
    service = _number(scenario.get('service_target', 0.95), 'service_target', 0.5, 0.999)
    multiplier = _number(scenario.get('demand_multiplier', 1), 'demand_multiplier', 0, 5)
    known_lead = _number(scenario.get('known_lead_demand', 0), 'known_lead_demand', 0)
    known_review = _number(scenario.get('known_review_demand', 0), 'known_review_demand', 0)
    price_raw = scenario.get('unit_cost_idr', record.get('unit_price_idr'))
    unit_cost = _number(price_raw, 'unit_cost_idr', 0) if price_raw is not None else None
    holding_rate = _number(scenario.get('annual_holding_rate', 0.2), 'annual_holding_rate', 0, 1)
    outage_raw = scenario.get('stockout_cost_idr')
    stockout_cost = _number(outage_raw, 'stockout_cost_idr', 0) if outage_raw not in (None, '') else None
    sizes = [float(q) for q in record.get('issue_day_sizes', []) if float(q) > 0] or [1.0]
    base_rate = -log(1 - probability) / 30 if probability else 0.0
    rate = base_rate * multiplier
    historical_mean_size = sum(sizes) / len(sizes)
    scale = forecast / (base_rate * 30 * historical_mean_size) if base_rate and historical_mean_size else 0.0
    lead = _samples(lead_days, rate, sizes, scale, known_lead)
    protection_days = lead_days + review_days
    protection = _samples(protection_days, rate, sizes, scale, known_lead + known_review)
    count_unit = record.get('unit') in COUNT_UNITS
    policy_level = (lambda amount: float(ceil(amount))) if count_unit else (lambda amount: round(amount, 2))
    reorder_point = policy_level(_quantile(lead, service))
    order_up_to = policy_level(_quantile(protection, service))
    raw_order = max(0.0, order_up_to - stock) if stock <= reorder_point else 0.0
    order_qty = float(ceil(raw_order)) if count_unit else raw_order
    mean_lead = forecast * multiplier * lead_days / 30 + known_lead
    mean_protection = forecast * multiplier * protection_days / 30 + known_lead + known_review
    safety_stock = policy_level(max(0.0, reorder_point - mean_lead))
    # Keep the frontier around plausible policy levels when current stock is
    # far above them; current-stock risk remains in the separate summary.
    chart_stock = [stock] if stock <= max(2 * order_up_to, order_up_to + 10) else []
    curve_levels = sorted({policy_level(v) for v in [0, reorder_point, order_up_to] + chart_stock +
                           [_quantile(protection, q) for q in (0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99)]})
    curve = []
    for level in curve_levels:
        risk = _risk(protection, level)
        holding = (unit_cost * holding_rate * protection_days / 365 *
                   sum(max(level - d, 0.0) for d in protection) / SAMPLES) if unit_cost is not None else None
        shortage = stockout_cost * risk if stockout_cost is not None else None
        total = holding + shortage if holding is not None and shortage is not None else None
        curve.append({'stock': level, 'stockout_risk': round(risk, 4),
                      'holding_cost_idr': round(holding, 2) if holding is not None else None,
                      'stockout_cost_idr': round(shortage, 2) if shortage is not None else None,
                      'total_cost_idr': round(total, 2) if total is not None else None})
    optimum = min(curve, key=lambda r: r['total_cost_idr'])['stock'] if unit_cost is not None and stockout_cost is not None else None
    if stock <= reorder_point:
        action = 'Reorder now'
    elif record.get('max_qty') is not None and stock > record['max_qty']:
        action = 'Review above existing maximum'
    else:
        action = 'Monitor'
    return {
        'available': True,
        'basis': 'User estimates' if 'forecast_30d_override' in scenario or 'probability_any_30d_override' in scenario else 'Historical issue model',
        'unit': record.get('unit'), 'action': action,
        'stock': stock, 'forecast_30d': round(forecast * multiplier, 2),
        'probability_any_30d': round(1 - exp(-rate * 30), 4),
        'mean_demand_lead': round(mean_lead, 2),
        'mean_demand_protection': round(mean_protection, 2),
        'stockout_risk_lead': round(_risk(lead, stock), 4),
        'stockout_risk_protection': round(_risk(protection, stock), 4),
        'reorder_point': round(reorder_point, 2),
        'safety_stock': safety_stock,
        'order_up_to': round(order_up_to, 2),
        'order_qty': round(order_qty, 2),
        'illustrative_lowest_cost_stock': optimum,
        'curve': curve,
        'assumptions': {
            'lead_days': lead_days, 'lead_source': lead_source,
            'review_days': review_days, 'service_target': service,
            'demand_multiplier': multiplier,
            'known_lead_demand': known_lead, 'known_review_demand': known_review,
            'annual_holding_rate': holding_rate,
            'unit_cost_idr': unit_cost, 'stockout_cost_idr': stockout_cost,
            'simulation_draws': SAMPLES,
            'method': 'Compound-Poisson approximation calibrated to model occurrence and mean; empirical positive issue-day sizes.',
            'missing_inputs': 'No open orders, actual receipt dates, demand censoring, MOQ, or verified downtime costs.'
        },
    }
