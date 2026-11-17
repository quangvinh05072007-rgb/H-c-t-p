import React, { useEffect, useState } from 'react';
import { Modal } from './kit';

interface ImageZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  title?: string;
}

export function ImageZoomModal({ isOpen, onClose, imageUrl, title = 'Phóng to Đồ thị / Hình vẽ' }: ImageZoomModalProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Reset when image changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen, imageUrl]);

  if (!isOpen) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoom((z) => Math.min(3.5, Math.max(0.6, Number((z + delta).toFixed(2)))));
  };

  return (
    <Modal title={title} onClose={onClose} width={860}>
      <div className="image-zoom-dialog-body" onWheel={handleWheel}>
        {/* Toolbar */}
        <div className="image-zoom-toolbar">
          <div className="zoom-actions-left">
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.2).toFixed(2))))}
              title="Thu nhỏ (Ctrl -)"
            >
              🔍 -
            </button>
            <span className="zoom-percent-badge tabular-nums">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setZoom((z) => Math.min(3.5, Number((z + 0.2).toFixed(2))))}
              title="Phóng to (Ctrl +)"
            >
              🔍 +
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                setZoom(1);
                setPosition({ x: 0, y: 0 });
              }}
              title="Đặt lại kích thước gốc"
            >
              1:1
            </button>
          </div>

          <div className="zoom-actions-right">
            <button
              type="button"
              className={`btn ghost sm ${showGrid ? 'active' : ''}`}
              onClick={() => setShowGrid(!showGrid)}
              title="Bật lưới tọa độ ảo để gióng giá trị cực trị/tiệm cận"
            >
              📐 Lưới tọa độ ảo
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              title="Xoay hình 90°"
            >
              🔄 Xoay hình
            </button>
          </div>
        </div>

        {/* Viewport Display with Drag & Grid */}
        <div
          className={`image-zoom-viewport ${isDragging ? 'is-dragging' : ''} ${showGrid ? 'has-grid-overlay' : ''}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {showGrid && (
            <div className="math-coordinate-grid-overlay" aria-hidden="true">
              <div className="axis axis-x" />
              <div className="axis axis-y" />
            </div>
          )}

          <div
            className="zoom-image-wrapper"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              cursor: isDragging ? 'grabbing' : 'grab',
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            }}
          >
            <img
              src={imageUrl}
              alt="Hình vẽ chi tiết phóng to"
              draggable={false}
              className="zoomed-target-image"
            />
          </div>
        </div>

        {/* Bottom Hint */}
        <div className="image-zoom-footer-hint">
          <span>Kéo chuột để di chuyển ảnh · Cuộn chuột hoặc dùng nút để phóng to/thu nhỏ</span>
        </div>
      </div>
    </Modal>
  );
}
