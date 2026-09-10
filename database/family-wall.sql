create schema if not exists family_wall_private;

revoke all on schema family_wall_private from public;
revoke all on schema family_wall_private from anon;
revoke all on schema family_wall_private from authenticated;

create table if not exists family_wall_private.config (
  id text primary key,
  access_code text not null,
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists family_wall_private.state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists family_wall_private.access_attempts (
  caller_key text primary key,
  failed_count integer not null default 0,
  window_started timestamptz not null default clock_timestamp()
);

insert into family_wall_private.config (id, access_code, updated_at)
values ('family-wall', '__FAMILY_ACCESS_CODE__', clock_timestamp())
on conflict (id) do update
set access_code = excluded.access_code,
    updated_at = excluded.updated_at;

create or replace function family_wall_private.check_access(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  key_value text;
  attempt family_wall_private.access_attempts%rowtype;
  expected_code text;
  now_value timestamptz := clock_timestamp();
begin
  key_value := md5(
    coalesce(claims ->> 'sub', 'anonymous') || ':' ||
    coalesce(headers ->> 'x-forwarded-for', headers ->> 'x-real-ip', 'unknown')
  );

  select * into attempt
  from family_wall_private.access_attempts
  where caller_key = key_value;

  if found
     and now_value - attempt.window_started < interval '15 minutes'
     and attempt.failed_count >= 5 then
    return jsonb_build_object('ok', false, 'error', '尝试次数过多，请 15 分钟后再试');
  end if;

  select access_code into expected_code
  from family_wall_private.config
  where id = 'family-wall';

  if expected_code is null then
    return jsonb_build_object('ok', false, 'error', '云端尚未设置家庭访问码');
  end if;

  if coalesce(p_code, '') <> expected_code then
    insert into family_wall_private.access_attempts (caller_key, failed_count, window_started)
    values (key_value, 1, now_value)
    on conflict (caller_key) do update
    set failed_count = case
          when now_value - family_wall_private.access_attempts.window_started < interval '15 minutes'
            then family_wall_private.access_attempts.failed_count + 1
          else 1
        end,
        window_started = case
          when now_value - family_wall_private.access_attempts.window_started < interval '15 minutes'
            then family_wall_private.access_attempts.window_started
          else now_value
        end;
    return jsonb_build_object('ok', false, 'error', '访问码不正确');
  end if;

  delete from family_wall_private.access_attempts where caller_key = key_value;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.family_wall_authenticate(p_code text)
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$
  select family_wall_private.check_access(p_code)
$$;

create or replace function public.family_wall_get(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  access_result jsonb;
  saved_payload jsonb;
  saved_at timestamptz;
begin
  access_result := family_wall_private.check_access(p_code);
  if not coalesce((access_result ->> 'ok')::boolean, false) then
    return access_result;
  end if;

  select payload, updated_at into saved_payload, saved_at
  from family_wall_private.state
  where id = 'shared-family-wall';

  return jsonb_build_object(
    'ok', true,
    'data', saved_payload,
    'updatedAt', case when saved_at is null then null else floor(extract(epoch from saved_at) * 1000)::bigint end
  );
end;
$$;

create or replace function public.family_wall_put(p_code text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  access_result jsonb;
  saved_at timestamptz := clock_timestamp();
begin
  access_result := family_wall_private.check_access(p_code);
  if not coalesce((access_result ->> 'ok')::boolean, false) then
    return access_result;
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('ok', false, 'error', '家庭数据格式不正确');
  end if;

  if octet_length(p_payload::text) > 3000000 then
    return jsonb_build_object('ok', false, 'error', '家庭数据过大');
  end if;

  insert into family_wall_private.state (id, payload, updated_at)
  values ('shared-family-wall', p_payload, saved_at)
  on conflict (id) do update
  set payload = excluded.payload,
      updated_at = excluded.updated_at;

  return jsonb_build_object(
    'ok', true,
    'updatedAt', floor(extract(epoch from saved_at) * 1000)::bigint
  );
end;
$$;

revoke all on function public.family_wall_authenticate(text) from public;
revoke all on function public.family_wall_get(text) from public;
revoke all on function public.family_wall_put(text, jsonb) from public;

grant execute on function public.family_wall_authenticate(text) to anon, authenticated;
grant execute on function public.family_wall_get(text) to anon, authenticated;
grant execute on function public.family_wall_put(text, jsonb) to anon, authenticated;
