import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { supabase, BUCKET } from '../supabase.js';
import { config } from '../config.js';
import { ok, validate, must, badRequest, notFound, forbidden, canAccessPatient, resolvePatientId } from '../utils.js';
import { idParams, reportListQuery } from '../schemas.js';
import { enqueue } from '../services/jobs.js';

const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });

// Check real file signature, not just the client-declared mime type.
function sniffMime(buf) {
  if (buf.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG') return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/** Loads a report and checks the caller may access its owner. */
async function loadReport(req, id) {
  const report = must(await supabase.from('reports').select('*').eq('id', id).maybeSingle());
  if (!report) throw notFound('Report not found');
  if (!(await canAccessPatient(req.user, report.user_id))) throw notFound('Report not found'); // don't reveal existence
  return report;
}

// 1. Upload (multipart field "file"). Returns 202 immediately; poll GET /reports/:id for status.
r.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('Attach a PDF or image in the "file" field');
  const mime = sniffMime(req.file.buffer);
  if (!mime) throw badRequest('Only PDF, JPEG, PNG or WEBP files are supported');

  const safeName = (req.file.originalname || 'report').replace(/[^\w.\-]/g, '_').slice(-80);
  const path = `${req.user.id}/${randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, req.file.buffer, { contentType: mime });
  if (error) throw badRequest('File upload failed');

  const report = must(
    await supabase.from('reports').insert({ user_id: req.user.id, file_path: path, file_name: safeName, mime_type: mime, status: 'uploaded' }).select().single()
  );
  enqueue(report.id);
  ok(res, report, 202);
});

r.get('/', validate({ query: reportListQuery }), async (req, res) => {
  const userId = await resolvePatientId(req);
  let q = supabase.from('reports').select('id, file_name, category, report_date, status, error_message, created_at, processed_at').eq('user_id', userId);
  if (req.query.category) q = q.eq('category', req.query.category);
  ok(res, must(await q.order('created_at', { ascending: false })));
});

r.get('/:id', validate({ params: idParams }), async (req, res) => {
  const report = await loadReport(req, req.params.id);
  const [biomarkers, insight, dietPlans, exercisePlans] = await Promise.all([
    supabase.from('biomarkers').select('*').eq('report_id', report.id).order('name').then(must),
    supabase.from('insights').select('*').eq('report_id', report.id).maybeSingle().then(must),
    supabase.from('diet_plans').select('*').eq('report_id', report.id).order('version', { ascending: false }).limit(1).then(must),
    supabase.from('exercise_plans').select('*').eq('report_id', report.id).order('version', { ascending: false }).limit(1).then(must),
  ]);

  const dietPlan = dietPlans?.[0] ?? null;
  const exercisePlan = exercisePlans?.[0] ?? null;

  const [fallbackDiet, fallbackEx] = (!dietPlan || !exercisePlan)
    ? await Promise.all([
        !dietPlan ? supabase.from('diet_plans').select('*').eq('user_id', report.user_id).eq('is_current', true).maybeSingle().then(must) : null,
        !exercisePlan ? supabase.from('exercise_plans').select('*').eq('user_id', report.user_id).eq('is_current', true).maybeSingle().then(must) : null,
      ])
    : [null, null];

  const { file_path, ...safe } = report;
  ok(res, {
    ...safe,
    biomarkers,
    insight,
    diet_plan: dietPlan || fallbackDiet || null,
    exercise_plan: exercisePlan || fallbackEx || null,
  });
});

// Short-lived signed URL for the original file (bucket is private).
r.get('/:id/file', validate({ params: idParams }), async (req, res) => {
  const report = await loadReport(req, req.params.id);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(report.file_path, 120);
  if (error) throw notFound('File unavailable');
  ok(res, { url: data.signedUrl, expires_in: 120 });
});

r.post('/:id/reprocess', validate({ params: idParams }), async (req, res) => {
  const report = await loadReport(req, req.params.id);
  if (report.user_id !== req.user.id) throw forbidden();
  if (report.status === 'processing') throw badRequest('Already processing');
  enqueue(report.id);
  ok(res, { id: report.id, status: 'processing' }, 202);
});

r.delete('/:id', validate({ params: idParams }), async (req, res) => {
  const report = await loadReport(req, req.params.id);
  if (report.user_id !== req.user.id) throw forbidden();
  await supabase.storage.from(BUCKET).remove([report.file_path]);
  must(await supabase.from('reports').delete().eq('id', report.id));
  ok(res, { deleted: true });
});

export default r;
