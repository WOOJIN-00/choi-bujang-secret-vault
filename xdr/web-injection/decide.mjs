// 웹 주입(MITRE ATT&CK T1190) 경보 판정기입니다.
// 심판은 인터넷 없이 이 파일 하나만 불러와 경보마다 바로 답을 받습니다.
// 그래서 이 파일은 다른 파일·패키지를 import 하지 않고, 파일을 읽거나 쓰지 않고,
// 네트워크에 묻지 않고, 넘겨받은 alert 하나만으로 혼자 계산합니다.

// ── 패턴 (xdr/web-injection/patterns.json 에서 옮겨 적은 상수) ──
// 근거: MITRE ATT&CK T1190 (Exploit Public-Facing Application) — https://attack.mitre.org/techniques/T1190/
const PATTERNS = Object.freeze({
  SQLI: Object.freeze({
    id: 'sql-injection',
    name: '요청 인자에 SQL 구문 주입',
    basis: 'MITRE T1190 — 공개 앱의 입력 검증 약점을 노려 SQL 구문을 주입(CWE-89 SQL Injection).',
  }),
  XSS: Object.freeze({
    id: 'xss-script-tag',
    name: '요청 인자에 스크립트 태그 주입',
    basis: 'MITRE T1190 — 공개 앱에 스크립트를 주입해 실행시키려는 시도(CWE-79 Cross-site Scripting).',
  }),
  TRAVERSAL: Object.freeze({
    id: 'path-traversal',
    name: '경로 거슬러 올라가기(../) 반복',
    basis: 'MITRE T1190 — 공개 앱의 경로 처리 약점으로 허용 밖 파일에 접근 시도(CWE-22 Path Traversal).',
  }),
  // 위 세 패턴에 딱 맞지는 않지만 같은 근거(T1190)의 웹 주입으로 확인된 경우에 쓰는 일반 라벨.
  GENERIC: Object.freeze({
    id: 'web-injection',
    name: '요청 인자 주입(기타 웹 주입)',
    basis: 'MITRE T1190 — 공개 앱 입력으로 주입을 시도(SQL·스크립트·경로 이탈 외 명령 구분자 등 포함).',
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

// 설명 문구로 어느 패턴에 해당하는지 고릅니다(reason 라벨용).
function matchPattern(description) {
  if (/스크립트/.test(description)) return PATTERNS.XSS;
  if (/SQL|구문을 이어|데이터베이스 조회를 이어/.test(description)) return PATTERNS.SQLI;
  if (/거슬러 올라|경로 이탈|\.\.\//.test(description)) return PATTERNS.TRAVERSAL;
  return PATTERNS.GENERIC;
}

// 경보 하나를 패턴과 맞춰 { action, confidence, reason } 로 답합니다.
// confidence(0~1): 경보가 웹 주입 패턴과 얼마나 뚜렷하게 맞는지.
//   - 근거(T1190)와 주입 신호가 분명할수록 높음(Wazuh 심각도 level을 주 신호로,
//     같은 주소의 반복 횟수(count)를 보조 신호로 사용).
export function decide(alert) {
  const rule = (alert && alert.rule) || {};
  const data = (alert && alert.data) || {};
  const level = Number.isFinite(rule.level) ? rule.level : 0;
  const description = typeof rule.description === 'string' ? rule.description : '';
  const mitre = Array.isArray(rule.mitre) ? rule.mitre : [];

  const isT1190 = mitre.includes('T1190');

  // 근거(T1190)가 없으면 웹 주입 패턴과 맞지 않음 → 정상 이벤트로 기록.
  // (정상 이벤트는 mitre가 비어 있음. 설명에 'select'·'스크립트' 같은 수업 낱말이 섞여도 그것에 기대지 않음.)
  if (!isT1190) {
    return {
      action: 'record',
      confidence: round2(Math.min(0.2, level / 25)),
      reason: '일치하는 웹 주입(T1190) 패턴 없음 — 정상 이벤트로 기록',
    };
  }

  // 같은 주소에서의 반복 횟수(보조 신호).
  const parsed = Number.parseInt(data.count, 10);
  const repeats = Number.isFinite(parsed) ? parsed : 0;

  const pattern = matchPattern(description);

  // 적합도 계산: Wazuh 심각도 밴드 + 반복 횟수 보조 가점.
  let confidence;
  if (level >= 10) {
    // 높은 심각도 = 주입 표기가 반복되는 뚜렷한 공격 → 차단 구간.
    confidence = 0.9 + Math.min(repeats / 20, 1) * 0.1;
  } else if (level >= 5) {
    // 중간 심각도 = 의심되나 1회성·수업 낱말일 수 있음 → 경보 구간(0.85 미만으로 유지).
    confidence = 0.5 + ((level - 5) / 4) * 0.3 + Math.min(repeats / 20, 1) * 0.04;
  } else {
    // 낮은 심각도 = 거의 정상 → 기록 구간.
    confidence = 0.3 + Math.min(repeats / 20, 1) * 0.1;
  }
  confidence = round2(confidence);

  return {
    action: actionFor(confidence),
    confidence,
    reason: `근거 패턴: ${pattern.name} (${pattern.basis})`,
  };
}
