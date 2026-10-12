// 무차별 로그인(MITRE ATT&CK T1110) 경보 판정기입니다.
// 심판은 인터넷 없이 이 파일 하나만 불러와 경보마다 바로 답을 받습니다.
// 그래서 이 파일은 다른 파일·패키지를 import 하지 않고, 파일을 읽거나 쓰지 않고,
// 네트워크에 묻지 않고, 넘겨받은 alert 하나만으로 혼자 계산합니다.

// ── 패턴 (xdr/brute-force/patterns.json 에서 옮겨 적은 상수) ──
// 근거: MITRE ATT&CK T1110 (Brute Force) — https://attack.mitre.org/techniques/T1110/
const PATTERNS = Object.freeze({
  GUESSING: Object.freeze({
    id: 'same-source-failed-logins',
    name: '같은 주소의 로그인 실패 연속',
    basis: 'MITRE T1110.001 Password Guessing — 한 출발지에서 암호를 반복 추측하며 로그인 실패가 몰림.',
  }),
  SPRAYING: Object.freeze({
    id: 'password-spraying',
    name: '여러 계정에 같은 비밀번호 대입',
    basis: 'MITRE T1110.003 Password Spraying — 한 출발지가 흔한 비밀번호 하나를 여러 계정에 넓게 시도.',
  }),
});

// 임계값: confidence 0.85 이상 block, 0.5 이상 alert, 그 아래 record.
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round2(n) {
  return Math.round(clamp01(n) * 100) / 100;
}

function actionFor(confidence) {
  if (confidence >= BLOCK_AT) return 'block';
  if (confidence >= ALERT_AT) return 'alert';
  return 'record';
}

// 경보 하나를 패턴과 맞춰 { action, confidence, reason } 로 답합니다.
// confidence(0~1): 경보가 무차별 대입 패턴과 얼마나 뚜렷하게 맞는지.
//   - 근거(T1110)와 로그인 실패 신호가 분명할수록 높음(Wazuh 심각도 level을 주 신호로,
//     실패 건수·계정 확산을 보조 신호로 사용).
export function decide(alert) {
  const rule = (alert && alert.rule) || {};
  const data = (alert && alert.data) || {};
  const level = Number.isFinite(rule.level) ? rule.level : 0;
  const description = typeof rule.description === 'string' ? rule.description : '';
  const mitre = Array.isArray(rule.mitre) ? rule.mitre : [];

  const isT1110 = mitre.includes('T1110');

  // 근거(T1110)가 없으면 무차별 대입 패턴과 맞지 않음 → 정상 이벤트로 기록.
  // (정상 이벤트는 mitre가 비어 있음. 공격 설명에 '실패'라는 낱말이 없을 수도 있어 그것에 기대지 않음.)
  if (!isT1110) {
    return {
      action: 'record',
      confidence: round2(Math.min(0.2, level / 25)),
      reason: '일치하는 무차별 대입(T1110) 패턴 없음 — 정상 이벤트로 기록',
    };
  }

  // 실패 건수와 계정 확산(보조 신호).
  const failCount = Number.parseInt(data.count, 10);
  const failures = Number.isFinite(failCount) ? failCount : 0;
  const accountCount = typeof data.accounts === 'string'
    ? data.accounts.split(',').map((s) => s.trim()).filter(Boolean).length
    : 0;

  // 패턴 고르기: 여러 계정에 같은 비밀번호를 넓게 뿌리면 spraying, 아니면 한 주소의 실패 연속.
  const isSpraying = accountCount > 1 || /같은 비밀번호|여러 계정|서로 다른 계정|계정\s*\d+\s*개/.test(description);
  const pattern = isSpraying ? PATTERNS.SPRAYING : PATTERNS.GUESSING;
  const spread = accountCount > 1 ? accountCount : failures;

  // 적합도 계산: Wazuh 심각도 밴드 + 실패량/계정 확산 보조 가점.
  let confidence;
  if (level >= 10) {
    // 높은 심각도 = 패턴과 뚜렷하게 일치 → 차단 구간.
    confidence = 0.9 + Math.min(spread / 50, 1) * 0.1;
  } else if (level >= 5) {
    // 중간 심각도 = 의심되나 단정하기 어려움 → 경보 구간(0.85 미만으로 유지).
    confidence = 0.5 + ((level - 5) / 4) * 0.3 + Math.min(spread / 50, 1) * 0.04;
  } else {
    // 낮은 심각도의 실패 = 거의 정상 → 기록 구간.
    confidence = 0.3 + Math.min(spread / 50, 1) * 0.1;
  }
  confidence = round2(confidence);

  return {
    action: actionFor(confidence),
    confidence,
    reason: `근거 패턴: ${pattern.name} (${pattern.basis})`,
  };
}
