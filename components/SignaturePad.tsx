'use client';
import { useEffect, useRef, useState } from 'react';

type Props = {
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
  submitting?: boolean;
  error?: string | null;
};

// Full-screen canvas signature pad — plain <canvas>, no dependencies. Draws
// via Pointer Events so the same handlers cover touch, mouse, and stylus.
export default function SignaturePad({ onConfirm, onCancel, submitting, error }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasStroke, setHasStroke] = useState(false);

  // Canvas backing store must match its CSS size * devicePixelRatio or
  // strokes render blurry/misaligned — resize on mount and on rotate/resize.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#111827';
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(e);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !lastPointRef.current) return;
    const point = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
    setHasStroke(true);
  }

  function handlePointerUp() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
  }

  function confirm() {
    canvasRef.current?.toBlob(blob => { if (blob) onConfirm(blob); }, 'image/png');
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <p className="text-sm font-bold text-gray-900">Sign to confirm delivery</p>
        <button onClick={onCancel} disabled={submitting} className="text-xs font-semibold text-gray-400 disabled:opacity-50">
          Cancel
        </button>
      </div>
      <p className="px-4 pt-3 text-xs text-gray-400 flex-shrink-0">Sign in the box below with your finger.</p>
      {error && <p className="px-4 pt-2 text-xs text-red-500 flex-shrink-0">{error}</p>}
      <div className="flex-1 m-4 border-2 border-dashed border-gray-200 rounded-2xl overflow-hidden touch-none min-h-0">
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>
      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 flex gap-3 flex-shrink-0">
        <button
          onClick={clear}
          disabled={submitting}
          className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl text-sm font-bold disabled:opacity-50"
        >
          Clear
        </button>
        <button
          onClick={confirm}
          disabled={!hasStroke || submitting}
          className="flex-1 py-3 bg-orange-500 text-white rounded-xl text-sm font-bold disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Confirm & Submit'}
        </button>
      </div>
    </div>
  );
}
