import { Router } from 'express';
import { supabase } from '../supabase.js';
import { ok, validate, must, requireRole, forbidden, notFound, canAccessPatient } from '../utils.js';
import { idParams, assignBody, roleBody } from '../schemas.js';

const r = Router();

// Doctor/admin: list accessible patients (doctors: assigned only)
r.get('/patients', requireRole('doctor', 'admin'), async (req, res) => {
  let ids = null;
  if (req.user.role === 'doctor') {
    ids = must(await supabase.from('care_assignments').select('patient_id').eq('doctor_id', req.user.id)).map((a) => a.patient_id);
    if (!ids.length) return ok(res, []);
  }
  let q = supabase.from('users').select('id, email, full_name, fitness_level, created_at').eq('role', 'patient');
  if (ids) q = q.in('id', ids);
  ok(res, must(await q.order('full_name')));
});

// Doctor/admin: full overview of one patient (reports, trends, plans, recent logs)
r.get('/patients/:id/overview', requireRole('doctor', 'admin'), validate({ params: idParams }), async (req, res) => {
  const id = req.params.id;
  if (!(await canAccessPatient(req.user, id))) throw notFound('Patient not found');
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [patient, reports, biomarkers, diet, exercise, logs, comparisons] = await Promise.all([
    supabase.from('users').select('id, email, full_name, sex, date_of_birth, height_cm, fitness_level, dietary_preferences, dietary_restrictions').eq('id', id).single(),
    supabase.from('reports').select('id, file_name, category, report_date, status, created_at').eq('user_id', id).order('created_at', { ascending: false }),
    supabase.from('biomarkers').select('name, display_name, value, unit, flag, severity, measured_at').eq('user_id', id).order('measured_at'),
    supabase.from('diet_plans').select('*').eq('user_id', id).eq('is_current', true).maybeSingle(),
    supabase.from('exercise_plans').select('*').eq('user_id', id).eq('is_current', true).maybeSingle(),
    supabase.from('daily_logs').select('*').eq('user_id', id).gte('log_date', since).order('log_date'),
    supabase.from('report_comparisons').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(5),
  ]).then((rs) => rs.map(must));
  ok(res, { patient, reports, biomarkers, diet_plan: diet, exercise_plan: exercise, daily_logs: logs, comparisons });
});

// Admin only
r.post('/assignments', requireRole('admin'), validate({ body: assignBody }), async (req, res) => {
  const doc = must(await supabase.from('users').select('role').eq('id', req.body.doctorId).maybeSingle());
  if (doc?.role !== 'doctor') throw forbidden('doctorId must belong to a doctor');
  must(await supabase.from('care_assignments').upsert(req.body));
  ok(res, req.body, 201);
});

r.patch('/users/:id/role', requireRole('admin'), validate({ params: idParams, body: roleBody }), async (req, res) => {
  ok(res, must(await supabase.from('users').update({ role: req.body.role }).eq('id', req.params.id).select('id, email, role').single()));
});

export default r;
