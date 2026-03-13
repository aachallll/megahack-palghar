"""
Prahari ICU Predictive Intelligence Engine
==========================================
Server-side vitals trend analysis, correlation detection,
predictive scoring, and early warning estimation.

All logic is pure Python / NumPy — no ML framework required.
This is also mirrored as TypeScript in TelemetryMonitor.tsx for
client-side use; keep both in sync when changing thresholds.
"""

import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class VitalTrend:
    vital: str          # short key: hr / spo2 / bp / rr / temp
    label: str          # human label: "Heart Rate"
    slope: float        # units/minute (linear regression)
    direction: str      # 'rising' | 'falling' | 'stable'
    change_percent: float
    alarming: bool
    current_value: Optional[float] = None


@dataclass
class CorrelationAlert:
    pattern: str
    severity: str       # 'warning' | 'urgent' | 'critical'
    explanation: str
    vitals_involved: List[str]
    confidence: float   # 0.0 – 1.0


@dataclass
class PredictiveResult:
    trends: List[VitalTrend]
    correlations: List[CorrelationAlert]
    predictive_score: int           # 0 – 100
    time_to_alert: Optional[int]    # minutes, None if can't estimate
    news2: Optional[int]
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())


# ---------------------------------------------------------------------------
# Alert debounce tracker  (per-patient in-memory state)
# ---------------------------------------------------------------------------

class AlertDebouncer:
    """
    Only surfaces a pattern alert if it has been continuously detected
    across `min_hits` consecutive analysis cycles (each ~30 s apart).
    Prevents single-reading spikes from firing alerts.
    """
    def __init__(self, min_hits: int = 3, window_seconds: int = 120):
        self.min_hits = min_hits
        self.window_seconds = window_seconds
        # patient_id → { pattern → deque of timestamps }
        self._hits: Dict[str, Dict[str, deque]] = defaultdict(lambda: defaultdict(deque))
        self._suppressed_count: Dict[str, int] = defaultdict(int)

    def check(self, patient_id: str, correlations: List[CorrelationAlert]) -> Tuple[List[CorrelationAlert], int]:
        """
        Returns (confirmed_correlations, suppressed_count).
        Confirmed = present in >= min_hits cycles within window.
        """
        now = time.time()
        patient_hits = self._hits[patient_id]
        detected_patterns = {c.pattern for c in correlations}
        suppressed = 0

        # Record new hits
        for pattern in detected_patterns:
            q = patient_hits[pattern]
            q.append(now)
            # Trim old hits outside window
            while q and (now - q[0]) > self.window_seconds:
                q.popleft()

        # Decay patterns no longer detected
        for pattern in list(patient_hits.keys()):
            if pattern not in detected_patterns:
                q = patient_hits[pattern]
                while q and (now - q[0]) > self.window_seconds:
                    q.popleft()

        # Filter correlations to confirmed-only
        confirmed = []
        for corr in correlations:
            hits = len(patient_hits[corr.pattern])
            if hits >= self.min_hits:
                confirmed.append(corr)
            else:
                suppressed += 1

        self._suppressed_count[patient_id] = self._suppressed_count.get(patient_id, 0) + suppressed
        return confirmed, suppressed

    def hourly_suppressed(self, patient_id: str) -> int:
        return self._suppressed_count.get(patient_id, 0)

    def reset_count(self, patient_id: str):
        self._suppressed_count[patient_id] = 0


# Singleton debouncer
debouncer = AlertDebouncer(min_hits=3, window_seconds=120)


# ---------------------------------------------------------------------------
# Core maths
# ---------------------------------------------------------------------------

def spike_filter(values: List[float], sigma: float = 3.0) -> List[float]:
    """Remove statistical outliers (> sigma std devs from mean)."""
    if len(values) < 4:
        return values
    arr = np.array(values, dtype=float)
    mean, std = arr.mean(), arr.std()
    if std == 0:
        return values
    return [v for v in values if abs(v - mean) <= sigma * std]


def calc_slope(values: List[float], timestamps: List[str]) -> float:
    """Linear regression slope in units/minute."""
    if len(values) < 3:
        return 0.0
    try:
        times_min = np.array([
            datetime.fromisoformat(t.replace('Z', '+00:00')).timestamp() / 60
            for t in timestamps
        ], dtype=float)
        vals = np.array(values, dtype=float)
        n = len(vals)
        mx, my = times_min.mean(), vals.mean()
        num = ((times_min - mx) * (vals - my)).sum()
        den = ((times_min - mx) ** 2).sum()
        return float(num / den) if den != 0 else 0.0
    except Exception:
        return 0.0


def analyze_trend(
    values: List[float],
    timestamps: List[str],
    vital_key: str,
    vital_label: str,
    baseline: Tuple[float, float],
) -> VitalTrend:
    clean = spike_filter(values)
    recent = clean[-12:]
    recent_times = timestamps[-12:]
    slope = calc_slope(recent, recent_times)
    first = recent[0] if recent else 0.0
    last = recent[-1] if recent else 0.0
    change_pct = ((last - first) / first * 100) if first != 0 else 0.0
    direction = 'rising' if slope > 0.3 else 'falling' if slope < -0.3 else 'stable'
    alarming = (
        abs(change_pct) > 10
        or last < baseline[0] * 0.9
        or last > baseline[1] * 1.1
    )
    return VitalTrend(
        vital=vital_key,
        label=vital_label,
        slope=round(slope, 4),
        direction=direction,
        change_percent=round(change_pct, 2),
        alarming=alarming,
        current_value=last if last else None,
    )


# ---------------------------------------------------------------------------
# Pattern detection
# ---------------------------------------------------------------------------

PATTERNS = [
    {
        "name": "Type II Respiratory Failure",
        "severity": "critical",
        "confidence": 0.89,
        "check": lambda t, v: (
            t.get('spo2') and t['spo2'].direction == 'falling' and
            t.get('etco2') and t['etco2'].direction == 'rising' and t['etco2'].current_value > 45
        ),
        "explain": lambda t, v: (
            f"SpO2 falling ({t['spo2'].current_value}%) with rising CO2 "
            f"({t['etco2'].current_value} mmHg) — indicates hypoventilation/failure"
        ),
        "vitals": ["Oxygen Saturation", "EtCO2"],
    },
    {
        "name": "Septic Shock Triad",
        "severity": "critical",
        "confidence": 0.92,
        "check": lambda t, v: (
            t.get('temp') and t['temp'].direction == 'rising' and
            t.get('hr') and t['hr'].direction == 'rising' and
            t.get('map') and t['map'].direction == 'falling' and t['map'].current_value < 65
        ),
        "explain": lambda t, v: (
            f"Rising fever ({t['temp'].current_value}°C) with tachycardia "
            f"and falling MAP ({t['map'].current_value} mmHg) — classic shock pattern"
        ),
        "vitals": ["Temperature", "Heart Rate", "MAP"],
    },
    {
        "name": "Respiratory Compromise",
        "severity": "urgent",
        "confidence": 0.82,
        "check": lambda t, v: (
            t.get('hr') and t['hr'].direction == 'rising' and t['hr'].change_percent > 8 and
            t.get('spo2') and t['spo2'].direction == 'falling' and t['spo2'].change_percent < -3
        ),
        "explain": lambda t, v: (
            f"HR rising {t['hr'].change_percent:.1f}% while SpO2 falling "
            f"{abs(t['spo2'].change_percent):.1f}% — early respiratory distress"
        ),
        "vitals": ["Heart Rate", "SpO2"],
    },
    {
        "name": "Hemodynamic Instability",
        "severity": "critical",
        "confidence": 0.88,
        "check": lambda t, v: (
            t.get('hr') and t['hr'].direction == 'rising' and t['hr'].change_percent > 10 and
            t.get('bp') and t['bp'].direction == 'falling' and t['bp'].change_percent < -8
        ),
        "explain": lambda t, v: (
            f"HR increasing {t['hr'].change_percent:.1f}% while BP dropping "
            f"{abs(t['bp'].change_percent):.1f}% — indicates possible circulatory collapse"
        ),
        "vitals": ["Heart Rate", "Blood Pressure"],
    },
    {
        "name": "Impending Respiratory Failure",
        "severity": "critical",
        "confidence": 0.91,
        "check": lambda t, v: (
            t.get('rr') and t['rr'].direction == 'rising' and t['rr'].change_percent > 15 and
            t.get('spo2') and t['spo2'].direction == 'falling'
        ),
        "explain": lambda t, v: (
            f"Respiratory rate rising {t['rr'].change_percent:.1f}% with falling oxygen — "
            "patient is working harder to breathe"
        ),
        "vitals": ["Respiratory Rate", "SpO2"],
    },
    {
        "name": "Multi-system Decompensation",
        "severity": "critical",
        "confidence": 0.94,
        "check": lambda t, v: sum(1 for tr in t.values() if tr.alarming) >= 4,
        "explain": lambda t, v: (
            f"{sum(1 for tr in t.values() if tr.alarming)} vitals simultaneously showing "
            "adverse trends — immediate clinical assessment warranted"
        ),
        "vitals": [],     # filled dynamically
    },
    {
        "name": "Critical Hypoxaemia",
        "severity": "critical",
        "confidence": 1.0,
        "check": lambda t, v: v.get('oxygen_saturation') and v['oxygen_saturation'] < 90,
        "explain": lambda t, v: (
            f"SpO2 {v['oxygen_saturation']}% is below the safe threshold of 90%."
        ),
        "vitals": ["SpO2"],
    },
]


def detect_correlations(
    trend_map: Dict[str, VitalTrend],
    latest_vitals: Dict,
) -> List[CorrelationAlert]:
    alerts: List[CorrelationAlert] = []
    seen: set = set()

    for p in PATTERNS:
        try:
            if p['check'](trend_map, latest_vitals) and p['name'] not in seen:
                seen.add(p['name'])
                vitals = p['vitals'] if p['vitals'] else [
                    tr.label for tr in trend_map.values() if tr.alarming
                ]
                alerts.append(CorrelationAlert(
                    pattern=p['name'],
                    severity=p['severity'],
                    explanation=p['explain'](trend_map, latest_vitals),
                    vitals_involved=vitals,
                    confidence=p['confidence'],
                ))
        except Exception as e:
            logger.debug(f"Pattern {p['name']} check error: {e}")

    return alerts


# ---------------------------------------------------------------------------
# Predictive score
# ---------------------------------------------------------------------------

def calc_predictive_score(
    trends: List[VitalTrend],
    correlations: List[CorrelationAlert],
) -> int:
    score = 0.0
    for t in trends:
        if t.alarming:
            score += 10
        score += min(15, abs(t.change_percent) * 0.5)
    for c in correlations:
        score += 25 if c.severity == 'critical' else 15 if c.severity == 'urgent' else 8
    return min(100, int(round(score)))


def estimate_time_to_alert(
    trend_map: Dict[str, VitalTrend],
    latest_vitals: Dict,
) -> Optional[int]:
    """Returns estimated minutes until a threshold breach, capped at 30."""
    results = []
    # HR threshold: 130 bpm
    hr = trend_map.get('hr')
    hr_val = latest_vitals.get('heart_rate')
    if hr and hr.slope > 0.5 and hr_val and hr_val < 130:
        mins = (130 - hr_val) / hr.slope
        if 0 < mins <= 30:
            results.append(int(round(mins)))

    # SpO2 threshold: 90%
    spo2 = trend_map.get('spo2')
    spo2_val = latest_vitals.get('oxygen_saturation')
    if spo2 and spo2.slope < -0.3 and spo2_val and spo2_val > 90:
        mins = (spo2_val - 90) / abs(spo2.slope)
        if 0 < mins <= 30:
            results.append(int(round(mins)))

    # BP threshold: 90 mmHg systolic
    bp = trend_map.get('bp')
    bp_val = latest_vitals.get('blood_pressure_systolic')
    if bp and bp.slope < -0.5 and bp_val and bp_val > 90:
        mins = (bp_val - 90) / abs(bp.slope)
        if 0 < mins <= 30:
            results.append(int(round(mins)))

    return min(results) if results else None


# ---------------------------------------------------------------------------
# NEWS2 (pure Python fallback, no DB RPC required)
# ---------------------------------------------------------------------------

def calc_news2(vitals: Dict) -> int:
    """
    Simplified NEWS2 score.
    Reference: Royal College of Physicians, 2017.
    """
    score = 0
    rr = vitals.get('respiratory_rate') or 0
    spo2 = vitals.get('oxygen_saturation') or 100
    bp = vitals.get('blood_pressure_systolic') or 120
    hr = vitals.get('heart_rate') or 70
    temp = vitals.get('temperature') or 37.0

    # Respiratory rate
    if rr <= 8 or rr >= 25:
        score += 3
    elif rr >= 21:
        score += 2
    elif rr >= 9:
        score += 0
    # SpO2 (Scale 1)
    if spo2 <= 91:
        score += 3
    elif spo2 <= 93:
        score += 2
    elif spo2 <= 95:
        score += 1
    # Systolic BP
    if bp <= 90 or bp >= 220:
        score += 3
    elif bp <= 100:
        score += 2
    elif bp <= 110:
        score += 1
    # Heart rate
    if hr <= 40 or hr >= 131:
        score += 3
    elif hr >= 111:
        score += 2
    elif hr <= 50 or hr >= 91:
        score += 1
    # Temperature
    if temp <= 35.0:
        score += 3
    elif temp >= 39.1:
        score += 2
    elif temp <= 36.0 or temp >= 38.1:
        score += 1

    return score


# ---------------------------------------------------------------------------
# Main analysis entry point
# ---------------------------------------------------------------------------

def analyze_patient_vitals(
    patient_id: str,
    vitals_history: List[Dict],
    debounce: bool = True,
) -> PredictiveResult:
    """
    Full analysis of a patient's vitals history.
    vitals_history: list of vital dicts with keys:
        heart_rate, oxygen_saturation, blood_pressure_systolic,
        blood_pressure_diastolic, respiratory_rate, temperature, 
        etco2, pulse, aw_rr, timestamp
    Returns PredictiveResult with trends, correlations, score, ETA, NEWS2.
    """
    if len(vitals_history) < 3:
        return PredictiveResult([], [], 0, None, None)

    latest = vitals_history[-1]
    timestamps = [v['timestamp'] for v in vitals_history]

    def extract(key: str) -> List[float]:
        return [v[key] for v in vitals_history if v.get(key) is not None]

    hr_vals = extract('heart_rate')
    spo2_vals = extract('oxygen_saturation')
    bp_vals = extract('blood_pressure_systolic')
    rr_vals = extract('respiratory_rate')
    temp_vals = extract('temperature')

    trends = []
    trend_map: Dict[str, VitalTrend] = {}

    for key, label, vals, baseline in [
        ('hr',    'Heart Rate',       hr_vals,   (60, 100)),
        ('spo2',  'SpO2',             spo2_vals, (94, 100)),
        ('bp',    'Blood Pressure',   bp_vals,   (90, 140)),
        ('rr',    'Respiratory Rate', rr_vals,   (12, 20)),
        ('temp',  'Temperature',      temp_vals, (36.1, 37.5)),
        ('etco2', 'EtCO2',            extract('etco2'), (35, 45)),
        ('map',   'MAP',              extract('map'),   (70, 105)),
        ('pulse', 'Pulse Rate',       extract('pulse'), (60, 100)),
        ('aw_rr', 'Airway RR',        extract('aw_rr'), (12, 20)),
    ]:
        if len(vals) >= 3:
            t = analyze_trend(vals, timestamps, key, label, baseline)
            trends.append(t)
            trend_map[key] = t

    correlations = detect_correlations(trend_map, latest)

    suppressed = 0
    if debounce:
        correlations, suppressed = debouncer.check(patient_id, correlations)

    score = calc_predictive_score(trends, correlations)
    tta = estimate_time_to_alert(trend_map, latest)
    news2 = calc_news2(latest)

    return PredictiveResult(
        trends=trends,
        correlations=correlations,
        predictive_score=score,
        time_to_alert=tta,
        news2=news2,
    )
