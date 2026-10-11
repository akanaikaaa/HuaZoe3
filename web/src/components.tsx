import { useState, useEffect, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from './hooks';
import type { Biomarker, DietPlan, ExercisePlan, TrendSeries } from './types';
import { notificationService, type InAppNotification } from './notifications';

export const DISCLAIMER = 'HuaZoe AI Automated Engine: Report analyzed, biomarkers evaluated, and personalized clinical nutrition & exercise protocols generated.';

// SVG Icons
export const Icons = {
  Bell: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  Activity: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  Upload: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  Clipboard: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  ),
  Compare: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  Users: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  AlertTriangle: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  CheckCircle: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  FileText: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  Heart: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  User: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
};

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [perm, setPerm] = useState<NotificationPermission>(notificationService.getPermission());

  useEffect(() => {
    return notificationService.subscribe((n) => setItems([...n]));
  }, []);

  const unreadCount = items.filter((i) => !i.read).length;

  const handleRequestPerm = async () => {
    const p = await notificationService.requestPermission();
    setPerm(p);
  };

  return (
    <div className="notif-wrap">
      <button
        type="button"
        className="notif-bell"
        onClick={() => {
          setOpen(!open);
          if (!open && unreadCount > 0) notificationService.markAllAsRead();
        }}
        title="Clinical Notifications & Alerts"
        aria-label="Notifications"
      >
        <Icons.Bell />
        {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-header">
            <span>Notifications &amp; Alerts</span>
            {unreadCount > 0 && (
              <button type="button" onClick={() => notificationService.markAllAsRead()}>
                Mark read
              </button>
            )}
          </div>

          {perm !== 'granted' && (
            <div className="notif-perm-bar">
              <span>Allow system notifications?</span>
              <button type="button" className="sm" onClick={handleRequestPerm}>
                Allow
              </button>
            </div>
          )}

          <div className="notif-list">
            {items.length === 0 ? (
              <div style={{ padding: '1.25rem 1rem', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.8rem' }}>
                No notifications on file
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className={`notif-item ${item.read ? '' : 'unread'}`}>
                  <div className="notif-title">
                    <span>{item.title}</span>
                    <span className="notif-time">
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="notif-body">{item.body}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const staff = user?.role === 'doctor' || user?.role === 'admin';

  // Get active route title
  const getPageTitle = () => {
    const p = location.pathname;
    if (p === '/') return { title: 'Clinical Dashboard', crumb: 'Overview' };
    if (p.startsWith('/upload')) return { title: 'Diagnostic Report Ingestion', crumb: 'Upload' };
    if (p.startsWith('/reports/')) return { title: 'Laboratory Diagnostic Analysis', crumb: 'Reports' };
    if (p.startsWith('/compare')) return { title: 'Biomarker Longitudinal Comparison', crumb: 'Diagnostics' };
    if (p.startsWith('/tracking')) return { title: 'Patient Biometrics & Tracking', crumb: 'Logs' };
    if (p.startsWith('/profile')) return { title: 'Patient Profile & Clinical Settings', crumb: 'Profile' };
    if (p.startsWith('/patients')) return { title: 'Clinical Patient Registry', crumb: 'Management' };
    return { title: 'HuaZoe AI', crumb: 'Diagnostic Engine' };
  };

  const { title, crumb } = getPageTitle();

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <div className="brand-mark">
            <Icons.Activity />
          </div>
          <div className="brand-name">
            HuaZoe<span style={{ color: 'var(--mauve)' }}> AI</span>
            <small>Clinical Laboratory Analysis</small>
          </div>
        </Link>

        <div className="nav-label">Diagnostic Tools</div>
        <nav>
          <NavLink to="/" end>
            <Icons.Activity /> Dashboard
          </NavLink>
          <NavLink to="/upload">
            <Icons.Upload /> Upload &amp; Analyze
          </NavLink>
          <NavLink to="/compare">
            <Icons.Compare /> Compare Reports
          </NavLink>
          <NavLink to="/tracking">
            <Icons.Clipboard /> Daily Biometrics
          </NavLink>
          <NavLink to="/profile">
            <Icons.User /> Profile &amp; Settings
          </NavLink>
          {staff && (
            <>
              <div className="nav-label" style={{ marginTop: '0.8rem' }}>Clinical Staff</div>
              <NavLink to="/patients">
                <Icons.Users /> Patient Registry
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-foot">
          <Link to="/profile" className="user-chip" title="View & edit clinical profile" style={{ textDecoration: 'none' }}>
            <div className="avatar">
              {(user?.full_name ?? user?.email ?? 'U').slice(0, 2).toUpperCase()}
            </div>
            <div className="who">
              <b>{user?.full_name ?? user?.email}</b>
              <span>{user?.role ?? 'Patient'} Account</span>
            </div>
          </Link>
          <button className="logout sm" onClick={logout} title="Sign out of HuaZoe AI">
            Sign out
          </button>
        </div>
      </aside>

      <div className="content">
        <div className="topbar">
          <div>
            <div className="crumb">{crumb}</div>
            <h1>{title}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <NotificationCenter />
            <div className="sys">
              <span className="pulse" />
              <span>HuaZoe AI v2.4 <b>Active</b></span>
            </div>
          </div>
        </div>

        <main>
          <Outlet />
        </main>

        <footer className="disclaimer-bar">
          <Icons.CheckCircle />
          <span>HuaZoe AI Automated Diagnostic Engine · Direct Report Analysis, Personalized Diet Plan &amp; Exercise Routine Active</span>
        </footer>
      </div>
    </div>
  );
}

export const Loading = () => (
  <div className="skeleton">
    <div style={{ width: '60%' }} />
    <div style={{ width: '85%' }} />
    <div style={{ width: '40%' }} />
  </div>
);

export const ErrorBox = ({ message, retry }: { message: string; retry?: () => void }) => (
  <div className="error" role="alert">
    <Icons.AlertTriangle />
    <div style={{ flex: 1 }}>{message}</div>
    {retry && (
      <button className="secondary sm" onClick={retry}>
        Retry
      </button>
    )}
  </div>
);

export const Card = ({
  title,
  subtitle,
  children,
  action,
  flush = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  flush?: boolean;
}) => (
  <section className="card">
    <div className="card-head">
      <div className="ico">
        <Icons.Activity />
      </div>
      <div>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && <div className="actions">{action}</div>}
    </div>
    <div className={`card-body ${flush ? 'flush' : ''}`}>{children}</div>
  </section>
);

export const Badge = ({ flag, severity }: { flag: string; severity?: string }) => (
  <span className={`badge ${flag}`}>
    {flag}
    {severity && severity !== 'none' ? ` · ${severity}` : ''}
  </span>
);

/**
 * Visual Range Bar Indicator: shows patient value relative to normal lower and upper bounds.
 */
function RangeVisualizer({
  value,
  refLow,
  refHigh,
  flag,
}: {
  value: number;
  refLow: number | null;
  refHigh: number | null;
  flag: string;
}) {
  if (refLow == null && refHigh == null) {
    return <span className="muted num">–</span>;
  }

  // Calculate percentage along standard 3-zone range:
  // 0% - 20%: Low zone
  // 20% - 80%: Normal reference range
  // 80% - 100%: High zone
  let pct = 50;

  if (refLow != null && refHigh != null && refHigh > refLow) {
    if (value < refLow) {
      // Position inside low zone (0% to 20%)
      const span = refHigh - refLow;
      const dist = (refLow - value) / (span || 1);
      pct = Math.max(4, 20 - Math.min(16, dist * 20));
    } else if (value > refHigh) {
      // Position inside high zone (80% to 100%)
      const span = refHigh - refLow;
      const dist = (value - refHigh) / (span || 1);
      pct = Math.min(96, 80 + Math.min(16, dist * 20));
    } else {
      // Position inside normal zone (20% to 80%)
      const normalRatio = (value - refLow) / (refHigh - refLow);
      pct = 20 + normalRatio * 60;
    }
  } else if (refHigh != null) {
    pct = value <= refHigh ? 50 : 88;
  } else if (refLow != null) {
    pct = value >= refLow ? 50 : 12;
  }

  return (
    <div className="range" title={`Value: ${value} | Ref: ${refLow ?? '–'} to ${refHigh ?? '–'}`}>
      <div className={`dot ${flag}`} style={{ left: `${pct}%` }} />
    </div>
  );
}

/**
 * Professional Laboratory Biomarker Table.
 * Renders original values, units, biological reference intervals, and range visualizer.
 */
export function BiomarkerTable({ items }: { items: Biomarker[] }) {
  if (!items || items.length === 0) {
    return <p className="muted" style={{ padding: '1rem' }}>No biomarkers recorded.</p>;
  }

  return (
    <table className="lab-table">
      <thead>
        <tr>
          <th>Test Parameter</th>
          <th>Original Result</th>
          <th>Unit</th>
          <th>Bio. Ref. Range</th>
          <th>Range Visualizer</th>
          <th>Diagnostic Status</th>
        </tr>
      </thead>
      <tbody>
        {items.map((b) => {
          const isHigh = b.flag === 'high';
          const isLow = b.flag === 'low';
          return (
            <tr key={b.id || b.name} className={isHigh ? 'is-high' : isLow ? 'is-low' : ''}>
              <td className="param">
                <b>{b.display_name}</b>
                <span>{b.name}</span>
              </td>
              <td className="result">
                {b.value}
                {isHigh && <span className="arrow" title="Above reference range">▲</span>}
                {isLow && <span className="arrow" title="Below reference range">▼</span>}
              </td>
              <td className="unit">{b.unit || '–'}</td>
              <td className="ref">
                {b.ref_low != null && b.ref_high != null ? (
                  `${b.ref_low} – ${b.ref_high}`
                ) : b.ref_high != null ? (
                  `< ${b.ref_high}`
                ) : b.ref_low != null ? (
                  `> ${b.ref_low}`
                ) : (
                  '–'
                )}
              </td>
              <td>
                <RangeVisualizer
                  value={b.value}
                  refLow={b.ref_low}
                  refHigh={b.ref_high}
                  flag={b.flag}
                />
              </td>
              <td>
                <Badge flag={b.flag} severity={b.severity} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Trend chart with the biological reference range shaded. */
export function TrendChart({ series }: { series: TrendSeries }) {
  return (
    <div className="chart">
      <h4>
        {series.display_name} <small>{series.unit}</small>
      </h4>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={series.points}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e6ebeb" />
          <XAxis dataKey="date" fontSize={11} stroke="#8a7f94" />
          <YAxis domain={['auto', 'auto']} fontSize={11} stroke="#8a7f94" />
          <Tooltip
            contentStyle={{
              background: '#ffffff',
              border: '1px solid #d3dcdc',
              borderRadius: '8px',
              boxShadow: '0 4px 14px rgba(83,62,100,0.1)',
            }}
          />
          {series.ref_low != null && series.ref_high != null && (
            <ReferenceArea
              y1={series.ref_low}
              y2={series.ref_high}
              fill="#A8C1C1"
              fillOpacity={0.25}
            />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke="#533E64"
            strokeWidth={2.5}
            dot={{ fill: '#A26997', r: 3.5 }}
            activeDot={{ r: 5, fill: '#533E64' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleLine({
  data,
  dataKey,
  label,
  color = '#A26997',
}: {
  data: object[];
  dataKey: string;
  label: string;
  color?: string;
}) {
  return (
    <div className="chart">
      <h4>{label}</h4>
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e6ebeb" />
          <XAxis dataKey="log_date" fontSize={11} stroke="#8a7f94" />
          <YAxis fontSize={11} stroke="#8a7f94" />
          <Tooltip />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            fill={color}
            fillOpacity={0.15}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Clinical Diet Protocol View with 7-Day Interactive Day Switcher.
 */
export function DietView({ plan }: { plan: DietPlan }) {
  const p = plan.plan;
  const [activeDay, setActiveDay] = useState(p.days?.[0]?.day || 'Monday');
  const currentDay = p.days?.find((d) => d.day === activeDay) || p.days?.[0];

  return (
    <div className="stack">
      <div className="plan-summary">{p.summary}</div>
      <p className="muted" style={{ margin: '0' }}>
        Protocol Revision {plan.version} · {p.rationale}
      </p>

      <div className="plan-meta">
        <div>
          Target Hydration
          <b>{p.hydration_ml} mL / day</b>
        </div>
        {p.daily_calorie_target && (
          <div>
            Target Energy
            <b>{p.daily_calorie_target} kcal / day</b>
          </div>
        )}
      </div>

      <div>
        <h4>Clinically Targeted Foods</h4>
        <div>
          {p.foods_to_emphasize.map((f, i) => (
            <span key={i} className="chip good">
              ✓ {f}
            </span>
          ))}
        </div>
      </div>

      <div>
        <h4>Foods to Avoid / Minimize</h4>
        <div>
          {p.foods_to_limit.map((f, i) => (
            <span key={i} className="chip bad">
              ✕ {f}
            </span>
          ))}
        </div>
      </div>

      <div>
        <h4>7-Day Clinical Meal Schedule</h4>
        <div className="day-tabs">
          {p.days.map((d) => (
            <button
              key={d.day}
              type="button"
              className={d.day === activeDay ? 'on' : ''}
              onClick={() => setActiveDay(d.day)}
            >
              {d.day}
            </button>
          ))}
        </div>

        {currentDay && (
          <div className="meals">
            {currentDay.meals.map((m, i) => (
              <div key={i} className="meal">
                <span className="type">{m.type}</span>
                <b>{m.name}</b>
                <p>{m.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {p.notes && p.notes.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            <b>Clinical Guidance:</b> {p.notes.join(' · ')}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Clinical Exercise Routine View with Weekly Schedule.
 */
export function ExerciseView({ plan }: { plan: ExercisePlan }) {
  const p = plan.plan;

  return (
    <div className="stack">
      <div className="plan-summary">{p.summary}</div>
      <p className="muted" style={{ margin: '0' }}>
        Protocol Revision {plan.version} · {p.rationale}
      </p>

      <div className="plan-meta">
        <div>
          Weekly Activity Target
          <b>{p.weekly_goal_minutes} min / week</b>
        </div>
      </div>

      <h4>Weekly Exercise Prescription</h4>
      <div className="week">
        {p.days.map((d) => (
          <div key={d.day} className={`wday ${d.rest ? 'rest' : ''}`}>
            <span className="d">{d.day.slice(0, 3)}</span>
            <span className="f">{d.focus}</span>
            {d.rest ? (
              <div className="a muted" style={{ marginTop: 'auto' }}>
                Active Rest &amp; Regeneration
              </div>
            ) : (
              <div className="a">
                {d.activities.map((act, i) => (
                  <div key={i} style={{ marginBottom: '0.35rem' }}>
                    <div><b>{act.name}</b></div>
                    <div>{act.duration_min} min · <span className={`int ${act.intensity}`}>{act.intensity}</span></div>
                    {act.notes && <div className="muted" style={{ fontSize: '0.74rem' }}>{act.notes}</div>}
                  </div>
                ))}
              </div>
            )}
            {!d.rest && (
              <span className="m">
                {d.activities.reduce((s, a) => s + (a.duration_min || 0), 0)} min
              </span>
            )}
          </div>
        ))}
      </div>

      {p.safety_notes && p.safety_notes.length > 0 && (
        <div className="alert warn" style={{ marginTop: '0.75rem' }}>
          <Icons.AlertTriangle />
          <div>
            <b>Clinical Safety Considerations:</b> {p.safety_notes.join(' ')}
          </div>
        </div>
      )}
    </div>
  );
}
