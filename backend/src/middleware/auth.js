import { supabase } from '../supabase.js';
import { ApiError } from '../utils.js';

/** Verifies the Supabase JWT (same for web and Android) and loads the app profile + role. */
export async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, 'unauthorized', 'Missing bearer token'));

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return next(new ApiError(401, 'unauthorized', 'Invalid or expired token'));

  let { data: profile, error: profileErr } = await supabase.from('users').select('*').eq('id', data.user.id).maybeSingle();
  if (profileErr && profileErr.code === 'PGRST205') {
    return next(new ApiError(500, 'schema_missing', "Database tables not found. Please execute the SQL in supabase/schema.sql inside your Supabase SQL Editor."));
  }
  if (!profile) {
    const newProfile = {
      id: data.user.id,
      email: data.user.email ?? '',
      full_name: data.user.user_metadata?.full_name ?? null,
      role: 'patient',
    };
    const { data: inserted } = await supabase.from('users').upsert(newProfile).select('*').maybeSingle();
    profile = inserted ?? newProfile;
  }
  if (!profile) return next(new ApiError(401, 'unauthorized', 'Profile not found'));

  req.user = { id: profile.id, role: profile.role, profile };
  next();
}
