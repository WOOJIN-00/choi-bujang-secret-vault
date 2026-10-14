// 10단계 복원 미리보기 CLI (읽기 전용).
// 침해 전 검증된 안전 정책 사본과 현재 시험 정책의 '차이만' 보여 줍니다.
// 사본이 없거나 검증 실패면 중단합니다. 어떤 파일도 쓰지 않습니다.
// 운영 정책(src/decider.mjs, aleph.config.json)은 읽지도 쓰지도 않습니다.
//   사용: npm run policy:diff                        (사본 policy/verified-policy.json ↔ 시험 정책 policy/test-policy.json)
//        npm run policy:diff -- --test <file>       (시험 정책 파일 지정, 침해 시뮬레이션용)
//        npm run policy:diff -- --snapshot <file>   (사본 파일 지정)
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { previewRestore } from '../src/policy-diff.mjs';

const root = resolve(import.meta.dirname, '..');
const out = (line) => process.stdout.write(`${line}\n`);

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

// 파일이 없으면 null(=중단 사유). 그 밖의 읽기 오류는 그대로 알립니다.
function loadJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw new Error(`읽을 수 없습니다(${relative(root, path)}): ${error.message}`);
  }
}

const REASONS = {
  no_snapshot: '검증된 안전 정책 사본이 없습니다.',
  invalid_snapshot: '사본 형식이 올바르지 않습니다.',
  schema_mismatch: '사본 스키마가 맞지 않습니다.',
  not_verified: '사본이 검증 표식(verified)을 갖고 있지 않습니다.',
  missing_policy: '사본에 정책 내용이 없습니다.',
  missing_integrity: '사본에 무결성 지문이 없습니다.',
  integrity_mismatch: '사본 무결성 지문이 내용과 일치하지 않습니다(손상/변조 의심).',
  invalid_test_policy: '현재 시험 정책이 없거나 형식이 올바르지 않습니다.',
};

const bullet = (label, items) => {
  if (items.length) out(`  ${label} (${items.length}): ${items.join(', ')}`);
};

try {
  const snapshotPath = resolve(arg('--snapshot') || join(root, 'policy', 'verified-policy.json'));
  const testPath = resolve(arg('--test') || join(root, 'policy', 'test-policy.json'));

  const snapshot = loadJson(snapshotPath); // 실행할 때마다 사본을 다시 읽어 검증합니다.
  const testPolicy = loadJson(testPath);
  const preview = previewRestore({ snapshot, current: testPolicy && testPolicy.policy });

  out('복원 미리보기 (읽기 전용 · 아무것도 적용하지 않음)');
  out(`사본: ${relative(root, snapshotPath)} · 시험 정책: ${relative(root, testPath)}`);
  if (preview.status === 'abort') {
    out(`중단: ${REASONS[preview.reason] || preview.reason}`);
    out('→ 아무것도 바꾸지 않았습니다. 유효한 사본과 시험 정책을 확인한 뒤 다시 실행하세요.');
    process.exitCode = 1;
  } else {
    out(`복원할 버전: ${preview.restoreVersion ?? '(미표기)'}${preview.verifiedAt ? ` · 검증 시각 ${preview.verifiedAt}` : ''}`);
    out(`현재 시험 정책 버전: ${typeof testPolicy.version === 'string' ? testPolicy.version : '(미표기)'}`);
    const c = preview.changes;
    if (c.identical) {
      out('변경 범위: 없음 (현재 시험 정책이 검증된 사본과 같습니다).');
    } else {
      out(`변경 범위: 총 ${c.changeCount}건 (복원하면 시험 정책이 아래처럼 바뀝니다)`);
      bullet('다시 들어올 규칙', c.rulesToRestore);
      bullet('빠질 규칙', c.rulesToRemove);
      bullet('다시 들어올 경로', c.routesToRestore);
      bullet('빠질 경로', c.routesToRemove);
    }
    out('→ 미리보기입니다. 시험 정책과 운영 정책 파일을 쓰지 않았습니다.');
  }
} catch (error) {
  process.stderr.write(`복원 미리보기 첫 오류: ${error.message}\n`);
  process.exitCode = 1;
}
