import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLabReport } from '../src/services/labParser.js';

test('thyroid table from OCR keeps original values and ranges', () => {
  const text = `Test Name                                   Result                 Unit              Bio. Ref. Range              Method
T-YHO J 20°F E7777) - |, SERUM
Triiodothyronine Total (TT3)                         1.37                         ng/mL                0.80 - 2.00                           ECLIA
Thyroxine (TT4)                                                              6.16                                      lag/dL                          5.1-14.1                                                ECLIA
Thyroid Stimulating Hormone (TSH)             12.50                      plu/mL              0.27-4.2                            ECLIA
For Pregnant women:
First trimester: 0.1 - 2.5
Second trimester: 0.2 - 3.0
Third trimester: 0.3 - 3.0
dnc. y corre ate c inica . y`;
  const rows = parseLabReport(text);
  assert.deepEqual(rows, [
    { name: 'Triiodothyronine Total (TT3)', canonical_name: 'tt3', value: 1.37, unit: 'ng/mL', ref_low: 0.8, ref_high: 2 },
    { name: 'Thyroxine Total (TT4)', canonical_name: 'tt4', value: 6.16, unit: 'µg/dL', ref_low: 5.1, ref_high: 14.1 },
    { name: 'Thyroid Stimulating Hormone (TSH)', canonical_name: 'tsh', value: 12.5, unit: 'µIU/mL', ref_low: 0.27, ref_high: 4.2 },
  ]);
});

test('lipid / glucose / CBC rows incl. < and > ranges', () => {
  const text = `Hemoglobin 14.5 g/dL 12.0-16.0
Total Cholesterol 215 mg/dL <200
Fasting Glucose 104 mg/dL 70-99
HDL Cholesterol 45 mg/dL >40
Patient Age 45 Years
Platelet Count 2.5 lakh/µL 1.5 - 4.5`;
  const rows = parseLabReport(text);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.find((r) => r.canonical_name === 'total_cholesterol'), { name: 'Total Cholesterol', canonical_name: 'total_cholesterol', value: 215, unit: 'mg/dL', ref_low: null, ref_high: 200 });
  assert.equal(rows.find((r) => r.canonical_name === 'hdl').ref_low, 40);
  assert.equal(rows.find((r) => r.canonical_name === 'fasting_glucose').value, 104);
});

test('free thyroid panel with multiline ranges and OCR unit artifacts', () => {
  const text = `
Free T3, T4 & TSH
Requested On: Jun 23 2024 10:34AM
Result On: Jun 23 2024 1:22PM | Approved On: Jun 23 2024 1:36PM
Detail: Result Value Ref Range
(F-T3) FREE TRIIODOTHYRONINE: 2.21 2.77 - 5.27 pg/ml
(F-T4) FREE THYROXINE: 0.93 0.78 - 2.19 ng/di
0.46-4.68 miu/ml
(TSH)THYROID STIMULATING: 11.24
Approved by: Padmin Jeyarajan
  `;
  const rows = parseLabReport(text);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.find((r) => r.canonical_name === 'ft3'), {
    name: 'Free T3 (FT3)',
    canonical_name: 'ft3',
    value: 2.21,
    unit: 'pg/mL',
    ref_low: 2.77,
    ref_high: 5.27,
  });
  assert.deepEqual(rows.find((r) => r.canonical_name === 'ft4'), {
    name: 'Free T4 (FT4)',
    canonical_name: 'ft4',
    value: 0.93,
    unit: 'ng/dL',
    ref_low: 0.78,
    ref_high: 2.19,
  });
  assert.deepEqual(rows.find((r) => r.canonical_name === 'tsh'), {
    name: 'Thyroid Stimulating Hormone (TSH)',
    canonical_name: 'tsh',
    value: 11.24,
    unit: 'µIU/mL',
    ref_low: 0.46,
    ref_high: 4.68,
  });
});

test('thyroid report with OCR-dropped decimal points in ranges and wgrdL unit', () => {
  const text = `
| Test Name Result                | unit Bio. Ref. Range Method
THYROID PROFILE (TFT) -l , seruM
Triiodothyronine Total (T T3)                      1.37                      ‘ng/mL               0.80 - 2.00                       | ECLIA
Thyroxine (TT4)             | 6.16                      | wgrdL               [51-141                           |ecLia
Thyroid Stimulating Hormone (TSH)              12.50                      piu/mL              0.27-42                            ECLIA
For Pregnant women:
First trimester: 0.1 - 2.5
Second trimester: 0.2 - 3.0
Third trimester: 0.3 - 3.0
kindly correlate clinically
  `;
  const rows = parseLabReport(text);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.find((r) => r.canonical_name === 'tt3'), {
    name: 'Triiodothyronine Total (TT3)',
    canonical_name: 'tt3',
    value: 1.37,
    unit: 'ng/mL',
    ref_low: 0.8,
    ref_high: 2,
  });
  assert.deepEqual(rows.find((r) => r.canonical_name === 'tt4'), {
    name: 'Thyroxine Total (TT4)',
    canonical_name: 'tt4',
    value: 6.16,
    unit: 'µg/dL',
    ref_low: 5.1,
    ref_high: 14.1,
  });
  assert.deepEqual(rows.find((r) => r.canonical_name === 'tsh'), {
    name: 'Thyroid Stimulating Hormone (TSH)',
    canonical_name: 'tsh',
    value: 12.5,
    unit: 'µIU/mL',
    ref_low: 0.27,
    ref_high: 4.2,
  });
});

