import { useState, type FormEvent, type DragEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { useResource } from '../hooks';
import { BiomarkerTable, Card, DietView, ErrorBox, ExerciseView, Icons, Loading } from '../components';

export function Upload() {
  const nav = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.uploadReport(file);
      nav(`/reports/${r.id}`);
    } catch (ex) {
      setErr((ex as Error).message);
      setBusy(false);
    }
  };

  const handleDrag = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDrag(true);
    else if (e.type === 'dragleave') setDrag(false);
  };

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="stack" style={{ maxWidth: '860px', margin: '0 auto' }}>
      <Card
        title="Diagnostic Lab Report Intake"
        subtitle="Upload laboratory documents, blood panels, or metabolic profiles for automated extraction & clinical analysis"
      >
        <form onSubmit={submit}>
          <label
            className={`dropzone ${drag ? 'drag' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="big">
              <Icons.Upload />
            </div>
            <h3>Drag &amp; drop your medical report here</h3>
            <p>Supported: Digital PDF, scanned reports, lab camera photos (JPEG, PNG, WebP) · Max 15 MB</p>
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="secondary sm"
              style={{ marginTop: '0.8rem' }}
              onClick={(e) => {
                const input = (e.currentTarget.parentElement as HTMLLabelElement)?.querySelector('input[type="file"]') as HTMLInputElement;
                input?.click();
              }}
            >
              Browse device files
            </button>
          </label>

          {file && (
            <div className="file-pill">
              <Icons.FileText />
              <div style={{ flex: 1 }}>
                <b>{file.name}</b>
                <div className="muted" style={{ fontSize: '0.78rem' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB · {file.type || 'Document'}
                </div>
              </div>
              <button
                type="button"
                className="link sm"
                onClick={() => setFile(null)}
              >
                Remove
              </button>
            </div>
          )}

          {err && <ErrorBox message={err} />}

          <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button disabled={!file || busy} style={{ minWidth: '180px' }}>
              {busy ? 'Ingesting & Analyzing…' : 'Analyze Medical Report'}
            </button>
          </div>
        </form>
      </Card>

      <div className="pipeline">
        <div className="pipe">
          <span className="n">STEP 01</span>
          <b>Secure Ingestion</b>
          <p>Encrypted local storage adhering to patient privacy standards.</p>
        </div>
        <div className="pipe">
          <span className="n">STEP 02</span>
          <b>Optical OCR</b>
          <p>Preprocessing and line removal to preserve table columns exactly.</p>
        </div>
        <div className="pipe">
          <span className="n">STEP 03</span>
          <b>Original Value Extraction</b>
          <p>Parses exact numeric results and reference intervals from the document.</p>
        </div>
        <div className="pipe">
          <span className="n">STEP 04</span>
          <b>Tailored Plans</b>
          <p>Builds 7-day nutrition and exercise routines matched to abnormal biomarkers.</p>
        </div>
      </div>
    </div>
  );
}

export function ReportDetail() {
  const { id } = useParams<{ id: string }>();

  // Poll every 3s while status is pending/processing
  const { data: r, error, loading, reload } = useResource(() => api.report(id!), [id], {
    pollMs: 3000,
    events: ['report:update', 'plans:updated'],
    stopWhen: (d) => d.status === 'completed' || d.status === 'failed',
  });

  if (loading) return <Loading />;
  if (error || !r) return <ErrorBox message={error ?? 'Report not found'} retry={reload} />;

  const biomarkers = r.biomarkers || [];
  const abnormalCount = biomarkers.filter((b) => b.flag !== 'normal').length;
  const normalCount = biomarkers.length - abnormalCount;
  const hasSevere = biomarkers.some((b) => b.severity === 'severe');

  return (
    <div className="stack">
      {/* Report Header Card */}
      <div className="card">
        <div className="report-head">
          <div>
            <div className="row" style={{ gap: '0.5rem', marginBottom: '0.35rem' }}>
              <span className={`badge ${r.status}`}>{r.status}</span>
              <span className="badge" style={{ background: 'var(--plum-50)', color: 'var(--plum)' }}>
                {r.category?.replace(/_/g, ' ') || 'Diagnostic Panel'}
              </span>
            </div>
            <h2>{r.file_name}</h2>
            <div className="meta-grid">
              <div>
                <span>Document Date</span>
                <b>{r.report_date || 'Current'}</b>
              </div>
              <div>
                <span>Ingestion Time</span>
                <b>{new Date(r.created_at).toLocaleString()}</b>
              </div>
              <div>
                <span>Extraction Engine</span>
                <b>Deterministic Table Parser v2.4</b>
              </div>
              <div>
                <span>Clinical Category</span>
                <b style={{ textTransform: 'capitalize' }}>{r.category?.replace(/_/g, ' ') || 'General'}</b>
              </div>
            </div>
          </div>

          <div className="right">
            <button
              className="secondary sm"
              onClick={async () => {
                const { url } = await api.reportFileUrl(r.id);
                window.open(url, '_blank');
              }}
            >
              <Icons.FileText /> View Original Document
            </button>
            {r.status === 'completed' && (
              <button
                className="secondary sm"
                onClick={async () => {
                  await api.reprocessReport(r.id);
                  reload();
                }}
              >
                Re-analyze Report
              </button>
            )}
          </div>
        </div>

        {/* Stepper if report is still processing */}
        {(r.status === 'uploaded' || r.status === 'processing') && (
          <div className="stepper">
            <div className="step done">
              <div className="bubble">✓</div>
              <span>Upload Received</span>
            </div>
            <div className="step active">
              <div className="bubble">2</div>
              <span>Extracting Biomarkers</span>
            </div>
            <div className="step">
              <div className="bubble">3</div>
              <span>Evaluating Ranges</span>
            </div>
            <div className="step">
              <div className="bubble">4</div>
              <span>Generating Plans</span>
            </div>
          </div>
        )}
      </div>

      {r.status === 'failed' && (
        <div className="card">
          <div className="card-body">
            <ErrorBox message={r.error_message ?? 'Diagnostic analysis failed.'} />
            <button
              style={{ marginTop: '0.75rem' }}
              onClick={async () => {
                await api.reprocessReport(r.id);
                reload();
              }}
            >
              Retry Diagnostic Engine
            </button>
          </div>
        </div>
      )}

      {r.status === 'completed' && (
        <>
          {/* Clinical KPI metrics */}
          <div className="kpis">
            <div className="kpi k-plum">
              <span className="label">Total Tests Extracted</span>
              <div className="value">{biomarkers.length}</div>
              <div className="sub">Extracted exactly from report</div>
            </div>
            <div className="kpi k-ok">
              <span className="label">In Reference Range</span>
              <div className="value">{normalCount}</div>
              <div className="sub">Parameters optimal</div>
            </div>
            <div className={`kpi ${abnormalCount > 0 ? 'k-high' : 'k-ok'}`}>
              <span className="label">Out of Range</span>
              <div className="value">{abnormalCount}</div>
              <div className="sub">{abnormalCount > 0 ? 'Requires attention' : 'All parameters normal'}</div>
            </div>
            <div className={`kpi ${hasSevere ? 'k-high' : 'k-plum'}`}>
              <span className="label">Clinical Priority</span>
              <div className="value" style={{ fontSize: '1.25rem', paddingTop: '0.2rem' }}>
                {hasSevere ? 'Elevated' : abnormalCount > 0 ? 'Moderate' : 'Routine'}
              </div>
              <div className="sub">{hasSevere ? 'Priority protocol active' : 'Targeted lifestyle protocol'}</div>
            </div>
          </div>

          {/* Biomarkers Table */}
          <Card
            title="Biomarker Diagnostic Matrix"
            subtitle="Original values, biological reference intervals, and flags parsed directly from the uploaded document"
            flush
          >
            <BiomarkerTable items={biomarkers} />
          </Card>

          {/* Clinical Insights */}
          {r.insight && (
            <Card
              title="Clinical Diagnostic Analysis & Assessment"
              subtitle="Automated analysis of lab findings with direct nutritional and activity interventions"
            >
              {r.insight.items.urgent_attention && (
                <div className="alert warn" style={{ marginBottom: '1rem' }}>
                  <Icons.Activity />
                  <div>
                    <b>Diagnostic Analysis Active:</b> Out-of-range biomarker detected. The specialized 7-Day Clinical Nutrition Plan and Prescribed Exercise Routine below have been customized directly to target and improve these markers.
                  </div>
                </div>
              )}

              <p style={{ fontSize: '1rem', lineHeight: 1.6, color: 'var(--plum-900)' }}>
                {r.insight.summary}
              </p>

              {r.insight.items.list.length > 0 ? (
                <div style={{ marginTop: '1rem' }}>
                  {r.insight.items.list.map((item, idx) => (
                    <details key={idx} className="interp" open={item.see_doctor}>
                      <summary>
                        <span className={`badge ${item.flag}`}>{item.flag}</span>
                        <b>{item.biomarker}</b>
                        {item.see_doctor && (
                          <span className="chip bad" style={{ marginLeft: '0.5rem', fontSize: '0.72rem' }}>
                            Priority Target
                          </span>
                        )}
                      </summary>
                      <div className="body">
                        <p>{item.explanation}</p>
                        <h5>Potential Contributing Factors</h5>
                        <ul>
                          {item.possible_causes.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                        <h5>Evidence-Based Lifestyle &amp; Dietary Actions</h5>
                        <ul>
                          {item.lifestyle_tips.map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <div className="alert info">
                  <Icons.CheckCircle />
                  <div>All tested parameters are aligned with the reported biological reference ranges.</div>
                </div>
              )}
            </Card>
          )}

          {/* Tailored Diet Plan */}
          {r.diet_plan && (
            <Card
              title="Report-Tailored Clinical Nutrition Plan"
              subtitle={`Medically tailored 7-day nutritional guidance targeted specifically to your ${r.category?.replace(/_/g, ' ') || 'biomarker'} results`}
            >
              <DietView plan={r.diet_plan} />
            </Card>
          )}

          {/* Recommended Exercise Routine */}
          {r.exercise_plan && (
            <Card
              title="Prescribed Exercise & Conditioning Protocol"
              subtitle={`Activity routine calibrated to support metabolic and cardiovascular health based on your lab findings`}
            >
              <ExerciseView plan={r.exercise_plan} />
            </Card>
          )}
        </>
      )}

      <div style={{ marginTop: '0.5rem' }}>
        <Link to="/" className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          ← Back to Clinical Dashboard
        </Link>
      </div>
    </div>
  );
}
