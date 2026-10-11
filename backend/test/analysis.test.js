import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBiomarker, compareBiomarkers } from '../src/services/analysis.js';

test('flags high with severity by deviation', () => {
  assert.deepEqual(
    (({ flag, severity }) => ({ flag, severity }))(analyzeBiomarker({ value: 210, ref_low: null, ref_high: 200 })),
    { flag: 'high', severity: 'mild' }
  );
  assert.equal(analyzeBiomarker({ value: 300, ref_low: null, ref_high: 200 }).severity, 'severe');
  assert.equal(analyzeBiomarker({ value: 9, ref_low: 12, ref_high: 16 }).flag, 'low');
  assert.equal(analyzeBiomarker({ value: 14, ref_low: 12, ref_high: 16 }).flag, 'normal');
});

test('comparison trends', () => {
  const mk = (value) => ({ name: 'ldl', display_name: 'LDL', unit: 'mg/dL', value, ref_low: null, ref_high: 100, flag: 'x' });
  assert.equal(compareBiomarkers([mk(110)], [mk(150)])[0].trend, 'improved');
  assert.equal(compareBiomarkers([mk(160)], [mk(120)])[0].trend, 'worsened');
  assert.equal(compareBiomarkers([mk(90)], [mk(95)])[0].trend, 'unchanged');
  assert.equal(compareBiomarkers([mk(90)], [])[0].trend, 'new');
});
