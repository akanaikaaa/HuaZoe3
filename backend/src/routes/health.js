import { Router } from 'express';
import { supabase } from '../supabase.js';
import { ok, validate, must, notFound, forbidden, canAccessPatient, resolvePatientId, badRequest } from '../utils.js';
import { biomarkerQuery, insightQuery, logRangeQuery, dailyLogBody, dateParams, compareBody, idParams, patientQuery } from '../schemas.js';
import { createComparison } from '../services/comparisons.js';
import { generatePlans } from '../services/plans.js';
import { emitToUser } from '../realtime.js';

const r = Router();

// ───────── Biomarkers ─────────
r.get('/biomarkers', validate({ query: biomarkerQuery }), async (req, res) => {
  const userId = await resolvePatientId(req);
  let q = supabase.from('biomarkers').select('*').eq('user_id', userId);
  if (req.query.name) q = q.eq('name', req.query.name.toLowerCase());
  if (req.query.reportId) q = q.eq('report_id', req.query.reportId);
  ok(res, must(await q.order('measured_at')));
});

// Grouped time series per biomarker for trend charts
r.get('/biomarkers/trends', validate({ query: patientQuery }), async (req, res) => {
  const userId = await resolvePatientId(req);
  const rows = must(await supabase.from('biomarkers').select('name, display_name, value, unit, ref_low, ref_high, flag, measured_at, report_id').eq('user_id', userId).order('measured_at'));
  const groups = {};
  for (const b of rows) (groups[b.name] ??= { name: b.name, display_name: b.display_name, unit: b.unit, ref_low: b.ref_low, ref_high: b.ref_high, points: [] }).points.push({ date: b.measured_at, value: b.value, flag: b.flag, report_id: b.report_id });
  ok(res, Object.values(groups));
});

// ───────── Insights ─────────
r.get('/insights', validate({ query: insightQuery }), async (req, res) => {
  const userId = await resolvePatientId(req);
  let q = supabase.from('insights').select('*').eq('user_id', userId);
  if (req.query.reportId) q = q.eq('report_id', req.query.reportId);
  ok(res, must(await q.order('created_at', { ascending: false }).limit(req.query.reportId ? 1 : 20)));
});

// ───────── Diet / exercise plans ─────────
for (const [path, table] of [['diet-plans', 'diet_plans'], ['exercise-plans', 'exercise_plans']]) {
  r.get(`/${path}/current`, validate({ query: patientQuery }), async (req, res) => {
    const userId = await resolvePatientId(req);
    ok(res, must(await supabase.from(table).select('*').eq('user_id', userId).eq('is_current', true).maybeSingle()));
  });
  r.get(`/${path}`, validate({ query: patientQuery }), async (req, res) => {
    const userId = await resolvePatientId(req);
    ok(res, must(await supabase.from(table).select('*').eq('user_id', userId).order('version', { ascending: false })));
  });
}

// Step 11: regenerate both plans from latest biomarkers, last comparison and daily logs (e.g. after a week of tracking)
r.post('/plans/regenerate', async (req, res) => {
  const latestCmp = must(await supabase.from('report_comparisons').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(1));
  const { diet, exercise } = await generatePlans(req.user.id, latestCmp[0]?.current_report_id ?? null, latestCmp[0] ?? null);
  ok(res, { diet, exercise }, 201);
});

// ───────── Daily logs ─────────
r.get('/daily-logs', validate({ query: logRangeQuery }), async (req, res) => {
  const userId = await resolvePatientId(req);
  const to = req.query.to ?? new Date().toISOString().slice(0, 10);
  const from = req.query.from ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  ok(res, must(await supabase.from('daily_logs').select('*').eq('user_id', userId).gte('log_date', from).lte('log_date', to).order('log_date')));
});

// Idempotent upsert per day: safe for offline-retry from Android
r.put('/daily-logs/:date', validate({ params: dateParams, body: dailyLogBody }), async (req, res) => {
  if (req.params.date > new Date(Date.now() + 864e5).toISOString().slice(0, 10)) throw badRequest('Date is in the future');
  const row = must(
    await supabase.from('daily_logs').upsert({ ...req.body, user_id: req.user.id, log_date: req.params.date, updated_at: new Date().toISOString() }, { onConflict: 'user_id,log_date' }).select().single()
  );
  emitToUser(req.user.id, 'log:updated', { date: row.log_date });
  ok(res, row);
});

r.delete('/daily-logs/:date', validate({ params: dateParams }), async (req, res) => {
  must(await supabase.from('daily_logs').delete().eq('user_id', req.user.id).eq('log_date', req.params.date));
  ok(res, { deleted: true });
});

// ───────── Report comparisons ─────────
r.get('/comparisons', validate({ query: patientQuery }), async (req, res) => {
  const userId = await resolvePatientId(req);
  ok(res, must(await supabase.from('report_comparisons').select('*').eq('user_id', userId).order('created_at', { ascending: false })));
});

r.get('/comparisons/:id', validate({ params: idParams }), async (req, res) => {
  const c = must(await supabase.from('report_comparisons').select('*').eq('id', req.params.id).maybeSingle());
  if (!c || !(await canAccessPatient(req.user, c.user_id))) throw notFound();
  const reports = must(await supabase.from('reports').select('id, report_date, category, file_name').in('id', [c.current_report_id, c.previous_report_id]));
  ok(res, { ...c, reports });
});

// Manual comparison of any two own reports
r.post('/comparisons', validate({ body: compareBody }), async (req, res) => {
  const { currentReportId, previousReportId } = req.body;
  if (!previousReportId) throw badRequest('previousReportId is required');
  const reports = must(await supabase.from('reports').select('id, user_id, status').in('id', [currentReportId, previousReportId]));
  if (reports.length !== 2 || reports.some((x) => x.user_id !== req.user.id)) throw forbidden();
  if (reports.some((x) => x.status !== 'completed')) throw badRequest('Both reports must be completed');
  ok(res, await createComparison(req.user.id, currentReportId, previousReportId), 201);
});

export default r;
