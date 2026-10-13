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
