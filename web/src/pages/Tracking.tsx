import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useResource } from '../hooks';
import { Card, ErrorBox, Loading, SimpleLine } from '../components';
import type { DailyLog } from '../types';

const today = () => new Date().toISOString().slice(0, 10);

export default function Tracking() {
  const logs = useResource(() => api.dailyLogs(), [], { events: ['log:updated'] });
  const [date, setDate] = useState(today());
  const [meals, setMeals] = useState('');
  const [workout, setWorkout] = useState('');
  const [minutes, setMinutes] = useState(0);
  const [water, setWater] = useState(0);
  const [weight, setWeight] = useState('');
  const [symptom, setSymptom] = useState('');
  const [sev, setSev] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setSaved(false);
    try {
      await api.saveLog(date, {
        meals: meals.split('\n').map((m) => m.trim()).filter(Boolean).map((name) => ({ name })),
        workouts: workout ? [{ type: workout, duration_min: minutes }] : [],
        water_ml: water,
        weight_kg: weight ? Number(weight) : null,
        symptoms: symptom ? [{ name: symptom, severity: sev }] : [],
      });
      setSaved(true); logs.reload();
    } catch (ex) { setErr((ex as Error).message); }
  };

  const data: (DailyLog & { workout_min: number })[] = (logs.data ?? []).map((l) => ({ ...l, workout_min: l.workouts.reduce((n, w) => n + w.duration_min, 0) }));

  return (
    <div className="grid">
      <Card title="Log your day">
        <form onSubmit={submit} className="form">
          <label>Date <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></label>
          <label>Meals (one per line) <textarea value={meals} onChange={(e) => setMeals(e.target.value)} /></label>
          <label>Workout <input value={workout} onChange={(e) => setWorkout(e.target.value)} placeholder="e.g. brisk walk" /></label>
          <label>Duration (min) <input type="number" min={0} value={minutes} onChange={(e) => setMinutes(+e.target.value)} /></label>
          <label>Water (ml) <input type="number" min={0} step={250} value={water} onChange={(e) => setWater(+e.target.value)} /></label>
          <label>Weight (kg) <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>
          <label>Symptom <input value={symptom} onChange={(e) => setSymptom(e.target.value)} placeholder="e.g. fatigue" /></label>
          <label>Severity (1-5) <input type="number" min={1} max={5} value={sev} onChange={(e) => setSev(+e.target.value)} /></label>
          {err && <ErrorBox message={err} />}
          {saved && <p className="ok">Saved ✓</p>}
          <button>Save log</button>
        </form>
      </Card>
      <Card title="Progress (30 days)">
        {logs.loading ? <Loading /> : logs.error ? <ErrorBox message={logs.error} retry={logs.reload} /> : (
          <div className="charts">
            <SimpleLine data={data} dataKey="weight_kg" label="Weight (kg)" color="#533E64" />
            <SimpleLine data={data} dataKey="water_ml" label="Water (ml)" color="#A8C1C1" />
            <SimpleLine data={data} dataKey="workout_min" label="Workout minutes" color="#A26997" />
          </div>
        )}
      </Card>
    </div>
  );
}
