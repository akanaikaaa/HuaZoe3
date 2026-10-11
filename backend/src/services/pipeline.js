import pdfParse from 'pdf-parse/lib/pdf-parse.js'; // direct path avoids the package index's debug file read
import { supabase, BUCKET } from '../supabase.js';
import { must, log } from '../utils.js';
import { generateJson, transcribe } from './llm.js';
import { CATEGORIZE, EXTRACT, INSIGHTS } from './prompts.js';
import { categorySchema, extractionSchema, insightsSchema } from '../schemas.js';
import { analyzeBiomarker } from './analysis.js';
import { findPreviousReport, createComparison } from './comparisons.js';
import { generatePlans } from './plans.js';
import { emitToUser } from '../realtime.js';
import { DISCLAIMER } from '../config.js';
import { parseLabReport } from './labParser.js';
import { sendReportCompletedNotification, sendReportFailedNotification } from './email.js';

async function setStatus(report, status, extra = {}) {
  must(await supabase.from('reports').update({ status, ...extra }).eq('id', report.id));
  emitToUser(report.user_id, 'report:update', { id: report.id, status });
}

/** Step 3 input: PDF text parsing, falling back to Gemini OCR for scans and images. */
async function getReportText(report, buffer) {
  if (report.mime_type === 'application/pdf') {
    try {
      const { text } = await pdfParse(buffer);
      if (text && text.replace(/\s/g, '').length > 200) return text;
    } catch {
      /* fall through to OCR */
    }
  }
  return transcribe({ mimeType: report.mime_type, data: buffer.toString('base64'), buffer });
}

const todayStr = () => new Date().toISOString().slice(0, 10);

// Fast category detection via clinical panel keywords (0ms)
export function detectFastCategory(text) {
  const s = text.toLowerCase();
  let category = null;
  if (s.includes('thyroid') || s.includes('tsh') || s.includes('tt3') || s.includes('tt4') || s.includes('ft3') || s.includes('ft4') || s.includes('thyroxine')) {
    category = 'thyroid';
  } else if (s.includes('lipid') || s.includes('cholesterol') || s.includes('triglyceride') || s.includes('hdl') || s.includes('ldl')) {
    category = 'lipid_profile';
  } else if (s.includes('glucose') || s.includes('hba1c') || s.includes('diabetes') || s.includes('insulin') || s.includes('sugar')) {
    category = 'diabetes';
  } else if (s.includes('liver') || s.includes('bilirubin') || s.includes('sgot') || s.includes('sgpt') || s.includes('alt') || s.includes('ast') || s.includes('hepatic') || s.includes('alkaline phosphatase')) {
    category = 'liver_function';
  } else if (s.includes('kidney') || s.includes('creatinine') || s.includes('urea') || s.includes('bun') || s.includes('egfr') || s.includes('renal') || s.includes('uric acid')) {
    category = 'kidney_function';
  } else if (s.includes('cbc') || s.includes('hemoglobin') || s.includes('platelet') || s.includes('hematology') || s.includes('wbc') || s.includes('rbc') || s.includes('leukocyte') || s.includes('neutrophil')) {
    category = 'blood_test';
  }

  const matchDate = text.match(/\b(20\d\d[-/]\d\d[-/]\d\d)\b/);
  const reportDate = matchDate ? matchDate[1].replace(/\//g, '-') : null;

  return category ? { category, confidence: 0.98, report_date: reportDate } : null;
}

// Biomarker extraction: values + reference ranges exactly as printed in the report.
export function extractFastBiomarkers(text) {
  return parseLabReport(text);
}

// Legacy loose regex extractor (kept for reference; no longer used).
export function extractLooseBiomarkers(text) {
  const lines = text.split('\n');
  const biomarkers = [];
  const seen = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 5) continue;
    // Match line pattern: Name ... Value ... Unit ... Range
    const m = trimmed.match(/^([a-zA-Z\s()/-]{3,50}?(?:\([a-zA-Z0-9\s]+\))?)\s*[:=-]?\s*([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z/%μuL^0-9]+)?\s*(?:\(?\s*([0-9.]+)?\s*[-–]\s*([0-9.]+)?\s*\)?)?/i);
    if (m) {
      const rawName = m[1].replace(/[:=-]+$/, '').trim();
      const lower = rawName.toLowerCase();
      if (
        lower.includes('page') ||
        lower.includes('report') ||
        lower.includes('date') ||
        lower.includes('patient') ||
        lower.includes('doctor') ||
        lower.includes('hospital') ||
        lower.includes('sample') ||
        lower.includes('phone') ||
        lower.includes('profile')
      ) {
        continue;
      }
      const val = parseFloat(m[2]);
      if (!isNaN(val) && !seen.has(lower)) {
        seen.add(lower);
        biomarkers.push({
          name: rawName,
          canonical_name: lower.replace(/[^a-z0-9]/g, ' ').trim(),
          value: val,
          unit: m[3] ? m[3].trim() : null,
          ref_low: m[4] ? parseFloat(m[4]) : null,
          ref_high: m[5] ? parseFloat(m[5]) : null,
        });
      }
    }
  }

  return biomarkers;
}

// Fast clinical diagnostic assessment generator (0ms)
export function generateFastInsights(category, abnormal) {
  const cat = String(category || '').toLowerCase();
  if (!abnormal || !abnormal.length) {
    return {
      summary: 'Diagnostic Assessment: All tested biomarkers are within physiological target ranges. Your 7-day nutrition and physical conditioning protocols below are optimized for metabolic balance, cellular energy, and long-term health.',
      urgent_attention: false,
      items: [],
    };
  }

  const items = abnormal.map((b) => {
    const isHigh = b.flag === 'high';
    const name = b.display_name;
    const lower = name.toLowerCase();

    let explanation = `${name} was measured at ${b.value} ${b.unit || ''}, which is ${isHigh ? 'elevated above' : 'below'} your biological reference interval (${b.ref_low ?? '–'} to ${b.ref_high ?? '–'}).`;
    let possible_causes = ['Nutritional intake and absorption', 'Metabolic and endocrine regulation', 'Physical recovery and hydration factors'];
    let lifestyle_tips = ['Follow the tailored nutritional protocol below', 'Maintain the structured exercise routine provided', 'Stay well hydrated with daily fluid targets'];

    if (lower.includes('cholesterol') || lower.includes('ldl') || lower.includes('lipid') || lower.includes('triglyceride')) {
      explanation = `${name} is elevated at ${b.value} ${b.unit || ''} (reference range: ${b.ref_low ?? '–'} to ${b.ref_high ?? '–'}). Elevated lipid fractions increase cardiovascular demand and arterial plaque susceptibility.`;
      possible_causes = ['Saturated and trans fat intake', 'Reduced physical activity', 'Hepatic lipid processing'];
      lifestyle_tips = ['Consume viscous soluble fiber (oats, chia seeds, lentils) to bind digestive cholesterol', 'Complete 150+ minutes of weekly aerobic exercise to boost HDL clearance', 'Eliminate industrial trans fats and processed snacks'];
    } else if (lower.includes('glucose') || lower.includes('sugar') || lower.includes('hba1c')) {
      explanation = `${name} is measured at ${b.value} ${b.unit || ''}, exceeding target thresholds (${b.ref_low ?? '–'} to ${b.ref_high ?? '–'}). This pattern indicates reduced peripheral insulin sensitivity.`;
      possible_causes = ['Refined carbohydrate load', 'Insulin receptor sensitivity', 'Elevated cortisol / physical stress'];
      lifestyle_tips = ['Prioritize low-glycemic complex carbohydrates paired with protein', 'Take a 10–15 minute walk immediately after meals to activate non-insulin glucose uptake', 'Incorporate strength training 2–3 times per week'];
    } else if (lower.includes('tsh') || lower.includes('thyroid stimulating')) {
      explanation = isHigh
        ? `${name} is elevated at ${b.value} ${b.unit || ''} (normal reference range: ${b.ref_low ?? '–'} to ${b.ref_high ?? '–'}). Elevated TSH indicates that the pituitary gland is actively compensating by signaling for increased thyroid hormone synthesis (Subclinical Hypothyroidism pattern).`
        : `${name} is low at ${b.value} ${b.unit || ''} (normal reference range: ${b.ref_low ?? '–'} to ${b.ref_high ?? '–'}). Low TSH indicates accelerated thyroid hormone output.`;
      possible_causes = isHigh
        ? ['Autoimmune thyroid sensitivity (Hashimoto\'s pattern)', 'Suboptimal intake of thyroid cofactors (selenium, zinc, tyrosine)', 'High stress and elevated systemic cortisol']
        : ['Excess thyroid hormone circulation', 'Iodine excess', 'Thyroid nodules'];
      lifestyle_tips = ['Consume 2-3 Brazil nuts daily for bioavailable selenium', 'Include zinc and tyrosine sources (pumpkin seeds, lean protein, eggs)', 'Avoid excess raw cruciferous goitrogens (steam or cook them instead)', 'Engage in moderate-intensity, restorative physical activity to protect adrenal energy'];
    } else if (lower.includes('thyroid') || lower.includes('tt3') || lower.includes('tt4') || lower.includes('t3') || lower.includes('t4')) {
      explanation = `${name} is measured at ${b.value} ${b.unit || ''}, outside typical target limits (${b.ref_low ?? '–'} to ${b.ref_high ?? '–'}).`;
      possible_causes = ['Thyroid gland output regulation', 'Micronutrient cofactor status', 'Metabolic conversion rate'];
      lifestyle_tips = ['Prioritize regular sleep schedule', 'Consume adequate micronutrient cofactors', 'Follow the tailored thyroid-support nutrition plan below'];
    } else if (lower.includes('hemoglobin') || lower.includes('iron') || lower.includes('rbc')) {
      explanation = `${name} is lower than target range at ${b.value} ${b.unit || ''} (reference: ${b.ref_low ?? '–'} to ${b.ref_high ?? '–'}), which may compromise oxygen transport capacity and vitality.`;
      possible_causes = ['Iron or ferritin deficiency', 'Vitamin B12 or folate insufficiency', 'Dietary absorption factors'];
      lifestyle_tips = ['Increase iron-rich whole foods (lentils, spinach, lean poultry)', 'Pair iron-rich foods with Vitamin C (citrus, bell peppers) to boost absorption', 'Avoid tea or coffee within 1 hour of meals'];
    }

    return {
      biomarker: name,
      flag: isHigh ? 'high' : 'low',
      explanation,
      possible_causes,
      lifestyle_tips,
      see_doctor: b.severity === 'severe' || b.severity === 'moderate',
    };
  });

  const hasUrgent = abnormal.some((b) => b.severity === 'severe');
  const abnormalNames = abnormal.map((b) => b.display_name).join(', ');

  let summary = '';
  if (cat.includes('thyroid') || abnormalNames.toLowerCase().includes('tsh') || abnormalNames.toLowerCase().includes('thyroid') || abnormalNames.toLowerCase().includes('ft3') || abnormalNames.toLowerCase().includes('ft4')) {
    const tshBio = abnormal.find((b) => b.display_name.toLowerCase().includes('tsh'));
    const ft3Bio = abnormal.find((b) => b.display_name.toLowerCase().includes('ft3') || b.display_name.toLowerCase().includes('triiodo'));
    const ft4Bio = abnormal.find((b) => b.display_name.toLowerCase().includes('ft4') || b.display_name.toLowerCase().includes('thyrox'));

    const findings = [];
    if (tshBio) findings.push(`elevated TSH (${tshBio.value} ${tshBio.unit || ''})`);
    if (ft3Bio) findings.push(`${ft3Bio.flag === 'low' ? 'reduced' : 'elevated'} Free T3 (${ft3Bio.value} ${ft3Bio.unit || ''})`);
    if (ft4Bio) findings.push(`${ft4Bio.flag === 'low' ? 'reduced' : 'elevated'} Free T4 (${ft4Bio.value} ${ft4Bio.unit || ''})`);
    const findingsStr = findings.length ? findings.join(' and ') : abnormalNames;

    summary = `Diagnostic Assessment: Primary Thyroid Imbalance Pattern. Laboratory analysis detects ${findingsStr}, indicating hypothyroid demand on cellular metabolism. Below is your tailored 7-Day Thyroid Support Nutrition Plan and restorative physical conditioning protocol designed directly according to this report to support thyroid hormone synthesis, metabolism, and cellular energy.`;
  } else if (cat.includes('lipid') || abnormalNames.toLowerCase().includes('cholesterol') || abnormalNames.toLowerCase().includes('triglyceride')) {
    summary = `Diagnostic Assessment: Cardiovascular Lipid Imbalance Pattern. Laboratory analysis shows flagged lipid fractions (${abnormalNames}). Below is your tailored 7-Day Soluble-Fiber Nutrition Protocol and cardiovascular exercise routine designed to accelerate lipid clearance.`;
  } else if (cat.includes('diabet') || cat.includes('glucose') || abnormalNames.toLowerCase().includes('glucose')) {
    summary = `Diagnostic Assessment: Impaired Glycemic Regulation. Elevated glucose markers (${abnormalNames}) detected. Below is your tailored 7-Day Glycemic Stabilization Meal Plan and targeted muscle-activation exercise routine designed to optimize insulin sensitivity.`;
  } else if (cat.includes('blood') || abnormalNames.toLowerCase().includes('hemoglobin')) {
    summary = `Diagnostic Assessment: Hematologic Oxygenation & RBC Pattern. Suboptimal parameters detected for ${abnormalNames}. Below is your tailored nutrition protocol and aerobic routine designed to support red blood cell vitality.`;
  } else {
    summary = `Diagnostic Assessment: Targeted Metabolic Intervention Required. Out-of-range values identified for ${abnormalNames}. Below is your personalized 7-day nutrition and physical conditioning protocol customized to restore physiological balance.`;
  }

  return {
    summary,
    urgent_attention: hasUrgent,
    items,
  };
}

/** Full pipeline for one report. Safe to re-run (idempotent: clears prior derived rows first). */
export async function processReport(reportId) {
  const report = must(await supabase.from('reports').select('*').eq('id', reportId).single());
  await setStatus(report, 'processing', { error_message: null });
  try {
    // 1. download from private storage
    const { data: blob, error } = await supabase.storage.from(BUCKET).download(report.file_path);
    if (error) throw new Error('Could not read uploaded file');
    const buffer = Buffer.from(await blob.arrayBuffer());

    // 2. OCR / text extraction
    const text = await getReportText(report, buffer);
    if (!text || text.trim().length < 20) throw new Error('No readable text found in the report');

    // 3. Fast category detection (fallback to LLM with small token limit if ambiguous)
    const fastCat = detectFastCategory(text);
    const cat = fastCat || await generateJson({
      system: CATEGORIZE.system,
      prompt: CATEGORIZE.prompt(text),
      schema: categorySchema,
      maxTokens: 100,
    });
    const reportDate = cat.report_date && cat.report_date <= todayStr() ? cat.report_date : todayStr();

    // 4. Fast biomarker extraction (fallback to LLM if table regex finds none)
    const fastBio = extractFastBiomarkers(text);
    let extracted;
    if (fastBio && fastBio.length >= 1) {
      extracted = { biomarkers: fastBio };
    } else {
      extracted = await generateJson({
        system: EXTRACT.system,
        prompt: EXTRACT.prompt(text, cat.category),
        schema: extractionSchema,
        maxTokens: 350,
      });
    }

    // 5. Deterministic abnormality analysis (dedupe by canonical name)
    const seen = new Set();
    const rows = [];
    for (const b of extracted.biomarkers) {
      const name = b.canonical_name.toLowerCase().trim();
      if (seen.has(name)) continue;
      seen.add(name);
      rows.push({
        report_id: report.id, user_id: report.user_id, name, display_name: b.name, value: b.value, unit: b.unit,
        ref_low: b.ref_low, ref_high: b.ref_high, measured_at: reportDate, ...analyzeBiomarker(b),
      });
    }
    if (!rows.length) throw new Error('No biomarkers could be extracted from this report');
    const dbRows = rows.map(({ deviation, ...r }) => r);
    must(await supabase.from('biomarkers').delete().eq('report_id', report.id));
    must(await supabase.from('biomarkers').insert(dbRows));
    must(await supabase.from('reports').update({ category: cat.category, report_date: reportDate }).eq('id', report.id));

    // 6. Fast clinical insights
    const abnormal = dbRows.filter((b) => b.flag !== 'normal');
    const insight = generateFastInsights(cat.category, abnormal);
    must(await supabase.from('insights').delete().eq('report_id', report.id));
    must(await supabase.from('insights').insert({ user_id: report.user_id, report_id: report.id, summary: insight.summary, items: { urgent_attention: insight.urgent_attention, list: insight.items }, disclaimer: DISCLAIMER }));

    // 7. Generate comparison and tailored diet + exercise plans according to this report
    const current = { ...report, category: cat.category, report_date: reportDate };
    let comparison = null;
    try {
      const prev = await findPreviousReport(current);
      if (prev) comparison = await createComparison(report.user_id, report.id, prev.id);
    } catch (err) {
      log.warn('comparison_failed', { reportId: report.id, error: err.message });
    }

    try {
      await generatePlans(report.user_id, report.id, comparison);
    } catch (err) {
      log.warn('plan_generation_failed', { reportId: report.id, error: err.message });
    }

    // 8. Instant completion! The user sees the completed report, biomarkers, insights, and tailored plans
    await setStatus(report, 'completed', { processed_at: new Date().toISOString() });
    log.info('report_completed_with_plans', { reportId: report.id });

    // 9. Dispatch real-time report completion email notification via Resend
    try {
      const { data: userProfile } = await supabase.from('users').select('email, full_name').eq('id', report.user_id).maybeSingle();
      if (userProfile?.email) {
        await sendReportCompletedNotification({
          to: userProfile.email,
          fullName: userProfile.full_name,
          report: { ...report, category: cat.category, report_date: reportDate },
          biomarkers: dbRows,
          insights: insight,
          urgentAttention: !!insight?.urgent_attention,
        });
      }
    } catch (notifErr) {
      log.warn('report_completed_notification_failed', { reportId: report.id, error: notifErr.message });
    }

  } catch (e) {
    log.error('report_failed', { reportId: report.id, reason: e.code ?? e.name });
    await setStatus(report, 'failed', { error_message: e.message?.slice(0, 200) ?? 'Processing failed' });
    try {
      const { data: userProfile } = await supabase.from('users').select('email, full_name').eq('id', report.user_id).maybeSingle();
      if (userProfile?.email) {
        await sendReportFailedNotification({
          to: userProfile.email,
          fullName: userProfile.full_name,
          report,
          reason: e.message?.slice(0, 200) ?? 'Processing failed',
        });
      }
    } catch {}
  }
}
