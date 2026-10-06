-- 4단계 준비(SQL만): 사용자별 소유자 연결.
--   - 기존 가상 메모(소유자 미지정)를 전부 A 소유로 연결합니다.
--   - B 소유의 공개 가능한 시험 메모 1건을 추가합니다(실습용 가상 자료).
-- 이 단계는 소유자 값만 채웁니다. API(api/notes.js)와 권한 정책(RLS)은 바꾸지 않습니다.
--
-- 사용법: Supabase SQL Editor에 붙여넣고 아래 <A의 이메일>·<B의 이메일>을
--         본인 A·B 계정 이메일로 바꾼 뒤 실행하세요.
--         두 계정은 미리 Authentication → Users에 있어야 ID를 찾을 수 있습니다.
--         (이메일은 개인정보이므로 저장소 파일에는 실제 값을 남기지 마세요.)

do $$
declare
  a_id uuid := (select id from auth.users where lower(email) = lower('<A의 이메일>'));
  b_id uuid := (select id from auth.users where lower(email) = lower('<B의 이메일>'));
begin
  -- 안전장치: 이메일로 못 찾으면 멈춰서 잘못된 소유자 연결을 막습니다.
  if a_id is null then raise exception 'A 계정 이메일을 auth.users에서 찾지 못했습니다. 이메일/계정을 확인하세요.'; end if;
  if b_id is null then raise exception 'B 계정 이메일을 auth.users에서 찾지 못했습니다. 이메일/계정을 확인하세요.'; end if;

  -- 소유자 미지정(기존) 메모 전부를 A에게 연결
  update public.secret_notes
  set owner_id = a_id
  where owner_id is null;

  -- B 소유의 공개 가능한 시험 메모 1건(이미 있으면 중복 추가하지 않음)
  insert into public.secret_notes (owner_id, title, content)
  select b_id, 'B 시험 메모', '실습용 가상 시험 메모 (B 소유)'
  where not exists (
    select 1 from public.secret_notes where owner_id = b_id
  );
end $$;

-- 확인: 소유자(이메일)별로 메모와 owner_id가 올바른지 봅니다.
select u.email, n.title, n.content, n.owner_id
from public.secret_notes n
join auth.users u on u.id = n.owner_id
order by u.email, n.created_at;
