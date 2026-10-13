// 10단계: 침해 전에 '검증한 안전 정책 사본'과 '현재 시험 정책'의 차이만 보여 줍니다.
// 이 모듈은 읽기 전용입니다. 어떤 파일도 쓰지 않고, 실제 운영 정책을 바꾸지 않습니다.
// 사본이 없거나 검증에 실패하면 미리보기를 '중단(abort)'으로 돌려줍니다.
import { createHash } from 'node:crypto';

export const SNAPSHOT_SCHEMA = 'aleph.policy.snapshot.v1';

// 정책을 비교·해시용으로 정규화합니다(규칙·경로를 정렬·중복 제거). 다른 키는 보지 않습니다.
export function canonicalPolicy(policy) {
  const list = (value) => (Array.isArray(value)
    ? [...new Set(value.filter((v) => typeof v === 'string'))].sort()
    : []);
  return {
    ruleIds: list(policy && policy.ruleIds),
    allowedRoutes: list(policy && policy.allowedRoutes),
  };
}

// 정규화한 정책의 SHA-256 지문. 사본 파일의 무결성(손상·형식) 검사에 씁니다.
// 서명 키가 아니라 무결성 지문이므로, 출처 위조까지 막는 암호 인증은 아닙니다.
export function policyHash(policy) {
  const canonical = canonicalPolicy(policy);
  const text = JSON.stringify([canonical.ruleIds, canonical.allowedRoutes]);
  return createHash('sha256').update(text).digest('hex');
}

// 사본 검증: 스키마·검증표식·무결성 지문을 확인합니다. 하나라도 어긋나면 ok:false와 사유.
export function verifySnapshot(snapshot) {
  if (snapshot === null || snapshot === undefined) return { ok: false, reason: 'no_snapshot' };
  if (typeof snapshot !== 'object' || Array.isArray(snapshot)) return { ok: false, reason: 'invalid_snapshot' };
  if (snapshot.schema !== SNAPSHOT_SCHEMA) return { ok: false, reason: 'schema_mismatch' };
  if (snapshot.verified !== true) return { ok: false, reason: 'not_verified' };
  if (!snapshot.policy || typeof snapshot.policy !== 'object' || Array.isArray(snapshot.policy)) {
    return { ok: false, reason: 'missing_policy' };
  }
  const integrity = snapshot.integrity;
  if (!integrity || integrity.algo !== 'sha256' || typeof integrity.sha256 !== 'string') {
    return { ok: false, reason: 'missing_integrity' };
  }
  if (policyHash(snapshot.policy) !== integrity.sha256) return { ok: false, reason: 'integrity_mismatch' };
  return {
    ok: true,
    version: typeof snapshot.version === 'string' ? snapshot.version : null,
    verifiedAt: typeof snapshot.verifiedAt === 'string' ? snapshot.verifiedAt : null,
  };
}

// 두 정책의 차이. 사본(verified)으로 되돌릴 때 기준으로 서술합니다.
//  - rulesToRestore / routesToRestore : 사본에는 있고 현재엔 없음 → 복원 시 다시 들어옴
//  - rulesToRemove  / routesToRemove  : 현재엔 있고 사본엔 없음 → 복원 시 빠짐
export function diffPolicy(verifiedPolicy, currentPolicy) {
  const from = canonicalPolicy(verifiedPolicy); // 복원 대상(사본)
  const to = canonicalPolicy(currentPolicy); // 현재 시험 정책
  const only = (a, b) => a.filter((v) => !b.includes(v));
  const rulesToRestore = only(from.ruleIds, to.ruleIds);
  const rulesToRemove = only(to.ruleIds, from.ruleIds);
  const routesToRestore = only(from.allowedRoutes, to.allowedRoutes);
  const routesToRemove = only(to.allowedRoutes, from.allowedRoutes);
  const changeCount = rulesToRestore.length + rulesToRemove.length
    + routesToRestore.length + routesToRemove.length;
  return {
    identical: changeCount === 0,
    changeCount,
    rulesToRestore,
    rulesToRemove,
    routesToRestore,
    routesToRemove,
  };
}

// 복원 미리보기. 검증을 통과해야만 차이를 돌려주고, 실패하면 중단합니다. 아무것도 적용하지 않습니다.
export function previewRestore({ snapshot, current }) {
  const verdict = verifySnapshot(snapshot);
  if (!verdict.ok) return { status: 'abort', reason: verdict.reason };
  return {
    status: 'ready',
    restoreVersion: verdict.version,
    verifiedAt: verdict.verifiedAt,
    changes: diffPolicy(snapshot.policy, current),
  };
}
