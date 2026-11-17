import React from 'react';
import { Modal } from './kit';

interface ExamShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isPractice?: boolean;
}

export function ExamShortcutsModal({ isOpen, onClose, isPractice = false }: ExamShortcutsModalProps) {
  if (!isOpen) return null;

  const shortcuts = [
    { key: '1, 2, 3, 4', desc: 'Chọn nhanh đáp án A, B, C, D (Phần I)' },
    { key: 'A, B, C, D', desc: 'Chọn đáp án tương ứng (không phân biệt hoa/thường)' },
    { key: '← / →', desc: 'Chuyển nhanh sang câu trước / câu kế tiếp' },
    { key: 'X', desc: 'Gạch loại trừ phương án sai / Bỏ gạch (dành cho MCQ)' },
    { key: 'N', desc: 'Bật / Tắt bảng nháp điện tử vẽ tay' },
    { key: 'F', desc: isPractice ? 'Xem thông tin câu hỏi' : 'Đánh dấu cờ (Flag) để xem lại sau' },
    { key: 'Z', desc: 'Phóng to hình vẽ / Đồ thị câu hỏi đang mở' },
    { key: 'Esc', desc: 'Đóng bảng nháp hoặc cửa sổ đang mở' },
    { key: '?', desc: 'Mở bảng trợ giúp phím tắt này' },
  ];

  return (
    <Modal title="Phím tắt phòng thi thần tốc" onClose={onClose} width={580}>
      <div className="exam-shortcuts-modal-body">
        <p className="shortcuts-lead-text">
          Sử dụng phím tắt giúp bạn thao tác nhanh hơn 50% trong phòng thi mà không cần dùng chuột:
        </p>

        <div className="shortcuts-table">
          {shortcuts.map(({ key, desc }) => (
            <div key={key} className="shortcut-row">
              <div className="shortcut-keys">
                {key.split(', ').map((k) => (
                  <kbd key={k} className="kbd-badge">
                    {k}
                  </kbd>
                ))}
              </div>
              <div className="shortcut-desc">{desc}</div>
            </div>
          ))}
        </div>

        <div className="shortcuts-footer-note">
          <span>💡 <strong>Lưu ý:</strong> Phím tắt sẽ tự động tạm ngưng khi con trỏ đang ở ô nhập kết quả (Phần III) để không gây xung đột nhập liệu.</span>
        </div>
      </div>
    </Modal>
  );
}
