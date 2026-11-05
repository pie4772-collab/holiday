import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';
import { getDocumentFile } from './personnelService.js';
import { readPdfPages } from '../utils/pdfReader.js';
import { parsePersonnelText } from '../utils/personnelTextParser.js';
import { OCR_BLOCKED_DOCUMENT_TYPES, OCR_EXTENSIONS } from '../../src/constants/personnel.js';

/**
 * 스캔 증명서류 글자 읽기(OCR).
 * CLOVA_OCR_URL·CLOVA_OCR_SECRET 이 있으면 스캔 그림(PNG·JPG)을 네이버 CLOVA OCR 로 보내 읽고,
 * 없거나 CLOVA 호출이 실패하면 서버 안의 tesseract.js(WASM)로 읽습니다(외부 전송 없음).
 * PDF 에 글자 정보가 있으면 OCR 없이 그 글자를 씁니다.
 * 읽은 글자는 저장하지 않고 화면에 후보로만 돌려줍니다.
 */

const require = createRequire(import.meta.url);
const LANGS = ['kor', 'eng'];
/** 표 양식 증명서는 칸 테두리 때문에 줄을 빠뜨리기 쉬워 읽는 방식(PSM)을 바꿔 한 번 더 읽고 합칩니다. */
const FORM_DOCUMENT_TYPES = ['경력증명서', '최종학력증명서', '성적증명서', '자격증 사본'];
const PSM_SINGLE_BLOCK = '6';
const PSM_SINGLE_COLUMN = '4';
const SECOND_PASS_DIVIDER = '──── 표 양식으로 한 번 더 읽은 결과 ────';
const MAX_PAGES = 5;
const MAX_WAITING = 3;
const JOB_TIMEOUT_MS = 120_000;
const IDLE_MS = 5 * 60_000;
const CLOVA_TIMEOUT_MS = 30_000;

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

/** 콘솔의 APIGW Invoke URL. 도메인 주소까지만 넣었으면 일반(General) 경로를 붙입니다. 비밀키가 오가므로 https 만 씁니다. */
function clovaEndpoint() {
  const url = String(process.env.CLOVA_OCR_URL || '').trim().replace(/^http:\/\//i, 'https://').replace(/\/+$/, '');
  if (!url || !process.env.CLOVA_OCR_SECRET) return null;
  return /\/(general|infer)$/.test(url) ? url : `${url}/general`;
}

/** CLOVA 가 받는 그림 형식(파일 앞 바이트로 판별). WEBP 등은 null → tesseract 로 읽습니다. */
function clovaImageFormat(image) {
  if (image[0] === 0x89 && image[1] === 0x50 && image[2] === 0x4e && image[3] === 0x47) return 'png';
  if (image[0] === 0xff && image[1] === 0xd8) return 'jpg';
  return null;
}

/** CLOVA 는 낱말마다 줄바꿈 여부(lineBreak)를 주므로 그대로 줄로 엮습니다. 정확도는 0~1 평균을 0~100 으로 바꿉니다. */
export async function recognizeWithClova(image, format, endpoint = clovaEndpoint()) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-OCR-SECRET': process.env.CLOVA_OCR_SECRET },
    body: JSON.stringify({
      version: 'V2',
      requestId: randomUUID(),
      timestamp: Date.now(),
      lang: 'ko',
      images: [{ format, name: 'page', data: Buffer.from(image).toString('base64') }],
    }),
    signal: AbortSignal.timeout(CLOVA_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`CLOVA OCR HTTP ${res.status}`);
  const result = (await res.json())?.images?.[0];
  if (result?.inferResult !== 'SUCCESS') throw new Error(`CLOVA OCR ${result?.inferResult || '응답 없음'} ${result?.message || ''}`);
  const fields = result.fields || [];
  let text = '';
  for (const field of fields) text += `${field.inferText}${field.lineBreak ? '\n' : ' '}`;
  const confidence = fields.length
    ? Math.round((fields.reduce((sum, f) => sum + (Number(f.inferConfidence) || 0), 0) / fields.length) * 100)
    : 0;
  return { text: text.replace(/ +\n/g, '\n').trim(), confidence };
}

let workerPromise = null;
let idleTimer = null;
let queue = Promise.resolve();
let waiting = 0;

/** 언어 데이터는 npm 패키지에 들어 있습니다. tesseract.js 는 한 폴더에서 읽으므로 임시 폴더에 모읍니다. */
function prepareLangDir() {
  const dir = path.join(os.tmpdir(), 'holiday-ocr-lang');
  fs.mkdirSync(dir, { recursive: true });
  for (const lang of LANGS) {
    const file = `${lang}.traineddata.gz`;
    const target = path.join(dir, file);
    const source = path.join(path.dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`)), '4.0.0_best_int', file);
    if (!fs.existsSync(target) || fs.statSync(target).size !== fs.statSync(source).size) fs.copyFileSync(source, target);
  }
  return dir;
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker(LANGS, 1, { langPath: prepareLangDir(), cacheMethod: 'none', gzip: true });
    })();
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

async function stopWorker() {
  const pending = workerPromise;
  workerPromise = null;
  if (pending) await pending.then((w) => w.terminate()).catch(() => {});
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(httpError('글자를 읽는 데 시간이 너무 오래 걸려 멈췄습니다. 해상도를 낮춰 다시 올려 보세요.', 504)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** 한 번에 하나씩 읽습니다(메모리 보호). 대기열이 차면 거절합니다. */
function enqueue(task) {
  if (waiting >= MAX_WAITING) throw httpError('다른 서류를 읽는 중입니다. 잠시 후 다시 시도하세요.', 503);
  waiting += 1;
  const run = queue.then(async () => {
    clearTimeout(idleTimer);
    try {
      return await withTimeout(task(), JOB_TIMEOUT_MS);
    } catch (error) {
      if (error.status === 504) await stopWorker();
      throw error;
    } finally {
      waiting -= 1;
      idleTimer = setTimeout(() => stopWorker(), IDLE_MS);
      idleTimer.unref?.();
    }
  });
  queue = run.catch(() => {});
  return run;
}

/** 이미지는 그대로, PDF 는 쪽마다 글자(글자 정보가 있을 때) 또는 스캔 그림으로 나눕니다. */
async function sourcePages(extension, content) {
  if (extension !== 'pdf') return { totalPages: 1, pages: [{ image: content }], garbledPages: 0 };
  const result = await readPdfPages(content, { maxPages: MAX_PAGES });
  if (!result.pages.length) {
    throw httpError(
      result.garbledPages
        ? '글자 정보가 깨져 있는 PDF라 읽을 수 없습니다. 인쇄해서 스캔하거나 JPG·PNG로 올려 주세요.'
        : 'PDF에서 글자나 스캔 이미지를 찾지 못했습니다.'
    );
  }
  return result;
}

/**
 * @returns {{ docType, method, pages, confidence, text, profile, records, warnings }}
 *   method: 'text'(PDF 글자 정보), 'ocr'(스캔 글자 인식), 'mixed'
 */
export async function readPersonnelDocument(docId) {
  const row = await getDb()
    .prepare('SELECT id, doc_type, extension FROM employee_documents WHERE id = ?')
    .get(Number(docId));
  if (!row) throw httpError('서류를 찾을 수 없습니다.', 404);
  if (OCR_BLOCKED_DOCUMENT_TYPES.includes(row.doc_type)) {
    throw httpError(`${row.doc_type}은(는) 개인정보 보호를 위해 글자 읽기를 하지 않습니다.`);
  }
  if (!OCR_EXTENSIONS.includes(row.extension)) {
    throw httpError('글자 읽기는 PDF·JPG·PNG·WEBP 파일만 됩니다.');
  }
  const file = await getDocumentFile(row.id);

  const modes = FORM_DOCUMENT_TYPES.includes(row.doc_type) ? [PSM_SINGLE_BLOCK, PSM_SINGLE_COLUMN] : [PSM_SINGLE_BLOCK];
  const endpoint = clovaEndpoint();
  let clovaFailed = false;
  const { source, pages } = await enqueue(async () => {
    const source = await sourcePages(row.extension, file.content);
    const out = [];
    for (const page of source.pages) {
      if (page.text) {
        out.push({ text: page.text, confidence: null });
        continue;
      }
      const format = endpoint && !clovaFailed && clovaImageFormat(page.image);
      if (format) {
        try {
          out.push({ ...(await recognizeWithClova(page.image, format, endpoint)), engine: 'clova' });
          continue;
        } catch (error) {
          console.error(`[ocr] CLOVA OCR 실패, 내장 OCR로 읽습니다: ${error.message}`);
          clovaFailed = true;
        }
      }
      const worker = await getWorker();
      const texts = [];
      let confidence = 0;
      for (const mode of modes) {
        await worker.setParameters({ tessedit_pageseg_mode: mode });
        const { data } = await worker.recognize(page.image);
        texts.push((data.text || '').trim());
        confidence = Math.max(confidence, Number(data.confidence) || 0);
      }
      out.push({ text: texts.join(`\n\n${SECOND_PASS_DIVIDER}\n`), confidence, engine: 'tesseract' });
    }
    return { source, pages: out };
  });

  const parsed = parsePersonnelText(pages.map((p) => p.text).join('\n\n'), row.doc_type);
  const ocrPages = pages.filter((p) => p.confidence !== null);
  const confidence = ocrPages.length
    ? Math.round(ocrPages.reduce((sum, p) => sum + p.confidence, 0) / ocrPages.length)
    : null;
  const method = !ocrPages.length ? 'text' : ocrPages.length === pages.length ? 'ocr' : 'mixed';
  const readPages = Math.min(source.totalPages, MAX_PAGES);
  const warnings = [];
  if (confidence !== null && confidence < 70) warnings.push('글자 인식 정확도가 낮습니다. 후보 값을 원본과 꼭 대조하세요.');
  if (pages.length < readPages) {
    warnings.push(`읽을 내용이 없거나 글자 정보가 깨진 ${readPages - pages.length}쪽은 건너뛰었습니다.`);
  }
  if (source.totalPages > MAX_PAGES) warnings.push(`전체 ${source.totalPages}쪽 중 앞쪽 ${MAX_PAGES}쪽까지만 읽었습니다.`);
  if (clovaFailed) warnings.push('CLOVA OCR에 연결하지 못해 내장 OCR로 읽었습니다. 정확도가 낮을 수 있습니다.');
  const engines = [...new Set(ocrPages.map((p) => p.engine))];
  const engine = engines.length === 1 ? engines[0] : engines.length ? 'mixed' : null;
  return { docType: row.doc_type, method, engine, pages: pages.length, confidence, ...parsed, warnings };
}
