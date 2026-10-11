import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '../hooks';
import { Card, Icons } from '../components';
import { notificationService } from '../notifications';

const PRESET_PREFERENCES = [
  'High-Protein',
  'Low-Carb',
  'Mediterranean',
  'Vegetarian',
  'Vegan',
  'Keto',
  'Gluten-Free',
  'Dairy-Free',
  'Anti-Inflammatory',
];

const PRESET_RESTRICTIONS = [
  'Dairy / Lactose',
  'Peanuts',
  'Tree Nuts',
  'Shellfish',
  'Eggs',
  'Soy',
  'Wheat / Gluten',
  'Nightshades',
  'Sulfites',
];

export default function Profile() {
  const { user, updateUser } = useAuth();

  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(user?.date_of_birth ?? '');
  const [sex, setSex] = useState<'male' | 'female' | 'other' | ''>(user?.sex ?? '');
  const [heightCm, setHeightCm] = useState(user?.height_cm ? String(user.height_cm) : '');
  const [fitnessLevel, setFitnessLevel] = useState<'beginner' | 'intermediate' | 'advanced'>(
    user?.fitness_level ?? 'beginner'
  );
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>(user?.dietary_preferences ?? []);
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>(user?.dietary_restrictions ?? []);

  const [customPref, setCustomPref] = useState('');
  const [customRestr, setCustomRestr] = useState('');

  const [busy, setBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>(notificationService.getPermission());

  useEffect(() => {
    if (user) {
      setFullName(user.full_name ?? '');
      setDateOfBirth(user.date_of_birth ?? '');
      setSex(user.sex ?? '');
      setHeightCm(user.height_cm ? String(user.height_cm) : '');
      setFitnessLevel(user.fitness_level ?? 'beginner');
      setDietaryPreferences(user.dietary_preferences ?? []);
      setDietaryRestrictions(user.dietary_restrictions ?? []);
    }
  }, [user]);

  const togglePreference = (item: string) => {
    setDietaryPreferences((prev) =>
      prev.includes(item) ? prev.filter((p) => p !== item) : [...prev, item]
    );
  };

  const addCustomPreference = () => {
    const val = customPref.trim();
    if (val && !dietaryPreferences.includes(val)) {
      setDietaryPreferences((prev) => [...prev, val]);
      setCustomPref('');
    }
  };

  const toggleRestriction = (item: string) => {
    setDietaryRestrictions((prev) =>
      prev.includes(item) ? prev.filter((r) => r !== item) : [...prev, item]
    );
  };

  const addCustomRestriction = () => {
    const val = customRestr.trim();
    if (val && !dietaryRestrictions.includes(val)) {
      setDietaryRestrictions((prev) => [...prev, val]);
      setCustomRestr('');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const payload = {
        full_name: fullName.trim() || null,
        date_of_birth: dateOfBirth || null,
        sex: (sex || null) as 'male' | 'female' | 'other' | null,
        height_cm: heightCm ? parseFloat(heightCm) : null,
        fitness_level: fitnessLevel,
        dietary_preferences: dietaryPreferences,
        dietary_restrictions: dietaryRestrictions,
      };

      await updateUser(payload);
      setSuccessMsg('Clinical profile and nutrition parameters updated successfully.');
      notificationService.notify(
        'Profile Updated',
        'Clinical parameters and dietary protocols have been synchronized.',
        'success'
      );
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRequestNotifications = async () => {
    const perm = await notificationService.requestPermission();
    setNotifPerm(perm);
  };

  const initials = (user?.full_name ?? user?.email ?? 'U').slice(0, 2).toUpperCase();

  return (
    <div className="stack">
      {/* Profile Header Banner */}
      <div className="profile-banner">
        <div className="profile-header-info">
          <div className="profile-avatar-large">{initials}</div>
          <div className="profile-header-text">
            <h2>{user?.full_name || 'Patient Profile'}</h2>
            <div className="email">{user?.email}</div>
            <div className="profile-tags-row">
              <span className="badge processing">
                {user?.role?.toUpperCase() || 'PATIENT'} ACCOUNT
              </span>
              <span className="badge normal">
                VERIFIED AUTHENTICATION
              </span>
              <span className="badge new">
                {fitnessLevel.toUpperCase()} FITNESS
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="secondary"
          onClick={handleRequestNotifications}
          title="Configure real-time desktop notification delivery"
        >
          <Icons.Bell />
          {notifPerm === 'granted' ? 'Notifications Active' : 'Allow Notifications'}
        </button>
      </div>

      {successMsg && (
        <div className="alert ok" role="status">
          <Icons.CheckCircle />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="error" role="alert">
          <Icons.AlertTriangle />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="stack">
        <div className="grid-2">
          {/* Clinical Demographics Card */}
          <Card
            title="Clinical Demographics"
            subtitle="Personal baseline biometrics used to calibrate laboratory reference ranges"
          >
            <div className="stack" style={{ gap: '1rem' }}>
              <label>
                Full Legal Name
                <input
                  type="text"
                  placeholder="e.g. Dr. Alex Morgan"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </label>

              <label>
                Email Address
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  title="Email managed by real-time token authentication"
                  style={{ background: 'var(--surface-2)', cursor: 'not-allowed' }}
                />
              </label>

              <div className="profile-grid-form">
                <label>
                  Date of Birth
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                  />
                </label>

                <label>
                  Biological Sex
                  <select
                    value={sex}
                    onChange={(e) => setSex(e.target.value as 'male' | 'female' | 'other' | '')}
                  >
                    <option value="">Select sex</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              </div>

              <div className="profile-grid-form">
                <label>
                  Height (cm)
                  <input
                    type="number"
                    min={50}
                    max={260}
                    step="0.5"
                    placeholder="175"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                  />
                </label>

                <label>
                  Fitness Level
                  <select
                    value={fitnessLevel}
                    onChange={(e) =>
                      setFitnessLevel(e.target.value as 'beginner' | 'intermediate' | 'advanced')
                    }
                  >
                    <option value="beginner">Beginner (Sedentary / Light)</option>
                    <option value="intermediate">Intermediate (Moderate 3-4x/week)</option>
                    <option value="advanced">Advanced (High Intensity / Athlete)</option>
                  </select>
                </label>
              </div>
            </div>
          </Card>

          {/* Security & Notification Preferences Card */}
          <Card
            title="Security & System Delivery"
            subtitle="Token-based authentication and notification channels"
          >
            <div className="stack" style={{ gap: '1rem' }}>
              <div
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1rem',
                  fontSize: '0.85rem',
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--plum-900)', marginBottom: '0.25rem' }}>
                  Real-Time Token Authentication (Resend &amp; Supabase)
                </div>
                <div style={{ color: 'var(--text-2)', lineHeight: 1.5 }}>
                  Authentication OTP tokens and clinical notifications are delivered via Resend API to your verified email inbox.
                </div>
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span className="badge normal">Resend Engine Connected</span>
                  <span className="badge normal">OTP Security Active</span>
                </div>
              </div>

              <div
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1rem',
                  fontSize: '0.85rem',
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--plum-900)', marginBottom: '0.25rem' }}>
                  Desktop / Browser Notifications
                </div>
                <div style={{ color: 'var(--text-2)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                  Receive instant alerts when medical lab reports finish processing and when personalized dietary protocols are updated.
                </div>
                <button
                  type="button"
                  className={notifPerm === 'granted' ? 'secondary sm' : 'sm'}
                  onClick={handleRequestNotifications}
                >
                  <Icons.Bell />
                  {notifPerm === 'granted'
                    ? 'Browser Notifications Granted'
                    : 'Enable Browser Notifications'}
                </button>
              </div>
            </div>
          </Card>
        </div>

        {/* Nutritional & Dietary Protocols Card */}
        <Card
          title="Clinical Dietary & Nutritional Profiles"
          subtitle="Directly controls HuaZoe AI personalized meal protocol generation"
        >
          <div className="stack" style={{ gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem' }}>
                Dietary Preferences &amp; Regimens
              </label>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: 'var(--text-3)' }}>
                Click to toggle active dietary targets considered when synthesizing clinical diet plans:
              </p>

              <div className="profile-tags-row">
                {PRESET_PREFERENCES.map((pref) => {
                  const active = dietaryPreferences.includes(pref);
                  return (
                    <button
                      type="button"
                      key={pref}
                      className={`tag-clickable ${active ? 'active' : ''}`}
                      onClick={() => togglePreference(pref)}
                    >
                      {active ? '✓ ' : '+ '}
                      {pref}
                    </button>
                  );
                })}
                {dietaryPreferences
                  .filter((p) => !PRESET_PREFERENCES.includes(p))
                  .map((custom) => (
                    <span key={custom} className="tag-clickable active">
                      {custom}
                      <span
                        className="tag-remove"
                        onClick={() => togglePreference(custom)}
                        title="Remove tag"
                      >
                        ×
                      </span>
                    </span>
                  ))}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', maxWidth: '360px' }}>
                <input
                  type="text"
                  placeholder="Add custom preference..."
                  value={customPref}
                  onChange={(e) => setCustomPref(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomPreference();
                    }
                  }}
                />
                <button type="button" className="secondary sm" onClick={addCustomPreference}>
                  Add
                </button>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1.25rem' }}>
              <label style={{ display: 'block', marginBottom: '0.35rem', color: '#b91c1c' }}>
                Dietary Restrictions &amp; Clinical Allergies
              </label>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: 'var(--text-3)' }}>
                Items specified here will be strictly excluded from recommended foods in all generated protocols:
              </p>

              <div className="profile-tags-row">
                {PRESET_RESTRICTIONS.map((restr) => {
                  const active = dietaryRestrictions.includes(restr);
                  return (
                    <button
                      type="button"
                      key={restr}
                      className={`tag-clickable ${active ? 'active-restriction' : ''}`}
                      onClick={() => toggleRestriction(restr)}
                    >
                      {active ? '✕ ' : '+ '}
                      {restr}
                    </button>
                  );
                })}
                {dietaryRestrictions
                  .filter((r) => !PRESET_RESTRICTIONS.includes(r))
                  .map((custom) => (
                    <span key={custom} className="tag-clickable active-restriction">
                      {custom}
                      <span
                        className="tag-remove"
                        onClick={() => toggleRestriction(custom)}
                        title="Remove restriction"
                      >
                        ×
                      </span>
                    </span>
                  ))}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', maxWidth: '360px' }}>
                <input
                  type="text"
                  placeholder="Add custom restriction..."
                  value={customRestr}
                  onChange={(e) => setCustomRestr(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomRestriction();
                    }
                  }}
                />
                <button type="button" className="secondary sm" onClick={addCustomRestriction}>
                  Add
                </button>
              </div>
            </div>
          </div>
        </Card>

        {/* Action Controls */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button type="submit" disabled={busy} style={{ minWidth: '180px' }}>
            {busy ? 'Saving Parameters…' : 'Save Profile Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
