-- 10단계(제안, SQL만): 비공개 가상 메모 '사본(백업)' 테이블과 복원 감사 테이블을 만듭니다.
-- Supabase SQL Editor에 붙여넣고 Run 하세요. 이 파일에는 비밀번호·토큰·키·실제 본문을 넣지 않습니다.
-- 백업 내용은 기존 secret_notes에서 복사하며, 저장소 파일에는 메모 본문을 남기지 않습니다.

-- 내용 해시(SHA-256)에 필요한 확장. 이미 있으면 통과합니다.
create extension if not exists pgcrypto;

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

-- 3) 침해 전 안전한 상태에서, 현재 secret_notes를 사본으로 담습니다(내용 해시 포함).
--    이미 같은 id가 있으면 사본 내용을 현재 값으로 갱신합니다. 안전한 시점에만 실행하세요.
insert into public.secret_notes_backup (id, owner_id, title, content, content_sha256)
select id, owner_id, title, content, encode(digest(content, 'sha256'), 'hex')
from public.secret_notes
where owner_id is not null
on conflict (id) do update
  set owner_id = excluded.owner_id,
      title = excluded.title,
      content = excluded.content,
      content_sha256 = excluded.content_sha256,
      backed_up_at = now();

-- 4) 확인(service_role 창): 사본 건수와 B 시험 메모의 내용 해시가 들어왔는지 봅니다.
select id, owner_id, title, content_sha256 from public.secret_notes_backup order by backed_up_at;
