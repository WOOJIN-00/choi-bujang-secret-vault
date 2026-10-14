// 10단계 복원 절차 CLI.
// 검증된 안전 정책 사본 버전으로 시험 정책(policy/test-policy.json)을 되돌립니다.
//   npm run policy:restore             → 미리보기만(바뀔 항목 확인, 쓰기 없음)
//   npm run policy:restore -- --apply  → 확인 후 실제 되돌림 + 감사 이력 덧붙이기
// 사본 없음/검증 실패면 중단합니다. 운영 코드·aleph.config.json·다른 서비스 규칙은 건드리지 않습니다.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { planRestore } from '../src/policy-restore.mjs';

const root = resolve(import.meta.dirname, '..');
const out = (line) => process.stdout.write(`${line}\n`);
const has = (flag) => process.argv.includes(flag);
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
};

const REASONS = {
  no_snapshot: '검증된 안전 정책 사본이 없습니다.',
  invalid_snapshot: '사본 형식이 올바르지 않습니다.',
  schema_mismatch: '사본 스키마가 맞지 않습니다.',
  not_verified: '사본이 검증 표식(verified)을 갖고 있지 않습니다.',
  missing_policy: '사본에 정책 내용이 없습니다.',
  missing_integrity: '사본에 무결성 지문이 없습니다.',
  integrity_mismatch: '사본 무결성 지문이 내용과 일치하지 않습니다(손상/변조 의심).',
  invalid_test_policy: '시험 정책(policy/test-policy.json) 형식이 올바르지 않습니다.',
};

function loadJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw new Error(`읽을 수 없습니다(${path}): ${error.message}`);
  }
}

const bullet = (label, items) => { if (items.length) out(`  ${label} (${items.length}): ${items.join(', ')}`); };

try {
  const snapshotPath = arg('--snapshot') || join(root, 'policy', 'verified-policy.json');
  const testPath = arg('--test') || join(root, 'policy', 'test-policy.json');
  const auditPath = join(root, 'policy', 'restore-audit.log');
  const apply = has('--apply');

  const snapshot = loadJson(snapshotPath);
  const testPolicy = loadJson(testPath);
  const plan = planRestore({ snapshot, testPolicy });

  out(`정책 복원 ${apply ? '실행' : '미리보기'} (대상: ${testPath.replace(root + '\\', '').replace(root + '/', '')})`);

  if (plan.status === 'abort') {
    out(`중단: ${REASONS[plan.reason] || plan.reason}`);
    out('→ 아무것도 바꾸지 않았습니다. 유효한 사본·시험 정책을 확인한 뒤 다시 실행하세요.');
    process.exitCode = 1;
  } else {
    out(`복원 대상 버전: ${plan.restoreVersion ?? '(미표기)'}${plan.verifiedAt ? ` · 검증 시각 ${plan.verifiedAt}` : ''}`);
    const c = plan.changes;
    if (c.identical) {
      out('바뀔 항목: 없음 (시험 정책이 이미 검증된 사본과 같습니다).');
    } else {
      out(`바뀔 항목: 총 ${c.changeCount}건`);
      bullet('다시 들어올 규칙', c.rulesToRestore);
      bullet('빠질 규칙', c.rulesToRemove);
      bullet('다시 들어올 경로', c.routesToRestore);
      bullet('빠질 경로', c.routesToRemove);
    }

    if (!apply) {
      out('→ 미리보기입니다. 실제로 되돌리려면 --apply 를 붙여 다시 실행하세요.');
    } else if (c.identical) {
      out('→ 바뀔 항목이 없어 되돌리지 않았습니다(감사 이력도 남기지 않음).');
    } else {
      // 다른 서비스 규칙 등 나머지 키는 planRestore가 보존한 nextTestPolicy로 저장.
      writeFileSync(testPath, `${JSON.stringify(plan.nextTestPolicy, null, 2)}\n`, 'utf8');
      // 감사 이력: 한 줄 덧붙이기(기존 내용 보존).
      appendFileSync(auditPath, `${JSON.stringify(plan.audit)}\n`, 'utf8');
      out(`→ 되돌렸습니다. 시험 정책을 ${plan.restoreVersion} 으로 복원하고 감사 이력 1줄을 덧붙였습니다.`);
      out('   운영 코드·aleph.config.json·다른 서비스 규칙은 바꾸지 않았습니다.');
    }
  }
} catch (error) {
  process.stderr.write(`정책 복원 첫 오류: ${error.message}\n`);
  process.exitCode = 1;
}
