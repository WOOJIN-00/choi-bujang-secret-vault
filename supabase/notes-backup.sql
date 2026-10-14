-- 10단계(제안, SQL만): 비공개 가상 메모 '사본(백업)' 테이블과 복원 감사 테이블을 만듭니다.
-- Supabase SQL Editor에 붙여넣고 Run 하세요. 이 파일에는 비밀번호·토큰·키·실제 본문을 넣지 않습니다.
-- 사본은 앱(api/notes.js)이 메모 생성(POST /api/notes) 시점에 자동으로 채웁니다.
-- 아래 3)의 초기 담기는 '이미 있던 메모'도 사본에 넣기 위한 선택 단계입니다(없어도 동작).

-- 내용 해시(SHA-256)에 필요한 확장. Supabase는 extensions 스키마에 둡니다.
create extension if not exists pgcrypto with schema extensions;

-- 1) 비공개 사본 테이블. RLS로 공개 클라이언트(anon·authenticated) 접근을 막습니다(서버 service_role만).
--    content_sha256 = 앱(api/_restore.js)의 contentHash와 같은 방식: content의 SHA-256 소문자 16진수.
create table if not exists public.secret_notes_backup (
  id             uuid primary key,
  owner_id       uuid not null,
  title          text not null,
  content        text not null,
  content_sha256 text not null,
  backed_up_at   timestamptz not null default now()
);
alter table public.secret_notes_backup enable row level security;
drop policy if exists "anon can read backup" on public.secret_notes_backup;
drop policy if exists "authenticated can read backup" on public.secret_notes_backup;

-- 2) 복원 감사 테이블. 한 건 복원마다 '추가'만 하고 과거 기록은 지우지 않습니다.
create table if not exists public.restore_audit (
  audit_id       bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  action         text not null,
  actor          uuid,
  note_id        uuid not null,
  owner_id       uuid not null,
  content_sha256 text not null
);
alter table public.restore_audit enable row level security;
drop policy if exists "anon can read audit" on public.restore_audit;
drop policy if exists "authenticated can read audit" on public.restore_audit;

-- 3) (선택) 안전한 시점에 이미 있던 메모도 사본으로 담습니다. 생성 시점 사본은 유지하기 위해
--    같은 id가 이미 있으면 덮어쓰지 않습니다(do nothing).
insert into public.secret_notes_backup (id, owner_id, title, content, content_sha256)
select id, owner_id, title, content, encode(extensions.digest(content, 'sha256'), 'hex')
from public.secret_notes
where owner_id is not null
on conflict (id) do nothing;

-- 4) 확인(service_role 창): 사본 건수와 내용 해시가 들어왔는지 봅니다.
select id, owner_id, title, content_sha256 from public.secret_notes_backup order by backed_up_at;
