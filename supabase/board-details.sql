alter table public.little_boards add column if not exists description text not null default '' check (char_length(description) <= 200);
grant insert(description), update(description) on public.little_boards to authenticated;
