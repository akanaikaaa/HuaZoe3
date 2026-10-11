-- HuaZoe AI schema (idempotent: safe to re-run). Run the WHOLE file in the Supabase SQL editor.
create extension if not exists "pgcrypto";

-- ───────── Enums ─────────
do $$ begin create type user_role as enum ('patient', 'doctor', 'admin'); exception when duplicate_object then null; end $$;
do $$ begin create type report_status as enum ('uploaded', 'processing', 'completed', 'failed'); exception when duplicate_object then null; end $$;
do $$ begin create type abnormal_flag as enum ('low', 'normal', 'high'); exception when duplicate_object then null; end $$;
do $$ begin create type severity_level as enum ('none', 'mild', 'moderate', 'severe'); exception when duplicate_object then null; end $$;
do $$ begin create type trend_type as enum ('improved', 'worsened', 'unchanged', 'new'); exception when duplicate_object then null; end $$;

-- ───────── Tables ─────────
-- "users": app profile, 1:1 with auth.users
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role user_role not null default 'patient',
  date_of_birth date,
  sex text check (sex in ('male','female','other')),
  height_cm numeric,
  fitness_level text not null default 'beginner' check (fitness_level in ('beginner','intermediate','advanced')),
  dietary_preferences text[] not null default '{}',
  dietary_restrictions text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Auto-sync existing auth.users into public.users
insert into public.users (id, email, full_name, role)
select id, coalesce(email, ''), raw_user_meta_data->>'full_name', 'patient'
from auth.users
on conflict (id) do nothing;

-- Function & trigger to auto-create public.users on auth.users sign-up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name, role)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data->>'full_name', 'patient')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.care_assignments (
  doctor_id uuid not null references public.users(id) on delete cascade,
  patient_id uuid not null references public.users(id) on delete cascade,
  primary key (doctor_id, patient_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  category text,
  report_date date,
  status report_status not null default 'uploaded',
  error_message text,
  disclaimer_ack boolean not null default true,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists reports_user_date_idx on public.reports(user_id, report_date desc);

create table if not exists public.biomarkers (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  display_name text not null,
  value numeric not null,
  unit text,
  ref_low numeric,
  ref_high numeric,
  flag abnormal_flag not null,
  severity severity_level not null default 'none',
  measured_at date not null,
  created_at timestamptz not null default now()
);
create index if not exists biomarkers_user_name_idx on public.biomarkers(user_id, name, measured_at);
create index if not exists biomarkers_report_idx on public.biomarkers(report_id);

create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  summary text not null,
  items jsonb not null,
  disclaimer text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.diet_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  version int not null default 1,
  is_current boolean not null default true,
  plan jsonb not null,
  rationale text,
  created_at timestamptz not null default now()
);
create index if not exists diet_plans_user_idx on public.diet_plans(user_id, is_current);

create table if not exists public.exercise_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  version int not null default 1,
  is_current boolean not null default true,
  plan jsonb not null,
  rationale text,
  created_at timestamptz not null default now()
);
create index if not exists exercise_plans_user_idx on public.exercise_plans(user_id, is_current);

create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  log_date date not null,
  meals jsonb not null default '[]',
  workouts jsonb not null default '[]',
  water_ml int not null default 0 check (water_ml >= 0),
  weight_kg numeric check (weight_kg > 0),
  symptoms jsonb not null default '[]',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create table if not exists public.report_comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  current_report_id uuid not null references public.reports(id) on delete cascade,
  previous_report_id uuid not null references public.reports(id) on delete cascade,
  items jsonb not null,
  summary text not null,
  created_at timestamptz not null default now(),
  unique (current_report_id, previous_report_id)
);

-- ───────── Helper functions ─────────
create or replace function public.can_access_patient(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() = pid
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
    or exists (select 1 from care_assignments c, users u
               where c.doctor_id = auth.uid() and c.patient_id = pid
                 and u.id = auth.uid() and u.role = 'doctor');
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────── Row Level Security ─────────
alter table public.users enable row level security;
alter table public.care_assignments enable row level security;
alter table public.reports enable row level security;
alter table public.biomarkers enable row level security;
alter table public.insights enable row level security;
alter table public.diet_plans enable row level security;
alter table public.exercise_plans enable row level security;
alter table public.daily_logs enable row level security;
alter table public.report_comparisons enable row level security;

drop policy if exists users_select on public.users;
create policy users_select on public.users for select using (public.can_access_patient(id));
drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.users where id = auth.uid()));

drop policy if exists care_select on public.care_assignments;
create policy care_select on public.care_assignments for select
  using (doctor_id = auth.uid() or patient_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['reports','biomarkers','insights','diet_plans','exercise_plans','daily_logs','report_comparisons']
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select using (public.can_access_patient(user_id))', t, t);
    execute format('create policy %I_insert on public.%I for insert with check (user_id = auth.uid())', t, t);
    execute format('create policy %I_update on public.%I for update using (user_id = auth.uid())', t, t);
    execute format('create policy %I_delete on public.%I for delete using (user_id = auth.uid())', t, t);
  end loop;
end $$;

-- ───────── Storage: private bucket, files under <user_id>/<file> ─────────
insert into storage.buckets (id, name, public) values ('reports', 'reports', false)
on conflict (id) do update set public = false;

drop policy if exists "reports owner read" on storage.objects;
create policy "reports owner read" on storage.objects for select
  using (bucket_id = 'reports' and public.can_access_patient(((storage.foldername(name))[1])::uuid));
drop policy if exists "reports owner write" on storage.objects;
create policy "reports owner write" on storage.objects for insert
  with check (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "reports owner delete" on storage.objects;
create policy "reports owner delete" on storage.objects for delete
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);

-- ───────── Optional Realtime (skips tables already published) ─────────
do $$
declare t text;
begin
  foreach t in array array['reports','diet_plans','exercise_plans','daily_logs']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Make PostgREST pick up the new tables immediately
notify pgrst, 'reload schema';
