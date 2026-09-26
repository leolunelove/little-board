-- Fresh tables. Existing shared-memo data is not altered.
begin;
create schema little_private;
revoke all on schema little_private from public, anon, authenticated;
grant usage on schema little_private to authenticated;
create table public.little_boards (
 id uuid primary key,
 code text unique not null check(code ~ '^[1-9][0-9]{5}$'),
 owner_id uuid not null references auth.users(id),
 title text not null check(char_length(btrim(title)) between 1 and 100),
 tasks jsonb not null default '[]'::jsonb,
 viewer_email text check(viewer_email is null or (char_length(viewer_email)<=254 and viewer_email=lower(btrim(viewer_email)) and viewer_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')),
 revision bigint not null default 0 check(revision>=0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create function little_private.verified_email() returns text language sql stable security definer set search_path='' as $$
 select lower(email) from auth.users where id=auth.uid() and email_confirmed_at is not null;
$$;
revoke all on function little_private.verified_email() from public, anon, authenticated;
grant execute on function little_private.verified_email() to authenticated;
create function little_private.validate_board() returns trigger language plpgsql set search_path='' as $$
declare item jsonb; count_ids integer;
begin
 if jsonb_typeof(new.tasks) is distinct from 'array' then raise exception 'Invalid items'; end if;
 if jsonb_array_length(new.tasks)>1000 then raise exception 'Board is full'; end if;
 for item in select value from jsonb_array_elements(new.tasks) loop
  if jsonb_typeof(item) is distinct from 'object' then raise exception 'Invalid item';end if;
  if item->>'id' is null or item->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'Invalid item ID';end if;
  if item->>'board_id' is distinct from new.id::text then raise exception 'Invalid board';end if;
  if jsonb_typeof(item->'title') is distinct from 'string' or char_length(btrim(item->>'title')) not between 1 and 240 then raise exception 'Invalid title';end if;
  if jsonb_typeof(item->'note') is distinct from 'string' or char_length(item->>'note')>400 then raise exception 'Invalid note';end if;
  if item->>'status' is null or item->>'status' not in ('pending','waiting','done') then raise exception 'Invalid status';end if;
  if not(item ? 'assigned_to') or (item->>'assigned_to' is not null and item->>'assigned_to' not in ('me','partner')) then raise exception 'Invalid assignee';end if;
  if jsonb_typeof(item->'sort_order') is distinct from 'number' or item->>'sort_order' !~ '^[0-9]+$' or (item->>'sort_order')::numeric>9007199254740991 then raise exception 'Invalid order';end if;
  if item->>'created_at' is null or item->>'updated_at' is null then raise exception 'Missing timestamp';end if;
  perform (item->>'created_at')::timestamptz, (item->>'updated_at')::timestamptz;
  if item->>'status'='done' then
   if item->>'completed_at' is null then raise exception 'Missing completion time';end if;
   perform (item->>'completed_at')::timestamptz;
  elsif item->>'completed_at' is not null then raise exception 'Invalid completion time';end if;
 end loop;
 select count(distinct value->>'id') into count_ids from jsonb_array_elements(new.tasks);
 if count_ids<>jsonb_array_length(new.tasks) then raise exception 'Duplicate item';end if;
 new.updated_at=clock_timestamp();
 return new;
end;$$;
revoke all on function little_private.validate_board() from public, anon, authenticated;
create trigger little_validate before insert or update on public.little_boards for each row execute function little_private.validate_board();
alter table public.little_boards enable row level security;
revoke all on public.little_boards from public,anon,authenticated;
grant select on public.little_boards to authenticated;
grant insert(id,code,owner_id,title,tasks) on public.little_boards to authenticated;
grant update(title,tasks,viewer_email,revision) on public.little_boards to authenticated;
create policy little_read on public.little_boards for select to authenticated using (
 (select little_private.verified_email()) is not null and (owner_id=(select auth.uid()) or viewer_email=(select little_private.verified_email()))
);
create policy little_create on public.little_boards for insert to authenticated with check (
 owner_id=(select auth.uid()) and (select little_private.verified_email()) is not null
);
create policy little_edit on public.little_boards for update to authenticated using (
 owner_id=(select auth.uid()) and (select little_private.verified_email()) is not null
) with check (owner_id=(select auth.uid()) and (select little_private.verified_email()) is not null);
create index little_owner on public.little_boards(owner_id);
create index little_viewer on public.little_boards(viewer_email) where viewer_email is not null;
commit;
