import { DISCLAIMER } from './config.js';
import { supabase } from './supabase.js';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const badRequest = (m, d) => new ApiError(400, 'bad_request', m, d);
export const notFound = (m = 'Not found') => new ApiError(404, 'not_found', m);
export const forbidden = (m = 'Forbidden') => new ApiError(403, 'forbidden', m);

/** Privacy-safe logger: never pass request bodies, tokens, or health values. IDs and codes only. */
export const log = {
  info: (msg, meta = {}) => console.log(JSON.stringify({ level: 'info', msg, ...meta })),
  warn: (msg, meta = {}) => console.warn(JSON.stringify({ level: 'warn', msg, ...meta })),
  error: (msg, meta = {}) => console.error(JSON.stringify({ level: 'error', msg, ...meta })),
};

/** Uniform success envelope. Disclaimer is included on every response. */
export const ok = (res, data, status = 200) => res.status(status).json({ data, disclaimer: DISCLAIMER });

/** Validate req parts with zod; replaces them with parsed values. */
export const validate = (schemas) => (req, _res, next) => {
  for (const part of ['body', 'query', 'params']) {
    if (!schemas[part]) continue;
    const r = schemas[part].safeParse(req[part]);
    if (!r.success) {
      return next(badRequest('Validation failed', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
    }
    Object.defineProperty(req, part, { value: r.data, writable: true });
  }
  next();
};

/** Staff = admin, or doctor assigned to the patient. */
export async function canAccessPatient(user, patientId) {
  if (user.id === patientId || user.role === 'admin') return true;
  if (user.role !== 'doctor') return false;
  const { data } = await supabase
    .from('care_assignments')
    .select('patient_id')
    .eq('doctor_id', user.id)
    .eq('patient_id', patientId)
    .maybeSingle();
  return !!data;
}

/** Resolve target patient: ?userId= only honored for authorized staff; otherwise self. */
export async function resolvePatientId(req) {
  const target = req.query.userId;
  if (!target || target === req.user.id) return req.user.id;
  if (!(await canAccessPatient(req.user, target))) throw forbidden('No access to this patient');
  return target;
}

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(forbidden('Insufficient role'));

/** Throw on Supabase error without leaking internals. */
export function must({ data, error }, what = 'database') {
  if (error) {
    log.error('db_error', { what, code: error.code });
    throw new ApiError(500, 'db_error', `A ${what} error occurred`);
  }
  return data;
}
