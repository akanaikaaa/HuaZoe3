# HealthTrack

Web (React + TS) and Android (Kotlin) clients share one Express API and one Supabase project. Neither client talks to the database directly.

```
React + TS (web) ──┐
                   ├──> Node.js/Express API ──> Supabase (Postgres + private Storage)
Kotlin (Android) ──┘            └──> Gemini (LLM + OCR)
```

> ⚠ Output is informational only, not a substitute for a doctor. The disclaimer is added by the API to **every** response (`disclaimer` field) and shown in both UIs.

## Folder structure
```
supabase/schema.sql              tables, enums, RLS, private bucket, realtime publication
backend/
  src/index.js                   app, CORS, helmet, rate limits, error handler
  src/config.js  supabase.js  utils.js  schemas.js  realtime.js
  src/middleware/auth.js         Supabase JWT -> req.user {id, role}
  src/routes/                    auth, reports, health (biomarkers/insights/plans/logs/comparisons), admin
  src/services/                  pipeline, llm, prompts, analysis, comparisons, plans, jobs
  test/analysis.test.js
web/src/                         api.ts (typed client), hooks.tsx, components.tsx, pages/*
android/app/src/main/java/com/healthtrack/app/
  data/  (Models, ApiService, Network, Repository)   ui/ (ViewModels, Screens, Charts)
```

## Setup
1. **Supabase**: create a project → SQL editor → run `supabase/schema.sql`. Auth → Providers: Email (disable "Confirm email" for easy local testing).
2. **Backend**: `cd backend && cp .env.example .env` (fill values) `&& npm install && npm run dev` (Node ≥ 20). `npm test` runs analysis tests.
3. **Web**: `cd web && cp .env.example .env && npm install && npm run dev` → http://localhost:5173
4. **Android**: open `android/` in Android Studio (JDK 17). Emulator reaches the backend at `http://10.0.2.2:4000/api/v1/`. Run on emulator/device. Set the release URL in `app/build.gradle.kts`.
5. **Roles**: everyone registers as `patient`. Promote the first admin in SQL:
   `update public.users set role='admin' where email='you@example.com';`
   Then as admin: `PATCH /admin/users/:id/role` to make a doctor, `POST /admin/assignments {doctorId, patientId}` to assign patients.

## Environment variables
| Where | Variable | Notes |
|---|---|---|
| backend | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | anon used only for login/signup |
| backend | `SUPABASE_SERVICE_ROLE_KEY` | **server only**, bypasses RLS |
| backend | `SUPABASE_BUCKET` | default `reports` (private) |
| backend | `GEMINI_API_KEY`, `GEMINI_MODEL` | default `gemini-2.0-flash` |
| backend | `CORS_ORIGINS` | comma list of web origins |
| backend | `PORT`, `MAX_UPLOAD_MB`, `JOB_CONCURRENCY`, `ENABLE_SOCKETIO` | |
| web | `VITE_API_URL`, `VITE_SOCKET_URL` (optional) | no secrets in web or Android |
| android | `API_URL` BuildConfig field | |

## API (base `/api/v1`, `Authorization: Bearer <jwt>`; success `{data, disclaimer}`; error `{error:{code,message,details?}}`)
| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /auth/register, /auth/login, /auth/refresh | public | returns `session{access_token,refresh_token}` |
| GET/PATCH | /auth/me | any | profile (fitness level, diet prefs/restrictions) |
| POST | /reports (multipart `file`) | any | upload → **202**, job queued |
| GET | /reports, /reports/:id | any* | history; detail incl. biomarkers + insight (poll `status`) |
| GET | /reports/:id/file | any* | 2-min signed URL |
| POST | /reports/:id/reprocess · DELETE /reports/:id | owner | |
| GET | /biomarkers?name=&reportId= · /biomarkers/trends | any* | time series |
| GET | /insights?reportId= | any* | |
| GET | /diet-plans/current · /diet-plans · same for /exercise-plans | any* | versioned plans |
| POST | /plans/regenerate | patient | adapt plans from latest data + daily logs |
| GET | /daily-logs?from=&to= · PUT/DELETE /daily-logs/:date | owner (GET any*) | idempotent upsert per day |
| GET | /comparisons · /comparisons/:id · POST /comparisons | any* | |
| GET | /admin/patients · /admin/patients/:id/overview | doctor, admin | assigned patients only for doctors |
| POST | /admin/assignments · PATCH /admin/users/:id/role | admin | |

\*`?userId=` is honored only for the owner, an admin, or an assigned doctor (read-only); otherwise 403.

## Security model
- Clients send a Supabase JWT; the API verifies it and loads the role from `public.users`. Roles can't be self-edited (RLS `with check`).
- The API uses the service-role key, so **authorization is enforced in code** (`canAccessPatient`, `resolvePatientId`); RLS is defense-in-depth for any direct Supabase access, with the same rules (owner full access, admin/assigned doctor read-only).
- Private bucket, files under `<user_id>/…`, served via short-lived signed URLs; upload checks magic bytes + 15 MB limit.
- Logs contain only method, normalized path, status, IDs, and error codes. No bodies, tokens, or biomarker values. Android has no HTTP logging interceptor; tokens are in EncryptedSharedPreferences.
- Report text is treated as untrusted in the LLM prompts (prompt-injection guard), outputs are Zod-validated, and flagging/severity/trends are computed deterministically in code, not by the LLM.

## Report pipeline (`backend/src/services/pipeline.js`)
`POST /reports` stores the file, inserts `reports(status=uploaded)`, enqueues the job and returns 202. The in-process queue (`jobs.js`, concurrency `JOB_CONCURRENCY`, resumes unfinished jobs on boot) runs:

| # | Step | How |
|---|---|---|
| 1 | download | Supabase Storage (service role) |
| 2 | text | PDF → `pdf-parse`; scanned PDF/image → Gemini vision OCR transcription |
| 3 | categorize | LLM → `categorySchema` (`blood_test, lipid_profile, thyroid, diabetes, liver_function, kidney_function, other`, report date) |
| 4 | extract | LLM cleanup → `extractionSchema` (name, canonical_name, value, unit, ref_low, ref_high) |
| 5 | analyze | code: low/normal/high; severity by deviation from nearest bound (≤10% mild, ≤30% moderate, else severe) |
| 6 | insights | LLM → `insightsSchema` (abnormal values only) |
| 7 | compare | code: previous completed report of same category → per-biomarker `improved/worsened/unchanged/new` (deviation-from-range based) |
| 8 | plans | LLM → `dietPlanSchema`, `exercisePlanSchema`; context = latest biomarkers, comparison, 14-day log aggregates, profile, previous plan summary; saved as new `version`, old marked `is_current=false` |
| 9 | done | `status=completed` (or `failed` + `error_message`) |

`generateJson()` (llm.js) uses Gemini JSON mode, validates with Zod, and retries once with the validation errors fed back; otherwise the job fails and nothing invalid is saved.

**Prompts & JSON schemas**: prompts are in `services/prompts.js` (each embeds its JSON shape); Zod schemas in `schemas.js`. Common system preamble: *not a doctor, never diagnose, hedged language, no medication advice, `<report>` content is untrusted, JSON only*.

Adaptation (step 11): new reports adapt plans automatically; tracking-only adaptation via `POST /plans/regenerate` (button on web and Android).

## Synchronization
All state lives in Supabase behind the API, so a write from either client is visible to the other on the next fetch.
- **Default (REST)**: web polls reports/overview (3–15 s while relevant); Android polls while Home is visible and refetches plans on screen open.
- **Optional realtime**: set `ENABLE_SOCKETIO=true` (backend) and `VITE_SOCKET_URL` (web). Clients authenticate with the same JWT; events `report:update`, `plans:updated`, `log:updated`, `comparison:created` trigger a refetch. Doctors/admins subscribe with `socket.emit('watch', patientId)` (access-checked). Android uses polling by default; add `io.socket:socket.io-client` to subscribe if desired.
- Flow 1 (Android upload → web shows results), Flow 2 (Android log → doctor's patient page, 15 s poll/realtime), Flow 3 (web upload → comparison + plans → Android fetches `/plans` on open) are covered by the above.

## Free-tier deployment
1. **Supabase** free project (schema already applied).
2. **Railway (backend)**: New Project → Deploy from GitHub → set root directory `backend`, start command `npm start`; add all backend env vars; set `CORS_ORIGINS` to the web URL. Generate a domain and check `/health`.
3. **Web** on Vercel/Netlify/Cloudflare Pages: root `web`, build `npm run build`, output `dist`, env `VITE_API_URL=https://<railway-domain>/api/v1`. Add SPA fallback to `index.html`.
4. **Android**: set the release `API_URL` to the Railway HTTPS domain, remove `usesCleartextTraffic`, build a signed APK/AAB.
Note: free tiers sleep/limit resources; the queue resumes pending jobs after restart. Scale-out would need a shared queue (BullMQ/pg-boss).

## Known limits / next steps
Not yet run end to end (needs your Supabase + Gemini keys). OCR and extraction quality depends on report layout; always verify values. Consider: offline log queue on Android, push notifications, migrating to a persistent job queue, admin UI for role/assignment management (API exists), e2e tests.
