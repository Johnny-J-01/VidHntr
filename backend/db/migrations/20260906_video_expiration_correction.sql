-- Correct records created before per-owner expiration was enforced.
update public.videos
set expires_at = created_at + interval '3 hours'
where guest_id is not null
  and user_id is null
  and (expires_at is null or expires_at > created_at + interval '3 hours');

update public.videos
set expires_at = created_at + interval '3 days'
where user_id is not null
  and (expires_at is null or expires_at > created_at + interval '3 days');
