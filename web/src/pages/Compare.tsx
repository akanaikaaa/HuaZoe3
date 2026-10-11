import { useState } from 'react';
import { api } from '../api';
import { useResource } from '../hooks';
import { Card, ErrorBox, Loading, TrendChart } from '../components';

export default function Compare({ userId }: { userId?: string }) {
  const list = useResource(() => api.comparisons(userId), [userId], { events: ['comparison:created'] });
  const trends = useResource(() => api.trends(userId), [userId]);
  const [selected, setSelected] = useState<string | null>(null);
  const [metric, setMetric] = useState<string | null>(null);

  if (list.loading) return <Loading />;
  if (list.error) return <ErrorBox message={list.error} retry={list.reload} />;
  if (!list.data?.length) return <Card title="Compare reports"><p className="muted">Upload a follow-up report of the same type to see a comparison.</p></Card>;

  const c = list.data.find((x) => x.id === (selected ?? list.data![0].id))!;
  const series = trends.data?.find((s) => s.name === (metric ?? c.items[0]?.name));

  return (
    <div className="grid">
      <Card title="Comparisons">
        <select value={c.id} onChange={(e) => setSelected(e.target.value)}>
          {list.data.map((x) => <option key={x.id} value={x.id}>{x.created_at.slice(0, 10)} — {x.summary}</option>)}
        </select>
        <p>{c.summary}</p>
        <table>
          <thead><tr><th>Biomarker</th><th>Previous</th><th>Current</th><th>Change</th><th>Trend</th></tr></thead>
          <tbody>
            {c.items.map((i) => (
              <tr key={i.name} onClick={() => setMetric(i.name)} style={{ cursor: 'pointer' }}>
                <td>{i.display_name}</td>
                <td>{i.previous ?? '–'} {i.unit}</td>
                <td>{i.current} {i.unit}</td>
                <td>{i.change_pct == null ? '–' : `${i.change_pct > 0 ? '+' : ''}${i.change_pct}%`}</td>
                <td><span className={`badge ${i.trend}`}>{i.trend}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Timeline">
        {series ? <TrendChart series={series} /> : <p className="muted">Click a row to chart it.</p>}
      </Card>
    </div>
  );
}
