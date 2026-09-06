alter table public.videos
  add column if not exists guest_id uuid,
  add column if not exists drive_folder_id text;

alter table public.videos
  alter column expires_at drop not null;

create index if not exists videos_guest_active_idx
  on public.videos (guest_id, expires_at)
  where guest_id is not null;

create index if not exists videos_user_active_idx
  on public.videos (user_id, expires_at)
  where user_id is not null;

create or replace function public.reserve_video_slot(
  p_video_id uuid,
  p_user_id uuid,
  p_guest_id uuid,
  p_source_type text,
  p_expires_at timestamptz,
  p_guest_limit integer,
  p_auth_limit integer
)
returns table (allowed boolean, video_limit integer, active_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_key text;
  current_count integer;
  max_videos integer;
begin
  if (p_user_id is null) = (p_guest_id is null) then
    raise exception 'Exactly one owner identity is required';
  end if;

  owner_key := case
    when p_user_id is not null then 'user:' || p_user_id::text
    else 'guest:' || p_guest_id::text
  end;

  perform pg_advisory_xact_lock(hashtextextended(owner_key, 0));

  max_videos := case
    when p_user_id is not null then p_auth_limit
    else p_guest_limit
  end;

  select count(*) into current_count
  from public.videos
  where (user_id = p_user_id or guest_id = p_guest_id)
    and (expires_at is null or expires_at > now());

  if current_count >= max_videos then
    return query select false, max_videos, current_count;
    return;
  end if;

  insert into public.videos (
    id,
    user_id,
    guest_id,
    source_type,
    status,
    progress,
    created_at,
    expires_at
  )
  values (
    p_video_id,
    p_user_id,
    p_guest_id,
    p_source_type,
    'QUEUED',
    0,
    now(),
    p_expires_at
  );

  return query select true, max_videos, current_count + 1;
end;
$$;
