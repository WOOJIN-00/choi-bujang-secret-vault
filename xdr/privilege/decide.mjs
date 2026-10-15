// 권한 가로채기(권한 상승·유효 계정 악용, MITRE ATT&CK T1068·T1078) 경보 판정기입니다.
// 심판은 인터넷 없이 이 파일 하나만 불러와 경보마다 바로 답을 받습니다.
// 그래서 이 파일은 다른 파일·패키지를 import 하지 않고, 파일을 읽거나 쓰지 않고,
// 네트워크에 묻지 않고, 넘겨받은 alert 하나만으로 혼자 계산합니다.

// ── 패턴 (xdr/privilege/patterns.json 에서 옮겨 적은 상수) ──
// 근거: MITRE ATT&CK T1068 (Exploitation for Privilege Escalation) · T1078 (Valid Accounts) — https://attack.mitre.org/techniques/T1078/
const PATTERNS = Object.freeze({
  GROUP_ADD: Object.freeze({
    id: "admin-group-add",
    name: "평범한 계정이 관리자 그룹에 추가",
    match: "평소 관리자가 아닌 계정이 관리자 그룹에 추가됨(원격 주소에서, 한 주소에서 여러 계정이, 또는 빠졌다가 곧바로 다시 들어옴)",
    signals: Object.freeze(["관리자 그룹 추가","원격 주소에서의 추가","같은 주소에서 여러 계정 추가","빠졌다가 곧바로 다시 추가"]),
    notMatch: "관리자가 아닌 과제 그룹에 추가되거나, 새 로컬 그룹이 만들어졌을 뿐인 경우, 그룹 목록·소속을 읽기만 한 경우",
    basis: "MITRE T1078 — 훔친 정상 계정으로 들어와 관리자 그룹에 올려 높은 권한을 쓰려는 시도(이 경보 묶음이 T1078로 표시함).",
  }),
  UNFAMILIAR: Object.freeze({
    id: "unfamiliar-admin-command",
    name: "처음 보는 주소·계정에서 관리자 명령",
    match: "처음 보는 주소에서 관리자 명령이 실행되거나, 다른 계정의 권한으로 관리자 명령이 실행됨",
    signals: Object.freeze(["처음 보는 주소","관리자 명령 실행","다른 계정의 권한으로 실행"]),
    notMatch: "평소 주소에서 관리자 명령이 한 번 실행됐거나 실패 1건으로 끝난 경우, 수업용 관리 계정이 평소 주소에서 로그인한 경우",
    basis: "MITRE T1078 — 정상 계정이 평소와 다른 곳에서 높은 권한으로 쓰이면 도용된 계정일 수 있음.",
  }),
  OFF_HOURS: Object.freeze({
    id: "off-hours-privilege-use",
    name: "업무 시간 밖 권한 사용",
    match: "수업 시간 밖 또는 업무처럼 보이지 않는 시각에 관리자 권한 사용이 있음(그룹 추가나 관리자 명령과 함께)",
    signals: Object.freeze(["수업 시간 밖·업무와 안 맞는 시각","관리자 그룹 추가 또는 관리자 명령"]),
    notMatch: "수업 시간 안에 권한 상승 창이 한 번 뜨고 취소됐거나, 이어서 명령이 없는 경우",
    basis: "MITRE T1078 — 도용된 정상 계정은 주인이 쓰지 않는 시각에 쓰이는 경우가 많음.",
  }),
  CHAIN: Object.freeze({
    id: "escalation-chain",
    name: "권한이 오른 직후 관리자 명령",
    match: "계정이 관리자 그룹에 들어가거나 세션 권한이 관리자로 바뀐 직후 곧바로 관리자 명령·권한 명령이 실행됨",
    signals: Object.freeze(["관리자 그룹 추가 또는 세션 권한 변경","곧바로 이어진 관리자·권한 명령"]),
    notMatch: "권한 변경 없이 비밀번호만 바꾸거나 자기 계정 종류·세션 정보를 조회한 경우",
    basis: "MITRE T1068 — 낮은 권한에서 높은 권한으로 올린 뒤 바로 그 권한을 쓰는 권한 상승 흐름.",
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

// 권한과 관련된 말이 설명에 나오는지(권한·관리자·그룹·계정).
const KIND = /권한|관리자|그룹|계정/;
// 정상 표지: 로그인·로그아웃·읽기·조회·비밀번호 변경처럼 권한을 올리지 않는 일상 이벤트.
const BENIGN = /로그인했습니다|로그아웃했습니다|읽기만|조회했습니다|확인했습니다|비밀번호를 변경|열었습니다/;
// 부정·실패·취소 문장은 위험 신호로 세지 않습니다("명령은 없습니다", "실패 1건", "취소됐습니다").
const NEGATED = /없습니다|아닙니다|않았|실패|취소/;

// 설명(과 group·count)에서 위험 신호를 셉니다(각각 한 번만).
function scoreSignals(description, group, count) {
  const sentences = description.split('.').map((s) => s.trim()).filter(Boolean);
  const live = sentences.filter((s) => !NEGATED.test(s)).join('. ');
  const found = new Set();
  const adminGroup = group === 'administrators' || group === 'admin' || group === 'administrator';
  if (/관리자 그룹(?:에|에서 다시|으로)?\s*(?:추가|들어)|관리자(?:로| 그룹으로)\s*(?:다시 )?들어|관리자 그룹 추가/.test(live)
      || (adminGroup && /추가|들어/.test(live))) found.add('adminAdd');
  if (/관리자 명령|권한 명령/.test(live)) found.add('adminCmd');
  if (/원격 주소|처음 보는|처음 봅니다/.test(live)) found.add('unfamiliar');
  if (/수업 시간 밖|업무처럼 보이지 않는/.test(live)) found.add('offhours');
  if (/다른 계정의 권한/.test(live)) found.add('otherAccount');
  if (/같은 주소에서 계정|계정\s*\d+개/.test(live) || count >= 3) found.add('multi');
  if (/빠진 계정[^.]*다시/.test(live)) found.add('reentry');
  if (/관리자 권한으로 바뀌/.test(live)) found.add('privChange');
  if (/곧바로|방금 관리자가 된/.test(live)) found.add('chain');
  return { found, score: found.size };
}

// 어느 패턴인지 고릅니다(reason 라벨용).
function pickPattern(found) {
  if (found.has('chain') || found.has('privChange')) return PATTERNS.CHAIN;
  if (found.has('offhours')) return PATTERNS.OFF_HOURS;
  if (found.has('adminAdd') || found.has('multi') || found.has('reentry')) return PATTERNS.GROUP_ADD;
  return PATTERNS.UNFAMILIAR;
}

// 경보 하나를 패턴과 맞춰 { action, confidence, reason } 로 답합니다.
// confidence(0~1): 경보가 패턴과 얼마나 뚜렷하게 맞는지.
//   - 권한 관련 이벤트에 위험 신호(관리자 그룹 추가·관리자 명령·낯선 주소·업무 시간 밖·다른 계정 권한 등)가
//     2점 이상 겹치면 0.88 이상(block 구간).
//   - 신호가 1점 이하여도 T1068·T1078로 분류된 경보면 0.55~0.8(alert 구간, 0.85 미만).
//   - 로그인·읽기 같은 정상 표지가 있거나 신호와 분류가 모두 없으면 낮게(record 구간).
export function decide(alert) {
  const ok = alert && typeof alert === 'object';
  const rule = ok && alert.rule && typeof alert.rule === 'object' ? alert.rule : {};
  const data = ok && alert.data && typeof alert.data === 'object' ? alert.data : {};
  const level = Number.isFinite(rule.level) ? Math.min(Math.max(rule.level, 0), 15) : 0;
  const description = typeof rule.description === 'string' ? rule.description.slice(0, MAX_TEXT) : '';
  const group = typeof data.group === 'string' ? data.group.slice(0, 80).toLowerCase() : '';
  const tagged = Array.isArray(rule.mitre) && (rule.mitre.includes('T1068') || rule.mitre.includes('T1078'));
  const parsed = Number.parseInt(data.count, 10);
  const count = Number.isFinite(parsed) ? parsed : 0;

  const hasKind = KIND.test(description) || group === 'administrators';
  const benign = BENIGN.test(description);
  const { found, score } = scoreSignals(description, group, count);

  if (hasKind && !benign && score >= 2) {
    // 뚜렷한 권한 가로채기: 여러 위험 신호가 겹침.
    const confidence = round2(Math.min(0.88 + 0.03 * (score - 2) + (level >= 10 ? 0.02 : 0), 0.99));
    const pattern = pickPattern(found);
    return {
      action: actionFor(confidence),
      confidence,
      reason: `근거 패턴: ${pattern.name} (${pattern.basis})`,
    };
  }

  if (hasKind && !benign && (tagged || score >= 1)) {
    // 애매한 시도: 신호가 하나뿐이거나 없음 → 알림(0.85 미만으로 유지).
    const confidence = round2(Math.min(0.55 + Math.max(level - 5, 0) * 0.03 + score * 0.05, 0.8));
    return {
      action: actionFor(confidence),
      confidence,
      reason: '패턴 일부만 맞음(위험 신호가 하나뿐이거나 없음) — 알림으로 남김',
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
    reason: '일치하는 권한 가로채기 패턴 없음 — 정상 이벤트로 기록',
  };
}
