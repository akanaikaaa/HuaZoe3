import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useResource } from '../hooks';
import { BiomarkerTable, Card, DietView, ErrorBox, ExerciseView, Loading, SimpleLine } from '../components';
import Compare from './Compare';

export function Patients() {
  const { data, error, loading, reload } = useResource(() => api.patients(), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} retry={reload} />;
  return (
    <Card title="Patients">
      {!data?.length ? <p className="muted">No patients assigned.</p> : (
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Fitness</th></tr></thead>
          <tbody>{data.map((p) => <tr key={p.id}><td><Link to={`/patients/${p.id}`}>{p.full_name ?? '(no name)'}</Link></td><td>{p.email}</td><td>{p.fitness_level}</td></tr>)}</tbody>
        </table>
      )}
    </Card>
  );
}

/** Read-only clinician view. Refreshes every 15s so logs from Android appear without reloading. */
export function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: o, error, loading, reload } = useResource(() => api.patientOverview(id!), [id], { pollMs: 15000, events: ['log:updated', 'report:update', 'plans:updated'] });
  if (loading) return <Loading />;
  if (error || !o) return <ErrorBox message={error ?? 'Not found'} retry={reload} />;

  const latest = Object.values(
    o.biomarkers.reduce<Record<string, (typeof o.biomarkers)[number]>>((m, b) => ({ ...m, [b.name]: b }), {})
  );
  const logs = o.daily_logs.map((l) => ({ ...l, workout_min: l.workouts.reduce((n, w) => n + w.duration_min, 0) }));

  return (
    <div className="grid">
      <Card title={`${o.patient.full_name ?? o.patient.email}`}>
        <p>Fitness level: {o.patient.fitness_level}</p>
        <h4>Reports</h4>
        <ul>{o.reports.map((r) => <li key={r.id}>{r.report_date ?? r.created_at.slice(0, 10)} — {r.category ?? '?'} <span className={`badge ${r.status}`}>{r.status}</span></li>)}</ul>
      </Card>
      <Card title="Latest biomarkers"><BiomarkerTable items={latest} /></Card>
      <Card title="Daily progress (30 days)">
        <div className="charts">
          <SimpleLine data={logs} dataKey="weight_kg" label="Weight (kg)" color="#533E64" />
          <SimpleLine data={logs} dataKey="water_ml" label="Water (ml)" color="#A8C1C1" />
          <SimpleLine data={logs} dataKey="workout_min" label="Workout minutes" color="#A26997" />
        </div>
        <h4>Recent symptoms</h4>
        <ul>{logs.filter((l) => l.symptoms.length).slice(-7).map((l) => <li key={l.log_date}>{l.log_date}: {l.symptoms.map((s) => `${s.name} (${s.severity}/5)`).join(', ')}</li>)}</ul>
      </Card>
      <Card title="Diet plan">{o.diet_plan ? <DietView plan={o.diet_plan} /> : <p className="muted">None</p>}</Card>
      <Card title="Exercise plan">{o.exercise_plan ? <ExerciseView plan={o.exercise_plan} /> : <p className="muted">None</p>}</Card>
      <Card title="Report comparisons"><Compare userId={id} /></Card>
    </div>
  );
}
