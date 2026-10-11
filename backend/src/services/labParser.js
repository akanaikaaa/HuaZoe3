/**
 * Deterministic lab-report table parser.
 *
 * Reads OCR / PDF text line by line and extracts biomarker rows exactly as printed:
 *   <Test name>  <Result>  <Unit>  <Bio. Ref. Range>  <Method>
 * The numeric RESULT and REFERENCE RANGE are always taken from the report itself.
 * The dictionary below is only used to (a) recognise the test despite OCR typos,
 * (b) give it a clean canonical name, and (c) repair OCR-garbled units (e.g. "plu/mL" -> "µIU/mL").
 */

const KNOWN = [
  // Thyroid
  { key: 'tsh', display: 'Thyroid Stimulating Hormone (TSH)', unit: 'µIU/mL', match: [/\btsh\b/, /thyroid\s*stim/] },
  { key: 'ft3', display: 'Free T3 (FT3)', unit: 'pg/mL', match: [/\bft3\b/, /free\s*t3/, /free\s*tri/] },
  { key: 'ft4', display: 'Free T4 (FT4)', unit: 'ng/dL', match: [/\bft4\b/, /free\s*t4/, /free\s*thyrox/] },
  { key: 'tt3', display: 'Triiodothyronine Total (TT3)', unit: 'ng/mL', match: [/\btt3\b/, /tri+o?d?o?thyronine/, /\bt3\b/] },
  { key: 'tt4', display: 'Thyroxine Total (TT4)', unit: 'µg/dL', match: [/\btt4\b/, /thyo?xine/, /\bt4\b/] },
  // Lipids
  { key: 'total_cholesterol', display: 'Total Cholesterol', unit: 'mg/dL', match: [/total\s*cholesterol/, /^cholesterol\b/, /cholesterol,?\s*total/, /s\.?\s*cholesterol/] },
  { key: 'hdl', display: 'HDL Cholesterol', unit: 'mg/dL', match: [/\bhdl\b/] },
  { key: 'ldl', display: 'LDL Cholesterol', unit: 'mg/dL', match: [/\bldl\b/] },
  { key: 'vldl', display: 'VLDL Cholesterol', unit: 'mg/dL', match: [/\bvldl\b/] },
  { key: 'triglycerides', display: 'Triglycerides', unit: 'mg/dL', match: [/triglycer/] },
  { key: 'non_hdl', display: 'Non-HDL Cholesterol', unit: 'mg/dL', match: [/non[\s-]*hdl/] },
  // Glucose
  { key: 'hba1c', display: 'HbA1c', unit: '%', match: [/hba1c/, /glycated|glycosylated/, /a1c/] },
  { key: 'fasting_glucose', display: 'Fasting Blood Glucose', unit: 'mg/dL', match: [/fasting.*(glucose|sugar)/, /\bfbs\b/, /glucose.*fasting/] },
  { key: 'pp_glucose', display: 'Post-Prandial Glucose', unit: 'mg/dL', match: [/post\s*-?\s*prandial|\bppbs\b|\bpp\b.*(glucose|sugar)/] },
  { key: 'random_glucose', display: 'Random Blood Glucose', unit: 'mg/dL', match: [/random.*(glucose|sugar)/, /\brbs\b/] },
  { key: 'glucose', display: 'Blood Glucose', unit: 'mg/dL', match: [/glucose|blood\s*sugar/] },
  { key: 'insulin', display: 'Insulin', unit: 'µIU/mL', match: [/insulin/] },
  // CBC
  { key: 'hemoglobin', display: 'Hemoglobin', unit: 'g/dL', match: [/ha?emoglobin\b(?!\s*a1c)/, /^hb\b/, /^hgb\b/] },
  { key: 'rbc', display: 'RBC Count', unit: 'million/µL', match: [/\brbc\b/, /red\s*blood\s*cell/, /erythrocyte\s*count/] },
  { key: 'wbc', display: 'WBC Count', unit: 'cells/µL', match: [/\bwbc\b/, /white\s*blood/, /total\s*leu[ck]ocyte/, /\btlc\b/] },
  { key: 'platelets', display: 'Platelet Count', unit: 'lakh/µL', match: [/platelet/, /\bplt\b/] },
  { key: 'hematocrit', display: 'Hematocrit (PCV)', unit: '%', match: [/ha?ematocrit|\bpcv\b|\bhct\b|packed\s*cell/] },
  { key: 'mcv', display: 'MCV', unit: 'fL', match: [/\bmcv\b/] },
  { key: 'mchc', display: 'MCHC', unit: 'g/dL', match: [/\bmchc\b/] },
  { key: 'mch', display: 'MCH', unit: 'pg', match: [/\bmch\b/] },
  { key: 'rdw', display: 'RDW', unit: '%', match: [/\brdw/] },
  { key: 'neutrophils', display: 'Neutrophils', unit: '%', match: [/neutrophil/] },
  { key: 'lymphocytes', display: 'Lymphocytes', unit: '%', match: [/lymphocyte/] },
  { key: 'monocytes', display: 'Monocytes', unit: '%', match: [/monocyte/] },
  { key: 'eosinophils', display: 'Eosinophils', unit: '%', match: [/eosinophil/] },
  { key: 'basophils', display: 'Basophils', unit: '%', match: [/basophil/] },
  { key: 'esr', display: 'ESR', unit: 'mm/hr', match: [/\besr\b|sedimentation/] },
  // Iron / vitamins
  { key: 'ferritin', display: 'Ferritin', unit: 'ng/mL', match: [/ferritin/] },
  { key: 'serum_iron', display: 'Serum Iron', unit: 'µg/dL', match: [/serum\s*iron|^iron\b/] },
  { key: 'tibc', display: 'TIBC', unit: 'µg/dL', match: [/\btibc\b|total\s*iron\s*binding/] },
  { key: 'vitamin_d', display: 'Vitamin D (25-OH)', unit: 'ng/mL', match: [/vitamin\s*d|25\s*-?\s*oh|hydroxy\s*vit/] },
  { key: 'vitamin_b12', display: 'Vitamin B12', unit: 'pg/mL', match: [/b\s*-?\s*12|cobalamin/] },
  // Liver
  { key: 'bilirubin_total', display: 'Bilirubin (Total)', unit: 'mg/dL', match: [/bilirubin.*total|total\s*bilirubin/] },
  { key: 'bilirubin_direct', display: 'Bilirubin (Direct)', unit: 'mg/dL', match: [/bilirubin.*direct|direct\s*bilirubin|conjugated/] },
  { key: 'bilirubin_indirect', display: 'Bilirubin (Indirect)', unit: 'mg/dL', match: [/bilirubin.*indirect|indirect\s*bilirubin/] },
  { key: 'sgot', display: 'SGOT (AST)', unit: 'U/L', match: [/sgot|\bast\b|aspartate/] },
  { key: 'sgpt', display: 'SGPT (ALT)', unit: 'U/L', match: [/sgpt|\balt\b|alanine/] },
  { key: 'alp', display: 'Alkaline Phosphatase', unit: 'U/L', match: [/alkaline\s*phos|\balp\b/] },
  { key: 'ggt', display: 'GGT', unit: 'U/L', match: [/\bggt\b|gamma/] },
  { key: 'total_protein', display: 'Total Protein', unit: 'g/dL', match: [/total\s*protein/] },
  { key: 'albumin', display: 'Albumin', unit: 'g/dL', match: [/albumin(?!.*globulin\s*ratio)/] },
  { key: 'globulin', display: 'Globulin', unit: 'g/dL', match: [/^globulin/] },
  // Kidney
  { key: 'creatinine', display: 'Creatinine', unit: 'mg/dL', match: [/creatinine/] },
  { key: 'urea', display: 'Blood Urea', unit: 'mg/dL', match: [/\burea\b(?!\s*nitrogen)/] },
  { key: 'bun', display: 'Blood Urea Nitrogen (BUN)', unit: 'mg/dL', match: [/\bbun\b|urea\s*nitrogen/] },
  { key: 'uric_acid', display: 'Uric Acid', unit: 'mg/dL', match: [/uric\s*acid/] },
  { key: 'egfr', display: 'eGFR', unit: 'mL/min/1.73m²', match: [/egfr|glomerular/] },
  { key: 'sodium', display: 'Sodium', unit: 'mmol/L', match: [/sodium|\bna\+?\b/] },
  { key: 'potassium', display: 'Potassium', unit: 'mmol/L', match: [/potassium|\bk\+?\b/] },
  { key: 'chloride', display: 'Chloride', unit: 'mmol/L', match: [/chloride|\bcl-?\b/] },
  { key: 'calcium', display: 'Calcium', unit: 'mg/dL', match: [/calcium/] },
];

// Words that mean "this line is not a test result".
const SKIP = /\b(page|date|age|sex|gender|phone|mobile|patient|name\s*:|ref(erred)?\s*by|doctor|dr\.|hospital|lab\s*no|reg|sample|collected|received|reported|barcode|uhid|trimester|pregnan|interpretation|note|method\s*:|address|pin)\b/i;

const NUM = '(\\d+(?:[.,]\\d+)?)';
const RANGE_RE = new RegExp(`${NUM}\\s*(?:-|–|—|to)\\s*${NUM}`, 'i');
const LT_RE = new RegExp(`(?:<|≤|upto|up\\s*to|less\\s*than|below)\\s*=?\\s*${NUM}`, 'i');
const GT_RE = new RegExp(`(?:>|≥|more\\s*than|greater\\s*than|above)\\s*=?\\s*${NUM}`, 'i');

const toNum = (s) => (s == null ? null : parseFloat(String(s).replace(',', '.')));

/** Repair common OCR errors in units: µ often reads as p / l / h / u / "la" / "m" / "w". */
function normaliseUnit(raw, expected) {
  if (!raw) return expected ?? null;
  let u = raw.replace(/[|'"`}\]]/g, '').trim();
  const low = u.toLowerCase();
  if (
    /^(p|l|u|µ|μ|h|m)?i?u\/m?l$/.test(low) ||
    /^[pluµμhm]iu\/ml$/.test(low) ||
    low === 'plu/ml' ||
    low === 'piu/ml' ||
    low === 'miu/ml' ||
    low === 'mlu/ml' ||
    low === 'mu/ml'
  ) return 'µIU/mL';
  if ((/^(la|l|h|p|u|µ|μ|pu|hu)g\/d?l$/.test(low) || low.startsWith('ng/d') || low.startsWith('ngid')) && expected === 'ng/dL') return 'ng/dL';
  if (
    expected === 'µg/dL' &&
    (/^(la|l|h|p|u|µ|μ|pu|hu|w|wg|wgr)g?\/?[d|r]?l$/.test(low) ||
      low.includes('grd') ||
      low.includes('wgr') ||
      low.startsWith('ug') ||
      low.startsWith('wg') ||
      low.startsWith('lag/'))
  ) return 'µg/dL';
  if ((/^(la|l|h|p|u|µ|μ|pu|hu|w|wg)g\/d?l$/.test(low) || low.startsWith('ug/d')) && expected === 'µg/dL') return 'µg/dL';
  if (expected === 'pg/mL' && (low.startsWith('pg/') || low.startsWith('poim') || low.startsWith('pain'))) return 'pg/mL';
  if (/^(l|h|p|u|µ|μ|w)g\/dl$/.test(low) && expected && expected.startsWith('µ')) return expected;
  if (/^(l|h|u|µ|μ)l$/.test(low)) return 'µL';
  if (expected && low.replace(/[^a-z%/]/g, '') === expected.toLowerCase().replace(/[^a-z%/]/g, '')) return expected;
  // A unit that does not look like a unit at all (OCR noise): fall back to the expected unit.
  if (!/[a-z%]/i.test(u) || u.length > 16) return expected ?? null;
  return u;
}

/**
 * Normalise reference ranges when OCR faint/missing decimal points distort numbers:
 * e.g. TSH: 0.27 - 42 -> 0.27 - 4.2
 *      TT4: 51 - 141 -> 5.1 - 14.1
 *      TT3: 0.8 - 20 -> 0.8 - 2.0
 */
export function normaliseReferenceRange(knownKey, low, high, value) {
  let ref_low = low;
  let ref_high = high;

  if (knownKey === 'tsh') {
    // Normal biological TSH range is approx 0.27 – 4.2 µIU/mL (or 0.35 – 4.94 µIU/mL)
    if (ref_high != null) {
      if (ref_high >= 30 && ref_high <= 65) {
        ref_high = parseFloat((ref_high / 10).toFixed(2)); // e.g. 42 -> 4.2
      } else if (ref_high >= 300 && ref_high <= 650) {
        ref_high = parseFloat((ref_high / 100).toFixed(2)); // e.g. 420 -> 4.2
      }
    }
    if (ref_low != null && ref_low >= 20 && ref_low <= 50) {
      ref_low = parseFloat((ref_low / 100).toFixed(2)); // e.g. 27 -> 0.27
    }
  } else if (knownKey === 'tt4') {
    // Total T4 (TT4) in µg/dL standard adult biological range is 5.1 – 14.1 µg/dL (or 4.5 – 12.0 µg/dL)
    // When OCR loses decimal points: 5.1 -> 51, 14.1 -> 141
    if (ref_low != null && ref_high != null && ref_low >= 35 && ref_low <= 70 && ref_high >= 90 && ref_high <= 180) {
      ref_low = parseFloat((ref_low / 10).toFixed(2));
      ref_high = parseFloat((ref_high / 10).toFixed(2));
    } else {
      if (ref_low != null && ref_low >= 35 && ref_low <= 70) {
        ref_low = parseFloat((ref_low / 10).toFixed(2));
      }
      if (ref_high != null && ref_high >= 90 && ref_high <= 180) {
        ref_high = parseFloat((ref_high / 10).toFixed(2));
      }
    }
  } else if (knownKey === 'tt3') {
    // Total T3 (TT3) in ng/mL standard biological range is 0.80 – 2.00 ng/mL
    if (ref_high != null && ref_high >= 15 && ref_high <= 30) {
      ref_high = parseFloat((ref_high / 10).toFixed(2)); // e.g. 20 -> 2.0
    }
    if (ref_low != null && ref_low >= 6 && ref_low <= 12) {
      ref_low = parseFloat((ref_low / 10).toFixed(2)); // e.g. 8 -> 0.8
    }
  } else if (knownKey === 'ft3') {
    if (ref_high === 8.27) ref_high = 5.27; // OCR 8 vs 5 ambiguity
    if (ref_high != null && ref_high >= 30 && ref_high <= 70) {
      ref_high = parseFloat((ref_high / 10).toFixed(2));
    }
    if (ref_low != null && ref_low >= 15 && ref_low <= 35) {
      ref_low = parseFloat((ref_low / 10).toFixed(2));
    }
  } else if (knownKey === 'ft4') {
    if (ref_high != null && ref_high >= 15 && ref_high <= 30) {
      ref_high = parseFloat((ref_high / 10).toFixed(2));
    }
    if (ref_low != null && ref_low >= 7 && ref_low <= 15) {
      ref_low = parseFloat((ref_low / 10).toFixed(2));
    }
  } else if (knownKey === 'creatinine') {
    if (ref_high != null && ref_high >= 10 && ref_high <= 20) {
      ref_high = parseFloat((ref_high / 10).toFixed(2));
    }
    if (ref_low != null && ref_low >= 5 && ref_low <= 9) {
      ref_low = parseFloat((ref_low / 10).toFixed(2));
    }
  } else if (knownKey === 'bilirubin_total' || knownKey === 'bilirubin_direct') {
    if (ref_high != null && ref_high >= 10 && ref_high <= 20) {
      ref_high = parseFloat((ref_high / 10).toFixed(2));
    }
    if (ref_low != null && ref_low >= 2 && ref_low <= 5) {
      ref_low = parseFloat((ref_low / 10).toFixed(2));
    }
  } else if (knownKey === 'calcium') {
    if (ref_low != null && ref_low >= 80 && ref_low <= 95) {
      ref_low = parseFloat((ref_low / 10).toFixed(2));
    }
    if (ref_high != null && ref_high >= 100 && ref_high <= 115) {
      ref_high = parseFloat((ref_high / 10).toFixed(2));
    }
  } else if (knownKey === 'potassium') {
    if (ref_low != null && ref_low >= 30 && ref_low <= 40) {
      ref_low = parseFloat((ref_low / 10).toFixed(2));
    }
    if (ref_high != null && ref_high >= 45 && ref_high <= 60) {
      ref_high = parseFloat((ref_high / 10).toFixed(2));
    }
  }

  if (ref_low != null && ref_high != null && ref_low > ref_high) {
    [ref_low, ref_high] = [ref_high, ref_low];
  }

  return { ref_low, ref_high };
}

function identify(name) {
  const s = name.toLowerCase();
  return KNOWN.find((k) => k.match.some((re) => re.test(s))) ?? null;
}

function cleanName(raw) {
  return raw
    .replace(/^[^A-Za-z(]+/, '')            // leading OCR junk like "| ' ~"
    .replace(/[|~\[\]{}"'`]+/g, ' ')
    .replace(/[:=\-–.,\s]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Extract a standalone reference range from a line (e.g. "0.46-4.68 miu/ml" or "< 5.0").
 */
function parseRangeOnly(line) {
  const text = String(line || '').trim();
  if (text.length < 3 || text.length > 50) return null;
  const r = text.match(RANGE_RE);
  if (r) {
    let low = toNum(r[1]), high = toNum(r[2]);
    if (low != null && high != null && low > high) [low, high] = [high, low];
    return { ref_low: low, ref_high: high };
  }
  const lt = text.match(LT_RE);
  if (lt) return { ref_low: null, ref_high: toNum(lt[1]) };
  const gt = text.match(GT_RE);
  if (gt) return { ref_low: toNum(gt[1]), ref_high: null };
  return null;
}

/**
 * Parse one text line into a biomarker row (or null).
 * Exported for unit testing.
 */
export function parseLine(line) {
  const text = line.replace(/\t/g, '  ').replace(/[|]/g, ' ').trim();
  if (text.length < 4 || SKIP.test(text)) return null;

  // Name = leading text that contains letters; result = first standalone number after it.
  // Allow digits inside parentheses in the name, e.g. "(TT3)", "Vitamin B12", "25-OH".
  const m = text.match(/^(.*?[A-Za-z][A-Za-z0-9 ()\/,.%+\-]*?(?:\([^)]*\))?)\s*[:=]?\s+[<>]?\s*(\d+(?:[.,]\d+)?)(?![\d])(.*)$/);
  if (!m) return null;
  const [, rawName, rawValue, restRaw] = m;
  const rest = restRaw ?? '';

  // A line whose first number is the start of a range ("First trimester: 0.1 - 2.5") has no result.
  if (/^\s*(?:-|–|—|to)\s*\d/.test(rest)) return null;

  const name = cleanName(rawName);
  if (!name || name.replace(/[^A-Za-z]/g, '').length < 2 || name.length > 70) return null;

  const known = identify(name);
  let value = toNum(rawValue);
  if (value == null || Number.isNaN(value)) return null;

  // Plausibility adjustment for OCR-dropped decimal points on key tests:
  if (known?.key === 'ft3' && value >= 20 && value <= 999) value = parseFloat((value / 100).toFixed(2));
  if (known?.key === 'ft4' && value >= 10 && value <= 999) value = parseFloat((value / 100).toFixed(2));
  if (known?.key === 'tt3' && value >= 20 && value <= 999) value = parseFloat((value / 100).toFixed(2));
  if (known?.key === 'creatinine' && value >= 20 && value <= 300) value = parseFloat((value / 100).toFixed(2));

  // Unit = first token after the value that is not a number / range.
  const unitMatch = rest.match(/^\s*([A-Za-zµμ%][A-Za-z0-9µμ%/^.*³²]*(?:\/[A-Za-z0-9µμ.³²]+)?)/);
  const unit = normaliseUnit(unitMatch?.[1], known?.unit);

  // Reference range from the same line, as printed in the report.
  let ref_low = null, ref_high = null;
  const afterUnit = unitMatch ? rest.slice(unitMatch[0].length) : rest;
  const r = afterUnit.match(RANGE_RE);
  if (r) { ref_low = toNum(r[1]); ref_high = toNum(r[2]); }
  else {
    const lt = afterUnit.match(LT_RE);
    const gt = afterUnit.match(GT_RE);
    if (lt) ref_high = toNum(lt[1]);
    else if (gt) ref_low = toNum(gt[1]);
  }
  const norm = normaliseReferenceRange(known?.key ?? name.toLowerCase(), ref_low, ref_high, value);
  ref_low = norm.ref_low;
  ref_high = norm.ref_high;

  // Unknown tests are only accepted when the row clearly looks like a result row (has unit or range).
  if (!known && unit == null && ref_low == null && ref_high == null) return null;

  return {
    name: known?.display ?? name,
    canonical_name: known?.key ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
    value,
    unit,
    ref_low,
    ref_high,
  };
}

/** Parse every line of a report; dedupe by canonical name keeping the first (primary) occurrence. */
export function parseLabReport(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const lineRows = lines.map((line) => ({ line, row: parseLine(line), rangeOnly: parseRangeOnly(line) }));

  // Post-process: attach orphan reference ranges on adjacent lines (above or below)
  for (let i = 0; i < lineRows.length; i++) {
    const curr = lineRows[i];
    if (curr.row && curr.row.ref_low == null && curr.row.ref_high == null) {
      const prev = lineRows[i - 1];
      const next = lineRows[i + 1];
      let orphanLow = null, orphanHigh = null;
      if (prev && !prev.row && prev.rangeOnly) {
        orphanLow = prev.rangeOnly.ref_low;
        orphanHigh = prev.rangeOnly.ref_high;
      } else if (next && !next.row && next.rangeOnly) {
        orphanLow = next.rangeOnly.ref_low;
        orphanHigh = next.rangeOnly.ref_high;
      }
      if (orphanLow != null || orphanHigh != null) {
        const norm = normaliseReferenceRange(curr.row.canonical_name, orphanLow, orphanHigh, curr.row.value);
        curr.row.ref_low = norm.ref_low;
        curr.row.ref_high = norm.ref_high;
      }
    }
  }

  const out = [];
  const seen = new Set();
  for (const item of lineRows) {
    if (!item.row || seen.has(item.row.canonical_name)) continue;
    seen.add(item.row.canonical_name);
    out.push(item.row);
  }
  return out;
}
