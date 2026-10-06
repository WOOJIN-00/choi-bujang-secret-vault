-- 5단계(DB): public.secret_notes 의 '직접' 접근 권한을 PUBLIC·anon·authenticated 에서 모두 회수.
--   - 자료 요청은 서버 함수 한곳(/api/*)으로만 들어오고, 서버는 service_role 키로 접근합니다.
--   - 그래서 클라이언트 역할(anon·authenticated)과 PUBLIC 은 테이블에 직접 접근할 필요가 없습니다.
--   - service_role·테이블 소유자 권한은 건드리지 않으므로 서버 함수는 그대로 동작합니다.
-- 다른 테이블은 건드리지 않습니다. 실행 순서: [적용 전] → [적용] → [적용 후].
--
-- 참고: 4단계의 supabase/rls-secret-notes.sql 에서 authenticated 에 DML 을 GRANT 했다면,
--       이 묶음이 그것을 회수해 '클라이언트 직접 접근 없음' 상태로 만듭니다(5단계 최종 상태).

-- ========== [적용 전] 현재 권한 ==========
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'secret_notes'
order by grantee, privilege_type;

select r as role,
       has_table_privilege(r, 'public.secret_notes', 'SELECT') as can_select,
       has_table_privilege(r, 'public.secret_notes', 'INSERT') as can_insert,
       has_table_privilege(r, 'public.secret_notes', 'UPDATE') as can_update,
       has_table_privilege(r, 'public.secret_notes', 'DELETE') as can_delete
from unnest(array['anon', 'authenticated', 'service_role']) as r;


-- ========== [적용] 직접 권한 회수 ==========
revoke all on table public.secret_notes from public;
revoke all on table public.secret_notes from anon;
revoke all on table public.secret_notes from authenticated;
-- (RLS 는 켜 둔 채로 둬도 됩니다. 직접 GRANT 가 없으면 anon·authenticated 는 어차피 접근 불가입니다.)


-- ========== [적용 후] 대조 ==========
-- 기대: anon·authenticated 는 행이 없고 네 칸 모두 false, service_role 은 그대로 true(서버 경로 유지).
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'secret_notes'
order by grantee, privilege_type;

select r as role,
       has_table_privilege(r, 'public.secret_notes', 'SELECT') as can_select,
       has_table_privilege(r, 'public.secret_notes', 'INSERT') as can_insert,
       has_table_privilege(r, 'public.secret_notes', 'UPDATE') as can_update,
       has_table_privilege(r, 'public.secret_notes', 'DELETE') as can_delete
from unnest(array['anon', 'authenticated', 'service_role']) as r;
