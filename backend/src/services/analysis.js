/** Deterministic abnormality analysis and report comparison (no LLM, so flags are reproducible). */

export function analyzeBiomarker({ value, ref_low, ref_high }) {
  let flag = 'normal';
  let deviation = 0; // relative distance outside the range
  if (ref_low != null && value < ref_low) {
    flag = 'low';
    deviation = ref_low !== 0 ? (ref_low - value) / Math.abs(ref_low) : 1;
  } else if (ref_high != null && value > ref_high) {
    flag = 'high';
    deviation = ref_high !== 0 ? (value - ref_high) / Math.abs(ref_high) : 1;
  }
  let severity = 'none';
  if (flag !== 'normal') severity = deviation <= 0.1 ? 'mild' : deviation <= 0.3 ? 'moderate' : 'severe';
  return { flag, severity, deviation };
}

const deviationOf = (b) => analyzeBiomarker(b).deviation;

/** items: per-biomarker trend between two sets of biomarker rows. */
export function compareBiomarkers(current, previous) {
  const prevByName = new Map(previous.map((b) => [b.name, b]));
  return current.map((cur) => {
    const prev = prevByName.get(cur.name);
    if (!prev) {
      return { name: cur.name, display_name: cur.display_name, unit: cur.unit, previous: null, current: cur.value, change_pct: null, trend: 'new', flag: cur.flag };
    }
    const changePct = prev.value !== 0 ? ((cur.value - prev.value) / Math.abs(prev.value)) * 100 : null;
    const dPrev = deviationOf(prev);
    const dCur = deviationOf(cur);
    let trend = 'unchanged';
    if (dCur < dPrev - 0.02 || (dPrev > 0 && dCur === 0)) trend = 'improved';
    else if (dCur > dPrev + 0.02) trend = 'worsened';
    return {
      name: cur.name,
      display_name: cur.display_name,
      unit: cur.unit,
      previous: prev.value,
      current: cur.value,
      change_pct: changePct == null ? null : Math.round(changePct * 10) / 10,
      trend,
      flag: cur.flag,
    };
  });
}

export function comparisonSummary(items) {
  const c = (t) => items.filter((i) => i.trend === t).length;
  return `${c('improved')} improved, ${c('worsened')} worsened, ${c('unchanged')} unchanged, ${c('new')} new biomarkers compared with the previous report.`;
}
