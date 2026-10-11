import { useState, useEffect, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../hooks';
import { Icons } from '../components';

export default function Login() {
  const { user, login, verifyToken } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'verify_token'>('login');
  const [loginMethod, setLoginMethod] = useState<'password' | 'token'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [tokenType, setTokenType] = useState<'signup' | 'email'>('signup');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      if (mode === 'register') {
        const r = await api.register(email, password, name);
        if (r.confirmation_required) {
          setTokenType('signup');
          setMode('verify_token');
          setToken(r.dev_token || '');
          setResendCooldown(60);
          setInfoMsg(r.message || `A real-time verification token has been sent to ${email}. Check your email to verify.`);
          return;
        }
        await login(email, password);
        return;
      }

      if (mode === 'login') {
        if (loginMethod === 'token') {
          const r = await api.sendToken(email, 'email');
          setTokenType('email');
          setMode('verify_token');
          setToken(r.dev_token || '');
          setResendCooldown(60);
          setInfoMsg(r.message || `A real-time login token has been dispatched to ${email}.`);
          return;
        }
        await login(email, password);
        return;
      }

      if (mode === 'verify_token') {
        if (!token.trim()) {
          setErrorMsg('Please enter the verification token received in your email.');
          return;
        }
        await verifyToken(email, token, tokenType);
        return;
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const r = await api.sendToken(email, tokenType);
      if (r.dev_token) setToken(r.dev_token);
      setResendCooldown(60);
      setInfoMsg(r.message || `A new verification token has been sent to ${email}.`);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-hero">
        <div>
          <div className="row" style={{ gap: '0.6rem', alignItems: 'center', marginBottom: '2rem' }}>
            <div className="brand-mark" style={{ width: '38px', height: '38px', borderRadius: '10px' }}>
              <Icons.Activity />
            </div>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              HuaZoe<span style={{ color: 'var(--sage)' }}> AI</span>
            </span>
          </div>

          <h1>Precision Clinical Lab Report Analysis</h1>
          <p>
            An advanced diagnostic report analysis and clinical tracking platform. Extracts exact original biomarkers, visualizes biological reference intervals, and generates evidence-based nutrition and conditioning protocols.
          </p>

          <ul>
            <li>
              <span><Icons.CheckCircle /></span>
              Exact numerical biomarker and reference range preservation.
            </li>
            <li>
              <span><Icons.Activity /></span>
              Instant deterministic flag and abnormality detection.
            </li>
            <li>
              <span><Icons.Heart /></span>
              Medically tailored 7-day diet and exercise protocols.
            </li>
            <li>
              <span><Icons.FileText /></span>
              Real-time Supabase Auth with token email verification.
            </li>
          </ul>
        </div>

        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginTop: '2rem' }}>
          Diagnostic Software Engine v2.4 · Real-time Supabase Token Auth
        </div>
      </div>

      <div className="auth-panel">
        <form className="auth" onSubmit={submit}>
          {mode === 'verify_token' ? (
            <>
              <h2>Verify Email Token</h2>
              <p className="sub">
                Enter the real-time authentication token delivered to your email inbox via Resend.
              </p>

              <div className="token-dispatch-banner">
                <span className="tag">Resend Real-Time Delivery</span>
                <span className="target-email">{email}</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
                    {tokenType === 'signup' ? 'Registration confirmation token' : 'Passwordless sign-in token'}
                  </span>
                  <button
                    type="button"
                    className="link"
                    style={{ fontSize: '0.78rem' }}
                    onClick={() => {
                      setMode(tokenType === 'signup' ? 'register' : 'login');
                      setErrorMsg(null);
                      setInfoMsg(null);
                    }}
                  >
                    Change email
                  </button>
                </div>
              </div>

              {infoMsg && (
                <div className="alert info" role="status" style={{ fontSize: '0.82rem' }}>
                  {infoMsg}
                </div>
              )}

              <label>
                Authentication Token / OTP
                <input
                  type="text"
                  className="token-input"
                  placeholder="000000"
                  maxLength={12}
                  autoComplete="one-time-code"
                  autoFocus
                  value={token}
                  onChange={(e) => setToken(e.target.value.trim())}
                  required
                />
              </label>

              <div className="token-resend-bar">
                <span>Didn't receive the email?</span>
                <button
                  type="button"
                  className="link"
                  disabled={resendCooldown > 0 || busy}
                  onClick={handleResend}
                >
                  {resendCooldown > 0 ? `Resend token (${resendCooldown}s)` : 'Resend Token'}
                </button>
              </div>

              {errorMsg && <div className="error" role="alert">{errorMsg}</div>}

              <button disabled={busy} type="submit" style={{ marginTop: '0.5rem' }}>
                {busy ? 'Validating Token in Real-Time…' : 'Verify & Enter Workspace'}
              </button>

              <button
                type="button"
                className="link"
                style={{ textAlign: 'center', marginTop: '0.25rem' }}
                onClick={() => {
                  setMode('login');
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
              >
                Back to Sign In
              </button>
            </>
          ) : (
            <>
              <h2>{mode === 'login' ? 'Clinical Sign In' : 'Create Patient Account'}</h2>
              <p className="sub">
                {mode === 'login'
                  ? 'Access your diagnostic laboratory records and health protocols'
                  : 'Register to receive your real-time email authentication token'}
              </p>

              {mode === 'login' && (
                <div className="auth-tabs" role="tablist">
                  <button
                    type="button"
                    className={loginMethod === 'password' ? 'active' : ''}
                    onClick={() => { setLoginMethod('password'); setErrorMsg(null); }}
                  >
                    Password Sign In
                  </button>
                  <button
                    type="button"
                    className={loginMethod === 'token' ? 'active' : ''}
                    onClick={() => { setLoginMethod('token'); setErrorMsg(null); }}
                  >
                    Email Token (OTP)
                  </button>
                </div>
              )}

              {mode === 'register' && (
                <label>
                  Full Legal Name
                  <input
                    placeholder="e.g. Dr. Jane Doe / John Smith"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </label>
              )}

              <label>
                Email Address
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>

              {(mode === 'register' || (mode === 'login' && loginMethod === 'password')) && (
                <label>
                  Password
                  <input
                    type="password"
                    placeholder="At least 8 characters"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </label>
              )}

              {infoMsg && (
                <div className="alert info" role="status" style={{ fontSize: '0.82rem' }}>
                  {infoMsg}
                </div>
              )}

              {errorMsg && <div className="error" role="alert">{errorMsg}</div>}

              <button disabled={busy} type="submit" style={{ marginTop: '0.5rem' }}>
                {busy
                  ? 'Processing…'
                  : mode === 'register'
                  ? 'Send Real-Time Token & Register'
                  : loginMethod === 'token'
                  ? 'Send Real-Time Login Token'
                  : 'Sign In to Workspace'}
              </button>

              <button
                type="button"
                className="link"
                style={{ textAlign: 'center' }}
                onClick={() => {
                  setErrorMsg(null);
                  setInfoMsg(null);
                  setMode(mode === 'login' ? 'register' : 'login');
                }}
              >
                {mode === 'login'
                  ? 'New patient or clinician? Create an account'
                  : 'Already have an account? Sign in'}
              </button>
            </>
          )}

          <div className="fine" style={{ textAlign: 'center' }}>
            HuaZoe AI · Supabase Real-Time Token Authentication &amp; Diagnostic Protocol Engine
          </div>
        </form>
      </div>
    </div>
  );
}
