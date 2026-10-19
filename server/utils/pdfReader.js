import { createRequire } from 'node:module';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

/**
 * PDF 를 쪽마다 읽습니다(pdf.js, 그리기 없이).
 * - 글자 정보가 있는 쪽(한글·워드에서 저장, 발급 PDF, 글자층이 있는 스캔본): 글자를 그대로 꺼냅니다.
 * - 스캔 쪽: 가장 큰 그림을 PNG 로 꺼내 OCR 에 넘깁니다. JPEG·흑백 팩스(CCITT)·JBIG2·JPEG2000 모두 pdf.js 가 풉니다.
 */

const require = createRequire(import.meta.url);
const PDFJS_DIR = path.dirname(require.resolve('pdfjs-dist/package.json'));
const MIN_TEXT_CHARS = 20;
const MIN_READABLE_RATIO = 0.8;
const IMAGE_KIND = { GRAYSCALE_1BPP: 1, RGB_24BPP: 2, RGBA_32BPP: 3 };

let pdfjsPromise = null;

function loadPdfjs() {
  pdfjsPromise ||= (async () => {
    globalThis.pdfjsWorker ||= await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    return import('pdfjs-dist/legacy/build/pdf.mjs');
  })();
  return pdfjsPromise;
}

function readError(message) {
  return Object.assign(new Error(message), { status: 400 });
}

/** 위치(y, x)로 글자 조각을 줄로 묶습니다. */
function textFromItems(items) {
  const parts = items
    .filter((item) => item.str && item.str.trim())
    .map((item) => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      w: item.width || 0,
      h: Math.abs(item.height || item.transform[3] || 10),
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const part of parts) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - part.y) <= Math.max(2, Math.min(line.h, part.h) * 0.5)) line.parts.push(part);
    else lines.push({ y: part.y, h: part.h, parts: [part] });
  }
  return lines
    .map((line) => {
      const sorted = line.parts.sort((a, b) => a.x - b.x);
      let out = '';
      let end = null;
      for (const part of sorted) {
        if (end !== null && part.x - end > part.h * 0.2 && !out.endsWith(' ')) out += ' ';
        out += part.str;
        end = part.x + part.w;
      }
      return out.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean)
    .join('\n');
}

/** 글꼴에 글자 대응표가 없으면 이상한 기호로 나옵니다. 읽을 수 있는 글자 비율로 판단합니다. */
function readableText(text) {
  const chars = text.replace(/\s/g, '');
  if (chars.length < MIN_TEXT_CHARS) return false;
  const good = chars.match(/[가-힣ㄱ-ㅎㅏ-ㅣ一-龥A-Za-z0-9.,:;()[\]{}<>~\-–—_/\\@·•※■□○●◎%&+*#'"!?=|]/g)?.length || 0;
  return good / chars.length >= MIN_READABLE_RATIO;
}

function objectOf(page, name) {
  const store = name.startsWith('g_') ? page.commonObjs : page.objs;
  return new Promise((resolve) => store.get(name, resolve));
}

async function largestImage(page, pdfjs, minSide) {
  const { OPS } = pdfjs;
  const ops = await page.getOperatorList();
  let best = null;
  for (let i = 0; i < ops.fnArray.length; i += 1) {
    const fn = ops.fnArray[i];
    const arg = ops.argsArray[i]?.[0];
    let image = null;
    if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) image = await objectOf(page, arg);
    else if (fn === OPS.paintInlineImageXObject) image = arg;
    else if (fn === OPS.paintImageMaskXObject) image = arg && { ...arg, kind: IMAGE_KIND.GRAYSCALE_1BPP };
    if (!image?.data || !image.width || !image.height) continue;
    if (Math.min(image.width, image.height) < minSide) continue;
    if (!best || image.width * image.height > best.width * best.height) best = image;
  }
  return best;
}

/** pdf.js 가 푼 그림(raw)을 PNG 로 만듭니다. */
function imageToPng({ width, height, kind, data }) {
  let channels;
  let bitDepth = 8;
  let rowBytes;
  if (kind === IMAGE_KIND.GRAYSCALE_1BPP) {
    channels = 1;
    bitDepth = 1;
    rowBytes = (width + 7) >> 3;
  } else if (kind === IMAGE_KIND.RGB_24BPP) {
    channels = 3;
    rowBytes = width * 3;
  } else if (kind === IMAGE_KIND.RGBA_32BPP) {
    channels = 4;
    rowBytes = width * 4;
  } else {
    return null;
  }
  if (data.length < rowBytes * height) return null;

  // 1비트 그림은 바탕(흰색)이 대부분이므로, 0이 더 많으면 뒤집어 1을 흰색으로 맞춥니다.
  let invert = false;
  if (bitDepth === 1) {
    let ones = 0;
    const step = Math.max(1, Math.floor((rowBytes * height) / 20000));
    let samples = 0;
    for (let i = 0; i < rowBytes * height; i += step) {
      let b = data[i];
      while (b) {
        ones += b & 1;
        b >>= 1;
      }
      samples += 8;
    }
    invert = ones < samples / 2;
  }

  const rows = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const at = y * (rowBytes + 1) + 1;
    rows.set(data.subarray(y * rowBytes, (y + 1) * rowBytes), at);
    if (invert) for (let i = at; i < at + rowBytes; i += 1) rows[i] ^= 0xff;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = { 1: 0, 3: 2, 4: 6 }[channels];
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * @returns {{ totalPages, pages: Array<{ text: string } | { image: Buffer }>, garbledPages: number }}
 */
export async function readPdfPages(buffer, { maxPages = 5, minSide = 400 } = {}) {
  const pdfjs = await loadPdfjs();
  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      cMapUrl: `${path.join(PDFJS_DIR, 'cmaps')}${path.sep}`,
      cMapPacked: true,
      standardFontDataUrl: `${path.join(PDFJS_DIR, 'standard_fonts')}${path.sep}`,
      disableFontFace: true,
      useSystemFonts: false,
      isEvalSupported: false,
      isOffscreenCanvasSupported: false,
      verbosity: 0,
    }).promise;
  } catch (error) {
    if (error?.name === 'PasswordException') throw readError('암호가 걸린 PDF는 읽을 수 없습니다.');
    throw readError('PDF 파일을 열지 못했습니다. 파일이 손상되었는지 확인하세요.');
  }
  try {
    const pages = [];
    let garbledPages = 0;
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n += 1) {
      const page = await doc.getPage(n);
      const text = textFromItems((await page.getTextContent()).items);
      if (readableText(text)) {
        pages.push({ text });
      } else {
        if (text.replace(/\s/g, '').length >= MIN_TEXT_CHARS) garbledPages += 1;
        const image = await largestImage(page, pdfjs, minSide);
        const png = image && imageToPng(image);
        if (png) pages.push({ image: png });
      }
      page.cleanup();
    }
    return { totalPages: doc.numPages, pages, garbledPages };
  } finally {
    await doc.destroy();
  }
}
