// 알려진 취약점 악용(CVE-2021-44228 형태, MITRE ATT&CK T1190) 경보 판정기입니다.
// 심판은 인터넷 없이 이 파일 하나만 불러와 경보마다 바로 답을 받습니다.
// 그래서 이 파일은 다른 파일·패키지를 import 하지 않고, 파일을 읽거나 쓰지 않고,
// 네트워크에 묻지 않고, 넘겨받은 alert 하나만으로 혼자 계산합니다.

// ── 패턴 (xdr/known-cve/patterns.json 에서 옮겨 적은 상수) ──
// 근거: CVE-2021-44228 형태 요청 · MITRE ATT&CK T1190 (Exploit Public-Facing Application) — https://attack.mitre.org/techniques/T1190/
const PATTERNS = Object.freeze({
  HEADER: Object.freeze({
    id: 'lookup-in-header',
    name: '요청 머리글에 원격 조회 구문',
    match: '요청 머리글(예: useragent)에 ${ 로 시작하는 표기 안의 jndi: 형태 원격 조회 구문이 완전한 모양으로 들어 있음',
    signals: Object.freeze(['요청 머리글 속 jndi 형태 원격 조회 구문', '여러 머리글에 같은 표기가 겹치면 더 강함']),
    notMatch: 'jndi·CVE-2021-44228 같은 단어만 있고 완전한 구문이 아닌 경우',
    basis: 'CVE-2021-44228 · T1190 — 머리글 값이 기록·해석될 때 원격 조회가 실행되는 공개 앱 취약점을 노린 요청 형태.',
  }),
  PARAM: Object.freeze({
    id: 'lookup-in-param',
    name: '요청 인자에 원격 조회 구문',
    match: '요청 주소의 인자(data.url의 쿼리 등)에 ${ 로 시작하는 표기 안의 jndi: 형태 원격 조회 구문이 완전한 모양으로 들어 있음',
    signals: Object.freeze(['요청 인자 속 jndi 형태 원격 조회 구문', '같은 주소에서 반복되면 더 강함']),
    notMatch: '인자에 CVE 번호나 jndi 단어, 잘린 조각(완전한 구문이 아님)만 있는 경우',
    basis: 'CVE-2021-44228 · T1190 — 인자 값이 기록될 때 원격 조회가 실행되는 공개 앱 취약점을 노린 요청 형태.',
  }),
  SCANNER: Object.freeze({
    id: 'scanner-trace-with-lookup',
    name: '알려진 취약점 점검 흔적과 조회 구문이 함께',
    match: '알려진 취약점을 훑는 점검 요청 흔적(상태 확인·탐색용 인자 등)이 있고 같은 요청에 원격 조회 구문도 들어 있음',
    signals: Object.freeze(['취약점 점검 흔적', '같은 요청의 원격 조회 구문']),
    notMatch: '점검 도구와 이름만 비슷한 프로그램·문서 조회처럼 조회 구문이 없는 경우(흔적만으로는 판정하지 않음)',
    basis: 'T1190 — 공개 앱에 알려진 취약점이 있는지 훑은 뒤 CVE-2021-44228 형태 요청으로 이어지는 악용 단계.',
  }),
});

// 임계값: confidence 0.85 이상 block, 0.5 이상 alert, 그 아래 record.
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;
const MAX_TEXT = 2000; // 너무 긴 값은 앞부분만 봅니다(계산량 제한).

// 데이터 값 중 머리글·인자가 아닌 칸(주소·계정·횟수)은 구문 검사에서 뺍니다.
const SKIP_KEYS = new Set(['srcip', 'srcuser', 'count']);

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const round2 = (n) => Math.round(clamp01(n) * 100) / 100;

function actionFor(confidence) {
  if (confidence >= BLOCK_AT) return 'block';
  if (confidence >= ALERT_AT) return 'alert';
  return 'record';
}

// ${lower:j}ndi 처럼 글자를 가려 쓴 표기를 풀어 같은 모양으로 맞춥니다(몇 번만, 계산량 제한).
function normalize(text) {
  let out = String(text).slice(0, MAX_TEXT);
  for (let i = 0; i < 4; i += 1) {
    const next = out.replace(/\$\{(?:lower|upper)?:?-?([^${}:]{0,3})\}/gi, (m, c) => (/^\$\{(?:lower|upper|::-|:-)/i.test(m) ? c : m));
    if (next === out) break;
    out = next;
  }
  return out;
}

// 완전한 jndi 형태 원격 조회 구문: ${jndi:<방식>://...}
const FULL_LOOKUP = /\$\{\s*jndi\s*:\s*[a-z]{2,8}:\/\/[^}\s]{1,200}\}/i;
// 불완전한 조각·단어: 이것만으로는 공격으로 보지 않습니다.
const WEAK_HINT = /jndi|cve-\d{4}-\d{4,7}|lookup|ldap|\$\{|log4|취약점|조회 구문|중괄호|점검 도구|라이브러리/i;
// 취약점을 훑는 점검 요청 흔적(확인·탐색용 인자).
const PROBE_TRACE = /[?&](?:probe|scan|check|test)=|\/(?:health|status|probe)\b/i;

function textOf(value) {
  return typeof value === 'string' ? value : '';
}

// 경보 하나를 패턴과 맞춰 { action, confidence, reason } 로 답합니다.
// confidence(0~1): 경보가 패턴과 얼마나 뚜렷하게 맞는지.
//   - 완전한 원격 조회 구문이 머리글·인자에 있으면 0.9 이상(block 구간). 머리글·인자에 함께 있거나 반복되면 더 높음.
//   - 구문은 없고 단어·조각만 있는 경우, 공격 계열(T1190)로 분류된 경보면 0.5~0.8(alert 구간, 0.85 미만).
//   - 아무 신호도 없으면 낮게(record 구간).
export function decide(alert) {
  const rule = alert && typeof alert === 'object' && alert.rule && typeof alert.rule === 'object' ? alert.rule : {};
  const data = alert && typeof alert === 'object' && alert.data && typeof alert.data === 'object' ? alert.data : {};
  const level = Number.isFinite(rule.level) ? rule.level : 0;
  const description = textOf(rule.description);
  const isT1190 = Array.isArray(rule.mitre) && rule.mitre.includes('T1190');

  // 머리글(url 이외 문자열 칸)과 인자(url) 에서 완전한 구문을 찾습니다.
  let inHeader = 0;
  let inParam = 0;
  let weakHits = 0;
  let urlText = '';
  for (const [key, raw] of Object.entries(data)) {
    if (SKIP_KEYS.has(key) || typeof raw !== 'string') continue;
    const text = normalize(raw);
    if (key === 'url') urlText = text;
    if (FULL_LOOKUP.test(text)) {
      if (key === 'url') inParam += 1; else inHeader += 1;
    } else if (WEAK_HINT.test(text)) {
      weakHits += 1;
    }
  }
  if (WEAK_HINT.test(description.slice(0, MAX_TEXT))) weakHits += 1;

  const parsed = Number.parseInt(data.count, 10);
  const repeats = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 20) : 0;

  const complete = inHeader + inParam;
  if (complete > 0) {
    // 뚜렷한 공격: 완전한 구문이 실제로 있음.
    let confidence = 0.9;
    if (inHeader > 0 && inParam > 0) confidence += 0.05; // 머리글과 인자에 함께
    else if (complete > 1) confidence += 0.03; // 여러 머리글에 겹침
    if (repeats >= 4) confidence += 0.03; // 같은 주소에서 반복
    confidence = round2(Math.min(confidence, 0.99));
    const pattern = PROBE_TRACE.test(urlText) && inParam > 0 && inHeader === 0 && /\/(?:health|status|probe)\b|[?&]probe=/i.test(urlText)
      ? PATTERNS.SCANNER
      : inHeader > 0 ? PATTERNS.HEADER : PATTERNS.PARAM;
    return {
      action: actionFor(confidence),
      confidence,
      reason: `근거 패턴: ${pattern.name} (${pattern.basis})`,
    };
  }

  if (isT1190 && weakHits > 0) {
    // 애매한 시도: 단어·조각만 있고 완전한 구문은 없음 → 알림(0.85 미만으로 유지).
    const confidence = round2(Math.min(0.5 + Math.min(weakHits - 1, 3) * 0.05 + Math.min(level, 10) * 0.01 + Math.min(repeats / 20, 1) * 0.04, 0.8));
    return {
      action: actionFor(confidence),
      confidence,
      reason: '패턴 일부만 맞음(완전한 원격 조회 구문 없음) — 알림으로 남김',
    };
  }

  // 정상 이벤트: 일치하는 패턴이 없음. 공격 계열 표시가 없으면 더 낮게.
  const confidence = round2(Math.min(0.2, (isT1190 ? 0.1 : 0.02) + (weakHits > 0 ? 0.08 : 0) + level / 100));
  return {
    action: actionFor(confidence),
    confidence,
    reason: '일치하는 알려진 취약점 패턴 없음 — 정상 이벤트로 기록',
  };
}
