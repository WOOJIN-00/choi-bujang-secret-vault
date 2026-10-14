-- 11단계(제안, SQL만): 기기 승인 표. 승인 여부는 '서버 쪽'에서만 정합니다.
-- Supabase SQL Editor에 붙여넣고 Run 하세요. 이 파일에는 비밀번호·토큰·키를 넣지 않습니다.
-- 승인은 버튼 클릭이나 브라우저 저장소가 아니라, 아래 표의 approved 값(서버/관리자가 지정)으로만 판단합니다.

create table if not exists public.device_approvals (
  user_id      uuid primary key,          -- 검증된 사용자 신원(기기 키를 브라우저에 저장하지 않음)
  requested_at timestamptz,               -- 승인 '요청'이 들어온 시각(POST /api/device)
  approved     boolean not null default false,  -- 서버/관리자가 직접 true 로 바꿀 때만 승인
  approved_at  timestamptz
);

-- RLS: anon·authenticated 직접 접근 차단(서버 service_role만 읽고 씁니다).
alter table public.device_approvals enable row level security;
drop policy if exists "anon can read device" on public.device_approvals;
drop policy if exists "authenticated can read device" on public.device_approvals;

-- 승인하기(관리자/서버): 아래 <사용자 이메일>을 본인 A/B 계정 이메일로 바꿔 실행하면
-- 그 계정(기기)을 승인 기기로 등록합니다. 이 명령은 버튼이 아니라 서버 쪽에서만 수행합니다.
-- update public.device_approvals set approved = true, approved_at = now()
-- where user_id = (select id from auth.users where lower(email) = lower('<사용자 이메일>'));
-- (행이 아직 없으면, 화면에서 '승인 요청'을 한 번 누른 뒤 위 update 를 실행하거나, 아래로 직접 넣습니다.)
-- insert into public.device_approvals (user_id, requested_at, approved, approved_at)
-- select id, now(), true, now() from auth.users where lower(email) = lower('<사용자 이메일>')
-- on conflict (user_id) do update set approved = true, approved_at = now();

-- 확인: 승인 상태를 봅니다(service_role 창).
select user_id, requested_at, approved, approved_at from public.device_approvals order by requested_at;
