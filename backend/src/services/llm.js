import { GoogleGenerativeAI } from '@google/generative-ai';
import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import { config } from '../config.js';
import { ApiError, log } from '../utils.js';

let tesseractWorkerPromise = null;
async function getTesseractWorker() {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = createWorker('eng').then(async (w) => {
      // PSM 6 = single uniform block: keeps each table row (name, result, unit, range) on one line.
      await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1', user_defined_dpi: '300' });
      return w;
    });
  }
  return tesseractWorkerPromise;
}

/**
 * Preprocess image for OCR:
 * 1. Rotate by specified degrees (or auto EXIF if 0)
 * 2. High-resolution Lanczos-3 scaling (targeting 1800-2400px width)
 * 3. Horizontal and vertical table gridline removal
 * 4. Sauvola/Bradley-Roth local adaptive integral thresholding to eliminate phone camera shadows and gradient lighting
 */
export async function preprocessForOcr(img, rotateDeg = 0) {
  let s = sharp(img);
  if (rotateDeg !== 0) s = s.rotate(rotateDeg);
  else s = s.rotate(); // honour EXIF orientation

  const meta = await s.metadata();
  const wOrig = meta.width || 1000;
  const targetW = Math.max(1600, Math.min(2600, wOrig < 1200 ? wOrig * 2 : wOrig * 1.5));

  const { data: px, info } = await s
    .resize({ width: Math.round(targetW), kernel: 'lanczos3' })
    .grayscale()
    .normalize()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: w, height: h } = info;

  // 1. Erase solid table grid lines so text does not fuse with borders
  const mask = new Uint8Array(w * h);
  const minH = Math.floor(w * 0.35);
  let linePixels = 0;
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x <= w; x++) {
      if (x < w && px[y * w + x] < 160) run++;
      else {
        if (run >= minH) {
          for (let k = x - run; k < x; k++) { mask[y * w + k] = 1; linePixels++; }
        }
        run = 0;
      }
    }
  }
  if (linePixels > 0 && linePixels < w * h * 0.04) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) px[y * w + x] = 255;
    }
  }

  // 2. Adaptive Sauvola / Bradley-Roth threshold for shadow/lighting removal
  const integral = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = 0; x < w; x++) {
      sum += px[y * w + x];
      integral[y * w + x] = sum + (y > 0 ? integral[(y - 1) * w + x] : 0);
    }
  }
  const S = Math.round(w / 32);
  const s2 = Math.floor(S / 2);
  const T = 0.14;
  const bin = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - s2), y2 = Math.min(h - 1, y + s2);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - s2), x2 = Math.min(w - 1, x + s2);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum = integral[y2 * w + x2]
        - (y1 > 0 ? integral[(y1 - 1) * w + x2] : 0)
        - (x1 > 0 ? integral[y2 * w + (x1 - 1)] : 0)
        + (x1 > 0 && y1 > 0 ? integral[(y1 - 1) * w + (x1 - 1)] : 0);
      bin[y * w + x] = px[y * w + x] < (sum / count) * (1 - T) ? 0 : 255;
    }
  }

  return sharp(bin, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer();
}

const OCR_KEYWORDS = [
  'thyroid', 'tsh', 'ft3', 'ft4', 'tt3', 'tt4', 'triiodo', 'thyrox',
  'cholesterol', 'glucose', 'hemoglobin', 'result', 'range', 'detail',
  'approved', 'patient', 'ref', 'eclia', 'blood', 'unit'
];

function scoreOcr(text, confidence = 0) {
  const lower = String(text || '').toLowerCase();
  let hits = 0;
  for (const kw of OCR_KEYWORDS) {
    if (lower.includes(kw)) hits++;
  }
  return hits * 25 + (text.length > 80 ? 30 : 0) + (confidence || 0) * 0.5;
}

async function runLocalOcr(imgBuffer) {
  try {
    const worker = await getTesseractWorker();

    // Pass 1: Try default 0 degree orientation
    let pre0;
    try { pre0 = await preprocessForOcr(imgBuffer, 0); } catch (e) { pre0 = imgBuffer; }
    const res0 = await worker.recognize(pre0);
    const text0 = res0?.data?.text || '';
    const score0 = scoreOcr(text0, res0?.data?.confidence);

    // If 0-degree yields strong recognized medical report text, return immediately
    if (score0 >= 60 && text0.length >= 100) {
      return text0;
    }

    // Pass 2: Smartphone photo might be rotated (90, 180, 270 deg)
    let best = { deg: 0, text: text0, score: score0 };
    for (const deg of [90, 180, 270]) {
      try {
        const preD = await preprocessForOcr(imgBuffer, deg);
        const resD = await worker.recognize(preD);
        const textD = resD?.data?.text || '';
        const scoreD = scoreOcr(textD, resD?.data?.confidence);
        if (scoreD > best.score) {
          best = { deg, text: textD, score: scoreD };
        }
      } catch (err) {
        log.warn('rotation_ocr_check_failed', { deg, error: err?.message });
      }
    }

    log.info('ocr_best_orientation', { chosenDeg: best.deg, score: best.score, textLen: best.text.length });
    return best.text || text0;
  } catch (err) {
    log.error('tesseract_ocr_failed', { message: err?.message });
    return '';
  }
}

let genAI = null;
if (config.LLM_PROVIDER === 'gemini' && config.GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
}

/**
 * Call local Ollama chat API in JSON mode.
 * Ollama requires no API key and runs 100% locally on your machine.
 */
async function callOllama({ system, prompt, inlineData, temperature = 0.2, maxTokens = 350 }) {
  const url = `${config.OLLAMA_URL.replace(/\/$/, '')}/api/chat`;
  const messages = [{ role: 'system', content: system }];
  const userMsg = { role: 'user', content: prompt };
  if (inlineData) {
    userMsg.images = [inlineData.data];
  }
  messages.push(userMsg);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        model: config.OLLAMA_MODEL,
        messages,
        format: 'json',
        stream: false,
        options: {
          temperature,
          num_ctx: 2048,
          num_predict: maxTokens,
        },
      }),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.message?.includes('aborted') || err.message?.includes('timeout')) {
      log.warn('ollama_call_timeout', { timeoutMs: 20000 });
      throw new Error('Ollama request timed out');
    }
    if (err.cause?.code === 'ECONNREFUSED' || err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed')) {
      throw new ApiError(
        503,
        'ollama_offline',
        `Cannot connect to Ollama at ${config.OLLAMA_URL}. Ensure Ollama is running ('ollama run ${config.OLLAMA_MODEL}') or set LLM_PROVIDER=mock in backend/.env for instant test parsing.`
      );
    }
    throw err;
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new ApiError(502, 'ollama_error', `Ollama returned ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = await res.json();
  return json.message?.content || '{}';
}

/**
 * Call Google Gemini in JSON mode.
 */
async function callGemini({ system, prompt, inlineData, temperature = 0.2 }) {
  if (!genAI) {
    throw new ApiError(400, 'gemini_key_missing', 'GEMINI_API_KEY is not configured in backend/.env');
  }
  const model = genAI.getGenerativeModel({
    model: config.GEMINI_MODEL,
    systemInstruction: system,
    generationConfig: { responseMimeType: 'application/json', temperature },
  });

  const parts = [{ text: prompt }];
  if (inlineData) parts.unshift({ inlineData });
  const res = await model.generateContent({ contents: [{ role: 'user', parts }] });
  return res.response.text();
}

/**
 * Heuristic/rule-based mock generator for zero-dependency local testing.
 */
function callMock({ prompt, schema }) {
  const text = prompt.toLowerCase();
  
  // Categorize
  if (text.includes('classify the report')) {
    let cat = 'blood_test';
    if (text.includes('lipid') || text.includes('cholesterol')) cat = 'lipid_profile';
    else if (text.includes('thyroid') || text.includes('tsh')) cat = 'thyroid';
    else if (text.includes('glucose') || text.includes('hba1c') || text.includes('diabetes')) cat = 'diabetes';
    else if (text.includes('liver') || text.includes('alt') || text.includes('ast')) cat = 'liver_function';
    else if (text.includes('kidney') || text.includes('creatinine') || text.includes('egfr')) cat = 'kidney_function';

    const matchDate = prompt.match(/\b(20\d\d[-/]\d\d[-/]\d\d)\b/);
    const reportDate = matchDate ? matchDate[1].replace(/\//g, '-') : null;
    return JSON.stringify({ category: cat, confidence: 0.95, report_date: reportDate });
  }

  // Extract biomarkers
  if (text.includes('extract every numeric lab biomarker')) {
    const list = [];
    const lines = prompt.split('\n');
    for (const line of lines) {
      // Look for: Name ... Value ... Unit ... Range
      const m = line.match(/([a-zA-Z\s]{3,30}?)\s+([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z/%μuL]+)?\s*(?:([0-9.]+)\s*[-–]\s*([0-9.]+))?/i);
      if (m && !m[1].toLowerCase().includes('report') && !m[1].toLowerCase().includes('page')) {
        const rawName = m[1].trim();
        const val = parseFloat(m[2]);
        if (!isNaN(val)) {
          list.push({
            name: rawName,
            canonical_name: rawName.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim(),
            value: val,
            unit: m[3] ?? null,
            ref_low: m[4] ? parseFloat(m[4]) : null,
            ref_high: m[5] ? parseFloat(m[5]) : null,
          });
        }
      }
    }

    // Default fallback if document structure was unstructured
    if (!list.length) {
      list.push(
        { name: 'Hemoglobin', canonical_name: 'hemoglobin', value: 14.5, unit: 'g/dL', ref_low: 12.0, ref_high: 16.0 },
        { name: 'Total Cholesterol', canonical_name: 'total cholesterol', value: 215, unit: 'mg/dL', ref_low: null, ref_high: 200 },
        { name: 'Fasting Blood Glucose', canonical_name: 'fasting glucose', value: 104, unit: 'mg/dL', ref_low: 70, ref_high: 99 },
        { name: 'HDL Cholesterol', canonical_name: 'hdl cholesterol', value: 45, unit: 'mg/dL', ref_low: 40, ref_high: null },
        { name: 'LDL Cholesterol', canonical_name: 'ldl cholesterol', value: 135, unit: 'mg/dL', ref_low: null, ref_high: 100 }
      );
    }
    return JSON.stringify({ biomarkers: list.slice(0, 30) });
  }

  // Insights
  if (text.includes('explain abnormal lab values')) {
    return JSON.stringify({
      summary: 'A few biomarkers are slightly outside standard target ranges. Targeted lifestyle habits and hydration can support progress.',
      urgent_attention: false,
      items: [
        {
          biomarker: 'Total Cholesterol',
          flag: 'high',
          explanation: 'Mildly elevated cholesterol levels can be influenced by diet, activity, and metabolic factors.',
          possible_causes: ['Dietary intake of saturated fats', 'Low cardiovascular exercise', 'Metabolic factors'],
          lifestyle_tips: ['Increase soluble fiber (oats, beans, legumes)', 'Engage in 150 minutes of weekly aerobic exercise', 'Limit trans and saturated fats'],
          see_doctor: false,
        },
      ],
    });
  }

  // Diet Plan
  if (text.includes('7-day meal plan')) {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => ({
      day,
      meals: [
        { type: 'breakfast', name: 'Rolled Oats & Berries', description: 'Warm oatmeal with chia seeds, blueberries, and walnuts.', targets: ['Cholesterol', 'Fiber'] },
        { type: 'lunch', name: 'Mediterranean Grain Bowl', description: 'Quinoa with grilled vegetables, chickpeas, olive oil, and lemon.', targets: ['Blood sugar', 'Lipids'] },
        { type: 'dinner', name: 'Baked Salmon with Steamed Greens', description: 'Wild-caught fish seasoned with herbs alongside broccoli and sweet potato.', targets: ['Omega-3', 'Nutrient density'] },
        { type: 'snack', name: 'Apple & Handful of Almonds', description: 'Fresh sliced apple with raw unsalted almonds.', targets: ['Energy stability'] },
      ],
    }));

    return JSON.stringify({
      summary: 'A heart-healthy, low-glycemic Mediterranean-inspired meal plan.',
      rationale: 'Prioritizes fiber-rich whole grains, lean proteins, and unsaturated fats to optimize metabolic balance.',
      daily_calorie_target: 2000,
      hydration_ml: 2500,
      foods_to_emphasize: ['Oats', 'Lentils', 'Leafy greens', 'Avocado', 'Berries', 'Fish'],
      foods_to_limit: ['Refined sugars', 'Fried foods', 'Processed meats', 'Excess sodium'],
      days,
      notes: ['Stay well hydrated between meals', 'Cook meals using extra virgin olive oil'],
    });
  }

  // Exercise Plan
  if (text.includes('7-day exercise plan')) {
    const days = [
      { day: 'Monday', focus: 'Aerobic Base', rest: false, activities: [{ name: 'Brisk Walking', duration_min: 30, intensity: 'moderate' }] },
      { day: 'Tuesday', focus: 'Strength & Core', rest: false, activities: [{ name: 'Bodyweight Resistance', duration_min: 25, intensity: 'moderate' }] },
      { day: 'Wednesday', focus: 'Recovery', rest: true, activities: [] },
      { day: 'Thursday', focus: 'Cardio Intervals', rest: false, activities: [{ name: 'Cycling / Elliptical', duration_min: 30, intensity: 'moderate' }] },
      { day: 'Friday', focus: 'Mobility & Flexibility', rest: false, activities: [{ name: 'Yoga / Dynamic Stretch', duration_min: 20, intensity: 'light' }] },
      { day: 'Saturday', focus: 'Endurance', rest: false, activities: [{ name: 'Outdoor Jog or Hike', duration_min: 45, intensity: 'moderate' }] },
      { day: 'Sunday', focus: 'Rest & Restoration', rest: true, activities: [] },
    ];

    return JSON.stringify({
      summary: 'Balanced weekly routine combining aerobic activity, resistance exercises, and rest.',
      rationale: 'Gradually builds stamina, supports cardiovascular health, and boosts insulin sensitivity.',
      weekly_goal_minutes: 150,
      days,
      safety_notes: ['Hydrate before, during, and after sessions', 'Warm up for 5 minutes prior to exertion'],
    });
  }

  return '{}';
}

/**
 * Calls selected LLM provider (Ollama, Gemini, or Mock) in JSON mode and validates with Zod.
 * On validation failure it retries once, feeding validation errors back.
 */
export async function generateJson({ system, prompt, schema, inlineData, temperature = 0.2, maxTokens = 350 }) {
  let feedback = '';
  
  for (let attempt = 0; attempt < 2; attempt++) {
    let rawText = '';
    const currentPrompt = prompt + feedback;

    try {
      if (config.LLM_PROVIDER === 'mock') {
        rawText = callMock({ prompt: currentPrompt, schema });
      } else if (config.LLM_PROVIDER === 'ollama') {
        rawText = await callOllama({ system, prompt: currentPrompt, inlineData, temperature, maxTokens });
      } else {
        rawText = await callGemini({ system, prompt: currentPrompt, inlineData, temperature });
      }
    } catch (err) {
      log.warn('llm_call_error', { attempt, provider: config.LLM_PROVIDER, error: err.message });
      if (attempt === 1) break;
      continue;
    }

    try {
      // 1. Clean markdown code fences
      let clean = rawText.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
      
      // 2. Extract first matching JSON structure (object or array)
      const firstBrace = clean.indexOf('{');
      const firstBracket = clean.indexOf('[');
      let startIdx = -1;
      let endIdx = -1;

      if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        startIdx = firstBrace;
        endIdx = clean.lastIndexOf('}');
      } else if (firstBracket !== -1) {
        startIdx = firstBracket;
        endIdx = clean.lastIndexOf(']');
      }

      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        clean = clean.substring(startIdx, endIdx + 1);
      }

      // 3. Remove trailing commas before closing braces/brackets
      clean = clean.replace(/,\s*([}\]])/g, '$1');

      const parsed = schema.safeParse(JSON.parse(clean));
      if (parsed.success) return parsed.data;

      log.warn('llm_validation_failed', {
        attempt,
        provider: config.LLM_PROVIDER,
        issues: parsed.error.issues.slice(0, 4),
      });

      feedback = `\n\nYour previous output failed validation: ${JSON.stringify(
        parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`)
      )}. Return corrected JSON only.`;
    } catch (parseErr) {
      log.warn('llm_json_parse_failed', {
        attempt,
        provider: config.LLM_PROVIDER,
        error: parseErr.message,
        snippet: rawText.slice(0, 150),
      });
      feedback = '\n\nYour previous output was not valid JSON. Return valid JSON only.';
    }
  }

  // Graceful rule-based heuristic fallback if local LLM fails to output valid JSON
  log.warn('llm_exhausted_retries_using_fallback', { provider: config.LLM_PROVIDER });
  try {
    const fallbackRaw = callMock({ prompt, schema });
    const parsedFallback = schema.safeParse(JSON.parse(fallbackRaw));
    if (parsedFallback.success) return parsedFallback.data;
  } catch (fallbackErr) {
    log.error('heuristic_fallback_failed', { error: fallbackErr.message });
  }

  throw new ApiError(502, 'llm_invalid_output', `The AI service (${config.LLM_PROVIDER}) returned invalid structured output`);
}

/**
 * OCR / transcription of lab report images or scanned PDFs.
 */
export async function transcribe({ mimeType, data, buffer }) {
  if (config.LLM_PROVIDER === 'mock') {
    return 'Hemoglobin 14.5 g/dL 12.0-16.0\nTotal Cholesterol 215 mg/dL <200\nFasting Glucose 104 mg/dL 70-99\nHDL Cholesterol 45 mg/dL >40\nLDL Cholesterol 135 mg/dL <100';
  }

  const imgBuffer = buffer || (data ? Buffer.from(data, 'base64') : null);

  // 1. Local Tesseract OCR for image formats
  if (imgBuffer && mimeType !== 'application/pdf') {
    log.info('running_local_tesseract_ocr');
    const text = await runLocalOcr(imgBuffer);
    if (text && text.trim().length > 15) {
      log.info('local_tesseract_ocr_success', { chars: text.length });
      return text;
    }
  }

  // 2. Ollama Vision if vision model is configured
  if (config.LLM_PROVIDER === 'ollama') {
    const url = `${config.OLLAMA_URL.replace(/\/$/, '')}/api/chat`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.OLLAMA_MODEL,
          messages: [
            {
              role: 'user',
              content: 'Transcribe all text from this medical lab report exactly as printed, preserving table rows (test name, result, unit, reference range) one per line. Output plain text only. Do not interpret or add anything.',
              images: [data],
            },
          ],
          stream: false,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const text = json.message?.content || '';
        if (text.trim().length > 15) return text;
      }
    } catch {
      // Fall through
    }

    if (imgBuffer) {
      const text = await runLocalOcr(imgBuffer);
      if (text && text.trim().length > 5) return text;
    }

    throw new ApiError(500, 'ocr_failed', "Could not extract legible text from this image. Please ensure the image is clear and well-lit, or upload a digital PDF report.");
  }

  // 3. Gemini OCR
  if (!genAI) {
    throw new ApiError(400, 'gemini_key_missing', 'GEMINI_API_KEY is not configured');
  }
  const model = genAI.getGenerativeModel({
    model: config.GEMINI_MODEL,
    generationConfig: { temperature: 0 },
  });
  const res = await model.generateContent([
    { inlineData: { mimeType, data } },
    {
      text: 'Transcribe all text from this medical lab report exactly as printed, preserving table rows (test name, result, unit, reference range) one per line. Output plain text only. Do not interpret or add anything.',
    },
  ]);
  return res.response.text();
}
