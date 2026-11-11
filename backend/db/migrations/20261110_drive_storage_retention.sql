alter table public.videos
  add column if not exists metadata_file_id text;

create index if not exists videos_expiry_idx
  on public.videos (expires_at)
  where expires_at is not null;

create index if not exists exports_expiry_idx
  on public.exports (expires_at)
  where expires_at is not null;
