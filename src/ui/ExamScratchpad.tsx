import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './kit';

interface ExamScratchpadProps {
  currentQid?: number;
  isOpen: boolean;
  onClose: () => void;
}

type Tool = 'pen' | 'highlighter' | 'eraser';

export function ExamScratchpad({ currentQid, isOpen, onClose }: ExamScratchpadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Tools state
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>('#1e3a8a'); // Academic blue
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [isPerQuestion, setIsPerQuestion] = useState<boolean>(false);
  const [isTransparent, setIsTransparent] = useState<boolean>(false);

  // Undo history
  const historyRef = useRef<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  // Drawing state
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  // Persistent storage cache for question-specific or global drawings
  const cacheKey = isPerQuestion && currentQid ? `scratch_q_${currentQid}` : 'scratch_global';

  // Resize canvas to match display size
  const syncCanvasSize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      // Save content before resize
      const data = canvas.toDataURL();
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext('2d');
      if (ctx && data) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0);
        img.src = data;
      }
    }
  };

  // Load drawing when tab or currentQid changes
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    syncCanvasSize();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      const saved = sessionStorage.getItem(cacheKey);
      if (saved) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          historyRef.current = [saved];
          setCanUndo(false);
        };
        img.src = saved;
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        historyRef.current = [];
        setCanUndo(false);
      }
    } catch {
      // fallback
    }
  }, [isOpen, cacheKey]);

  // Window resize listener
  useEffect(() => {
    if (!isOpen) return;
    const handleResize = () => syncCanvasSize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen]);

  const saveState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const data = canvas.toDataURL();
      sessionStorage.setItem(cacheKey, data);
      historyRef.current.push(data);
      if (historyRef.current.length > 20) historyRef.current.shift();
      setCanUndo(historyRef.current.length > 1);
    } catch {
      // ignore storage limits
    }
  };

  const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isDrawing.current = true;
    const pos = getPos(e);
    lastPoint.current = pos;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = strokeWidth * 6;
    } else if (tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.4)';
      ctx.lineWidth = strokeWidth * 5;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
    }

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !lastPoint.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPoint.current = pos;
  };

  const endDraw = () => {
    if (isDrawing.current) {
      isDrawing.current = false;
      lastPoint.current = null;
      saveState();
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    try {
      sessionStorage.removeItem(cacheKey);
      historyRef.current.push('');
      setCanUndo(true);
    } catch {
      // ignore
    }
  };

  const undo = () => {
    if (historyRef.current.length <= 1) return;
    historyRef.current.pop(); // remove current state
    const prev = historyRef.current[historyRef.current.length - 1];
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (prev) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = prev;
    }
    setCanUndo(historyRef.current.length > 1);
  };

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className={`scratchpad-floating-window card shadow-lg ${isTransparent ? 'is-transparent' : ''}`}
      role="dialog"
      aria-label="Bảng nháp điện tử"
    >
      {/* Top Header & Drag Bar */}
      <div className="scratchpad-header">
        <div className="scratchpad-title">
          <span className="scratchpad-icon" aria-hidden="true">✏️</span>
          <span className="font-semibold">Bảng nháp điện tử</span>
          <div className="scratchpad-mode-pills">
            <button
              type="button"
              className={`mode-pill ${!isPerQuestion ? 'active' : ''}`}
              onClick={() => setIsPerQuestion(false)}
            >
              Nháp chung
            </button>
            <button
              type="button"
              className={`mode-pill ${isPerQuestion ? 'active' : ''}`}
              onClick={() => setIsPerQuestion(true)}
              title="Lưu trang nháp riêng cho câu hỏi này"
            >
              Nháp câu {currentQid ? `#${currentQid}` : 'này'}
            </button>
          </div>
        </div>

        <div className="scratchpad-header-actions">
          <button
            type="button"
            className={`btn-ghost-sm ${isTransparent ? 'active' : ''}`}
            onClick={() => setIsTransparent(!isTransparent)}
            title="Độ trong suốt (nhìn đề thi phía dưới)"
          >
            {isTransparent ? '👁️ Nhìn rõ' : '👓 Nhìn xuyên'}
          </button>
          <button
            type="button"
            className="btn-ghost-sm"
            onClick={onClose}
            title="Đóng bảng nháp (Phím tắt: N)"
            aria-label="Đóng bảng nháp"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Floating Toolbar */}
      <div className="scratchpad-toolbar">
        {/* Tool Selector */}
        <div className="tool-group">
          <button
            type="button"
            className={`tool-btn ${tool === 'pen' ? 'active' : ''}`}
            onClick={() => setTool('pen')}
            title="Bút viết nháp"
          >
            ✏️ Bút
          </button>
          <button
            type="button"
            className={`tool-btn ${tool === 'highlighter' ? 'active' : ''}`}
            onClick={() => setTool('highlighter')}
            title="Bút dạ quang (highlight)"
          >
            🖍️ Dạ quang
          </button>
          <button
            type="button"
            className={`tool-btn ${tool === 'eraser' ? 'active' : ''}`}
            onClick={() => setTool('eraser')}
            title="Tẩy xóa nét vẽ"
          >
            🧹 Tẩy
          </button>
        </div>

        {/* Color Palette (Active when tool === 'pen') */}
        {tool === 'pen' && (
          <div className="tool-group color-palette">
            {[
              { c: '#1e3a8a', label: 'Xanh đậm' },
              { c: '#0f172a', label: 'Đen' },
              { c: '#dc2626', label: 'Đỏ' },
              { c: '#059669', label: 'Xanh lá' },
            ].map(({ c, label }) => (
              <button
                key={c}
                type="button"
                className={`color-swatch ${color === c ? 'selected' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
                title={label}
                aria-label={label}
              />
            ))}
          </div>
        )}

        {/* Stroke Width */}
        <div className="tool-group stroke-group">
          {[2, 4, 7].map((w) => (
            <button
              key={w}
              type="button"
              className={`stroke-btn ${strokeWidth === w ? 'active' : ''}`}
              onClick={() => setStrokeWidth(w)}
              title={`Nét vẽ ${w}px`}
            >
              <span className="stroke-dot" style={{ width: w + 3, height: w + 3 }} />
            </button>
          ))}
        </div>

        {/* Grid & Actions */}
        <div className="tool-group right-actions">
          <button
            type="button"
            className={`tool-btn sm ${showGrid ? 'active' : ''}`}
            onClick={() => setShowGrid(!showGrid)}
            title="Bật/Tắt lưới kẻ ô ly"
          >
            # Lưới
          </button>
          <button
            type="button"
            className="tool-btn sm"
            disabled={!canUndo}
            onClick={undo}
            title="Hoàn tác (Undo)"
          >
            ↩
          </button>
          <button
            type="button"
            className="tool-btn sm danger"
            onClick={clearCanvas}
            title="Xóa trắng bảng nháp"
          >
            🗑️ Xóa hết
          </button>
        </div>
      </div>

      {/* Canvas Area with Math Notebook Grid */}
      <div className={`scratchpad-canvas-wrap ${showGrid ? 'with-grid' : ''}`}>
        <canvas
          ref={canvasRef}
          className="scratchpad-canvas"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        <div className="scratchpad-hint-tip">
          Phím tắt <strong>N</strong> để ẩn/hiện nháp · Vẽ tự do bằng chuột hoặc bút cảm ứng
        </div>
      </div>
    </div>
  );
}
