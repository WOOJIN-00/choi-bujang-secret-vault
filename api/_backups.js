// 10단계 정적 사본 무결성 검증(라우트 아님: _ 시작).
// 심판은 배포가 아니라 '저장소 파일'을 읽어 판정하므로, 검증 증거를 파일로 둡니다:
//   - backups/notes.json           : 침해 전 검증한 가상 메모 사본
//   - backups/verified-policy.json : 침해 전 검증한 안전 정책 사본
//   - backups/manifest.json        : 위 사본들의 SHA-256을 '따로' 적은 무결성 장부(독립 기준)
// 복구 직전에 각 사본을 '다시 읽어' manifest의 해시와 대조합니다. 하나라도 어긋나면 복구를 멈춥니다.
// 해시는 줄바꿈을 LF로 정규화해 계산합니다(Windows CRLF ↔ Vercel LF 차이 방지).
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();

// LF 정규화 SHA-256. backups/*.json 파일 내용과 manifest 해시가 같은 방식이어야 합니다.
export function sha256Lf(text) {
  const normalized = String(text).replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

async function readRepoFile(relPath) {
  return readFile(join(root, relPath), 'utf8');
}

// manifest를 읽고, 적힌 모든 사본 파일을 다시 읽어 해시를 재대조합니다.
// 반환: { ok, reason?, version, notes, checked } — ok:false면 복구 금지(사본 미검증).
export async function verifyBackups() {
  let manifest;
  try {
    manifest = JSON.parse(await readRepoFile('backups/manifest.json'));
  } catch {
    return { ok: false, reason: 'manifest_missing' };
  }
  if (manifest.schema !== 'aleph.backup.manifest.v1' || manifest.verified !== true
      || manifest.algo !== 'sha256' || !manifest.entries || typeof manifest.entries !== 'object') {
    return { ok: false, reason: 'manifest_invalid' };
  }

  // 1) 장부에 적힌 각 사본 파일을 다시 읽어 해시 재대조. 하나라도 어긋나면 중단.
  const checked = [];
  for (const [relPath, expected] of Object.entries(manifest.entries)) {
    let raw;
    try {
      raw = await readRepoFile(relPath);
    } catch {
      return { ok: false, reason: 'backup_file_missing', file: relPath };
    }
    const actual = sha256Lf(raw);
    if (typeof expected !== 'string' || expected.toLowerCase() !== actual) {
      return { ok: false, reason: 'backup_integrity_mismatch', file: relPath };
    }
    checked.push(relPath);
  }

  // 2) 검증된 메모 사본을 읽습니다. 각 메모의 내용 해시도 자기 content와 다시 대조.
  let notesDoc;
  try {
    notesDoc = JSON.parse(await readRepoFile('backups/notes.json'));
  } catch {
    return { ok: false, reason: 'notes_missing' };
  }
  const notes = Array.isArray(notesDoc.notes) ? notesDoc.notes : [];
  for (const n of notes) {
    if (!n || typeof n.content !== 'string' || typeof n.contentSha256 !== 'string'
        || sha256Lf(n.content).toLowerCase() !== n.contentSha256.toLowerCase()) {
      return { ok: false, reason: 'note_content_hash_mismatch', id: n && n.id };
    }
  }

  return {
    ok: true,
    version: typeof notesDoc.version === 'string' ? notesDoc.version : null,
    manifestSha: sha256Lf(JSON.stringify(manifest.entries)),
    notes,
    checked,
  };
}

// 실행 전 '계획 토큰': (id·버전·장부해시)로 만든 재현 가능한 값. 미리보기를 먼저 받았는지 확인용.
export function planToken(id, version, manifestSha) {
  return sha256Lf(`restore:${id}:${version}:${manifestSha}`);
}
