-- ============================================================
-- 健身打卡 Supabase 建表脚本
-- 在 Supabase 控制台 → SQL Editor 里粘贴整段，点 Run 执行
-- ============================================================

-- 1. 打卡记录表
create table if not exists public.sessions (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  minutes    integer not null check (minutes between 1 and 600),
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_date_idx on public.sessions (user_id, date);

-- 2. 用户设置表（每人一行：开始日期、目标次数、达标时长）
create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  start_date date not null,
  target     integer not null default 50  check (target between 1 and 365),
  goal_min   integer not null default 60  check (goal_min between 1 and 300),
  updated_at timestamptz not null default now()
);

-- 3. 开启行级安全（RLS）——用户只能读写自己的数据
alter table public.sessions      enable row level security;
alter table public.user_settings enable row level security;

create policy "own sessions select" on public.sessions for select using (auth.uid() = user_id);
create policy "own sessions insert" on public.sessions for insert with check (auth.uid() = user_id);
create policy "own sessions update" on public.sessions for update using (auth.uid() = user_id);
create policy "own sessions delete" on public.sessions for delete using (auth.uid() = user_id);

create policy "own settings select" on public.user_settings for select using (auth.uid() = user_id);
create policy "own settings insert" on public.user_settings for insert with check (auth.uid() = user_id);
create policy "own settings update" on public.user_settings for update using (auth.uid() = user_id);

-- 4. 原子替换某用户全部记录（事务内 delete+insert，内部用 auth.uid() 保证安全）
create or replace function public.replace_sessions(p_sessions jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.sessions where user_id = auth.uid();
  insert into public.sessions (id, user_id, date, minutes)
  select (x->>'id'), auth.uid(), (x->>'date')::date, (x->>'minutes')::int
  from jsonb_array_elements(p_sessions) x
  where (x->>'id') is not null
    and (x->>'date') is not null
    and (x->>'minutes') is not null;
end;
$$;

grant execute on function public.replace_sessions(jsonb) to anon, authenticated;
