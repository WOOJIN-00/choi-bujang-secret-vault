// 몰래 심어진 프로그램(서비스·예약 작업 등 지속성, MITRE ATT&CK T1543·T1053) 경보 판정기입니다.
// 심판은 인터넷 없이 이 파일 하나만 불러와 경보마다 바로 답을 받습니다.
// 그래서 이 파일은 다른 파일·패키지를 import 하지 않고, 파일을 읽거나 쓰지 않고,
// 네트워크에 묻지 않고, 넘겨받은 alert 하나만으로 혼자 계산합니다.

// ── 패턴 (xdr/persistence/patterns.json 에서 옮겨 적은 상수) ──
// 근거: MITRE ATT&CK T1543 (Create or Modify System Process) · T1053 (Scheduled Task/Job) — https://attack.mitre.org/techniques/T1543/
const PATTERNS = Object.freeze({
  SERVICE: Object.freeze({
    id: "unsigned-new-service",
    name: "서명 없는 새 서비스 등록",
    match: "평소 목록에 없는 서비스가 새로 등록되거나 실행 파일이 바뀌었고, 그 실행 파일에 서명이 없거나 임시 폴더를 가리킴",
    signals: Object.freeze(["서명 없는 새 서비스","임시 폴더의 실행 파일을 가리킴","같은 주소에서 서명 없는 등록이 연속으로 나옴"]),
    notMatch: "서명된 기존 서비스가 그대로 실행 중이거나, 서비스 설명만 바뀌었거나, 멈췄다가 같은 파일로 다시 시작된 경우",
    basis: "MITRE T1543 — 공격자가 서비스를 새로 만들거나 바꿔서 다시 켜도 프로그램이 남도록 심는 지속성 기법.",
  }),
  TASK: Object.freeze({
    id: "unfamiliar-scheduled-task",
    name: "낯선 예약 작업",
    match: "처음 보는 예약 작업이 만들어졌고, 이름이 임의 문자열이거나 임시 폴더의 프로그램을 수업 시간 밖에 실행함",
    signals: Object.freeze(["처음 보는 예약 작업","임의 문자열 이름","임시 폴더의 프로그램 실행","평소와 다른 실행 시각"]),
    notMatch: "기존 예약 작업이 평소 시각에 그대로 돌거나, 수업 시간 안의 예약 작업이 하나 있을 뿐 다른 신호가 없는 경우",
    basis: "MITRE T1053 — 공격자가 예약 작업을 만들어 정해진 때마다 프로그램이 다시 실행되게 하는 지속성 기법.",
  }),
  STARTUP: Object.freeze({
    id: "startup-folder-change",
    name: "시작 폴더에 낯선 프로그램 추가",
    match: "시작 폴더에 평소 목록에 없는 프로그램이 추가되고 이어서 실행된 흔적이 있음",
    signals: Object.freeze(["시작 폴더의 목록 밖 프로그램","변경 뒤 실행 기록"]),
    notMatch: "시작 프로그램 목록을 읽기만 했거나, 변경이 1건이고 이어서 실행된 기록이 없는 경우",
    basis: "MITRE T1543 계열로 분류된 경보 — 로그인·부팅 때 다시 실행되도록 시작 위치에 심는 지속성 시도(정식 기법 번호는 T1547.001이지만 이 경보 묶음은 T1543으로 표시함).",
  }),
  SHARED: Object.freeze({
    id: "shared-temp-file-persistence",
    name: "여러 지속 수단이 같은 임시 파일을 가리킴",
    match: "시작 프로그램과 예약 작업(또는 서비스)이 같은 임시 폴더의 파일을 함께 가리킴",
    signals: Object.freeze(["시작 항목과 예약 작업이 같은 파일을 가리킴","임시 폴더의 파일"]),
    notMatch: "임시 폴더에 실행 파일이 하나 생겼을 뿐 서비스·예약 작업·시작 항목 등록이 없는 경우",
    basis: "MITRE T1543 · T1053 — 한 프로그램을 서비스·예약 작업 등 여러 곳에 겹쳐 심어 하나가 지워져도 남게 하는 지속성 기법.",
  }),
});

// 임계값: confidence 0.85 이상 block, 0.5 이상 alert, 그 아래 record.
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;
const MAX_TEXT = 1000; // 너무 긴 값은 앞부분만 봅니다(계산량 제한).

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const round2 = (n) => Math.round(clamp01(n) * 100) / 100;

function actionFor(confidence) {
  if (confidence >= BLOCK_AT) return 'block';
  if (confidence >= ALERT_AT) return 'alert';
  return 'record';
}

// 지속 수단의 종류가 설명·경로에 나오는지(서비스·예약 작업·시작 위치).
const KIND = /서비스|예약 작업|예약|시작 폴더|시작 프로그램|시작 항목/;
// 정상으로 보이는 표지: 서명된 기존 항목, 평소대로의 예약, 읽기만 한 경우.
const BENIGN = /서명된|평소 시각에 그대로|읽기만|기존[^.]*(?:마쳤|실행 중)/;
// 부정문(등록·실행·기록이 '없다')은 지속 신호로 세지 않습니다.
const NEGATED = /(?:등록|실행|기록|변경|추가)\S*\s*(?:은|는)?\s*없/;
// 서명이 확인되지 않았거나 모르는 경우는 약한 신호입니다.
const WEAK = /서명은?\s*(?:확인되지|아직 모)|이름이 [^.]*비슷/;

// 경로·설명에서 신호를 셉니다(각각 한 번만). 점수 1점짜리 신호와 2점짜리 신호가 있습니다.
function scoreSignals(description, path, count) {
  const sentences = description.split('.').map((s) => s.trim()).filter(Boolean);
  const live = sentences.filter((s) => !NEGATED.test(s)).join('. ');
  const found = new Set();
  if (/서명\s*(?:이|은)?\s*없/.test(description) && !/서명된/.test(description)) found.add('unsigned');
  if (/처음 보는|평소 목록에 없|임의 문자열|목록 밖/.test(live)) found.add('unfamiliar');
  if (/임시 폴더/.test(live) || /[\\/]Temp[\\/]|[\\/]tmp[\\/]/i.test(path)) found.add('temp');
  if (/Start Menu[\\/]Programs[\\/]Startup/i.test(path)) found.add('startupPath');
  if (/수업 시간 밖/.test(live)) found.add('offhours');
  if (/연속으로\s*\d+건|\d+번 반복/.test(live) || count >= 3) found.add('repeated');
  if (/서비스 등록|새 서비스|추가됐|등록됐|다시 켜도 남도록|실행 파일이 바뀌었/.test(live)) found.add('install');
  const combined = /함께 가리킵/.test(live);
  const score = found.size + (combined ? 2 : 0);
  return { found, combined, score };
}

// 어느 패턴인지 고릅니다(reason 라벨용).
function pickPattern(text, found, combined) {
  if (combined) return PATTERNS.SHARED;
  if (/시작 폴더|시작 프로그램|시작 항목/.test(text) || found.has('startupPath')) return PATTERNS.STARTUP;
  if (/예약 작업|예약/.test(text)) return PATTERNS.TASK;
  return PATTERNS.SERVICE;
}

// 경보 하나를 패턴과 맞춰 { action, confidence, reason } 로 답합니다.
// confidence(0~1): 경보가 패턴과 얼마나 뚜렷하게 맞는지.
//   - 지속 수단(서비스·예약 작업·시작 위치)이 나오고 위험 신호가 2점 이상이면 0.88 이상(block 구간).
//   - 신호가 1점 이하이거나 약한 신호뿐이지만 T1543·T1053으로 분류된 경보면 0.5~0.8(alert 구간, 0.85 미만).
//   - 서명된 기존 항목처럼 정상 표지가 있거나 신호가 없으면 낮게(record 구간).
export function decide(alert) {
  const ok = alert && typeof alert === 'object';
  const rule = ok && alert.rule && typeof alert.rule === 'object' ? alert.rule : {};
  const data = ok && alert.data && typeof alert.data === 'object' ? alert.data : {};
  const level = Number.isFinite(rule.level) ? Math.min(Math.max(rule.level, 0), 15) : 0;
  const description = typeof rule.description === 'string' ? rule.description.slice(0, MAX_TEXT) : '';
  const path = typeof data.path === 'string' ? data.path.slice(0, MAX_TEXT) : '';
  const tagged = Array.isArray(rule.mitre) && (rule.mitre.includes('T1543') || rule.mitre.includes('T1053'));
  const parsed = Number.parseInt(data.count, 10);
  const count = Number.isFinite(parsed) ? parsed : 0;

  const text = description + ' ' + path;
  const hasKind = KIND.test(text);
  const benign = BENIGN.test(description);
  const weak = WEAK.test(description) ? 1 : 0;
  const { found, combined, score } = scoreSignals(description, path, count);

  if (hasKind && !benign && score >= 2) {
    // 뚜렷한 지속성 심기: 서명 없음·낯섦·임시 폴더·반복 같은 신호가 겹침.
    const confidence = round2(Math.min(0.88 + 0.03 * (score - 2) + (level >= 10 ? 0.02 : 0), 0.99));
    const pattern = pickPattern(text, found, combined);
    return {
      action: actionFor(confidence),
      confidence,
      reason: `근거 패턴: ${pattern.name} (${pattern.basis})`,
    };
  }

  if (hasKind && (tagged || score >= 1) && !benign) {
    // 애매한 시도: 신호가 하나뿐이거나 약함 → 알림(0.85 미만으로 유지).
    const confidence = round2(Math.min(0.55 + Math.max(level - 5, 0) * 0.03 + score * 0.05 + weak * 0.04, 0.8));
    return {
      action: actionFor(confidence),
      confidence,
      reason: '패턴 일부만 맞음(위험 신호가 하나뿐이거나 약함) — 알림으로 남김',
    };
  }

  if (hasKind && benign && score >= 2) {
    // 정상 표지와 위험 신호가 서로 부딪힘: 막지 않고 사람이 보게 알림으로만 남깁니다.
    return { action: 'alert', confidence: 0.6, reason: '정상 표지와 위험 신호가 함께 있어 알림으로 남김' };
  }

  // 정상 이벤트: 일치하는 패턴이 없음.
  const confidence = round2(Math.min(0.3, 0.05 + level * 0.01 + (tagged ? 0.05 : 0)));
  return {
    action: actionFor(confidence),
    confidence,
    reason: '일치하는 몰래 심어진 프로그램 패턴 없음 — 정상 이벤트로 기록',
  };
}
