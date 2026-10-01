import { DOCUMENT_EXTENSIONS, DOCUMENT_MAX_BYTES } from '../../src/constants/personnel.js';

const SIGNATURES = {
  pdf: (b) => b.subarray(0, 4).toString('latin1') === '%PDF',
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8',
  webp: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

/** 경로·제어문자·금지 문자를 빼고 150자 이내로 줄입니다(확장자 유지). */
export function cleanFileName(value) {
  const raw = value == null ? '' : String(value).trim();
  const base = [...raw.split(/[\\/]/).pop()]
    .filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127)
    .join('')
    .replace(/["<>|:*?]/g, '')
    .trim();
  if (!base) throw httpError('파일 이름이 없습니다.');
  if (base.length <= 150) return base;
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot) : '';
  return base.slice(0, 150 - ext.length) + ext;
}

/** 올린 파일의 이름·형식·크기·내용을 확인하고 { name, extension } 을 돌려줍니다. */
export function validateUpload(fileName, content) {
  const name = cleanFileName(fileName);
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (!DOCUMENT_EXTENSIONS[extension]) {
    throw httpError(`올릴 수 없는 파일 형식입니다. (${Object.keys(DOCUMENT_EXTENSIONS).join(', ')})`);
  }
  if (!Buffer.isBuffer(content) || !content.length) throw httpError('파일 내용이 비어 있습니다.');
  if (content.length > DOCUMENT_MAX_BYTES) {
    throw httpError(`파일은 ${Math.round(DOCUMENT_MAX_BYTES / 1024 / 1024)}MB 이하만 올릴 수 있습니다.`, 413);
  }
  if (SIGNATURES[extension] && !SIGNATURES[extension](content)) {
    throw httpError(`파일 내용이 확장자(.${extension})와 맞지 않습니다.`);
  }
  return { name, extension };
}

/** 내려받기 응답 헤더 */
export function sendFile(res, { fileName, extension, content }) {
  res.setHeader('Content-Type', DOCUMENT_EXTENSIONS[extension] || 'application/octet-stream');
  res.setHeader('Content-Length', String(content.length));
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(content);
}
