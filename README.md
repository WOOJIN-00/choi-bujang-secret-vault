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

**남은 약점:** `api/notes.js`는 아직 공개 주소입니다. 로그인하지 않은 누구나 `/api/notes`를 직접 호출해 네 건을 그대로 받을 수 있습니다. 로그인과 접근 제한은 다음 단계에서 추가합니다.

### 가상 메모 노출 확인 절차

가상 메모 문장(예: `실습용 가상 과제 기록`, `실습용 가상 포트폴리오 기록`, `실습용 가상 리추얼 기록`, `실습용 가상 행정 기록`)이 공개 위치에 남아 있는지 검색합니다. 아래 두 곳을 각각 확인하고 결과를 기록하세요.

1. **현재 배포 파일**(비로그인으로 공개 URL 요청):
   - `curl -s https://<배포주소>/data.json` → `"notes": []`, 메모 문장 없음이 정상.
   - `curl -s https://<배포주소>/ | grep -F "실습용 가상"` → 아무 줄도 안 나와야 정상(화면 메모는 `/api/notes` 응답으로만 들어옴).
2. **GitHub 최신 파일**(`main` 최신 커밋 기준):
   - 로컬 최신 상태에서 `git grep -n "실습용 가상" $(git rev-parse HEAD)` → 공개 정적 파일(`data.json`, `public/data.json`, `public/index.html`)에서는 안 나와야 정상. (`supabase/secret-notes.sql`과 이 README의 예시 문장은 설명·시드용으로 남아 있습니다.)
   - GitHub 웹에서 저장소 검색창에 `실습용 가상`을 넣어 최신 `main`에 공개 메모가 없는지 눈으로 확인.

검색 결과(각 명령의 출력 유무)와 아래 "남은 약점"을 **각각 따로** 기록하세요. 둘은 다른 사안입니다.

**과거 노출은 아직 해소되지 않았습니다.** 이번 변경 이전의 공개 커밋(예: `7230b4b`)과 그 커밋으로 만들어진 옛 배포에는 네 건의 가상 메모가 그대로 남아 있습니다. GitHub 커밋 이력과 이전 배포가 공개로 남아 있는 한, 현재 파일에서 메모가 사라졌어도 **과거 노출이 해소됐다고 적지 마세요.** 과거 노출 해소는 이력·옛 배포까지 정리해야 하는 별도 작업입니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.
