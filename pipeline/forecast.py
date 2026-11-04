"""Leakage-safe features and interpretable intermittent-demand benchmarks."""

from collections import defaultdict
from datetime import timedelta
from math import exp


FEATURE_NAMES = (
    'age_days', 'days_since_issue', 'issue_days_30', 'issue_days_90',
    'issue_days_180', 'qty_30', 'qty_90', 'qty_180',
    'avg_daily_180', 'avg_size', 'size_cv', 'total_issue_days',
)


def aggregate_days(events):
    days = defaultdict(float)
    for day, qty in events:
        days[day] += float(qty)
    return sorted(days.items())


def make_examples(events_by_material, cutoffs, observation_start, horizon_days=30):
    examples = []
    for material_id, raw in events_by_material.items():
        days = aggregate_days(raw)
        for cutoff in cutoffs:
            history = [(day, qty) for day, qty in days if observation_start <= day < cutoff]
            if not history:
                continue
            future_end = cutoff + timedelta(days=horizon_days)
            actual = sum(qty for day, qty in days if cutoff <= day < future_end)
            avg_size = sum(qty for _, qty in history) / len(history)
            size_var = sum((qty - avg_size) ** 2 for _, qty in history) / len(history)
            features = {
                'age_days': (cutoff - observation_start).days,
                'days_since_issue': (cutoff - history[-1][0]).days,
                'avg_size': avg_size,
                'size_cv': size_var ** 0.5 / avg_size if avg_size else 0.0,
                'total_issue_days': len(history),
            }
            for window in (30, 90, 180):
                recent = [qty for day, qty in history if day >= cutoff - timedelta(days=window)]
                features[f'issue_days_{window}'] = len(recent)
                features[f'qty_{window}'] = sum(recent) / avg_size if avg_size else 0.0
            features['avg_daily_180'] = features['qty_180'] / min(180, features['age_days'])
            examples.append({
                'material_id': material_id, 'cutoff': cutoff, 'features': features,
                'history': history, 'actual_qty': actual, 'avg_size': avg_size,
            })
    return examples


def trailing_forecast(events, cutoff, horizon_days=30, window_days=90):
    history = aggregate_days((d, q) for d, q in events if cutoff - timedelta(days=window_days) <= d < cutoff)
    rate = len(history) / window_days
    return {'qty': sum(q for _, q in history) * horizon_days / window_days,
            'prob_any': 1.0 - exp(-rate * horizon_days)}


def tsb_forecast(events, cutoff, observation_start, horizon_days=30, alpha=0.02, beta=0.2):
    """TSB updates occurrence probability daily, size only on issue days."""
    days = aggregate_days((d, q) for d, q in events if observation_start <= d < cutoff)
    probability = 0.0
    size = 0.0
    day = observation_start
    for issue_day, qty in days:
        probability *= (1.0 - alpha) ** (issue_day - day).days
        probability += alpha * (1.0 - probability)
        size = qty if size == 0 else size + beta * (qty - size)
        day = issue_day + timedelta(days=1)
    probability *= (1.0 - alpha) ** (cutoff - day).days
    return {'qty': horizon_days * probability * size,
            'prob_any': 1.0 - (1.0 - probability) ** horizon_days}


def score_predictions(rows, predictions):
    if len(rows) != len(predictions) or not rows:
        raise ValueError('Rows and predictions must have matching nonzero length')
    n = len(rows)
    normalized_error = sum(abs(r['actual_qty'] - p['qty']) / r['avg_size'] for r, p in zip(rows, predictions)) / n
    normalized_bias = sum((p['qty'] - r['actual_qty']) / r['avg_size'] for r, p in zip(rows, predictions)) / n
    brier = sum((p['prob_any'] - (1 if r['actual_qty'] > 0 else 0)) ** 2 for r, p in zip(rows, predictions)) / n
    true_positive = sum(r['actual_qty'] > 0 and p['prob_any'] >= 0.5 for r, p in zip(rows, predictions))
    false_positive = sum(r['actual_qty'] == 0 and p['prob_any'] >= 0.5 for r, p in zip(rows, predictions))
    false_negative = sum(r['actual_qty'] > 0 and p['prob_any'] < 0.5 for r, p in zip(rows, predictions))
    precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
    recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        'n': n, 'positive_rate': sum(r['actual_qty'] > 0 for r in rows) / n,
        'normalized_mae': round(normalized_error, 6),
        'normalized_bias': round(normalized_bias, 6),
        'brier': round(brier, 6),
        'precision_at_50pct': round(precision, 6),
        'recall_at_50pct': round(recall, 6),
        'f1_at_50pct': round(f1, 6),
    }
