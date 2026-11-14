-- Export readiness, Drive persistence, recovery settings, and performance telemetry.
alter table public.exports
  alter column expires_at drop not null,
  add column if not exists storage_status text not null default 'PENDING',
  add column if not exists output_path text,
  add column if not exists local_ready_at timestamptz,
  add column if not exists drive_uploaded_at timestamptz,
  add column if not exists storage_error text,
  add column if not exists filename_base text,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists quality text,
  add column if not exists captions text,
  add column if not exists crop_mode text,
  add column if not exists format_preset text,
  add column if not exists progress integer not null default 0,
  add column if not exists error text,
  add column if not exists metrics jsonb not null default '{}'::jsonb;

create index if not exists exports_storage_recovery_idx
  on public.exports (status, storage_status)
  where status = 'READY' and storage_status <> 'STORED';
