import { deflateSync, inflateSync } from 'node:zlib';

/**
 * 스캔 PDF 에 들어 있는 페이지 이미지를 꺼냅니다. PDF 를 그리지 않고 이미지 스트림만 읽으므로
 * 스캐너가 만든 PDF(페이지마다 JPEG·무손실 이미지 1장)에만 맞습니다.
 * 지원: DCTDecode(JPEG), FlateDecode 8비트 흑백·컬러, 1비트 흑백.
 * 돌려주는 값: { images: [{ buffer, width, height }], skipped: ['CCITTFaxDecode', ...] }
 */
export function extractPdfImages(pdf, { maxImages = 5, minSide = 400 } = {}) {
  const src = pdf.toString('latin1');
  if (!src.startsWith('%PDF')) throw new Error('PDF 파일이 아닙니다.');
  if (/\/Encrypt\s/.test(src)) throw new Error('암호가 걸린 PDF는 읽을 수 없습니다.');

  const images = [];
  const skipped = [];
  const seen = new Set();
  const subtype = /\/Subtype\s*\/Image\b/g;
  let match;
  while ((match = subtype.exec(src)) && images.length < maxImages) {
    const objStart = src.lastIndexOf(' obj', match.index);
    const streamAt = src.indexOf('stream', match.index);
    if (objStart < 0 || streamAt < 0 || seen.has(objStart)) continue;
    seen.add(objStart);
    const dict = src.slice(objStart, streamAt);
    if (/\/ImageMask\s+true/.test(dict)) continue;
    const width = numberOf(dict, 'Width');
    const height = numberOf(dict, 'Height');
    if (!width || !height || Math.min(width, height) < minSide) continue;

    let dataStart = streamAt + 'stream'.length;
    if (src[dataStart] === '\r') dataStart += 1;
    if (src[dataStart] === '\n') dataStart += 1;
    const length = directLength(dict);
    let dataEnd = length ? dataStart + length : src.indexOf('endstream', dataStart);
    if (dataEnd < 0) continue;
    if (!length) while (dataEnd > dataStart && (src[dataEnd - 1] === '\n' || src[dataEnd - 1] === '\r')) dataEnd -= 1;
    const data = pdf.subarray(dataStart, dataEnd);

    const filters = filtersOf(dict);
    try {
      if (filters.length === 1 && filters[0] === 'DCTDecode') {
        images.push({ buffer: Buffer.from(data), width, height });
      } else if (filters.length <= 1 && (filters[0] || 'FlateDecode') === 'FlateDecode') {
        const raw = filters.length ? inflateSync(data) : data;
        const png = rawToPng(raw, dict, width, height);
        if (png) images.push({ buffer: png, width, height });
        else skipped.push(filters[0] || 'raw');
      } else {
        skipped.push(filters.join('+'));
      }
    } catch {
      skipped.push(filters.join('+') || 'raw');
    }
  }
  return { images, skipped };
}

function numberOf(dict, key) {
  const m = dict.match(new RegExp(`/${key}\\s+(\\d+)(?!\\s+\\d+\\s+R)`));
  return m ? Number(m[1]) : 0;
}

function directLength(dict) {
  const m = dict.match(/\/Length\s+(\d+)(\s+\d+\s+R)?/);
  return m && !m[2] ? Number(m[1]) : 0;
}

function filtersOf(dict) {
  const m = dict.match(/\/Filter\s*(\[[^\]]*\]|\/\w+)/);
  if (!m) return [];
  return [...m[1].matchAll(/\/(\w+)/g)].map((x) => x[1]);
}

function rawToPng(raw, dict, width, height) {
  const bpc = numberOf(dict, 'BitsPerComponent') || 8;
  const predictor = numberOf(dict, 'Predictor');
  if (predictor > 1 && predictor < 10) return null;
  const pngRows = predictor >= 10;
  const rowBytesFor = (channels) => Math.ceil((width * channels * bpc) / 8) + (pngRows ? 1 : 0);
  const channels = [1, 3].find((ch) => raw.length >= rowBytesFor(ch) * height && raw.length < rowBytesFor(ch + 1) * height);
  if (!channels || (bpc !== 8 && !(bpc === 1 && channels === 1))) return null;
  if (/\/Indexed\b/.test(dict) || /\/DeviceCMYK\b/.test(dict)) return null;

  const rowBytes = rowBytesFor(channels);
  let rows;
  if (pngRows) {
    rows = raw.subarray(0, rowBytes * height);
  } else {
    rows = Buffer.alloc((rowBytes + 1) * height);
    for (let y = 0; y < height; y += 1) raw.copy(rows, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
    if (bpc === 1 && /\/Decode\s*\[\s*1(?:\.0*)?\s+0/.test(dict)) {
      for (let i = 0; i < rows.length; i += 1) if (i % (rowBytes + 1)) rows[i] ^= 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bpc;
  ihdr[9] = channels === 3 ? 2 : 0;
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
