// 10단계 복원 대조 로컬 확인. 시험 계정 B의 가상 메모 한 건으로만 확인합니다.
// 실제 DB·네트워크 없이 순수 대조 함수(api/_restore.js)만 시험합니다.
import { isDeepStrictEqual } from 'node:util';
import {
  contentHash, verifyAgainstBackup, verifyRestored, saveVerifiedBackup,
} from '../api/_restore.js';

// 생성 시 백업이 실제로 어떤 사본 행을 만드는지 확인하는 가짜 supabase(메모리).
function fakeSupabase() {
  const rows = [];
  return {
    rows,
    from() {
      return { upsert(row) { rows.push(row); return Promise.resolve({ error: null }); } };
    },
  };
}

// 가상 시험 자료(assign-owners.sql의 'B 시험 메모'와 같은 내용). 실명·토큰·실제 본문 아님.
const B = { kind: 'student', userId: '11111111-1111-4111-8111-111111111111' };
const A = { kind: 'student', userId: '22222222-2222-4222-8222-222222222222' };
const noteId = '33333333-3333-4333-8333-333333333333';
const bContent = '실습용 가상 시험 메모 (B 소유)';
const backup = {
  id: noteId, owner_id: B.userId, title: 'B 시험 메모',
  content: bContent, content_sha256: contentHash(bContent),
};

const cases = [
  {
    name: 'B가 B 사본 한 건 복원 대조 → ID·소유자·내용 해시 일치',
    run: () => verifyAgainstBackup({ identity: B, requestedId: noteId, backup }),
    expect: { ok: true, ownerId: B.userId, contentSha256: backup.content_sha256 },
  },
  {
    name: '복원 후 대조 → 되살린 행이 사본과 같음',
    run: () => verifyRestored({ backup, restored: { id: noteId, owner_id: B.userId, content: bContent } }),
    expect: { ok: true },
  },
  {
    name: 'A가 B 사본 복원 시도 → 소유자 아님(차단)',
    run: () => verifyAgainstBackup({ identity: A, requestedId: noteId, backup }),
    expect: { ok: false, reason: 'not_owner' },
  },
  {
    name: '손상된 사본(내용 해시 불일치) → 복원 중단',
    run: () => verifyAgainstBackup({ identity: B, requestedId: noteId, backup: { ...backup, content_sha256: 'deadbeef' } }),
    expect: { ok: false, reason: 'backup_integrity_mismatch' },
  },
  {
    name: '다른 ID 요청 → ID 불일치(차단)',
    run: () => verifyAgainstBackup({ identity: B, requestedId: '44444444-4444-4444-8444-444444444444', backup }),
    expect: { ok: false, reason: 'id_mismatch' },
  },
  {
    name: '복원본 내용이 바뀜 → 내용 해시 불일치 감지',
    run: () => verifyRestored({ backup, restored: { id: noteId, owner_id: B.userId, content: '변조됨' } }),
    expect: { ok: false, reason: 'content_mismatch' },
  },
];

let failed = 0;
for (const item of cases) {
  const actual = item.run();
  const passed = isDeepStrictEqual(actual, item.expect);
  if (!passed) failed += 1;
  process.stdout.write(`${passed ? '통과' : '확인 필요'} · ${item.name}\n`);
}

// 생성 시 백업 → 복원 대조: POST /api/notes가 남긴 사본으로 B가 복원하면 ID·소유자·내용 해시 일치.
const sb = fakeSupabase();
await saveVerifiedBackup(sb, { id: noteId, owner_id: B.userId, title: 'B 시험 메모', content: bContent });
const madeBackup = sb.rows[0];
const chainOk = madeBackup
  && verifyAgainstBackup({ identity: B, requestedId: noteId, backup: madeBackup }).ok
  && madeBackup.content_sha256 === contentHash(bContent);
if (!chainOk) failed += 1;
process.stdout.write(`${chainOk ? '통과' : '확인 필요'} · 생성 시 백업한 사본으로 B 복원 대조 통과\n`);
process.stdout.write(`복구 대상 한 건의 내용 해시(sha256) = ${backup.content_sha256.slice(0, 16)}…\n`);
process.stdout.write('가상 자료 로컬 대조이며 실제 DB 복원·심판 판정이 아닙니다.\n');
if (failed) process.exitCode = 1;
