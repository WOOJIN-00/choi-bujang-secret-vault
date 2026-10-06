-- 4단계(DB): public.secret_notes 에만 RLS + 최소 권한. 다른 테이블은 건드리지 않습니다.
-- 실행 순서: [적용 전 확인] 블록 → [적용] 블록 → [적용 후 확인] 블록.
--
-- 참고: 앱 API는 service_role 키(BYPASSRLS)를 써서 RLS를 우회합니다.
--       그래서 A/B 행 격리는 이미 앱 코드(api/*)가 owner_id로 처리합니다.
--       아래 정책은 anon·authenticated가 DB에 '직접' 접근할 때의 최소 권한·행 격리(심층 방어)입니다.
--       auth.uid()는 사용자 JWT(authenticated)로 접근할 때만 값이 있고, service_role에선 RLS 자체가 우회됩니다.

-- ========== [적용 전 확인] ==========
-- 1) 테이블 권한(GRANT) 목록
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'secret_notes'
order by grantee, privilege_type;

-- 2) 두 역할의 실제 권한
select r as role,
       has_table_privilege(r, 'public.secret_notes', 'SELECT') as can_select,
       has_table_privilege(r, 'public.secret_notes', 'INSERT') as can_insert,
       has_table_privilege(r, 'public.secret_notes', 'UPDATE') as can_update,
       has_table_privilege(r, 'public.secret_notes', 'DELETE') as can_delete
from unnest(array['anon', 'authenticated']) as r;


-- ========== [적용] ==========
-- 1) RLS 켜기(+ 테이블 소유자에게도 정책 강제)
alter table public.secret_notes enable row level security;
alter table public.secret_notes force row level security;

-- 2) 기존 권한 회수(최소 권한 시작점)
revoke all on table public.secret_notes from public;
revoke all on table public.secret_notes from anon;
revoke all on table public.secret_notes from authenticated;

-- 3) authenticated 에만 네 가지 DML 권한 부여(anon 에는 아무 권한도 주지 않음)
grant select, insert, update, delete on table public.secret_notes to authenticated;

-- 4) 행 단위 정책: 모두 auth.uid() = owner_id 일 때만
drop policy if exists secret_notes_select_own on public.secret_notes;
drop policy if exists secret_notes_insert_own on public.secret_notes;
drop policy if exists secret_notes_update_own on public.secret_notes;
drop policy if exists secret_notes_delete_own on public.secret_notes;

-- SELECT: 기존 행이 내 것일 때만 보임 (USING)
create policy secret_notes_select_own on public.secret_notes
  for select to authenticated
  using (auth.uid() = owner_id);

-- INSERT: 새 행의 소유자가 나일 때만 허용 (WITH CHECK)
create policy secret_notes_insert_own on public.secret_notes
  for insert to authenticated
  with check (auth.uid() = owner_id);

-- UPDATE: 기존 행이 내 것(USING)이고, 바뀐 행도 내 것(WITH CHECK)일 때만 → 소유자 변경 불가
create policy secret_notes_update_own on public.secret_notes
  for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- DELETE: 기존 행이 내 것일 때만 삭제 (USING)
create policy secret_notes_delete_own on public.secret_notes
  for delete to authenticated
  using (auth.uid() = owner_id);


-- ========== [적용 후 확인] ==========
-- 1) 테이블 권한(GRANT) 목록 — anon 은 없어야 하고, authenticated 는 네 가지만 남아야 함
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'secret_notes'
order by grantee, privilege_type;

-- 2) 두 역할의 실제 권한 — anon 전부 false, authenticated 네 가지만 true
select r as role,
       has_table_privilege(r, 'public.secret_notes', 'SELECT') as can_select,
       has_table_privilege(r, 'public.secret_notes', 'INSERT') as can_insert,
       has_table_privilege(r, 'public.secret_notes', 'UPDATE') as can_update,
       has_table_privilege(r, 'public.secret_notes', 'DELETE') as can_delete
from unnest(array['anon', 'authenticated']) as r;

-- 3) 적용된 정책 목록 확인
select policyname, cmd, qual as using_expr, with_check
from pg_policies
where schemaname = 'public' and tablename = 'secret_notes'
order by policyname;
