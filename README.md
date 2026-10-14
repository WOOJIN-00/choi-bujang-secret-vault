# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있습니다. `/data.json`에는 같은 가상 메모가 공개됩니다. 이 공개 상태를 확인하는 것이 1단계의 출발점입니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

## 설치·실행·중지·복구 안내 (재현 순서)

학생 판정기·탐지 규칙·접속 앱·자료실을 처음부터 다시 세우고, 돌리고, 멈추고, 되살리는 순서입니다. 아래 내용은 코드와 실제 실행으로 확인한 것만 적었고, 확인하지 못한 것은 그렇게 표시했습니다.

### 0. 기준 커밋과 확인 범위
- **검사한 커밋: `0dc067b`**(이 안내를 쓰기 직전의 마지막 커밋). 이 커밋의 코드로 아래 시험을 실행해 수치를 얻었습니다. 안내와 함께 바뀐 것은 README와 `supabase/notes-backup.sql`의 낡은 설명 주석뿐이며 코드는 같습니다.
- **배포 환경에서 실제로 확인한 마지막 커밋은 `7839b9d`입니다.** 이후 `e5a3e33`(탈환 작전실)·`0dc067b`(재시험 표)는 작성 시점에 push 전이라 **배포 환경 결과가 없습니다.**
- 로컬에서 측정한 시험(작성 시점): `decider:test` 4/4 · `detect:test` 6/6 · `restore:test` 6/6 · `ops:test` 15/15 · `retest:test` 26/26 · `fixture:7`(정상 `allow`, 복합 이상 `step_up`) · `policy:diff`(변경 없음) · `build -- --local` 정상.
- **시작 틀의 옛 시험 두 개는 통과하지 않습니다**(`test:r5`, `test:package`). 둘 다 1단계 시작 틀의 모양을 기대하는데(배포 식별 파일의 항목 7개, `api/`에 `ai.js`·`threat-intel.js`만 존재) 2단계 이후 단계 지시에 따라 항목과 파일이 늘어 기대와 어긋났습니다. 제공물이라 고치지 않았고, 이 안내의 재현 순서에는 쓰지 않습니다.

### 1. 학생 몫과 제공물의 구분
| 구분 | 무엇 | 출처 |
|---|---|---|
| **제공 엔진** | **ALEPH SDP 엔진** — 요청의 신원·기기·경로를 확인해 `decide(request)`에 전달하고, 탐지 사건을 전달하고, 회수를 집행하는 쪽 | **제공된 엔진을 사용합니다. 이 저장소에는 엔진 코드가 없고**(`student-kit`·`sdp-core` 폴더 없음) 계약 설명([docs/DECIDER_REQUEST.md](docs/DECIDER_REQUEST.md), [docs/DETECT_EVENTS.md](docs/DETECT_EVENTS.md))만 있습니다. 학생이 만들거나 고치지 않았습니다. |
| **제공 시작 틀** (처음 커밋 `7230b4b`) | 로그인 검사기 `src/verify-login.mjs`, 계약 문서 `docs/*`, 시험·제출 스크립트(`scripts/decider-test.mjs`·`detect-test.mjs`·`fixture-7.mjs`·`bundle.mjs`), 서버 뼈대 `api/ai.js`·`api/threat-intel.js`, `xdr/fixtures` | 처음 커밋 그대로입니다(수정 없음). |
| **제공 뼈대를 학생이 채운 것** | `src/decider.mjs`(기본은 전부 거부 → 규칙 3개), `src/detect.mjs`(기본은 아무것도 회수하지 않음 → 탐지 규칙) | 뼈대는 제공, **규칙 내용은 학생 몫**입니다(처음 커밋 대비 +180줄·+60줄). |
| **제공 설정을 학생이 맞춘 것** | `aleph.config.json`, `package.json`, `vercel.json`, `scripts/build-public.mjs`·`deployment-identity.mjs`, `src/attack-check.mjs` | 단계 지시에 따라 몇 줄씩 바꿨습니다. `judgeIssuer`는 운영 측이 채운 값이라 바꾸지 않았습니다. |
| **학생이 새로 만든 것** | 자료실 서버 함수 `api/*`, 접속 앱 화면 `public/*`, 복구 `backups/*`·`policy/*`·`scripts/policy-*`·`scripts/restore-test.mjs`, 작전실 `api/ops.js`·`public/ops.html`, 재시험 표 `scripts/retest*.mjs`, 표 생성 SQL `supabase/*`, 보너스 `xdr/brute-force`·`xdr/web-injection` | 처음 커밋에 없던 파일입니다. |

### 2. 준비물과 비밀값
- Node.js 22 이상(`package.json`의 `engines`; 이 PC에서는 24.19.0으로 실행), npm, GitHub 저장소, Vercel 프로젝트, Supabase 프로젝트.
- 서버가 읽는 환경변수는 **이름 네 개**입니다. 값은 Vercel 프로젝트의 환경변수 화면에만 직접 넣고 **코드·Git·제출 묶음·로그·이 README에 적지 않습니다**(`.env`와 `.env.*`는 `.gitignore`에 들어 있습니다).

| 이름 | 용도 | 서버 전용 |
|---|---|---|
| `SUPABASE_URL` | Supabase 프로젝트 주소 | — |
| `SUPABASE_PUBLISHABLE_KEY` | 화면 로그인용 공개 키(`/api/public-config`가 돌려줌) | 아님(공개용) |
| `SUPABASE_SECRET_KEY` | 서버가 자료를 읽고 쓰는 키 | **예 — 화면·Git에 절대 넣지 않음** |
| `INSTRUCTOR_USER_IDS` | 강사 사용자 ID 목록(쉼표 구분, 선택) | 예 |

- 시험 계정(A·B)의 이메일·비밀번호는 저장소에 적지 않습니다. 재시험 때만 터미널 환경변수로 넣습니다(아래 12단계의 "정상·금지 요청 재시험 표 (제작 2)" 절에 방법이 있습니다).

### 3. 설치 (처음 한 번)
1. 저장소를 받고 `npm install`을 실행합니다. 새 클론에서 오류 없이 끝나는 것을 확인했습니다.
2. Supabase **SQL Editor**에 `supabase/`의 파일을 아래 순서로 붙여 넣고 Run 합니다. 파일 안의 `<제목>`·`<A의 이메일>`처럼 **꺾쇠가 있는 자리는 꺾쇠까지 통째로 본인 값으로 바꿉니다**(바꾸지 않으면 아무 행도 처리되지 않습니다). 실제 메모 본문·이메일은 저장소 파일에 남기지 않습니다.

| 순서 | 파일 | 하는 일 |
|---|---|---|
| 1 | `secret-notes.sql` | 가상 메모 표 `secret_notes`(RLS로 공개 읽기 차단) |
| 2 | `assign-owners.sql` | 메모에 소유자 A를 연결하고 B의 시험 메모 1건 추가 |
| 3 | `rls-secret-notes.sql` | **제안** — 소유자별 접근 정책(적용 여부는 직접 판단) |
| 4 | `revoke-direct-access.sql` | **제안** — 공개·로그인 사용자의 표 직접 권한 회수 |
| 5 | `device-approvals.sql` | 기기 승인 표 `device_approvals` |
| 6 | `notes-backup.sql` | 복구 감사 표 `restore_audit`(+ 옛 DB 사본 표는 현재 코드가 쓰지 않음) |

3. Vercel → 프로젝트 환경변수에 위 이름 세 개(+선택 하나)를 넣고 **재배포**합니다. 값이 없으면 `/api/notes`는 500(`NOTES_BACKEND_NOT_CONFIGURED`)을 돌려줍니다.
4. Supabase **Authentication → Users**에서 로그인할 계정을 만듭니다.

### 4. 실행
- **로컬(화면 미리보기와 시험)**: `npm run build -- --local`로 정적 화면을 만들고, 아래 시험 명령을 돌립니다. **서버 함수(`/api/*`)는 로컬에서 실행해 보지 않았습니다**(`vercel` CLI가 이 저장소에 설치돼 있지 않고 이 PC에서 확인하지 못함). 서버 함수의 실제 동작은 Vercel 배포에서만 확인했습니다.
- **배포**: 변경을 `git push origin main` 하면 Vercel이 자동으로 다시 배포합니다. 배포가 **Ready**가 된 뒤 `/aleph.json`의 `commit`이 방금 push한 커밋인지 확인합니다.
- **접속 앱(자료실)을 처음 여는 순서**: 배포 주소 → 로그인 → 기기가 **미승인이면 자료가 비어 있고** "이 기기 승인 요청" 버튼만 보입니다(요청만 기록, 승인 아님) → 서버/관리자가 `device-approvals.sql`의 `update … set approved = true`로 해당 계정을 승인 → 새로고침 후 다시 로그인하면(세션을 브라우저 저장소에 남기지 않아 새로고침하면 다시 로그인) 자료실이 열립니다.
- **판정기·탐지 규칙 확인**(가상 입력 연습이며 반 엔진·심판의 판정이 아닙니다):
  - `npm run decider:test` — 4줄 모두 `통과`(등록 기기 정상 allow / 미등록 deny / 복합 이상 step_up / 다시 확인하면 allow)
  - `npm run fixture:7` — `정상 사건: allow` · `복합 이상 사건: step_up`
  - `npm run detect:test` — 6줄 모두 `통과`(10분 안 120건까지는 observe, 121건부터 회수 제안)
  - 판정기 규칙은 `device_registered`·`step_up_required`·`resource_zone` 세 개이고, 탐지 규칙은 `burst_read` 하나입니다. **회수 제안은 계산만 하며 실제 접속 회수 집행은 연결돼 있지 않습니다(미실행).**

### 5. 중지
이 저장소에는 서버를 끄는 코드가 없습니다. 접근을 멈추는 방법은 아래 세 가지이고, **1번만 코드로 동작을 확인**했습니다.
1. **기기 승인 취소(권장, 즉시)**: SQL Editor에서 `update public.device_approvals set approved = false where user_id = (select id from auth.users where lower(email) = lower('<이메일>'));` — `<이메일>`은 꺾쇠까지 본인 값으로 바꿉니다. 이후 그 계정의 `/api/notes` 조회는 빈 목록, 쓰기는 403, 단일 자료 조회는 404가 됩니다(`api/notes.js`·`api/notes/[id].js`의 승인 확인).
2. **계정 차단**: Supabase Authentication → Users에서 해당 계정을 삭제하거나 비활성화합니다(이 PC에서 실행해 보지 않음).
3. **배포 중지**: Vercel에서 배포를 삭제하거나 프로젝트를 멈춥니다(이 PC에서 실행해 보지 않음).

화면의 로컬 시험 서버는 따로 띄우지 않으므로 끌 것이 없습니다.

### 6. 복구
복구는 **검증한 사본으로만, 바뀔 항목을 먼저 보고, 한 건씩** 합니다. 자세한 규칙은 아래 "10단계 현재 상태 (백업에서 자료실을 되살립니다)" 절에 있고, 순서만 적으면 이렇습니다.
1. **정책**: `npm run policy:diff`로 검증한 정책 사본(`backups/verified-policy.json` 계열)과 현재 시험 정책(`policy/test-policy.json`)의 차이만 봅니다 → 필요하면 `npm run policy:restore`로 미리보기 → `npm run policy:restore -- --apply`로 되돌립니다. 사본이 없거나 검증에 실패하면 멈춥니다. 운영 정책(`src/decider.mjs`·`aleph.config.json`)은 쓰지 않습니다.
2. **자료 한 건**: `GET /api/restore?id=<메모 id>`로 복구할 버전과 `planToken`을 먼저 확인 → 로그인한 상태로 `POST /api/restore` 본문 `{ "id": "…", "planToken": "…" }`. 사본(`backups/notes.json`)이 장부(`backups/manifest.json`)의 해시와 어긋나면 `412`로 멈추고, 미리보기 없이 보내면 `428`입니다. **복구 적용은 자료를 바꾸므로 자동 시험에서는 실행하지 않았고, 이 PC에서 실제로 실행해 보지 않았습니다(미실행).**
3. `backups/*.json`을 직접 고치면 장부 해시와 어긋나 복구가 멈춥니다(의도된 동작). **장부를 다시 만드는 스크립트는 없습니다**(처음 만들 때 한 번 계산해 적었습니다).
4. 복구 뒤에는 `npm run retest`로 정상 요청 허용과 금지 요청 거부를 한 표로 다시 확인합니다.

### 7. 한 번에 따라 하는 재현 순서
1. `npm install` → 오류 없이 끝나는지 확인.
2. `npm run decider:test`, `npm run detect:test`, `npm run fixture:7`, `npm run restore:test`, `npm run ops:test`, `npm run retest:test` → 모두 통과(위 수치와 같아야 함).
3. `npm run build -- --local` → "공개 자료를 복사했습니다" 한 줄.
4. SQL 6개를 순서대로 실행하고 Vercel 환경변수를 넣은 뒤 push → 배포 Ready 확인.
5. 배포 주소에서 로그인 → 미승인이면 자료가 비어 있음을 확인 → 승인 후 자료실이 열리는지 확인.
6. `npm run retest` → 표의 정상 허용과 금지 거부가 실측으로 남는지 확인(A·B 계정 행은 환경변수가 있어야 실측). **12단계 41종 공격 방어는 이 표에서 항상 미실행이며 심판이 판정합니다.**
7. 제출 전 `npm run bundle`(작업 트리가 깨끗해야 하고, `bundle-notes.json`과 `artifacts/`는 커밋하지 않습니다).

> 위 안내는 **사용한 제공 엔진(ALEPH SDP 엔진)** 과 **학생이 만든 것**을 구분해 적었습니다. 엔진의 실제 판정·사건 전달·회수 집행은 이 저장소에서 확인할 수 없으며, 배포 환경 결과는 `7839b9d`까지만 있습니다.

## 2단계 현재 상태와 남은 약점

가상 메모 네 건은 이제 코드·공개 정적 파일이 아니라 Supabase 테이블(`secret_notes`, RLS로 공개 읽기 차단)에 있습니다. 화면 `/`는 서버 함수 `api/notes.js`를 통해 메모를 읽고, `/data.json`에는 메모가 더 이상 없습니다. 서버 함수는 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY`를 Vercel 환경변수에서 읽으며, 이 값들은 코드·Git·응답·로그에 넣지 않습니다.

**다시 실행하는 방법:** (1) Supabase SQL Editor에서 `supabase/secret-notes.sql` 실행 → `secret_notes`에 4건. (2) Vercel → Settings → Environment Variables에 `SUPABASE_URL`·`SUPABASE_SECRET_KEY`(service_role) 넣고 Redeploy. (3) `git push origin main` 하면 자동 재배포. 로컬 정적 미리보기만 볼 때는 `npm run build -- --local`(서버 함수 `/api/*`는 실제 배포 또는 `vercel dev`에서만 동작).

## 3단계 현재 상태

화면에 Supabase Auth 이메일·비밀번호 로그인/로그아웃이 붙었고, 자료 API `/api/notes`는 요청의 `Authorization` 토큰을 틀의 `src/verify-login.mjs`로 검사합니다(브라우저가 보낸 `userId`·`role`은 신뢰하지 않음). 토큰이 없거나 검사에 실패하면 **401로 자료 없이 거부**하고, 정상 로그인만 메모 4건을 받습니다. 발급자 정보는 `aleph.config.json`의 `identityProvider`(`issuer`·`jwksUrl`·`audience`)에 있으며 **비밀 키는 없습니다**. 공개 publishable 키만 화면 코드에 있습니다.

**다시 실행하는 방법(3단계):** Vercel 환경변수 `SUPABASE_URL`·`SUPABASE_SECRET_KEY`(service_role)를 넣고 **재배포**해야 `/api/notes`가 동작합니다. 없으면 500 `NOTES_BACKEND_NOT_CONFIGURED`가 납니다. 로그인할 A 계정은 Supabase Authentication → Users에서 만듭니다.

> 검증 메모: 코드·설정은 로컬 문법/`verifiedConfig` 검사를 통과했으나, 작성 시점의 실배포는 환경변수 미설정으로 `/api/notes`가 500이었습니다. 실배포 동작은 환경변수 반영·재배포 후 확인해야 합니다.

## 4단계 현재 상태

로그인해도 '내 자료'만 보이도록 소유자 검사를 붙였습니다. 자료 API는 **검증된 토큰의 `userId`만** 소유자로 쓰고(URL·본문의 `owner_id`는 무시), `secret_notes.owner_id`와 비교합니다.
- `GET /api/notes`(내 목록) · `POST /api/notes`(내 소유로 추가)
- `GET·PUT·DELETE /api/notes/:id` (모두 `owner_id = 내 id` 조건 → 남의 것·소유자 변경은 거부, 없는 것처럼 404)
- 한 건 응답 `{id,title,body}`, 수정 입력 `{title,body}` (DB `content` ↔ `body`). `aleph.config.json`의 `allowedRoutes`에 위 5개 메서드·경로 기록.

**다시 실행하는 방법(4단계):** (1) `supabase/assign-owners.sql`로 기존 메모를 A 소유로, B 시험 메모 1건 추가(이메일은 SQL Editor에서 직접 채움). (2) 앱은 service_role 키로 `owner_id` 필터링하므로 재배포만 하면 동작. (3) DB 직접 접근 차단은 `supabase/rls-secret-notes.sql`(RLS + 최소 권한) **제안** — 검토 후 SQL Editor에서 실행(앱은 service_role이라 RLS 우회, 심층 방어용).

> 상태 메모: Vercel 환경변수(`SUPABASE_URL`·`SUPABASE_SECRET_KEY`)가 반영돼 비로그인 `/api/notes`는 401로 거부됩니다. `rls-secret-notes.sql`은 아직 '제안'이며, 적용 여부는 학생이 실행으로 확정합니다.

## 5단계 현재 상태

자료 요청은 서버 함수 한곳(`/api/*`)으로만 모읍니다. 브라우저는 Supabase **자료**에 직접 접근하지 않고(로그인 Auth 호출만 유지), 메모 읽기·추가·수정·삭제는 모두 서버 함수를 거칩니다. 서버만 service_role 키로 원본 자료에 접근합니다.
- 원본 자료 경로는 `aleph.config.json`의 `originalApiUrl`에 기록(쿼리 없는 HTTPS: Supabase REST `/rest/v1/secret_notes`).
- `supabase/revoke-direct-access.sql`(**제안**): PUBLIC·anon·authenticated의 테이블 직접 권한을 회수 → 클라이언트 직접 접근 불가(service_role·서버 경로는 유지). 검토 후 학습 DB에서 실행.

> 확인: anon 키로 원본(`/rest/v1/secret_notes`) 직접 요청은 거부되고, 화면의 A 정상 동작(서버 함수 경유)은 유지되어야 합니다.

### 가상 메모 노출 확인 절차

Supabase에 넣은 메모 본문 문구가 공개 위치에 남아 있는지 검색합니다. 검색어(`<메모 본문 문구>`)는 본인이 아는 메모 내용으로 **직접** 바꿔 넣고, 이 저장소 파일에는 적지 마세요. 아래 두 곳을 각각 확인하고 결과를 기록하세요.

1. **현재 배포 파일**(비로그인으로 공개 URL 요청):
   - `curl -s https://<배포주소>/data.json` → `"notes": []`, 메모 문장 없음이 정상.
   - `curl -s https://<배포주소>/ | grep -F "<메모 본문 문구>"` → 아무 줄도 안 나와야 정상(화면 메모는 `/api/notes` 응답으로만 들어옴).
2. **GitHub 최신 파일**(`main` 최신 커밋 기준):
   - 로컬 최신 상태에서 `git grep -n "<메모 본문 문구>" $(git rev-parse HEAD)` → 어떤 파일에서도 안 나와야 정상.
   - GitHub 웹 저장소 검색창에 메모 문구를 넣어 최신 `main`에 공개 메모가 없는지 눈으로 확인.

검색 결과(각 명령의 출력 유무)와 아래 "남은 약점"을 **각각 따로** 기록하세요. 둘은 다른 사안입니다.

**과거 노출은 아직 해소되지 않았습니다.** 이번 변경 이전의 공개 커밋(예: `7230b4b`)과 그 커밋으로 만들어진 옛 배포에는 네 건의 가상 메모가 그대로 남아 있습니다. GitHub 커밋 이력과 이전 배포가 공개로 남아 있는 한, 현재 파일에서 메모가 사라졌어도 **과거 노출이 해소됐다고 적지 마세요.** 과거 노출 해소는 이력·옛 배포까지 정리해야 하는 별도 작업입니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.

## 6단계 현재 상태 (등록한 기기만 자료실에 들어옵니다)

`src/decider.mjs`에 `device_registered` 규칙을 넣었습니다. 엔진이 확인해 넣어 준 `deviceRegistered`가 `true`일 때만 내 자료실 읽기를 **허용(allow)** 하고, 미등록(`false`)이거나 값이 없으면 이유 코드 `device_not_registered`로 **거부(deny)** 합니다.
- `RULE_IDS`에 `device_registered` 추가(기존 `starter.deny` 유지). 응답은 계약의 5개 이름(`schema·requestId·decision·reasonCode·ruleIds`)만 사용.
- 기기 검증은 엔진이 끝내고 불리언으로 전달하므로, **새 인증서·CA·서명 키를 만들거나 설치하는 과정이 없습니다.** 미등록 기기 공격 자체는 심판이 맡습니다.

**다시 실행하는 방법(6단계 확인 순서):**
1. `npm run decider:test` 실행 — 두 줄 모두 `통과`여야 합니다.
   - `통과 · 등록 기기의 정상 요청` (deviceRegistered=true → `allow`)
   - `통과 · 미등록 기기의 가상 요청` (deviceRegistered=false → `deny`, `device_not_registered`)
2. 실제 판정 값까지 눈으로 보려면 같은 규칙을 가상 요청에 직접 넣어 확인합니다(등록=`allow`/`approved`, 미등록=`deny`/`device_not_registered`).

> 이 명령은 가상 요청 연습이며 반 엔진·운영 심판의 판정이 아닙니다. 설치할 접속 프로그램은 없습니다.

## 7단계 현재 상태 (평소와 다른 접속은 다시 확인합니다)

`src/decider.mjs`에 입력 검사와 `step_up_required` 규칙을 넣었습니다. 기존 `device_registered` 규칙은 유지합니다(`RULE_IDS = ['device_registered', 'step_up_required']`).

- **입력 검사 `readAccessContext(request)`**: 엔진이 넘긴 `signals.source`를 `none`/`fixture`/`unclear`로 구분하고, 출처가 없음·불명확이면 지역·시각·네트워크를 `unknown`으로 둡니다(임의 정상값으로 안 채움 → 위조 클라이언트 값이 신뢰 정보로 승격되지 않음). `judge_fixture`는 값은 읽되 실제 위치 증거로 쓰지 않음(`realEvidence=false`).
- **`step_up_required` 규칙**: 등록 기기라도 **평소와 다른 시각 + 처음 보는 네트워크 + 갑자기 많은 자료 읽기**가 함께일 때만 영구 차단이 아닌 **추가 본인 확인(`step_up`)** 을 요구하고 사유를 `reasonCode`로 남깁니다. **지역 하나만으로는 차단하지 않습니다.** 최근 추가 확인을 통과한 요청(`stepUp.verified`, 0~900초)은 다시 묻지 않고 허용합니다.
- **재로그인 시각 계약은 아직 없음**: 엔진 입력의 재인증 계약은 `stepUp:{verified, authAgeSeconds}`뿐이고 별도 "재로그인 시각" 필드는 없습니다. 그래서 가상 사건 수준 재판정만 시험하고 **실제 `api/*` 자료 차단은 미실행**으로 둡니다. 토큰 원문은 어디에도 기록하지 않습니다.

**다시 실행하는 방법(7단계 확인 순서):**
1. `npm run fixture:7` — `정상 사건: allow`, `복합 이상 사건: step_up` 이어야 합니다.
2. `npm run decider:test` — 네 줄 모두 `통과`(등록 정상 allow / 미등록 deny / 복합 이상 step_up / 다시 확인한 복합 이상 allow).

> 가상 요청 연습이며 반 엔진·운영 심판의 판정이 아닙니다. 계약(실경로 신호·재로그인 시각)이 준비되면 그때 실제 자료 차단/허용을 실측합니다.

## 8단계 현재 상태 (자료마다 갈 수 있는 구역을 나눕니다)

`api/_resources.js`에 자원 식별 층을 넣어, 내 자료실 메모와 강사 공지를 **서로 다른 자원 ID 네임스페이스**(구역)로 구분합니다.

- 구역: 내 메모 = `my-notes`(`res:my-notes:note[:<id>]`), 강사 공지 = `instructor-notice`(`res:instructor-notice:notice[:<id>]`). 두 구역의 자원 ID가 서로 달라 섞이지 않습니다.
- `resourceForRequest(request)`가 요청 경로로 구역/자원 ID를 정하고, `api/notes.js`·`api/notes/[id].js`가 응답에 표시합니다(헤더 `X-Resource-Zone`·`X-Resource-Id`, 각 메모에 `resourceId` 필드).
- **보존**: 자료 본문(`id/title/body`)·화면 메뉴(`public/index.html`)는 그대로. 모르는 주소는 `zone: unknown, resourceId: null`로 두고 임의 승격하지 않습니다.
- 강사 공지는 **자원 ID 구역만 등록**했고, 실제 공지 엔드포인트·데이터·메뉴는 아직 붙이지 않았습니다(주소·메뉴 보존).

**판정기 구역 규칙(`src/decider.mjs`, `resource_zone`)**: 서비스·정확한 경로 모양으로 구역을 나눕니다(이전 규칙 유지).

- 메모: 단일 자료 경로(`/notes/:id`)의 GET·PUT·DELETE만 허용, ID 없는 전체 목록·컬렉션(`/notes`, POST)은 거부. `:id`는 UUID로 좁히지 않고, `:id` 깊이에 기능 경로를 두지 않으며, 쿼리로 기능을 고르지 않습니다. 메모 주인 비교는 판정기가 아니라 API에서.
- 반 공지: 읽기(GET)만 허용, 쓰기(POST·PUT·PATCH·DELETE)는 누구에게나 거부. 강사의 공지 수정은 역할 없는 판정기 대신 서버 관리 경로에서.
- 강사 자료·알 수 없는 경로: 모두 거부(`route_not_allowed`).
- `aleph.config.json`의 `allowedRoutes`는 판정기가 허용하는 경로만(메서드 포함): `GET/PUT/DELETE /api/notes/:id`, `GET /api/notices`, `GET /api/notices/:id`.

**API 측 권한 재대조(`api/_authz.js`, 심층 방어)**: 자료 API가 검증된 사용자와 저장된 소유자·강사 권한을 다시 대조합니다.

- 메모 조회/수정/삭제에서 `owner_id`를 함께 읽어 코드로 소유자 재대조 → 없거나 소유자 아님은 `404`(메뉴 우회 직접 요청에도 남의/다른 구역 자료 노출 금지).
- 화면 메뉴·요청 본문의 `role`은 **절대 불신**. 강사 권한은 서버 env `INSTRUCTOR_USER_IDS`(허용목록)에서만 판단(미설정이면 강사 없음). 거부 사유는 짧게(`not_owner`, `not_instructor`).

**다시 실행하는 방법(8단계 확인 순서):**
1. 자원 ID 구별: `node -e "import('./api/_resources.js').then(m=>{console.log(m.resourceForRequest({url:'/api/notes'}));console.log(m.resourceForRequest({url:'/api/notices'}));})"` → 두 요청이 서로 다른 구역/자원 ID.
2. 판정기 구역 규칙: `npm run decider:test`·`npm run fixture:7` 통과(기존 규칙 유지). `GET /notes/:id`는 allow, `GET /notes`·공지 쓰기·강사 자료는 deny.
3. API 권한: 소유자 재대조·본문 role 불신은 `api/_authz.js`가 담당(라이브 소유자 격리는 배포 환경에서 2계정으로 실측).

## 9단계 현재 상태 (도플갱어를 찾고 권한을 거둡니다)

`src/detect.mjs`의 `detect(events)`에 가상 조회 사건 탐지를 넣었습니다. 사건 형식·규칙 계약은 `docs/DETECT_EVENTS.md`.

- **입력 정리(`readEvent`/`readEvents`)**: 각 사건에서 안전한 값만 새 객체로 추립니다 — 가명 사용자(`identity.sub`)·기기(`device`)·요청 종류(`method`)·엔진이 준 판정(`decision`)·시각(`at`). 메모 본문·토큰·실명 등 그 밖의 값은 읽지도 담지도 않고, 원본 사건을 그대로 보관하지 않습니다. 브라우저가 보낸 사용자 번호는 신원으로 쓰지 않습니다.
- **`burst_read` 규칙**: 같은 가명 사용자의 GET이 **어느 10분 구간에서든 120건을 넘을 때만** `{ action: 'propose_revocation', reasonCode: 'burst_read', subject }`를 돌려줍니다. 정확히 120건·10분 밖으로 흩어진 조회·다른 사용자 합산은 의심이 아니라 `observe`입니다.
- **지역/네트워크 단독으로 확정하지 않습니다.** 네트워크 신호는 9단계 사건 계약에 없어 판정에 쓰지 않았습니다(네트워크+조회량 복합 판정은 7단계 `step_up_required`가 담당). `subject`로는 가명만 반환하고 토큰·본문·실명은 노출하지 않습니다.

**다시 실행하는 방법(9단계 확인 순서):**
1. `npm run detect:test` — 여섯 줄 모두 `통과`여야 합니다(정상 30건·10분 내 120건·서로 다른 사용자 각 100건·10분 밖 200건 → `observe` / 10분 내 121건·폭주 200건 → `propose_revocation`).

> 가상 사건 로컬 연습이며 반 엔진·운영 심판의 판정이 아닙니다. 회수 제안을 실제 `api/*` 집행 경로로 전달·집행하는 연결은 아직 미실행입니다.

**단계 번호(`aleph.config.json`의 `step`) 갱신:** 9단계에 맞춰 `step`을 `9`로 올렸습니다. 이에 맞춰 1단계에만 고정돼 있던 `step === 1` 가드(`scripts/build-public.mjs`·`scripts/deployment-identity.mjs`·`src/attack-check.mjs`)를 `1~12` 범위 검사로 바꿔 `npm run build`·`npm run bundle`이 현재 단계에서도 동작하게 했습니다. 공개 `data.json`에는 메모가 없어야 하며(2단계 이후), 배포 식별 `aleph.json`의 `step`도 설정값을 따릅니다. 실제 배포 동작은 `git push` 후 Vercel 재배포로 확인해야 합니다(로컬 빌드만으로는 증명되지 않음).

## 10단계 현재 상태 (백업에서 자료실을 되살립니다)

### 정책 차이 미리보기 (제작 1)
- `npm run policy:diff` — 침해 전 검증한 안전 정책 사본(`policy/verified-policy.json`)과 현재 시험 정책(`policy/test-policy.json`)의 **차이만** 표시(읽기 전용). 사본 없음/검증 실패/시험 정책 이상이면 중단. 운영 정책(`decider.mjs`·`aleph.config.json`)은 읽지도 쓰지도 않습니다.

### 정책 되돌림 절차 (제작 2)
- `npm run policy:restore` — 검증 사본 버전으로 시험 정책(`policy/test-policy.json`)을 되돌립니다. **기본은 미리보기**(바뀔 항목만 표시, 쓰기 없음), `-- --apply` 일 때만 적용합니다.
- 되돌림은 `policy`(ruleIds·allowedRoutes)만 바꾸고 **다른 서비스 규칙(`otherServices` 등)은 보존**합니다. 복원 1건마다 `policy/restore-audit.log`에 **추가(append)** 로 감사 이력을 남깁니다(덮어쓰기 없음). 사본 없음/검증 실패/시험 정책 이상이면 중단합니다.
- 운영 코드·`aleph.config.json`은 건드리지 않습니다. 복원 뒤에는 `resource_zone` 등 규칙이 돌아와, 판정기 기준 **B의 A 자료 경로(`GET /api/notes` 컬렉션·`/admin/export`)는 다시 `route_not_allowed`로 거부**되고 **A의 단일 자료(`GET /api/notes/:id`)는 `allow`**로 유지됩니다.

### 자료 한 건 복원 서비스·경로 (제작 3)
| 서비스 | 경로(메서드) | 하는 일 |
|---|---|---|
| `notes-restore` | **`GET /api/restore?id=<id>`** | 미리보기: 사본을 **다시 읽어 검증**한 뒤 복구할 버전·바뀔 항목·`planToken`을 보여 줌(쓰기 없음) |
| `notes-restore` | **`POST /api/restore`** | 복구: 본문 `{ id, planToken }` — 재검증 통과 시 **지정한 한 건**만 되살림 |

**검증 증거를 저장소 파일로 둡니다(심판이 직접 읽을 수 있게):**
- `backups/notes.json` — 침해 전에 **검증한 시험 계정 B의 가상 메모 사본**(각 메모의 `content`와 `contentSha256`).
- `backups/verified-policy.json` — 검증한 안전 정책 사본.
- `backups/manifest.json` — 위 사본 **각 파일의 LF 정규화 SHA-256을 따로 적은 무결성 장부**(독립 기준). 사본과 장부가 서로 다른 파일이라, 사본만 바꾸면 해시가 어긋나 **변조가 드러납니다**.

**복구 절차(`api/restore.js`) — 검증을 '코드로 할 뿐 아니라 보이게':**
- **복구 직전에 사본을 다시 읽어** `manifest.json`의 해시와 재대조합니다. **해시가 하나라도 어긋나면 `412 BACKUP_UNVERIFIED`로 중단하고 절대 복구하지 않습니다**(검증 실패 뒤 복원 금지 — 닭크웹/변조 공격의 핵심 방어선).
- `GET /api/restore?id=…` 미리보기로 **복구할 버전·바뀔 항목·`planToken`**을 먼저 돌려줍니다. `planToken` 없이 온 `POST`는 `428 PREVIEW_REQUIRED`로 막아, **실행 전에 버전·바뀔 항목을 반드시 확인**하게 합니다.
- 복구는 **인증 주체·자원 ID(`resourceId`)·소유자 키(`ownerKey`)·내용 해시(`contentSha256`)가 모두 맞는 단 한 건**만 수행하고, **복구 직전에 한 번 더 재검증**합니다(이중 대조). 복구 후 저장된 행을 **다시 읽어** 사본 해시와 또 대조합니다.
- 그 **한 건만** `id` 기준 upsert로 되살리고 **다른 메모는 건드리지 않습니다.** 복구 1건마다 `restore_audit`에 **추가(append)**(과거 기록 보존). **운영 정책(`src/decider.mjs`·`aleph.config.json`)은 건드리지 않습니다.**
- 해시는 **LF로 정규화**해 계산하고(Windows CRLF ↔ Vercel LF 차이 방지), `vercel.json`의 `includeFiles`로 `backups/**`를 서버 함수 번들에 포함합니다.
- 판정기·허용 경로 등록: `aleph.config.json`의 `allowedRoutes`·`restoreRoute`에 `POST /api/restore`, `src/decider.mjs`의 `resource_zone`에서 `POST /restore` 한 모양만 허용.

복구 후 1~9단계 재시험 순서는 [docs/RESTORE_RETEST_PLAN.md](docs/RESTORE_RETEST_PLAN.md)에 적었습니다.

**다시 실행하는 방법(10단계 확인 순서):**
1. `npm run restore:test` — 정적 사본(`backups/*.json`)을 장부(`manifest.json`)로 **재대조**하고, 사본이 1자라도 바뀌면 해시가 어긋나 **복구 중단 근거**가 됨을 확인합니다.
2. 라이브(배포): `GET /api/restore?id=<id>`로 버전·바뀔 항목·`planToken` 확인 → `POST /api/restore {id, planToken}` → 그 한 건만 되살아나고 다른 메모·감사 기록은 그대로. 사본이 변조됐으면 `412`로 멈춥니다.

> 사본 검증은 내용 SHA-256 **무결성** 대조입니다. 심판은 배포가 아니라 **저장소 파일(`backups/*.json`·`manifest.json`)과 이 문서**를 읽어 검증 과정을 확인합니다.

## 복구 후 회귀 점검 순서 (1~9단계 정상·금지 요청)

복구가 끝나면 아래 순서로 각 단계의 **정상 요청(통과해야 함)** 과 **금지 요청(다시 거부돼야 함)** 을 함께 실행해, 자료·정책이 돌아오고 이전에 막던 요청이 **다시 거부**되는지 봅니다.

> 아래는 실행 순서와 기대 결과입니다. **작성 시점에 라이브(배포·A/B 계정·Supabase)로 실행하지 않았으므로 상태는 모두 `미실행`입니다.** 실행한 사람이 실제 출력으로 결과를 채우세요. 로컬 스크립트(`decider:test`·`detect:test`·`fixture:7`·`restore:test`)는 **가상 연습**이며 반 엔진·운영 심판의 판정이 아닙니다. 결과를 꾸미지 마세요.

**0. 복구 먼저 (10단계)**
- 정책: `npm run policy:diff`로 바뀔 항목을 먼저 보고, `npm run policy:restore -- --apply`로 검증 사본 버전으로 되돌립니다(다른 서비스 규칙·감사 이력 보존).
- 자료 한 건: B로 로그인 → 메모를 `POST /api/notes`로 만들면 사본이 자동 저장됨 → 그 메모를 변조(`PUT`) → `POST /api/restore` 본문 `{ "id": "<메모 id>" }` → 그 한 건만 되살아나고 다른 메모·감사 기록 보존.
- 상태: 미실행

| 순서 | 단계 | 정상 요청(통과) | 금지 요청(다시 거부) | 상태 |
|---|---|---|---|---|
| 1 | 공개 노출 차단 | `curl -s https://<배포>/` → 화면 200 | `curl -s https://<배포>/data.json` → `"notes": []`, 메모 문장 없음 | 미실행 |
| 2 | 서버 함수 경유 | 로그인 A → 화면에 A 메모 표시(서버 함수) | 비로그인 `GET /api/notes` → `401` | 미실행 |
| 3 | 로그인 토큰 검사 | A 정상 로그인 → `GET /api/notes` `200` | 토큰 없음/위조 → `401` (본문 `userId`·`role` 무시) | 미실행 |
| 4 | 소유자 격리 | A가 자기 메모 `GET /api/notes/:id` → `200` | B가 A 메모 `GET·PUT·DELETE /api/notes/:idA` → `404`, 소유자 변경 무시 | 미실행 |
| 5 | 원본 직접 차단 | 화면 A 동작(서버 함수 경유) | anon 키로 원본 `/rest/v1/secret_notes` 직접 요청 → 거부 | 미실행 |
| 6 | 등록 기기만 | `deviceRegistered=true` → `allow` (로컬 `npm run decider:test`) | 미등록/값 없음 → `deny` `device_not_registered` | 미실행 |
| 7 | 복합 이상 추가확인 | 정상 사건 → `allow` (로컬 `npm run fixture:7`) | 복합 이상(시각+네트워크+폭주) → `step_up` (지역 하나로는 안 막음) | 미실행 |
| 8 | 자원 구역/경로 | `GET /api/notes/:id` → `allow` (로컬 `npm run decider:test`) | `GET /api/notes`(컬렉션)·공지 쓰기·강사/알 수 없는 경로 → `deny` `route_not_allowed` | 미실행 |
| 9 | 폭주 조회 탐지 | 정상 조회 → `observe` (로컬 `npm run detect:test`) | 같은 사용자 10분 내 120건 초과 → `propose_revocation` `burst_read` | 미실행 |

실행 뒤 각 행의 `상태`를 실제 출력(HTTP 코드·판정 값)으로 바꾸고, 실행하지 않은 행은 `미실행`으로 남겨 두세요.

## 11단계 현재 상태 (나만의 접속 앱을 완성합니다)

### 설치형 웹앱 설정 (제작 1)
- `public/manifest.webmanifest`(앱 이름 `BYTE BACK 내 자료실`·`display: standalone`·테마색·아이콘)와 `public/icon.svg`를 추가하고, `public/index.html`에 manifest·테마색·아이콘을 연결했습니다.
- 화면에 **오프라인 안내 배너**(연결 상태만 알림, 보호 판단은 안 함)와 **기기 승인 상태 표시**를 넣되, **설치했다는 표시만으로 기기가 승인된 것은 아님**을 분명히 적었습니다. 별도 접속 프로그램·서비스워커는 만들지 않습니다.

### 기기 승인 흐름 (제작 2)
- **승인은 서버가 정합니다.** 승인 여부는 서버 표 `device_approvals`에서만 읽고, **버튼 클릭·브라우저 저장소로 승인하지 않습니다.** 승인 근거는 서버 표에만 두고 브라우저 저장소·화면·Git·제출물에는 두지 않으며, 승인은 검증된 사용자 신원(`userId`)으로 식별합니다.
- **로그인 토큰도 브라우저 저장소에 넣지 않습니다.** 화면의 Supabase 클라이언트를 `persistSession: false`로 만들어 세션을 **메모리에만** 둡니다(기본값은 `localStorage`에 `sb-…-auth-token`으로 저장되므로 바꿨습니다). 대신 **새로고침하면 다시 로그인**해야 합니다. 로컬에서 SDK를 브라우저 환경으로 흉내 내 측정하면 기본값은 localStorage 1개(토큰 포함), `persistSession:false`는 0개였습니다.
- `GET /api/device` → 이 기기의 승인 상태(`{ approved, requested }`). `POST /api/device` → 승인 **요청만 기록**(`202`), `approved`는 서버/관리자가 `device-approvals.sql`로 따로 `true`로 바꿉니다.
- **승인 전에는 자료실을 열지 않습니다.** 화면은 `GET /api/device`가 `approved:true`일 때만 자료(`/api/notes`)를 불러옵니다. 심층 방어로 서버도 미승인 기기에는 `/api/notes` GET을 **빈 목록(`deviceApproved:false`)**, 쓰기를 `403`, 단일 자료(`/api/notes/:id`) 조회를 `404`로 막습니다.
- 기존 보호(로그인 토큰 검사·소유자 격리)는 그대로이고, **승인된 기기에서는 기존 화면이 정상**입니다.

**다시 실행하는 방법(11단계 확인 순서):**
1. `supabase/device-approvals.sql`로 `device_approvals` 표를 만듭니다.
2. 배포 화면에서 로그인 → **아직 미승인이라 자료가 비어 있고** "이 기기 승인 요청" 버튼이 보입니다. 버튼을 눌러도(요청만 기록) **자료는 열리지 않습니다.**
3. 서버/관리자가 `device-approvals.sql`의 `update ... set approved = true`로 그 계정을 승인합니다.
4. 화면을 새로고침 → **"승인된 기기"**로 바뀌고 기존 자료실이 정상으로 열립니다.

> 승인 상태는 서버가 매 요청 때 확인합니다. 설치 여부·버튼 클릭·브라우저 저장소는 승인 근거가 아닙니다.

## 12단계 현재 상태 (탈환 작전실을 완성합니다)

`aleph.config.json`의 `step`을 `12`로 올렸습니다. 허용 경로·복구 경로·발급자·`RULE_IDS`는 11단계와 같고, 12단계는 읽기 전용 작전실(`/api/ops`, `/ops.html`)과 재시험 표(`npm run retest`)를 더했습니다. 12단계 41종 공격 방어는 심판이 판정하며 이 저장소에서는 **미실행**입니다.

### 요약 화면 (제작 1)
- **`/ops.html`(탈환 작전실)** 은 서버 `GET /api/ops`가 돌려준 값만 그립니다. 읽기 전용이며 로그인이 필요 없고, Supabase 클라이언트를 만들지 않아 브라우저 저장소에 아무것도 쓰지 않습니다. 화면의 성공 문구는 통과 근거가 아니고, 응답을 받지 못하면 `확인 불가`만 보입니다.
- **값마다 출처 라벨이 붙습니다.**

| 라벨 | 뜻 | 해당 값 |
|---|---|---|
| 확인됨 | 서버가 이 응답을 만들면서 실제로 읽거나 실행 | 판정기 규칙 이름·허용 경로, 복구 사본 검증(버전·검증 파일·대상 수), 서버 기록(복구 감사) 건수 |
| 가상 실행 | 가상 입력으로 판정기·탐지기를 실행한 연습 결과 | 판정기 가상 요청 7건, 탐지 가상 사건 3종(합 271건), 회수 제안 수 |
| 미실행 | 아직 연결·실행하지 않음 | 반 엔진의 실제 사건 수신, 회수 집행, 1~9단계 배포 환경 재시험, 12단계 41종 방어 판정 |

- **회수 집행 수치는 만들지 않습니다.** 집행 경로가 연결돼 있지 않아 `null`이고 화면에도 "미실행"으로 보입니다. 회수 제안 건수는 가상 사건에서 나온 값이라 "가상 사건 기준"으로 표시합니다.
- **서버 기록은 가려서만 보입니다.** 복구 감사(`restore_audit`)의 메모 ID는 앞 4자·뒤 4자만 남기고, 소유자·실행자·내용 해시·메모 본문은 응답에 넣지 않습니다. 서버 기록을 읽지 못하면 건수를 `0`으로 채우지 않고 "읽지 못함"(미실행 라벨)으로 둡니다.
- **수치와 서버 기록이 맞는지 화면이 다시 셉니다.** 판정기 일치 건수, 탐지 사건 합계, 회수 제안 수, 서버 기록 표시 건수를 목록에서 다시 세어 비교하고, 어긋나면 "불일치"를 보여 줍니다.

### 제출 묶음의 점검 기록 (`src/attack-check.mjs`)
`npm run bundle`이 만드는 `attackAttempts`는 위 재시험 표(제작 2)의 **실행 기록에서 만듭니다.** 점검 목록을 따로 쓰지 않아 표와 제출 묶음이 같은 요청을 가리킵니다.
- **실제로 보낸 요청**: `observed`에 결과·판정(기대와 같음/다름)·**요청 ID·서버 ID·확인 시각**을 적습니다. 기대와 다르면 숨기지 않고 `기대와 다름(실패)`로 적습니다.
- **보내지 않은 점검**(계정 환경변수 없음, 자료를 바꾸는 요청, 네트워크 오류): `observed`를 정확히 `not_run`으로 적고 결과를 만들어 채우지 않습니다.
- 공격 ID 11개: `anonymous_note_read`(무인증 메모 조회), `cross_owner_note_read`(B가 A의 메모 조회), `anonymous_notes_api`, `forged_token_notes`, `direct_original_api`, `restore_without_login`, `restore_wrong_method`, `device_status_without_login`, `device_request_without_login`, `cross_owner_list_mix`, `cross_owner_note_write`. 무인증 조회와 타인 메모 조회가 앞에 옵니다.
- **A·B 시험 계정 환경변수를 넣고 `npm run bundle`을 실행해야 `cross_owner_*`가 실제 요청으로 남습니다.** 넣지 않으면 그 점검들은 `not_run`입니다. `cross_owner_note_write`(타인 메모 수정·삭제)는 거부되지 않으면 자료가 바뀌므로 어떤 경우에도 자동으로 보내지 않아 항상 `not_run`입니다.
- 이 기록은 학생의 자기 점검이며 심판의 판정이 아닙니다.

**다시 실행하는 방법(12단계 제작 1 확인 순서):**
1. `npm run ops:test` — 가짜 서버 기록(전체 25건 중 3건)으로 요약 모듈을 실행해, 수치와 가린 기록이 맞는지·본문/해시/토큰이 없는지 확인합니다(15개).
2. 배포 화면: `/ops.html`을 열어 각 구역의 라벨(확인됨/가상 실행/미실행)과 마지막 줄의 "수치 일치" 문구를 봅니다.
3. 서버 기록과 화면 수치 대조: Supabase에서 `select count(*) from public.restore_audit;`의 값이 화면의 "서버 전체 N건"과 같아야 합니다.

> 이 요약의 판정기·탐지 결과는 가상 입력 연습이며 실제 접속 사건이나 심판 판정이 아닙니다. 배포 환경의 `/api/ops` 응답은 배포 뒤 직접 확인해야 합니다(작성 시점에는 로컬에서만 실행했습니다).

### 정상·금지 요청 재시험 표 (제작 2)
`npm run retest`는 1~11단계의 정상·금지 요청을 **배포 주소로 실제로 보내**, 기대 결과·실제 결과·요청 ID·서버 ID·확인 시각을 **한 표**(`artifacts/retest/latest.md`와 `.json`, git이 무시하는 폴더)로 남깁니다. 표에는 어느 배포 커밋을 측정했는지도 적힙니다.

- **행마다 근거를 구분합니다.** `실측(배포 HTTP)`은 실제 응답이고, `로컬 가상 실행`은 판정기·탐지기 **함수**를 가상 입력으로 실행한 결과(실제 API 응답이 아님)이며, `미실행`은 실행하지 않은 행입니다. 통과는 앞의 둘에만 붙고, **미실행은 통과로 세지 않습니다.**
- **41종은 통과 처리하지 않습니다.** 12단계 41종 공격 방어는 심판이 판정하는 시험이라 표에 `미실행` 행으로만 있고, 표의 행은 41종이 아닙니다.
- **정상 허용과 금지 거부가 모두 실측으로 남는지** 표 머리에 건수로 적힙니다. 어느 한쪽이 0건이면 경고가 나옵니다. 거부돼야 할 요청이 허용되면 그 행은 `실패`로 남고 종료 코드가 실패입니다.
- **요청 ID**는 절차가 요청마다 만들어 `X-Request-Id`로 보낸 값이고, **서버 ID**는 응답의 `x-vercel-id`(Vercel 로그에서 찾는 값)입니다. 서버가 서버 ID를 주지 않으면 지어내지 않고 `—`로 둡니다.
- **자료를 바꿀 수 있는 요청은 자동으로 보내지 않습니다.** 남의 메모 수정·삭제, 복구 적용은 거부되지 않으면 실제로 자료가 바뀌므로 `미실행`(사유 포함)으로 남기고, 직접 확인합니다. 자동으로 보내는 것은 읽기와 "거부돼야 하는" 무인증 요청뿐입니다.

**실행 방법:**
1. 계정 없이 가능한 행만: `npm run retest` (공개 화면·로그인 없는 거부·복구 미리보기·manifest·작전실 등을 실측하고 나머지는 미실행).
2. A·B 계정 행까지(소유자 격리, 기기 승인 상태에 따른 결과): 실행하는 터미널에서 **직접** 환경변수를 넣습니다. 값은 저장소·로그·표에 남지 않고, 토큰은 메모리에서만 씁니다.
   - PowerShell: `$env:RETEST_EMAIL_A='…'; $env:RETEST_PASSWORD_A='…'; $env:RETEST_EMAIL_B='…'; $env:RETEST_PASSWORD_B='…'; npm run retest`
   - 끝난 뒤: `Remove-Item Env:RETEST_*`
3. `npm run retest:test` — 가짜 서버로 표 생성 절차를 시험합니다(정상 서버, 거부돼야 할 요청이 허용된 서버, 계정 없음, 로그인 실패, 네트워크 끊김, 승인 상태 변화, 비밀값 비노출).

**확인 순서:** 복구(10단계) 뒤에 위 표를 만들면, 자료와 정책이 돌아왔는지(정상 요청 허용)와 이전에 막던 요청이 다시 거부되는지(금지 요청 거부)가 같은 표에서 실측 결과로 보입니다. 표의 `확인 시각`과 `요청 ID`로 Vercel 로그를 대조할 수 있습니다.

> 작성 시점에는 계정 없이 가능한 행만 배포 주소(커밋 `7839b9d`)에 실제로 실행했습니다. A·B 계정이 필요한 행과 새로 만든 `/api/ops`(아직 배포 전)는 이 README를 쓴 시점의 실측 결과가 없습니다.

## 보너스 xdr-01 현재 상태 (무차별 로그인 공격 탐지)

`xdr/brute-force/`에 Wazuh 경보(MITRE ATT&CK T1110) 기반 무차별 로그인 탐지를 넣었습니다. `src/decider.mjs`와 `src/detect.mjs`는 **건드리지 않았습니다**.

- `patterns.json` — 근거(T1110) 있는 패턴 2종: 같은 주소의 로그인 실패 연속(T1110.001), 여러 계정에 같은 비밀번호 대입(T1110.003).
- `decide.mjs` — 패턴을 상수로 담고 `decide(alert) → { action: block|alert|record, confidence, reason }`. 임계값 0.85 block / 0.5 alert / 그 아래 record. import·파일 I/O·네트워크 없이 경보 하나로 혼자 판단.
- `respond.mjs` — block 후보만 골라 출발 주소(srcip) 기준 거부 규칙(만료 시각·근거 경보 번호 포함)으로 내보내고, 알림을 `xdr/alerts.log`에 한 줄씩 쌓음. 정상 이벤트 주소에는 규칙을 넣지 않음.
- `read-alerts.mjs` — 경보 확인용(판정기가 import 하지 않음).

**다시 실행하는 방법:** `npm run xdr:run -- brute-force` → `xdr/brute-force/result.json` 생성(`scripts/xdr-run.mjs`가 `decide`를 경보마다 호출). 대응 연결 확인은 `node xdr/brute-force/respond.mjs`.

**작성 시점 로컬 확인(가상 경보 28건):** counts `block 10 / alert 9 / record 9`, 정상 이벤트(T1110 아님) block 0건. 이는 로컬 가상 경보 연습 결과이며 반 엔진·운영 심판의 판정이 아닙니다. `result.json`과 `alerts.log`는 생성 산출물이라 Git에서 제외합니다.

## 보너스 xdr-02 현재 상태 (웹 주입 공격 탐지)

`xdr/web-injection/`에 Wazuh 경보(MITRE ATT&CK T1190) 기반 웹 주입 탐지를 넣었습니다. `src/decider.mjs`와 `src/detect.mjs`는 **건드리지 않았습니다**.

- `patterns.json` — 근거(T1190) 있는 패턴 3종: 요청 인자에 SQL 구문 주입(CWE-89), 스크립트 태그 주입(CWE-79), 경로 거슬러 올라가기 `../` 반복(CWE-22).
- `decide.mjs` — 패턴을 상수로 담고 `decide(alert) → { action: block|alert|record, confidence, reason }`. 임계값 0.85 block / 0.5 alert / 그 아래 record. import·파일 I/O·네트워크 없이 경보 하나로 혼자 판단. 3개 패턴에 안 맞아도 명백한 T1190 공격(명령 구분자 등)은 일반 라벨로 block.
- `respond.mjs` — block 후보만 골라 출발 주소(srcip) 기준 거부 규칙(만료 시각·근거 경보 번호 포함)으로 내보내고, 알림을 `xdr/alerts.log`에 한 줄씩 쌓음(`module=web-injection`). 정상 이벤트 주소에는 규칙을 넣지 않음.
- `read-alerts.mjs` — 경보 확인용(판정기·decide가 import 하지 않음). `url`·`count` 등 payload는 뽑지 않음.

**다시 실행하는 방법:** `npm run xdr:run -- web-injection` → `xdr/web-injection/result.json` 생성(`scripts/xdr-run.mjs`가 `decide`를 경보마다 호출). 대응 연결 확인은 `node xdr/web-injection/respond.mjs`.

**작성 시점 로컬 확인(가상 경보 26건):** counts `block 8 / alert 9 / record 9`, 정상 이벤트(T1190 아님) block 0건. 이는 로컬 가상 경보 연습 결과이며 반 엔진·운영 심판의 판정이 아닙니다. `result.json`과 `alerts.log`는 생성 산출물이라 Git에서 제외합니다.
