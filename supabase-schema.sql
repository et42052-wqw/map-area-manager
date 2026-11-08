-- Supabase SQL Editor에서 전체 실행
create table if not exists public.areas (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  description text not null default '',
  points jsonb not null,
  created_at bigint not null
);

alter table public.areas enable row level security;

-- 로그인한 사용자는 본인 데이터만 조회·등록·수정·삭제할 수 있음
 drop policy if exists "Users can manage their own areas" on public.areas;
create policy "Users can manage their own areas"
on public.areas
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update, delete on public.areas to authenticated;
