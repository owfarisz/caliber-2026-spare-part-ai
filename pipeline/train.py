"""Tune intermittent-demand candidates on time-separated windows and publish forecasts."""

from collections import defaultdict
from datetime import date
from math import exp
from pathlib import Path
from statistics import median
import json
import sqlite3

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor

from .forecast import FEATURE_NAMES, make_examples, score_predictions, trailing_forecast, tsb_forecast


OBSERVATION_START = date(2025, 5, 6)
CUTOFFS = [date(2025, 11, 1), date(2025, 12, 1)] + [date(2026, m, 1) for m in range(1, 10)]
AS_OF = date(2026, 10, 1)


def split_examples(rows):
    train = [r for r in rows if r['cutoff'] <= date(2026, 5, 1)]
    validation = [r for r in rows if date(2026, 6, 1) <= r['cutoff'] <= date(2026, 7, 1)]
    test = [r for r in rows if r['cutoff'] >= date(2026, 8, 1)]
    return train, validation, test


def _matrix(rows):
    return np.asarray([[r['features'][key] for key in FEATURE_NAMES] for r in rows], dtype=float)


def _fit_hurdle(rows, leaves):
    x = _matrix(rows)
    occurrence = np.asarray([r['actual_qty'] > 0 for r in rows], dtype=int)
    quantity = np.asarray([r['actual_qty'] / r['avg_size'] for r in rows], dtype=float)
    common = dict(max_iter=100, learning_rate=0.06, max_leaf_nodes=leaves,
                  min_samples_leaf=40, l2_regularization=10.0,
                  early_stopping=False, random_state=17)
    clf = HistGradientBoostingClassifier(**common).fit(x, occurrence)
    reg = HistGradientBoostingRegressor(loss='poisson', **common).fit(x[occurrence == 1], quantity[occurrence == 1])
    return clf, reg


def _predict_hurdle(model, rows):
    if not rows:
        return []
    clf, reg = model
    x = _matrix(rows)
    probability = clf.predict_proba(x)[:, 1]
    conditional = reg.predict(x)
    return [{'qty': float(max(0.0, p * q * r['avg_size'])), 'prob_any': float(p)}
            for p, q, r in zip(probability, conditional, rows)]


def combine_predictions(quantity_predictions, occurrence_predictions):
    if len(quantity_predictions) != len(occurrence_predictions):
        raise ValueError('Prediction lengths differ')
    return [{'qty': q['qty'], 'prob_any': o['prob_any']}
            for q, o in zip(quantity_predictions, occurrence_predictions)]


def summarize_sensitivity(original, alternative):
    """Compare within material only; mixing physical units would be invalid."""
    alternative_map = dict(alternative)
    per_material = {}
    for material, quantity in original:
        if quantity > 0:
            per_material[material] = round(100 * (alternative_map.get(material, 0.0) - quantity) / quantity, 3)
    changes = [abs(value) for value in per_material.values()]
    return ({'compared_materials': len(changes),
             'affected_materials': sum(value > 0.001 for value in changes),
             'materials_changed_at_least_10pct': sum(value >= 10 for value in changes),
             'median_absolute_change_pct': round(median(changes), 3) if changes else None},
            per_material)


def _predict_candidate(name, params, model, rows):
    if name == 'trailing':
        return [trailing_forecast(r['history'], r['cutoff'], 30, params['window']) for r in rows]
    if name == 'tsb':
        return [tsb_forecast(r['history'], r['cutoff'], OBSERVATION_START, 30,
                             params['alpha'], params['beta']) for r in rows]
    if name == 'hurdle':
        return _predict_hurdle(model, rows)
    if name == 'hybrid':
        quantity = _predict_hurdle(model, rows)
        occurrence = [tsb_forecast(r['history'], r['cutoff'], OBSERVATION_START, 30,
                                   params['alpha'], params['beta']) for r in rows]
        return combine_predictions(quantity, occurrence)
    raise ValueError(name)


def _objective(metrics, zero):
    return metrics['normalized_mae'] / max(zero['normalized_mae'], 1e-9) + metrics['brier'] / max(zero['brier'], 1e-9)


def _load_events(db):
    events = defaultdict(list)
    raw = []
    for row in db.execute('select posting_date,material_id,qty,unit,order_id,description from issues order by posting_date,source_row'):
        day, material, qty, unit, order, description = row
        events[material].append((date.fromisoformat(day), qty))
        raw.append(row)
    return events, raw


def _current_forecasts(db, selected, final_model, events):
    db.execute('drop table if exists material_forecasts')
    db.execute('create table material_forecasts (material_id text primary key, forecast_30d real, probability_any_30d real, issue_days integer, last_issue_date text, days_since_issue integer, lead_days_proxy real, unit_price_idr real, price_status text, duplicate_sensitivity_pct real)')
    procurement = defaultdict(lambda: {'lead': [], 'price_idr': [], 'currencies': set()})
    for material, pr_date, po_date, price, currency in db.execute('select material_id,pr_date,po_delivery_date,unit_price,currency from procurement'):
        p = procurement[material]
        if pr_date and po_date:
            lead = (date.fromisoformat(po_date) - date.fromisoformat(pr_date)).days
            if 1 <= lead <= 365:
                p['lead'].append(lead)
        if price and price > 0 and currency:
            p['currencies'].add(currency)
            if currency == 'IDR':
                p['price_idr'].append(price)
    material_ids = [r[0] for r in db.execute('select material_id from materials')]
    active_rows = make_examples(events, [AS_OF], OBSERVATION_START, 30)
    active_by_id = {r['material_id']: r for r in active_rows}
    active_predictions = _predict_candidate(selected['name'], selected['params'], final_model, active_rows)
    active_pred_by_id = {r['material_id']: p for r, p in zip(active_rows, active_predictions)}
    output = []
    for material in material_ids:
        row = active_by_id.get(material)
        pred = active_pred_by_id.get(material)
        supply = procurement[material]
        currency_set = supply['currencies']
        price_status = 'IDR reference' if currency_set == {'IDR'} and supply['price_idr'] else ('Mixed or foreign currency' if currency_set else 'No price history')
        output.append((
            material, pred['qty'] if pred else None, pred['prob_any'] if pred else None,
            len(row['history']) if row else 0,
            row['history'][-1][0].isoformat() if row else None,
            row['features']['days_since_issue'] if row else None,
            median(supply['lead']) if supply['lead'] else None,
            median(supply['price_idr']) if price_status == 'IDR reference' else None,
            price_status, None,
        ))
    db.executemany('insert into material_forecasts values (?,?,?,?,?,?,?,?,?,?)', output)
    return len(active_rows)


def train_and_publish(db_path: Path, report_path: Path, model_path: Path):
    db_path, report_path, model_path = map(Path, (db_path, report_path, model_path))
    with sqlite3.connect(db_path) as db:
        events, raw_issues = _load_events(db)
        examples = make_examples(events, CUTOFFS, OBSERVATION_START, 30)
        train, validation, test = split_examples(examples)
        zero_validation = score_predictions(validation, [{'qty': 0.0, 'prob_any': 0.0}] * len(validation))
        candidates = []
        models = {}
        for window in (30, 90, 180):
            params = {'window': window}
            metrics = score_predictions(validation, _predict_candidate('trailing', params, None, validation))
            candidates.append({'name': 'trailing', 'params': params, 'validation': metrics, 'objective': _objective(metrics, zero_validation)})
        for alpha in (0.005, 0.015, 0.03, 0.06):
            for beta in (0.1, 0.3, 0.6):
                params = {'alpha': alpha, 'beta': beta}
                metrics = score_predictions(validation, _predict_candidate('tsb', params, None, validation))
                candidates.append({'name': 'tsb', 'params': params, 'validation': metrics, 'objective': _objective(metrics, zero_validation)})
        for leaves in (7, 15, 31):
            model = _fit_hurdle(train, leaves)
            params = {'max_leaf_nodes': leaves}
            models[leaves] = model
            metrics = score_predictions(validation, _predict_candidate('hurdle', params, model, validation))
            candidates.append({'name': 'hurdle', 'params': params, 'validation': metrics, 'objective': _objective(metrics, zero_validation)})
        best_tsb = min((c for c in candidates if c['name'] == 'tsb'), key=lambda c: c['objective'])['params']
        for leaves, model in models.items():
            params = {'max_leaf_nodes': leaves, **best_tsb}
            metrics = score_predictions(validation, _predict_candidate('hybrid', params, model, validation))
            candidates.append({'name': 'hybrid', 'params': params, 'validation': metrics, 'objective': _objective(metrics, zero_validation)})
        selected = min(candidates, key=lambda c: c['objective'])
        chosen_model = models[selected['params']['max_leaf_nodes']] if selected['name'] in ('hurdle', 'hybrid') else None
        test_metrics = score_predictions(test, _predict_candidate(selected['name'], selected['params'], chosen_model, test))
        comparators = {}
        for label, name, params, model in (
            ('zero', 'zero', {}, None),
            ('trailing_90', 'trailing', {'window': 90}, None),
            ('tsb_tuned', 'tsb', min((c for c in candidates if c['name'] == 'tsb'), key=lambda c: c['objective'])['params'], None),
            ('hurdle_tuned', 'hurdle', min((c for c in candidates if c['name'] == 'hurdle'), key=lambda c: c['objective'])['params'], None),
            ('hybrid_tuned', 'hybrid', min((c for c in candidates if c['name'] == 'hybrid'), key=lambda c: c['objective'])['params'], None),
        ):
            if name == 'zero':
                preds = [{'qty': 0.0, 'prob_any': 0.0}] * len(test)
            elif name in ('hurdle', 'hybrid'):
                model = models[params['max_leaf_nodes']]
                preds = _predict_candidate(name, params, model, test)
            else:
                preds = _predict_candidate(name, params, model, test)
            comparators[label] = score_predictions(test, preds)
        if selected['name'] in ('hurdle', 'hybrid'):
            final_model = _fit_hurdle(examples, selected['params']['max_leaf_nodes'])
            model_path.parent.mkdir(parents=True, exist_ok=True)
            joblib.dump({'classifier': final_model[0], 'positive_quantity': final_model[1], 'feature_names': FEATURE_NAMES}, model_path)
        else:
            final_model = None
            if model_path.exists():
                model_path.unlink()
        active_count = _current_forecasts(db, selected, final_model, events)
        # Exact-repeat rows have no movement ID; this is sensitivity, not cleaning.
        dedup_events = defaultdict(list)
        seen = set()
        for record in raw_issues:
            if record in seen:
                continue
            seen.add(record)
            day, material, qty, *_ = record
            dedup_events[material].append((date.fromisoformat(day), qty))
        original_rows = make_examples(events, [AS_OF], OBSERVATION_START, 30)
        dedup_rows = make_examples(dedup_events, [AS_OF], OBSERVATION_START, 30)
        original_preds = _predict_candidate(selected['name'], selected['params'], final_model, original_rows)
        dedup_preds = _predict_candidate(selected['name'], selected['params'], final_model, dedup_rows)
        sensitivity, sensitivity_by_material = summarize_sensitivity(
            [(r['material_id'], p['qty']) for r, p in zip(original_rows, original_preds)],
            [(r['material_id'], p['qty']) for r, p in zip(dedup_rows, dedup_preds)])
        db.executemany('update material_forecasts set duplicate_sensitivity_pct=? where material_id=?',
                       [(change, material) for material, change in sensitivity_by_material.items()])
        units = dict(db.execute('select material_id,unit from materials'))
        test_preds = _predict_candidate(selected['name'], selected['params'], chosen_model, test)
        by_unit = {}
        for unit in sorted(set(units.values())):
            pairs = [(r, p) for r, p in zip(test, test_preds) if units.get(r['material_id']) == unit]
            if pairs:
                by_unit[unit] = score_predictions([r for r, _ in pairs], [p for _, p in pairs])
        report = {
            'as_of': '2026-09-30', 'horizon_days': 30,
            'training_cutoffs': ['2025-11-01', '2026-05-01'],
            'validation_cutoffs': ['2026-06-01', '2026-07-01'],
            'test_cutoffs': ['2026-08-01', '2026-09-01'],
            'cohort': 'Only materials with at least one issue before each cutoff',
            'metric_definitions': {
                'normalized_mae': 'Mean |actual-predicted| / historical mean positive issue-day quantity; lower is better.',
                'brier': 'Mean squared error of 30-day any-issue probability; lower is better.',
                'selection': 'Validation normalized MAE relative to zero baseline plus Brier relative to zero baseline; equal relative weight.',
                'f1_at_50pct': 'Occurrence F1 with fixed probability threshold 0.5; diagnostic only.',
            },
            'sample_counts': {'train': len(train), 'validation': len(validation), 'test': len(test), 'active_as_of': active_count, 'catalog': len(units)},
            'selected': {'name': selected['name'], 'params': selected['params'], 'validation': selected['validation'], 'test': test_metrics},
            'test_comparators': comparators, 'test_by_unit': by_unit,
            'validation_candidates': candidates,
            'duplicate_issue_sensitivity': sensitivity,
            'source_notes': [
                'Synthetic case data; no observed plant downtime or actual inventory service outcomes.',
                'Current stock has no snapshot timestamp and is excluded from historical model features.',
                'PR-to-promised-PO date is a planning lead-time proxy, not receipt lead time.',
                'Maintenance plans lack a direct part mapping; no scheduled part demand is invented.',
                'A/B/C/S criticality codes have no verified ranking or downtime cost mapping.',
            ],
        }
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2), encoding='utf-8')
        return report


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    report = train_and_publish(root / 'data' / 'caliber.sqlite', root / 'data' / 'model_report.json', root / 'data' / 'model.joblib')
    print(json.dumps({'selected': report['selected'], 'test_comparators': report['test_comparators'], 'sample_counts': report['sample_counts'], 'duplicate_issue_sensitivity': report['duplicate_issue_sensitivity']}, indent=2))
