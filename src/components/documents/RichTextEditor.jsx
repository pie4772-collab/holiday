import { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Eraser,
  Italic,
  List,
  ListOrdered,
  Minus,
  Redo2,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  Underline,
  Undo2,
} from 'lucide-react';

const BLOCKS = [
  { value: 'p', label: '기본서식' },
  { value: 'h1', label: '제목 1' },
  { value: 'h2', label: '제목 2' },
  { value: 'h3', label: '제목 3' },
];
const FONTS = [
  { value: "'Batang', '바탕', serif", label: '바탕체' },
  { value: "'Dotum', '돋움', sans-serif", label: '돋움체' },
  { value: "'Gulim', '굴림', sans-serif", label: '굴림체' },
  { value: "'Malgun Gothic', '맑은 고딕', sans-serif", label: '맑은 고딕' },
];
const SIZES = [9, 10, 11, 12, 14, 16, 18, 20, 24, 28];

function ToolButton({ icon: Icon, label, onRun }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onRun}
      className="rounded p-1 text-[#333] hover:bg-[#e8eef5]"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-[#d0d7de]" />;
}

/**
 * 서식 있는 본문 편집기. 브라우저 편집 기능(execCommand)으로 굵게·글꼴·크기·색·목록·정렬·표를 넣습니다.
 * value 는 처음 한 번만 읽으므로, 다른 문서를 불러올 때는 key 를 바꿔 다시 만드세요.
 */
export function RichTextEditor({ value = '', onChange, minHeight = 420 }) {
  const ref = useRef(null);
  const range = useRef(null);
  const initial = useRef(value);
  const [tableOpen, setTableOpen] = useState(false);
  const [table, setTable] = useState({ rows: 3, cols: 3 });

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initial.current;
  }, []);

  function saveRange() {
    const sel = window.getSelection();
    if (sel?.rangeCount && ref.current?.contains(sel.anchorNode)) range.current = sel.getRangeAt(0).cloneRange();
  }

  function restoreRange() {
    ref.current?.focus();
    if (!range.current) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range.current);
  }

  function emit() {
    onChange?.(ref.current?.innerHTML || '');
  }

  function run(command, arg) {
    restoreRange();
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(command, false, arg);
    saveRange();
    emit();
  }

  /** 글자 크기를 pt 로 지정합니다. execCommand 의 크기 7 을 표시로 쓰고 바로 pt 로 바꿉니다. */
  function setSize(pt) {
    run('fontSize', '7');
    const root = ref.current;
    root.querySelectorAll('font[size="7"]').forEach((font) => {
      const span = document.createElement('span');
      span.style.fontSize = `${pt}pt`;
      span.append(...font.childNodes);
      font.replaceWith(span);
    });
    root.querySelectorAll('span').forEach((span) => {
      if (span.style.fontSize === 'xxx-large' || span.style.fontSize === '-webkit-xxx-large') span.style.fontSize = `${pt}pt`;
    });
    emit();
  }

  function insertTable() {
    const rows = Math.min(Math.max(Number(table.rows) || 1, 1), 20);
    const cols = Math.min(Math.max(Number(table.cols) || 1, 1), 10);
    const tr = `<tr>${'<td><br></td>'.repeat(cols)}</tr>`;
    run('insertHTML', `<table><tbody>${tr.repeat(rows)}</tbody></table><p><br></p>`);
    setTableOpen(false);
  }

  const select = 'h-7 rounded border border-[#d0d7de] bg-white px-1.5 text-[12px] text-[#333]';
  return (
    <div className="rich-editor">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[#d0d7de] bg-[#f6f8fa] px-1.5 py-1">
        <ToolButton icon={Undo2} label="실행 취소" onRun={() => run('undo')} />
        <ToolButton icon={Redo2} label="다시 실행" onRun={() => run('redo')} />
        <Divider />
        <select className={select} defaultValue="p" onChange={(e) => run('formatBlock', e.target.value)} aria-label="문단 서식">
          {BLOCKS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
        <select className={select} defaultValue="" onChange={(e) => e.target.value && run('fontName', e.target.value)} aria-label="글꼴">
          <option value="">글꼴</option>
          {FONTS.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select className={select} defaultValue="" onChange={(e) => e.target.value && setSize(e.target.value)} aria-label="글자 크기">
          <option value="">크기</option>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}pt
            </option>
          ))}
        </select>
        <Divider />
        <ToolButton icon={Bold} label="굵게" onRun={() => run('bold')} />
        <ToolButton icon={Italic} label="기울임" onRun={() => run('italic')} />
        <ToolButton icon={Underline} label="밑줄" onRun={() => run('underline')} />
        <ToolButton icon={Strikethrough} label="취소선" onRun={() => run('strikeThrough')} />
        <ToolButton icon={Superscript} label="위 첨자" onRun={() => run('superscript')} />
        <ToolButton icon={Subscript} label="아래 첨자" onRun={() => run('subscript')} />
        <label className="relative flex items-center rounded p-1 hover:bg-[#e8eef5]" title="글자 색">
          <span className="text-[13px] font-bold leading-none text-[#333] underline decoration-[#df1b41] decoration-2">A</span>
          <input
            type="color"
            className="absolute inset-0 cursor-pointer opacity-0"
            onMouseDown={saveRange}
            onChange={(e) => run('foreColor', e.target.value)}
            aria-label="글자 색"
          />
        </label>
        <label className="relative flex items-center rounded p-1 hover:bg-[#e8eef5]" title="배경 색">
          <span className="rounded-sm bg-[#fde68a] px-0.5 text-[13px] font-bold leading-none text-[#333]">A</span>
          <input
            type="color"
            defaultValue="#fde68a"
            className="absolute inset-0 cursor-pointer opacity-0"
            onMouseDown={saveRange}
            onChange={(e) => run('hiliteColor', e.target.value)}
            aria-label="배경 색"
          />
        </label>
        <Divider />
        <ToolButton icon={ListOrdered} label="번호 목록" onRun={() => run('insertOrderedList')} />
        <ToolButton icon={List} label="글머리 목록" onRun={() => run('insertUnorderedList')} />
        <ToolButton icon={AlignLeft} label="왼쪽 정렬" onRun={() => run('justifyLeft')} />
        <ToolButton icon={AlignCenter} label="가운데 정렬" onRun={() => run('justifyCenter')} />
        <ToolButton icon={AlignRight} label="오른쪽 정렬" onRun={() => run('justifyRight')} />
        <Divider />
        <ToolButton icon={Minus} label="가로줄" onRun={() => run('insertHorizontalRule')} />
        <div className="relative">
          <ToolButton icon={Table} label="표 넣기" onRun={() => setTableOpen((v) => !v)} />
          {tableOpen && (
            <div className="absolute left-0 top-8 z-20 flex items-center gap-1.5 rounded-md border border-stripe-border bg-white p-2 text-[12px] shadow-lg">
              <input
                type="number"
                min={1}
                max={20}
                className="w-12 rounded border border-[#d0d7de] px-1 py-0.5"
                value={table.rows}
                onChange={(e) => setTable({ ...table, rows: e.target.value })}
                aria-label="행"
              />
              행 ×
              <input
                type="number"
                min={1}
                max={10}
                className="w-12 rounded border border-[#d0d7de] px-1 py-0.5"
                value={table.cols}
                onChange={(e) => setTable({ ...table, cols: e.target.value })}
                aria-label="열"
              />
              열
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={insertTable}
                className="rounded bg-primary-600 px-2 py-0.5 font-medium text-white"
              >
                넣기
              </button>
            </div>
          )}
        </div>
        <ToolButton icon={Eraser} label="서식 지우기" onRun={() => run('removeFormat')} />
      </div>
      <div
        ref={ref}
        className="rich-content px-4 py-3 outline-none"
        style={{ minHeight }}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="본문"
        onInput={emit}
        onKeyUp={saveRange}
        onMouseUp={saveRange}
        onBlur={saveRange}
      />
    </div>
  );
}
