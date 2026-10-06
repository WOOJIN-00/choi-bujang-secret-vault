-- 2단계: 가상 메모를 코드 밖(학습용 Supabase 테이블)으로 옮깁니다.
-- Supabase 대시보드의 SQL Editor에 이 파일 전체를 붙여넣고 Run 하세요.
-- 실제 키는 필요 없습니다. 이 파일에는 비밀번호·토큰·키를 넣지 않습니다.

-- 1) 테이블: 메모를 서버 쪽에 보관합니다.
--    owner_id 칸은 미리 둡니다. 아직 auth.users 외래키는 걸지 않습니다(이후 단계에서 연결).
create table if not exists public.secret_notes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid,                         -- 소유자 자리. auth.users 외래키는 아직 없음.
  title      text not null,
  content    text not null,
  created_at timestamptz not null default now()
);

-- 2) RLS를 켭니다. 정책이 하나도 없으면 기본은 '전부 거부'입니다.
--    anon·authenticated에는 어떤 select/insert/update/delete 정책도 주지 않으므로
--    공개 클라이언트(브라우저 anon 키, 로그인 사용자)는 이 테이블을 읽지 못합니다.
--    서버 전용 service_role 키는 RLS를 우회하므로, 자료 읽기는 서버에서만 합니다.
alter table public.secret_notes enable row level security;

-- (명시 강조) 혹시 이전 실습에서 만든 정책이 남아 있다면 지워서 '읽기 권한 없음'을 확실히 합니다.
drop policy if exists "anon can read" on public.secret_notes;
drop policy if exists "authenticated can read" on public.secret_notes;

-- 3) 가상 메모를 옮겨 담습니다. 메모 본문은 저장소 파일에 적지 않습니다.
--    아래 템플릿의 <제목>·<내용>을 SQL Editor에서 본인 메모로 직접 채워 실행하세요.
--    owner_id는 비워 둡니다(아직 소유자 연결 전).
--    주의: 다시 실행하면 행이 중복 추가됩니다. 비우고 다시 넣으려면 아래 truncate 주석을 푸세요.
-- truncate table public.secret_notes;
-- insert into public.secret_notes (title, content) values
--   ('<제목>', '<내용>'),
--   ('<제목>', '<내용>'),
--   ('<제목>', '<내용>'),
--   ('<제목>', '<내용>');

-- 4) 확인용 조회(이 창은 service_role 권한으로 실행되어 보입니다).
--    브라우저 anon 키로는 RLS 때문에 빈 결과가 나와야 정상입니다.
select id, owner_id, title, content, created_at from public.secret_notes order by created_at;
