import { useEffect, useRef, useState } from 'react';
import { get, post } from '../api';
import { go, Icon, useApp } from './kit';

interface NotificationItem {
  id: number;
  title: string;
  mode: 'exam' | 'homework';
  modeLabel: string;
  className: string;
  teacherName: string;
  openAt: number;
  closeAt: number;
  durationMin: number;
  state: 'open' | 'doing' | 'done' | 'upcoming' | 'missed';
  isNew: boolean;
  attemptId: number | null;
}

function fmtRelativeTime(timestamp: number) {
  const diff = timestamp - Date.now();
  if (diff <= 0) return 'Đã hết hạn';
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `Còn ${days} ngày`;
  if (hours > 0) return `Còn ${hours} giờ`;
  const minutes = Math.floor(diff / 60000);
  return `Còn ${minutes} phút`;
}

function fmtDate(ms: number) {
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${h}:${m} ngày ${day}/${month}`;
}

export function StudentNotifications() {
  const { toast } = useApp();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const res = await get<{ notifications: NotificationItem[]; unreadCount: number }>('/api/student/notifications');
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
    } catch {
      // silently ignore if guest
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 45000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // Handle clicking an item to start or continue
  const handleItemClick = async (item: NotificationItem) => {
    setOpen(false);
    if (item.attemptId) {
      go(`/thi/${item.attemptId}`);
      return;
    }

    try {
      const att = await post<any>('/api/attempts/start', { assignmentId: item.id });
      go(`/thi/${att.id}`);
    } catch (err: any) {
      toast(err.message || 'Không thể bắt đầu làm bài.');
      go('/lop-hoc');
    }
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      {/* Bell Button */}
      <button
        type="button"
        className="topbar-bell-btn"
        onClick={() => {
          setOpen((prev) => !prev);
          if (!open) loadNotifications();
        }}
        aria-label={`Thông báo bài tập mới (${unreadCount} chưa làm)`}
        aria-expanded={open}
        title="Thông báo bài tập mới từ giáo viên"
      >
        <Icon name="bell" />
        {unreadCount > 0 && (
          <span className="bell-badge-count" aria-hidden="true">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown */}
      {open && (
        <div className="topbar-notifications-dropdown">
          {/* Header */}
          <div className="notif-header">
            <div className="row between" style={{ alignItems: 'center' }}>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <span className="strong" style={{ fontSize: 15, color: 'var(--ink)' }}>
                  Bài tập vừa giao
                </span>
                {unreadCount > 0 && (
                  <span className="badge blue" style={{ fontWeight: 700, fontSize: 11 }}>
                    {unreadCount} cần làm
                  </span>
                )}
              </div>
              <button
                type="button"
                className="btn ghost sm"
                style={{ padding: '2px 6px', fontSize: 12 }}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
          </div>

          {/* List of items */}
          <div className="notif-body">
            {loading && notifications.length === 0 ? (
              <div className="notif-empty">Đang kiểm tra bài mới…</div>
            ) : notifications.length === 0 ? (
              <div className="notif-empty">
                <span style={{ fontSize: 24, display: 'block', marginBottom: 6 }}>🎉</span>
                Tuyệt vời! Bạn không có bài tập nào chưa hoàn thành.
              </div>
            ) : (
              <div className="notif-list">
                {notifications.map((item) => {
                  const isOpen = item.state === 'open';
                  const isDoing = item.state === 'doing';
                  const isDone = item.state === 'done';

                  return (
                    <div
                      key={item.id}
                      className={`notif-item ${isOpen ? 'is-unread' : ''}`}
                      onClick={() => handleItemClick(item)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') handleItemClick(item);
                      }}
                    >
                      <div className="row between mb" style={{ alignItems: 'flex-start', gap: 6 }}>
                        <span
                          className={`badge ${item.mode === 'exam' ? 'red' : 'blue'}`}
                          style={{ fontSize: 11, fontWeight: 700 }}
                        >
                          {item.mode === 'exam' ? 'Kiểm tra' : 'Bài tập'}
                        </span>

                        <div className="row" style={{ gap: 4 }}>
                          {isOpen && <span className="badge green">Mới</span>}
                          {isDoing && <span className="badge amber">Đang dở</span>}
                          {isDone && <span className="badge">Đã nộp</span>}
                        </div>
                      </div>

                      <div className="notif-item-title">{item.title}</div>

                      <div className="row between tiny muted" style={{ marginTop: 4 }}>
                        <span>
                          {item.teacherName} • {item.className}
                        </span>
                        <span style={{ fontWeight: 600, color: isOpen || isDoing ? 'var(--warn)' : undefined }}>
                          {fmtRelativeTime(item.closeAt)}
                        </span>
                      </div>

                      <div className="tiny muted" style={{ marginTop: 2, fontSize: 11 }}>
                        Hạn: {fmtDate(item.closeAt)}
                        {item.mode === 'exam' && ` (${item.durationMin} phút)`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="notif-footer">
            <a
              href="#/lop-hoc"
              onClick={() => setOpen(false)}
              className="notif-footer-link"
            >
              Xem tất cả bài tập trong Lớp học ➔
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
