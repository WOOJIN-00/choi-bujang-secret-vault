// 10단계 복원 미리보기 CLI (읽기 전용).
// 침해 전 검증된 안전 정책 사본과 현재 시험 정책의 '차이만' 보여 줍니다.
// 사본이 없거나 검증 실패면 중단합니다. 운영 정책 파일은 절대 쓰지 않습니다.
//   사용: npm run policy:diff            (현재 정책 = 저장소의 decider.mjs + aleph.config.json)
//        npm run policy:diff -- --current <file>   (현재 정책을 파일로 대체, 침해 시뮬레이션용)
//        npm run policy:diff -- --snapshot <file>  (사본 경로 지정)
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { previewRestore } from '../src/policy-diff.mjs';

const root = resolve(import.meta.dirname, '..');
const out = (line) => process.stdout.write(`${line}\n`);

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

// 사본 읽기. 파일이 없으면 null(=중단 사유 no_snapshot).
function loadSnapshot(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw new Error(`사본을 읽을 수 없습니다: ${error.message}`);
  }
}

// 현재 시험 정책을 읽습니다. 기본은 저장소의 운영 파일에서 '읽기만' 합니다.
async function loadCurrentPolicy(currentPath) {
  if (currentPath) {
    const doc = JSON.parse(readFileSync(resolve(root, currentPath), 'utf8'));
    return { ruleIds: doc.ruleIds, allowedRoutes: doc.allowedRoutes };
  }
  const { RULE_IDS } = await import(pathToFileURL(join(root, 'src', 'decider.mjs')).href);
  const config = JSON.parse(readFileSync(join(root, 'aleph.config.json'), 'utf8'));
  return { ruleIds: [...RULE_IDS], allowedRoutes: config.allowedRoutes };
}

const REASONS = {
  no_snapshot: '검증된 안전 정책 사본이 없습니다.',
  invalid_snapshot: '사본 형식이 올바르지 않습니다.',
  schema_mismatch: '사본 스키마가 맞지 않습니다.',
  not_verified: '사본이 검증 표식(verified)을 갖고 있지 않습니다.',
  missing_policy: '사본에 정책 내용이 없습니다.',
  missing_integrity: '사본에 무결성 지문이 없습니다.',
  integrity_mismatch: '사본 무결성 지문이 내용과 일치하지 않습니다(손상/변조 의심).',
};

const bullet = (label, items) => {
  if (!items.length) return;
  out(`  ${label} (${items.length}): ${items.join(', ')}`);
};

try {
  const snapshotPath = arg('--snapshot') || join(root, 'policy', 'verified-policy.json');
  const snapshot = loadSnapshot(snapshotPath);
  const current = await loadCurrentPolicy(arg('--current'));

  const preview = previewRestore({ snapshot, current });

  out('복원 미리보기 (읽기 전용 · 아무것도 적용하지 않음)');
  if (preview.status === 'abort') {
    out(`중단: ${REASONS[preview.reason] || preview.reason}`);
    out('→ 운영 정책을 바꾸지 않았습니다. 유효한 사본을 확인한 뒤 다시 실행하세요.');
    process.exitCode = 1;
  } else {
    out(`복원 대상 버전: ${preview.restoreVersion ?? '(미표기)'}${preview.verifiedAt ? ` · 검증 시각 ${preview.verifiedAt}` : ''}`);
    const c = preview.changes;
    if (c.identical) {
      out('변경 범위: 없음 (현재 시험 정책이 검증된 사본과 같습니다).');
    } else {
      out(`변경 범위: 총 ${c.changeCount}건 (복원 시 현재 정책이 아래처럼 바뀝니다)`);
      bullet('다시 들어올 규칙', c.rulesToRestore);
      bullet('빠질 규칙', c.rulesToRemove);
      bullet('다시 들어올 경로', c.routesToRestore);
      bullet('빠질 경로', c.routesToRemove);
    }
    out('→ 이것은 미리보기입니다. 운영 정책 파일을 쓰지 않았습니다.');
  }
} catch (error) {
  process.stderr.write(`복원 미리보기 첫 오류: ${error.message}\n`);
  process.exitCode = 1;
}
