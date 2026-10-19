import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getDb } from '../db.js';
import { getDocumentFile } from './personnelService.js';
import { readPdfPages } from '../utils/pdfReader.js';
import { parsePersonnelText } from '../utils/personnelTextParser.js';
import { OCR_BLOCKED_DOCUMENT_TYPES, OCR_EXTENSIONS } from '../../src/constants/personnel.js';

/**
 * 스캔 증명서류 글자 읽기(OCR). 서버 안에서 tesseract.js(WASM)로 처리하고 외부로 보내지 않습니다.
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

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
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
  const { source, pages } = await enqueue(async () => {
    const source = await sourcePages(row.extension, file.content);
    const out = [];
    for (const page of source.pages) {
      if (page.text) {
        out.push({ text: page.text, confidence: null });
        continue;
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
      out.push({ text: texts.join(`\n\n${SECOND_PASS_DIVIDER}\n`), confidence });
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
  return { docType: row.doc_type, method, pages: pages.length, confidence, ...parsed, warnings };
}
