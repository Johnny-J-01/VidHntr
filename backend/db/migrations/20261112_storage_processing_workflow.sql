-- Migration: storage and processing workflow improvements
alter table public.videos
  add column if not exists storage_status text default 'PENDING',
  add column if not exists transcription_status text default 'PENDING',
  add column if not exists thumbnail_status text default 'PENDING',
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists transcript jsonb;

alter table public.exports
  alter column expires_at drop not null;

create index if not exists videos_storage_status_idx
  on public.videos (storage_status);

create index if not exists videos_transcription_status_idx
  on public.videos (transcription_status);
