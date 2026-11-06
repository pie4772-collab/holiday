import { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

const HEIGHT = 180;

/** 손가락·마우스·펜으로 서명합니다. 손을 뗄 때마다 투명 배경 PNG(data URL)를 onChange 로 넘기고, 지우면 '' 를 넘깁니다. */
export function SignaturePad({ onChange, disabled = false }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = HEIGHT * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#111111';
  }, []);

  function point(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleDown(e) {
    if (disabled) return;
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = '#111111';
    ctx.fill();
  }

  function handleMove(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const next = point(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    last.current = next;
  }

  function handleUp() {
    if (!drawing.current) return;
    drawing.current = false;
    setEmpty(false);
    onChange(canvasRef.current.toDataURL('image/png'));
  }

  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    onChange('');
  }

  return (
    <div>
      <div className="relative rounded-md border border-dashed border-stripe-border bg-white">
        <canvas
          ref={canvasRef}
          style={{ height: HEIGHT, touchAction: 'none' }}
          className={`block w-full ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair'}`}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          aria-label="서명 칸"
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-stripe-muted">
            여기에 서명하세요
          </span>
        )}
      </div>
      <div className="mt-1.5 flex justify-end">
        <button
          type="button"
          onClick={clear}
          disabled={disabled || empty}
          className="inline-flex items-center gap-1 text-xs text-stripe-muted hover:text-primary-500 disabled:opacity-40"
        >
          <Eraser className="h-3.5 w-3.5" />
          지우고 다시 쓰기
        </button>
      </div>
    </div>
  );
}
