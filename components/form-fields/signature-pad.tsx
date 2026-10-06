"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

/**
 * Responsive, touch-friendly signature pad (pointer events, HiDPI aware).
 * Emits a PNG data URL (trimmed to keep payloads small) or "" when cleared.
 */
export function SignaturePad({
  value,
  onChange,
  labelledBy,
  describedBy,
  invalid,
  color = "#0f172a",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  labelledBy: string;
  describedBy?: string;
  invalid?: boolean;
  color?: string;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(Boolean(value));

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = color;
    // Resizing clears the canvas; require re-signing to keep the image faithful.
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = value;
    }
  }, [color, value]);

  useEffect(() => {
    resize();
    const ro = new ResizeObserver(() => resize());
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount/color change
  }, [color]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const commit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Downscale to max 600px wide to keep the PNG small.
    const scale = Math.min(1, 600 / canvas.width);
    const out = document.createElement("canvas");
    out.width = Math.round(canvas.width * scale);
    out.height = Math.round(canvas.height * scale);
    out.getContext("2d")!.drawImage(canvas, 0, 0, out.width, out.height);
    onChange(out.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange("");
  };

  return (
    <div>
      <div className={`relative rounded-lg border-2 border-dashed bg-white ${invalid ? "border-red-400" : "border-slate-300"}`}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          className="block h-40 w-full touch-none sm:h-44"
          onPointerDown={(e) => {
            if (disabled) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            last.current = point(e);
          }}
          onPointerMove={(e) => {
            if (!drawing.current || !last.current) return;
            const ctx = e.currentTarget.getContext("2d")!;
            const p = point(e);
            ctx.beginPath();
            ctx.moveTo(last.current.x, last.current.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            last.current = p;
            if (!hasInk) setHasInk(true);
          }}
          onPointerUp={() => {
            if (!drawing.current) return;
            drawing.current = false;
            last.current = null;
            commit();
          }}
          onPointerCancel={() => {
            drawing.current = false;
          }}
        />
        {!hasInk && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">Sign here with your finger or mouse</span>}
        <div aria-hidden className="pointer-events-none absolute right-6 bottom-8 left-6 border-b border-slate-200" />
      </div>
      <button type="button" onClick={clear} disabled={disabled} className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
        <Eraser className="size-4" aria-hidden /> Clear signature
      </button>
    </div>
  );
}
