import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle2, Clock, FileUp, MessageSquareWarning, X } from 'lucide-react';
import { get } from '../api';
import { fmtDateTime, go } from './kit';

export interface TeacherNotificationItem {
  id: string;
  kind: 'appeal' | 'late' | 'import' | 'closing';
  priority: 'high' | 'medium' | 'normal';
  title: string;
  subtitle: string;
  detail: string;
  at: number;
  href: string;
}

interface NotificationsPayload {
  unreadCount: number;
  totalCount: number;
  counts?: { appeals: number; late: number; imports: number; closing: number };
  notifications: TeacherNotificationItem[];
}

function KindBadge({ kind }: { kind: TeacherNotificationItem['kind'] }) {
  if (kind === 'appeal') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: '#b91c1c' }}>
        <MessageSquareWarning size={13} /> Khiếu nại điểm
      </span>
    );
  }
  if (kind === 'late') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: '#b45309' }}>
        <Clock size={13} /> Nộp muộn chờ duyệt
      </span>
    );
  }
  if (kind === 'import') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: '#1d4ed8' }}>
        <FileUp size={13} /> Nhập đề hoàn tất
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: '#475569' }}>
      <Clock size={13} /> Sắp hết hạn
    </span>
  );
}

export function TeacherNotifications({
  variant = 'cockpit',
  collapsed = false,
}: {
  variant?: 'cockpit' | 'sidebar';
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationsPayload>({ unreadCount: 0, totalCount: 0, notifications: [] });
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await get<NotificationsPayload>('/api/teacher/notifications');
      setData(res);
    } catch {
      // ignore background fetch errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 45000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const badgeCount = data.totalCount || 0;

  return (
    <div
      ref={wrapRef}
      className={variant === 'sidebar' ? 'nav-item-group' : undefined}
      style={variant === 'cockpit' ? { position: 'relative', display: 'inline-flex' } : undefined}
    >
      {variant === 'sidebar' ? (
        <button
          type="button"
          className={`sidebar-footer-account ${open ? 'is-active' : ''}`}
          aria-label={`Việc cần xử lý (${badgeCount})`}
          aria-expanded={open}
          title={collapsed ? `Thông báo (${badgeCount})` : 'Thông báo giáo viên'}
          onClick={() => {
            setOpen((prev) => !prev);
            if (!open) load();
          }}
        >
          <span
            style={{
              position: 'relative',
              width: 28,
              height: 28,
              borderRadius: 8,
              background: badgeCount > 0 ? '#eff6ff' : 'var(--bg-soft, #f1f5f9)',
              color: badgeCount > 0 ? '#2563eb' : 'var(--nav-muted)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <Bell size={15} />
            {badgeCount > 0 && collapsed && (
              <span
                className="tabular-nums"
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 99,
                  background: '#dc2626',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  display: 'grid',
                  placeItems: 'center',
                  padding: '0 3px',
                }}
              >
                {badgeCount > 9 ? '9+' : badgeCount}
              </span>
            )}
          </span>
          {!collapsed && (
            <>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span>Thông báo</span>
                  {badgeCount > 0 && (
                    <span
                      className="tabular-nums"
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: 6,
                        background: '#fee2e2',
                        color: '#b91c1c',
                      }}
                    >
                      {badgeCount}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--nav-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {badgeCount > 0 ? `${badgeCount} việc cần xử lý` : 'Không có việc tồn đọng'}
                </div>
              </div>
            </>
          )}
        </button>
      ) : (
        <button
          type="button"
          className="topbar-bell-btn"
          aria-label={`Thông báo giáo viên (${badgeCount} việc cần xử lý)`}
          aria-expanded={open}
          title="Khiếu nại, bài nộp muộn & nhập đề hoàn tất"
          onClick={() => {
            setOpen((prev) => !prev);
            if (!open) load();
          }}
        >
          <Bell size={17} />
          {badgeCount > 0 && (
            <span
              className="tabular-nums"
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                minWidth: 18,
                height: 18,
                borderRadius: 99,
                background: '#dc2626',
                color: '#ffffff',
                fontSize: 10,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
                boxShadow: '0 0 0 2px #ffffff',
              }}
              aria-hidden="true"
            >
              {badgeCount > 9 ? '9+' : badgeCount}
            </span>
          )}
        </button>
      )}

      {open && (
        <div
          className={variant === 'sidebar' ? 'nav-popover is-utility' : 'topbar-notifications-dropdown'}
          style={
            variant === 'sidebar'
              ? { width: 340, maxWidth: '88vw', padding: 0, overflow: 'hidden', zIndex: 140 }
              : { width: 370, maxWidth: '92vw', zIndex: 140 }
          }
          role="dialog"
          aria-label="Trung tâm thông báo giáo viên"
        >
          <div className="notif-header">
            <div className="row between" style={{ alignItems: 'center' }}>
              <div>
                <div className="strong" style={{ fontSize: 14, color: 'var(--ink)' }}>
                  Việc cần xử lý
                </div>
                <div className="tiny muted tabular-nums">
                  {badgeCount > 0 ? `${badgeCount} mục đang chờ thao tác` : 'Mọi công việc đã xử lý xong'}
                </div>
              </div>
              <button
                type="button"
                className="btn ghost sm"
                style={{ padding: '4px 6px' }}
                aria-label="Đóng thông báo"
                onClick={() => setOpen(false)}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="notif-body" style={{ maxHeight: 360 }}>
            {loading && data.notifications.length === 0 ? (
              <div className="notif-empty">Đang kiểm tra cập nhật…</div>
            ) : data.notifications.length === 0 ? (
              <div className="notif-empty">
                <CheckCircle2 size={24} style={{ color: '#16a34a', margin: '0 auto 8px', display: 'block' }} />
                Không có khiếu nại, bài nộp muộn hay file nhập đề nào đang chờ duyệt.
              </div>
            ) : (
              <div className="notif-list">
                {data.notifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      go(item.href);
                    }}
                    style={{
                      textAlign: 'left',
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--line)',
                      background: item.priority === 'high' ? '#fefce8' : '#ffffff',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    <div className="row between" style={{ alignItems: 'center', gap: 6 }}>
                      <KindBadge kind={item.kind} />
                      <span className="tiny muted tabular-nums">{fmtDateTime(item.at)}</span>
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>
                      {item.title}
                    </div>
                    <div className="tiny muted">
                      {item.subtitle}
                      {item.detail ? ` · ${item.detail}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TeacherNotifications;
