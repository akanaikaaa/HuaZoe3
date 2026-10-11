import { Router } from 'express';
import { supabase, supabaseAuth } from '../supabase.js';
import { authenticate } from '../middleware/auth.js';
import { ApiError, ok, validate, must, log } from '../utils.js';
import { registerBody, loginBody, refreshBody, profileBody, verifyTokenBody, sendTokenBody } from '../schemas.js';
import { sendAuthTokenEmail, sendWelcomeEmail } from '../services/email.js';

const r = Router();

const session = (s) => ({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at });

r.post('/register', validate({ body: registerBody }), async (req, res) => {
  const { email, password, full_name } = req.body;
  let emailOtp = null;
  let actionLink = null;
  let userId = null;

  // 1. Generate signup token link via Supabase admin
  let linkRes = await supabase.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: { data: { full_name } },
  });

  if (linkRes.error) {
    // If user already exists in auth, generate login/magiclink token instead
    if (/already registered|exists/i.test(linkRes.error.message)) {
      const mlRes = await supabase.auth.admin.generateLink({ type: 'magiclink', email });
      if (mlRes.data?.properties) {
        emailOtp = mlRes.data.properties.email_otp;
        actionLink = mlRes.data.properties.action_link;
        userId = mlRes.data.user?.id;
      }
    } else {
      throw new ApiError(400, 'register_failed', linkRes.error.message);
    }
  } else if (linkRes.data?.properties) {
    emailOtp = linkRes.data.properties.email_otp;
    actionLink = linkRes.data.properties.action_link;
    userId = linkRes.data.user?.id;
  }

  // 2. Dispatch real-time token email via Resend
  let emailResult = { success: false };
  if (emailOtp) {
    emailResult = await sendAuthTokenEmail({
      to: email,
      token: emailOtp,
      type: 'signup',
      actionLink,
      fullName: full_name,
    });
  }

  // In development, or if Resend test domain was restricted to account holder, provide dev_token in response
  const isRestricted = emailResult?.restricted || !emailResult?.success;
  const msg = emailResult?.success
    ? `A real-time verification token has been delivered to ${email}.`
    : `Verification token generated.${isRestricted ? ` (Dev Token: ${emailOtp})` : ''}`;

  ok(res, {
    user_id: userId,
    session: null,
    confirmation_required: true,
    token_sent: emailResult.success,
    dev_token: isRestricted ? emailOtp : undefined,
    message: msg,
  }, 201);
});

r.post('/verify-token', validate({ body: verifyTokenBody }), async (req, res) => {
  const { email, token, type = 'signup' } = req.body;
  const cleanToken = token.trim();

  // 1. Try verification with the provided type (default 'signup')
  let result = await supabaseAuth.auth.verifyOtp({
    email,
    token: cleanToken,
    type,
  });

  // Fallbacks: If initial type failed, attempt 'email' or 'magiclink'
  if (result.error) {
    const alternateTypes = ['email', 'signup'].filter((t) => t !== type);
    for (const altType of alternateTypes) {
      const fallback = await supabaseAuth.auth.verifyOtp({
        email,
        token: cleanToken,
        type: altType,
      });
      if (!fallback.error && fallback.data?.session) {
        result = fallback;
        break;
      }
    }
  }

  if (result.error || !result.data?.session) {
    throw new ApiError(400, 'invalid_token', result.error?.message || 'Invalid or expired verification token');
  }

  const { data } = result;
  let { data: profile, error: profileErr } = await supabase.from('users').select('id, email, full_name, role').eq('id', data.user.id).maybeSingle();
  if (profileErr && profileErr.code === 'PGRST205') {
    throw new ApiError(500, 'schema_missing', 'Database tables not found. Please execute the SQL in supabase/schema.sql inside your Supabase SQL Editor.');
  }

  let isNew = false;
  if (!profile) {
    isNew = true;
    const newProfile = {
      id: data.user.id,
      email: data.user.email ?? email,
      full_name: data.user.user_metadata?.full_name ?? null,
      role: 'patient',
    };
    const { data: inserted } = await supabase.from('users').upsert(newProfile).select('id, email, full_name, role').maybeSingle();
    profile = inserted ?? newProfile;
  }

  // Send welcome notification asynchronously via Resend
  if (isNew || type === 'signup') {
    sendWelcomeEmail({ to: profile.email, fullName: profile.full_name }).catch((e) => {
      log.warn('welcome_email_failed', { error: e.message });
    });
  }

  ok(res, { session: session(data.session), user: profile, message: 'Authentication successful' });
});

r.post('/send-token', validate({ body: sendTokenBody }), async (req, res) => {
  const { email, type = 'signup' } = req.body;
  let emailOtp = null;
  let actionLink = null;

  // Generate OTP token link via Supabase admin
  let linkRes = await supabase.auth.admin.generateLink({
    type: type === 'signup' ? 'signup' : 'magiclink',
    email,
  });

  if (linkRes.error && type === 'signup') {
    linkRes = await supabase.auth.admin.generateLink({ type: 'magiclink', email });
  }

  if (linkRes.error && !linkRes.data?.properties) {
    throw new ApiError(400, 'send_token_failed', linkRes.error.message || 'Could not generate authentication token');
  }

  emailOtp = linkRes.data.properties.email_otp;
  actionLink = linkRes.data.properties.action_link;

  // Dispatch real-time token email via Resend
  const emailResult = await sendAuthTokenEmail({
    to: email,
    token: emailOtp,
    type,
    actionLink,
  });

  const isRestricted = emailResult?.restricted || !emailResult?.success;
  const msg = emailResult.success
    ? `Real-time verification token has been delivered to ${email}.`
    : `Verification token generated.${isRestricted ? ` (Dev Token: ${emailOtp})` : ''}`;

  ok(res, {
    sent: true,
    email,
    token_sent: emailResult.success,
    dev_token: isRestricted ? emailOtp : undefined,
    message: msg,
  });
});

r.post('/login', validate({ body: loginBody }), async (req, res) => {
  const { data, error } = await supabaseAuth.auth.signInWithPassword(req.body);
  if (error || !data.session) throw new ApiError(401, 'invalid_credentials', error?.message || 'Invalid email or password');
  let { data: profile, error: profileErr } = await supabase.from('users').select('id, email, full_name, role').eq('id', data.user.id).maybeSingle();
  if (profileErr && profileErr.code === 'PGRST205') {
    throw new ApiError(500, 'schema_missing', "Database tables not found. Please execute the SQL in supabase/schema.sql inside your Supabase SQL Editor.");
  }
  if (!profile) {
    const newProfile = {
      id: data.user.id,
      email: data.user.email ?? req.body.email,
      full_name: data.user.user_metadata?.full_name ?? null,
      role: 'patient',
    };
    const { data: inserted } = await supabase.from('users').upsert(newProfile).select('id, email, full_name, role').maybeSingle();
    profile = inserted ?? newProfile;
  }
  ok(res, { session: session(data.session), user: profile });
});

r.post('/refresh', validate({ body: refreshBody }), async (req, res) => {
  const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token: req.body.refresh_token });
  if (error || !data.session) throw new ApiError(401, 'invalid_refresh', 'Session expired, please log in again');
  ok(res, { session: session(data.session) });
});

r.get('/me', authenticate, (req, res) => ok(res, req.user.profile));

r.patch('/me', authenticate, validate({ body: profileBody }), async (req, res) => {
  const updated = must(await supabase.from('users').update(req.body).eq('id', req.user.id).select().single());
  ok(res, updated);
});

export default r;
