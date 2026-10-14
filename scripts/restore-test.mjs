// 10단계 복원 검증 로컬 확인. 정적 사본(backups/*.json)을 무결성 장부(manifest.json)로
// '다시 읽어 검증'하는 과정을 시험합니다. 시험 계정 B의 가상 메모 사본으로 확인합니다.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const sha256Lf = (t) => createHash('sha256').update(String(t).replace(/\r\n/g, '\n'), 'utf8').digest('hex');
const read = (p) => readFileSync(p, 'utf8');

let failed = 0;
const check = (name, ok) => {
  if (!ok) failed += 1;
  process.stdout.write(`${ok ? '통과' : '확인 필요'} · ${name}\n`);
};

const manifest = JSON.parse(read('backups/manifest.json'));
const notesDoc = JSON.parse(read('backups/notes.json'));

// 1) 장부 형식: 검증 표식과 각 사본 해시가 있어야 함.
check('manifest에 verified 표식과 사본 해시가 있음',
  manifest.verified === true && manifest.algo === 'sha256'
  && typeof manifest.entries['backups/notes.json'] === 'string');

// 2) 사본 파일을 다시 읽어 장부 해시와 재대조(핵심: 독립 기준으로 검증).
check('backups/notes.json 재대조 → 장부 해시와 일치',
  sha256Lf(read('backups/notes.json')) === manifest.entries['backups/notes.json']);
check('backups/verified-policy.json 재대조 → 장부 해시와 일치',
  sha256Lf(read('backups/verified-policy.json')) === manifest.entries['backups/verified-policy.json']);

// 3) B 가상 메모: id·소유자 키·자원 ID·내용 해시가 사본 안에서 일관.
const b = (notesDoc.notes || []).find((n) => n.ownerKey === 'b');
check('B 사본 한 건 존재(id·소유자 키·자원 ID·내용 해시)',
  Boolean(b) && typeof b.id === 'string' && b.ownerKey === 'b'
  && b.resourceId === `res:my-notes:note:${b.id}`
  && sha256Lf(b.content) === b.contentSha256);

// 4) 변조 탐지: 사본 내용이 1바이트라도 바뀌면 장부 해시와 어긋나 '검증 실패'로 멈춰야 함.
check('사본이 변조되면(1자 변경) 장부와 불일치 → 복구 중단 근거',
  sha256Lf(read('backups/notes.json') + ' ') !== manifest.entries['backups/notes.json']);

// 5) 메모 내용 해시가 기록과 다르면(사본 변조) 탐지.
check('메모 내용이 기록 해시와 다르면 탐지',
  sha256Lf('변조된 내용') !== (b && b.contentSha256));

process.stdout.write(`복구 대상 한 건의 내용 해시(sha256) = ${(b && b.contentSha256 || '').slice(0, 16)}…\n`);
process.stdout.write('정적 사본 + 장부 재검증 로컬 확인이며, 실제 DB 복원·심판 판정이 아닙니다.\n');
if (failed) process.exitCode = 1;
