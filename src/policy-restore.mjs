// 10단계: 검증된 안전 정책 사본 버전으로 '시험 정책'을 되돌리는 계획을 세웁니다.
// 이 모듈은 순수 함수입니다(파일 쓰기 없음). 실제 쓰기는 CLI가 --apply 일 때만 합니다.
//  - 사본 검증 실패/없음이면 중단(previewRestore가 abort).
//  - 되돌림은 policy(ruleIds·allowedRoutes)만 바꾸고, 다른 서비스 규칙 등 나머지 키는 보존합니다.
import { previewRestore, canonicalPolicy } from './policy-diff.mjs';

export function planRestore({ snapshot, testPolicy }) {
  if (!testPolicy || typeof testPolicy !== 'object' || Array.isArray(testPolicy)
      || !testPolicy.policy || typeof testPolicy.policy !== 'object') {
    return { status: 'abort', reason: 'invalid_test_policy' };
  }
  // 검증 + 현재 시험 정책과의 차이. 실패하면 그대로 중단을 전달합니다.
  const preview = previewRestore({ snapshot, current: testPolicy.policy });
  if (preview.status === 'abort') return preview;

  const now = new Date().toISOString();
  // 되돌릴 다음 시험 정책: policy·버전·복원표식만 갱신하고 나머지 키(다른 서비스 규칙 등)는 보존.
  const nextTestPolicy = {
    ...testPolicy,
    policy: canonicalPolicy(snapshot.policy),
    version: preview.restoreVersion,
    restoredFrom: preview.restoreVersion,
    restoredAt: now,
  };
  // 감사 이력에 덧붙일 한 줄(덮어쓰기 아님).
  const audit = {
    at: now,
    action: 'restore',
    fromVersion: typeof testPolicy.version === 'string' ? testPolicy.version : null,
    toVersion: preview.restoreVersion,
    changeCount: preview.changes.changeCount,
    rulesToRestore: preview.changes.rulesToRestore,
    rulesToRemove: preview.changes.rulesToRemove,
    routesToRestore: preview.changes.routesToRestore,
    routesToRemove: preview.changes.routesToRemove,
  };
  return {
    status: 'ready',
    restoreVersion: preview.restoreVersion,
    verifiedAt: preview.verifiedAt,
    changes: preview.changes,
    nextTestPolicy,
    audit,
  };
}
