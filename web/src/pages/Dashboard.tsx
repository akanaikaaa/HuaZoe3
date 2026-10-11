import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useResource } from '../hooks';
import { Card, DietView, ErrorBox, ExerciseView, Icons, Loading, TrendChart } from '../components';

const EVENTS = ['report:update', 'plans:updated', 'log:updated'];

export default function Dashboard({ userId }: { userId?: string }) {
  const reports = useResource(() => api.reports(userId), [userId], { pollMs: 8000, events: EVENTS });
  const trends = useResource(() => api.trends(userId), [userId], { events: EVENTS });
  const diet = useResource(() => api.dietPlan(userId), [userId], { events: EVENTS });
  const ex = useResource(() => api.exercisePlan(userId), [userId], { events: EVENTS });

  const reportList = reports.data || [];
  const latestReport = reportList[0];

  return (
    <div className="stack">
      {/* KPI Overview */}
      <div className="kpis">
        <div className="kpi k-plum">
          <span className="label">Analyzed Reports</span>
          <div className="value">{reportList.length}</div>
          <div className="sub">{latestReport ? `Latest: ${latestReport.category?.replace(/_/g, ' ') || 'Report'}` : 'No reports on file'}</div>
        </div>
        <div className="kpi k-sage">
          <span className="label">Biomarker Series</span>
          <div className="value">{trends.data?.length ?? 0}</div>
          <div className="sub">Tracked longitudinally</div>
        </div>
        <div className="kpi k-ok">
          <span className="label">Nutritional Protocol</span>
          <div className="value" style={{ fontSize: '1.25rem', paddingTop: '0.2rem' }}>
            {diet.data ? `v${diet.data.version} Active` : 'Pending'}
          </div>
          <div className="sub">{diet.data ? `${diet.data.plan.hydration_ml} mL/day target` : 'Requires report'}</div>
        </div>
        <div className="kpi k-high">
          <span className="label">Exercise Prescription</span>
          <div className="value" style={{ fontSize: '1.25rem', paddingTop: '0.2rem' }}>
            {ex.data ? `${ex.data.plan.weekly_goal_minutes} min` : 'Pending'}
          </div>
          <div className="sub">{ex.data ? 'Weekly aerobic target' : 'Requires report'}</div>
        </div>
      </div>

      <div className="grid">
        {/* Report History */}
        <Card
          title="Diagnostic Laboratory Reports"
          subtitle="Chronological registry of processed clinical documents"
          action={
            <Link to="/upload">
              <button className="sm">
                <Icons.Upload /> New Report
              </button>
            </Link>
          }
          flush
        >
          {reports.loading ? (
            <div style={{ padding: '1rem' }}><Loading /></div>
          ) : reports.error ? (
            <div style={{ padding: '1rem' }}><ErrorBox message={reports.error} retry={reports.reload} /></div>
          ) : !reportList.length ? (
            <div style={{ padding: '2rem 1.25rem', textAlign: 'center' }}>
              <p className="muted">No laboratory reports ingested yet.</p>
              <Link to="/upload">
                <button style={{ marginTop: '0.5rem' }}>Upload your first medical report</button>
              </Link>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Report Date</th>
                  <th>Document Name</th>
                  <th>Clinical Panel</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {reportList.map((r) => (
                  <tr key={r.id}>
                    <td className="num">{r.report_date ?? r.created_at.slice(0, 10)}</td>
                    <td>
                      <Link to={`/reports/${r.id}`} style={{ fontWeight: 600 }}>
                        {r.file_name}
                      </Link>
                    </td>
                    <td>
                      <span className="badge" style={{ background: 'var(--plum-50)', color: 'var(--plum)' }}>
                        {r.category?.replace(/_/g, ' ') ?? 'General'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${r.status}`}>{r.status}</span>
                    </td>
                    <td>
                      <Link to={`/reports/${r.id}`} className="muted" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                        Open Analysis →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Biomarker Trends */}
        <Card
          title="Biomarker Longitudinal Trajectory"
          subtitle="Trend analysis with shaded physiological reference intervals"
          action={
            <Link to="/compare" className="muted" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
              Compare reports →
            </Link>
          }
        >
          {trends.loading ? (
            <Loading />
          ) : trends.error ? (
            <ErrorBox message={trends.error} />
          ) : !trends.data?.length ? (
            <p className="muted">Biomarker trends will populate automatically as reports are processed.</p>
          ) : (
            <div className="charts">
              {trends.data
                .filter((s) => s.points.length > 0)
                .slice(0, 6)
                .map((s) => (
                  <TrendChart key={s.name} series={s} />
                ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid">
        {/* Active Diet Protocol */}
        <Card
          title="Active Clinical Diet Protocol"
          subtitle="Nutrition plan tailored to current biomarker abnormalities"
        >
          {diet.loading ? (
            <Loading />
          ) : diet.error ? (
            <ErrorBox message={diet.error} />
          ) : diet.data ? (
            <DietView plan={diet.data} />
          ) : (
            <p className="muted">Upload and analyze a lab report to generate an active nutrition protocol.</p>
          )}
        </Card>

        {/* Active Exercise Protocol */}
        <Card
          title="Prescribed Exercise Protocol"
          subtitle="Physical conditioning plan calibrated to your lab findings"
        >
          {ex.loading ? (
            <Loading />
          ) : ex.error ? (
            <ErrorBox message={ex.error} />
          ) : ex.data ? (
            <ExerciseView plan={ex.data} />
          ) : (
            <p className="muted">Upload and analyze a lab report to generate an active exercise prescription.</p>
          )}
        </Card>
      </div>

      {!userId && <RegenerateButton onDone={() => { diet.reload(); ex.reload(); }} />}
    </div>
  );
}

function RegenerateButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <Card
      title="Adaptive Protocol Recalibration"
      subtitle="Recalculate clinical diet and exercise targets combining latest lab biomarkers and recent patient logs"
    >
      {err && <ErrorBox message={err} />}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <p className="muted" style={{ margin: 0, maxWidth: '600px' }}>
          When new daily logs or repeat test results become available, trigger the diagnostic engine to recalculate your personal nutritional and activity protocols.
        </p>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await api.regeneratePlans();
              onDone();
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Recalibrating Protocols…' : 'Recalibrate Plans'}
        </button>
      </div>
    </Card>
  );
}
