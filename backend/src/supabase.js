import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

/** Service-role client: bypasses RLS. Server only. Authorization is enforced in code (see access.js). */
export const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, opts);

/** Anon client: used only for sign-up/sign-in/refresh flows. */
export const supabaseAuth = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, opts);

export const BUCKET = config.SUPABASE_BUCKET;
