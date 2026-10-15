// 자료 빼돌리기(처음 보는 곳으로 나가는 큰 전송, MITRE ATT&CK T1041·T1048) 경보 판정기입니다.
// 심판은 인터넷 없이 이 파일 하나만 불러와 경보마다 바로 답을 받습니다.
// 그래서 이 파일은 다른 파일·패키지를 import 하지 않고, 파일을 읽거나 쓰지 않고,
// 네트워크에 묻지 않고, 넘겨받은 alert 하나만으로 혼자 계산합니다.

// ── 패턴 (xdr/exfiltration/patterns.json 에서 옮겨 적은 상수) ──
// 근거: MITRE ATT&CK T1041 (Exfiltration Over C2 Channel) · T1048 (Exfiltration Over Alternative Protocol) — https://attack.mitre.org/techniques/T1048/
const PATTERNS = Object.freeze({
  BULK_NEW: Object.freeze({
    id: "bulk-to-new-destination",
    name: "처음 보는 목적지로 대용량 전송",
    match: "처음 보는 목적지·주소로 자료가 짧은 시간에 많은 건수 또는 큰 용량으로 나가거나, 자료실 전체가 외부로 복사됨",
    signals: Object.freeze(["처음 보는 목적지","짧은 시간에 많은 건수·큰 용량","자료실 전체 복사","여러 목적지로 같은 파일이 나감"]),
    notMatch: "평소 목적지로 나가는 작은 동기화나 파일 수가 한 번 늘었을 뿐인 경우, 실패 1건으로 끝난 경우, 전송량이 한 번 높지만 목적지가 수업 자료 주소인 경우",
    basis: "MITRE T1048 — 평소 쓰지 않던 곳으로 자료를 한꺼번에 내보내는 반출 형태.",
  }),
  ARCHIVE_OFF: Object.freeze({
    id: "off-hours-archive-out",
    name: "업무 시간 밖 압축 파일 반출",
    match: "수업 시간 밖에 압축 파일이 처음 보는 주소로 나감(압축 파일이 연속으로 올라가는 경우 포함)",
    signals: Object.freeze(["수업 시간 밖·업무 시간 밖","압축 파일","처음 보는 주소"]),
    notMatch: "수업 시간 안에 압축 파일을 만들기만 하고 외부 전송이 없는 경우, 수업 끝 무렵 백업처럼 보이는 전송이 1건 있는 경우",
    basis: "MITRE T1048 — 자료를 압축해 주인이 쓰지 않는 시각에 밖으로 내보내는 반출 형태.",
  }),
  REPEAT_SAME: Object.freeze({
    id: "repeated-transfer-same-destination",
    name: "같은 목적지로 대용량 전송 반복",
    match: "같은 목적지로 대용량 전송이 여러 번 반복됨(업무 시간 밖의 반복 포함)",
    signals: Object.freeze(["같은 목적지","대용량 전송","여러 번 반복"]),
    notMatch: "작은 전송이 한두 번 있었거나 읽기만 한 경우",
    basis: "MITRE T1041 — 정해진 통로로 같은 곳에 자료를 나눠 반복해서 내보내는 반출 형태.",
  }),
  COMMAND: Object.freeze({
    id: "command-channel-exfil",
    name: "명령 통로로 큰 자료 전송",
    match: "명령 통로(원격 제어에 쓰는 연결)로 큰 파일이 처음 보는 목적지에 반복 전송됨",
    signals: Object.freeze(["명령 통로","큰 파일","처음 보는 목적지","반복 전송"]),
    notMatch: "명령 통로에 짧은 자료 이름이 몇 번 보였을 뿐 큰 파일은 아닌 경우",
    basis: "MITRE T1041 — 공격자가 쓰는 명령 통로를 그대로 이용해 자료를 내보내는 반출 형태.",
  }),
  PORT: Object.freeze({
    id: "unusual-port-transfer",
    name: "평소 쓰지 않던 포트로 자료 전송",
    match: "평소에 쓰지 않던 포트로 자료 이름이나 자료가 연속 전송됨",
    signals: Object.freeze(["평소 쓰지 않던 포트","자료의 연속 전송"]),
    notMatch: "평소 포트·평소 목적지로 나가는 일상 전송",
    basis: "MITRE T1048 — 평소와 다른 프로토콜·통로로 자료를 내보내 탐지를 피하는 반출 형태.",
  }),
});

// 임계값: confidence 0.85 이상 block, 0.5 이상 alert, 그 아래 record.
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;
const MAX_TEXT = 1000; // 너무 긴 값은 앞부분만 봅니다(계산량 제한).
const BIG_BYTES = 50_000_000; // 이 값 이상이면 대용량으로 봅니다.
const BIG_FILES = 50; // 이 건수 이상이면 많은 건수로 봅니다.
const REPEAT_BYTES = 10_000_000; // 반복 횟수는 이 용량 이상일 때만 반복 대용량으로 셉니다.

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const round2 = (n) => Math.round(clamp01(n) * 100) / 100;

function actionFor(confidence) {
  if (confidence >= BLOCK_AT) return 'block';
  if (confidence >= ALERT_AT) return 'alert';
  return 'record';
}

// 전송과 관련된 말이 설명에 나오는지.
const KIND = /전송|나갔|올라갔|복사|반출|동기화|압축|목적지|주소|파일|자료/;
// 정상 표지: 작은 동기화·읽기·저장·새로고침·세션 확인·로그아웃처럼 자료가 밖으로 나가지 않는 일상 이벤트.
const BENIGN = /작은 동기화|읽었습니다|저장했습니다|새로고침|세션 확인|로그아웃|열었습니다|받았습니다|전송은 없/;
// 부정·실패 문장은 위험 신호로 세지 않습니다("전송은 아직 없습니다", "실패 1건", "큰 파일은 아닙니다").
const NEGATED = /없습니다|아닙니다|않았|실패/;

const num = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

// 설명과 data 의 숫자(bytes·files·count)에서 위험 신호를 셉니다(각각 한 번만).
function scoreSignals(description, bytes, files, count) {
  const sentences = description.split('.').map((s) => s.trim()).filter(Boolean);
  const live = sentences.filter((s) => !NEGATED.test(s)).join('. ');
  const found = new Set();
  if (/처음 보는|처음 봅니다|평소와 다른 주소|외부 주소/.test(live)) found.add('newDest');
  if (bytes >= BIG_BYTES || files >= BIG_FILES || /대용량|큰 파일|자료실 전체|묶음|\d{3,}건/.test(live)) found.add('bulk');
  if (/짧은 시간|10분 안에|한 번에 나갔|한 번에 올라/.test(live)) found.add('burst');
  if (/수업 시간 밖|업무 시간 밖/.test(live)) found.add('offhours');
  if (/압축 파일/.test(live)) found.add('archive');
  if (/반복|연속|\d+번입니다/.test(live) || (count >= 3 && bytes >= REPEAT_BYTES)) found.add('repeated');
  if (/명령 통로/.test(live)) found.add('command');
  if (/쓰지 않던 포트/.test(live)) found.add('port');
  if (/두 곳/.test(live)) found.add('multiDest');
  return { found, score: found.size };
}

// 어느 패턴인지 고릅니다(reason 라벨용).
function pickPattern(found) {
  if (found.has('command')) return PATTERNS.COMMAND;
  if (found.has('port')) return PATTERNS.PORT;
  if (found.has('archive') && found.has('offhours')) return PATTERNS.ARCHIVE_OFF;
  if (found.has('repeated') && !found.has('newDest')) return PATTERNS.REPEAT_SAME;
  return PATTERNS.BULK_NEW;
}

// 경보 하나를 패턴과 맞춰 { action, confidence, reason } 로 답합니다.
// confidence(0~1): 경보가 패턴과 얼마나 뚜렷하게 맞는지.
//   - 전송 이벤트에 위험 신호(처음 보는 목적지·대용량·업무 시간 밖·압축 파일·반복·명령 통로·낯선 포트 등)가
//     2점 이상 겹치면 0.88 이상(block 구간).
//   - 신호가 1점 이하여도 T1041·T1048로 분류된 경보면 0.55~0.8(alert 구간, 0.85 미만).
//   - 작은 동기화·읽기 같은 정상 표지가 있거나 신호와 분류가 모두 없으면 낮게(record 구간).
export function decide(alert) {
  const ok = alert && typeof alert === 'object';
  const rule = ok && alert.rule && typeof alert.rule === 'object' ? alert.rule : {};
  const data = ok && alert.data && typeof alert.data === 'object' ? alert.data : {};
  const level = Number.isFinite(rule.level) ? Math.min(Math.max(rule.level, 0), 15) : 0;
  const description = typeof rule.description === 'string' ? rule.description.slice(0, MAX_TEXT) : '';
  const tagged = Array.isArray(rule.mitre) && (rule.mitre.includes('T1041') || rule.mitre.includes('T1048'));

  const hasKind = KIND.test(description);
  const benign = BENIGN.test(description);
  const { found, score } = scoreSignals(description, num(data.bytes), num(data.files), num(data.count));

  if (hasKind && !benign && score >= 2) {
    // 뚜렷한 자료 빼돌리기: 여러 위험 신호가 겹침.
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
    reason: '일치하는 자료 빼돌리기 패턴 없음 — 정상 이벤트로 기록',
  };
}
