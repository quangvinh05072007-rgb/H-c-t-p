import { useState } from 'react';
import {
  ArrowRight,
  Bell,
  Copy,
  Flame,
  GraduationCap,
  Info,
  LogOut,
  Pin,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { del, post } from '../../api';
import { fmtDateTime, Modal, useApp } from '../../ui/kit';
import { MathText } from '../../ui/MathText';
import type { ClassAnnouncement, ClassInfo, ClassMember } from './types';

/* --------------------------------------------------------------------------
   1. Announcements Feed (+ Teacher Composer & Delete)
   -------------------------------------------------------------------------- */
export function AnnouncementsView({
  classId,
  role,
  announcements,
  onReload,
}: {
  classId: number;
  role: 'student' | 'teacher' | 'admin';
  announcements: ClassAnnouncement[];
  onReload: () => void;
}) {
  const { toast } = useApp();
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    try {
      await post(`/api/classes/${classId}/announcements`, {
        title: title.trim(),
        body: body.trim(),
        pinned,
      });
      toast('Đã đăng thông báo lớp học');
      setTitle('');
      setBody('');
      setPinned(false);
      setComposing(false);
      onReload();
    } catch (err: any) {
      toast(err.message || 'Không thể đăng thông báo.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setBusy(true);
    try {
      await del(`/api/classes/${classId}/announcements/${deleteId}`);
      toast('Đã xóa thông báo');
      setDeleteId(null);
      onReload();
    } catch (err: any) {
      toast(err.message || 'Không thể xóa thông báo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cls-extra-wrap">
      <div className="cls-section-head">
        <div>
          <h2 className="cls-section-title">Thông báo lớp học</h2>
          <p className="cls-section-subtitle">
            Cập nhật lịch kiểm tra, hướng dẫn học tập và nhắc nhở từ giáo viên.
          </p>
        </div>
        {role !== 'student' && (
          <button
            type="button"
            className="cls-btn cls-btn-primary"
            onClick={() => setComposing((v) => !v)}
          >
            <Plus size={16} />
            <span>{composing ? 'Đóng khung soạn' : 'Đăng thông báo'}</span>
          </button>
        )}
      </div>

      {role !== 'student' && composing && (
        <form onSubmit={handlePublish} className="cls-surface-card cls-composer">
          <label className="field">
            <span>Tiêu đề thông báo</span>
            <input
              className="input"
              placeholder="VD: Lịch kiểm tra giữa kỳ & dặn dò ôn tập"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
            />
          </label>
          <label className="field">
            <span>Nội dung thông báo (hỗ trợ công thức KaTeX $…$)</span>
            <textarea
              className="input"
              rows={4}
              placeholder="Nhập thông tin chi tiết gửi đến học sinh…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
            />
          </label>
          <div className="row between wrap" style={{ gap: 10 }}>
            <label className="cls-checkbox-row">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
              />
              <span>Ghim lên đầu danh sách thông báo</span>
            </label>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="cls-btn cls-btn-ghost" onClick={() => setComposing(false)}>
                Hủy
              </button>
              <button type="submit" className="cls-btn cls-btn-primary" disabled={busy}>
                {busy ? 'Đang đăng…' : 'Đăng thông báo'}
              </button>
            </div>
          </div>
        </form>
      )}

      {announcements.length === 0 ? (
        <div className="cls-empty-card">
          <div className="cls-empty-icon">
            <Bell size={22} />
          </div>
          <h3>Chưa có thông báo nào</h3>
          <p>
            {role === 'student'
              ? 'Giáo viên chưa đăng thông báo mới cho lớp học này.'
              : 'Đăng thông báo để nhắc lịch kiểm tra hoặc dặn dò học sinh trước buổi học.'}
          </p>
        </div>
      ) : (
        <div className="cls-ann-list">
          {announcements.map((a) => (
            <article key={a.id} className={`cls-surface-card cls-ann-card ${a.pinned ? 'is-pinned' : ''}`}>
              <div className="cls-ann-head">
                <div className="cls-ann-title-row">
                  {Boolean(a.pinned) && (
                    <span className="cls-status-tag is-primary">
                      <Pin size={12} /> Đã ghim
                    </span>
                  )}
                  <h3>{a.title}</h3>
                </div>
                <div className="cls-ann-meta-right">
                  <span className="cls-muted-text tabular-nums">{fmtDateTime(a.created_at)}</span>
                  {role !== 'student' && (
                    <button
                      type="button"
                      className="cls-btn cls-btn-icon-sm is-danger"
                      onClick={() => setDeleteId(a.id)}
                      title="Xóa thông báo"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div className="cls-ann-author">
                Đăng bởi <strong>{a.author_name || 'Giáo viên bộ môn'}</strong>
              </div>
              <div className="cls-ann-body">
                <MathText text={a.body} as="div" />
              </div>
            </article>
          ))}
        </div>
      )}

      {deleteId !== null && (
        <Modal title="Xóa thông báo" onClose={() => setDeleteId(null)} width={400}>
          <div className="stack" style={{ gap: 14 }}>
            <p className="cls-modal-desc">Bạn chắc chắn muốn xóa thông báo này khỏi bảng tin lớp học?</p>
            <div className="row end" style={{ gap: 8 }}>
              <button type="button" className="cls-btn cls-btn-ghost" onClick={() => setDeleteId(null)}>
                Hủy
              </button>
              <button type="button" className="cls-btn cls-btn-danger" disabled={busy} onClick={handleDelete}>
                {busy ? 'Đang xóa…' : 'Xóa thông báo'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   2. Members Roster (+ Teacher Profile Drilldown & Invite Code)
   -------------------------------------------------------------------------- */
export function MembersView({
  cls,
  role,
  members,
  currentUsername,
  onCopyCode,
}: {
  cls: ClassInfo;
  role: 'student' | 'teacher' | 'admin';
  members: ClassMember[];
  currentUsername: string;
  onCopyCode: () => void;
}) {
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);

  const q = search.trim().toLowerCase();
  const filtered = members.filter((m) =>
    !q ? true : `${m.display_name} ${m.username}`.toLowerCase().includes(q),
  );

  return (
    <div className="cls-extra-wrap">
      <div className="cls-section-head">
        <div>
          <h2 className="cls-section-title">Thành viên lớp học</h2>
          <p className="cls-section-subtitle">
            1 giáo viên phụ trách · {members.length} học sinh đang theo học
          </p>
        </div>

        {role !== 'student' && (
          <button type="button" className="cls-btn cls-btn-primary" onClick={() => setShowInvite(true)}>
            <UserPlus size={16} />
            <span>Mời học sinh</span>
          </button>
        )}
      </div>

      {/* Teacher Card */}
      <div className="cls-surface-card cls-teacher-banner">
        <div className="cls-member-left">
          <div className="cls-avatar is-teacher">
            <GraduationCap size={18} />
          </div>
          <div>
            <div className="cls-member-name">{cls.teacher || 'Giáo viên bộ môn'}</div>
            <div className="cls-muted-text">Giáo viên phụ trách lớp {cls.name}</div>
          </div>
        </div>
        <span className="cls-status-tag is-primary">Giáo viên</span>
      </div>

      {/* Student Roster Search */}
      <div className="cls-modules-toolbar">
        <div className="cls-search-box cls-search-sm">
          <Search size={15} className="cls-search-icon" />
          <input
            type="search"
            placeholder="Tìm học sinh theo tên hoặc tài khoản…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="cls-search-clear" onClick={() => setSearch('')}>
              <X size={13} />
            </button>
          )}
        </div>
        <span className="cls-muted-text tabular-nums">
          Hiển thị {filtered.length}/{members.length} học sinh
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="cls-empty-card">
          <div className="cls-empty-icon">
            <Users size={22} />
          </div>
          <h3>{members.length === 0 ? 'Lớp chưa có học sinh' : 'Không tìm thấy học sinh phù hợp'}</h3>
          <p>
            {members.length === 0
              ? 'Chia sẻ mã tham gia lớp để học sinh tự đăng ký vào lớp.'
              : 'Thử xóa từ khóa tìm kiếm để xem toàn bộ danh sách.'}
          </p>
        </div>
      ) : (
        <div className="cls-table-surface">
          <table className="cls-table">
            <thead>
              <tr>
                <th style={{ width: 52 }}>STT</th>
                <th>Họ và tên</th>
                <th>Tài khoản</th>
                <th>Chuỗi học tập</th>
                {role !== 'student' && <th>Hoạt động gần nhất</th>}
                {role !== 'student' && <th className="text-right">Hồ sơ</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, idx) => {
                const isMe = s.username === currentUsername;
                const initial = s.display_name.trim().split(/\s+/).slice(-1)[0]?.slice(0, 1) || 'H';
                return (
                  <tr key={s.id} className={isMe ? 'cls-row-self' : ''}>
                    <td className="cls-muted-text tabular-nums">{idx + 1}</td>
                    <td>
                      <div className="cls-member-cell">
                        <span className="cls-avatar is-student">{initial}</span>
                        <div>
                          <span className="cls-table-primary">{s.display_name}</span>
                          {isMe && <span className="cls-self-tag">Bạn</span>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <code className="cls-code-chip">{s.username}</code>
                    </td>
                    <td className="tabular-nums">
                      {s.streak > 0 ? (
                        <span className="cls-streak-inline">
                          <Flame size={14} /> {s.streak} ngày
                        </span>
                      ) : (
                        <span className="cls-muted-text">—</span>
                      )}
                    </td>
                    {role !== 'student' && (
                      <td className="cls-muted-text tabular-nums">
                        {s.last_active_day || 'Chưa hoạt động'}
                      </td>
                    )}
                    {role !== 'student' && (
                      <td className="text-right">
                        <a className="cls-btn cls-btn-sm cls-btn-ghost" href={`#/hoc-sinh/${s.id}`}>
                          Xem hồ sơ <ArrowRight size={14} />
                        </a>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showInvite && (
        <Modal title={`Mời học sinh vào lớp ${cls.name}`} onClose={() => setShowInvite(false)} width={440}>
          <div className="stack" style={{ gap: 16 }}>
            <p className="cls-modal-desc">
              Học sinh mở mục <strong>Lớp học của tôi</strong>, chọn <strong>Tham gia lớp bằng mã</strong> và nhập mã dưới đây:
            </p>
            <div className="cls-invite-box">
              <div className="cls-invite-code">{cls.code}</div>
              <div className="cls-muted-text">Mã tham gia lớp {cls.name}</div>
            </div>
            <div className="row end" style={{ gap: 8 }}>
              <button type="button" className="cls-btn cls-btn-ghost" onClick={() => setShowInvite(false)}>
                Đóng
              </button>
              <button
                type="button"
                className="cls-btn cls-btn-primary"
                onClick={() => {
                  onCopyCode();
                  setShowInvite(false);
                }}
              >
                <Copy size={15} /> Sao chép mã lớp
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   3. Class Info & Safe Danger Zone ("Rời lớp học" for students)
   -------------------------------------------------------------------------- */
export function ClassInfoView({
  cls,
  role,
  onCopyCode,
  onLeaveClass,
}: {
  cls: ClassInfo;
  role: 'student' | 'teacher' | 'admin';
  onCopyCode: () => void;
  onLeaveClass?: () => Promise<void>;
}) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState(false);

  const doLeave = async () => {
    if (!onLeaveClass) return;
    setBusy(true);
    try {
      await onLeaveClass();
      setConfirmLeave(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cls-extra-wrap">
      <div className="cls-section-head">
        <div>
          <h2 className="cls-section-title">Thông tin lớp học</h2>
          <p className="cls-section-subtitle">Chi tiết môn học, giáo viên phụ trách và mã tham gia.</p>
        </div>
      </div>

      <div className="cls-info-grid">
        <div className="cls-surface-card cls-info-card">
          <div className="cls-info-row">
            <span className="cls-info-label">Tên lớp</span>
            <strong className="cls-info-val">{cls.subject || 'Toán học'} {cls.name}</strong>
          </div>
          <div className="cls-info-row">
            <span className="cls-info-label">Khối lớp</span>
            <strong className="cls-info-val">Khối {cls.grade}</strong>
          </div>
          <div className="cls-info-row">
            <span className="cls-info-label">Năm học</span>
            <strong className="cls-info-val">{cls.academicYear || '2026–2027'}</strong>
          </div>
          <div className="cls-info-row">
            <span className="cls-info-label">Giáo viên phụ trách</span>
            <strong className="cls-info-val">{cls.teacher || 'Giáo viên bộ môn'}</strong>
          </div>
          <div className="cls-info-row">
            <span className="cls-info-label">Sĩ số hiện tại</span>
            <strong className="cls-info-val tabular-nums">{cls.students} học sinh</strong>
          </div>
        </div>

        <div className="cls-surface-card cls-info-card">
          <div className="cls-info-code-block">
            <div className="cls-info-code-head">
              <Info size={16} />
              <span>Mã tham gia lớp</span>
            </div>
            <div className="cls-code-copy-box">
              <code>{cls.code}</code>
              <button type="button" className="cls-btn cls-btn-sm cls-btn-ghost" onClick={onCopyCode}>
                <Copy size={14} /> Sao chép mã
              </button>
            </div>
            <p className="cls-muted-text">
              {role === 'student'
                ? 'Bạn có thể dùng mã này để tham gia lại lớp bất kỳ lúc nào.'
                : 'Cung cấp mã này cho học sinh nhập tại mục Lớp học của tôi.'}
            </p>
          </div>

          {role === 'admin' && (
            <div style={{ marginTop: 12 }}>
              <a className="cls-btn cls-btn-primary" href="#/nguoi-dung">
                Quản lý phân công & tài khoản <ArrowRight size={15} />
              </a>
            </div>
          )}
        </div>
      </div>

      {role === 'student' && onLeaveClass && (
        <div className="cls-danger-zone">
          <div>
            <h3>Rời khỏi lớp học</h3>
            <p>
              Sau khi rời lớp {cls.name}, bạn có thể quay lại bằng mã tham gia <strong>{cls.code}</strong> hoặc chọn lớp khác từ danh mục trường.
            </p>
          </div>
          <button type="button" className="cls-btn cls-btn-danger" onClick={() => setConfirmLeave(true)}>
            <LogOut size={15} /> Rời lớp học
          </button>
        </div>
      )}

      {confirmLeave && (
        <Modal title={`Rời khỏi lớp ${cls.name}?`} onClose={() => setConfirmLeave(false)} width={420}>
          <div className="stack" style={{ gap: 14 }}>
            <p className="cls-modal-desc">
              Bạn sẽ rời khỏi lớp <strong>{cls.name}</strong>. Điểm số các bài đã làm vẫn được lưu trong hồ sơ cá nhân.
            </p>
            <div className="row end" style={{ gap: 8 }}>
              <button type="button" className="cls-btn cls-btn-ghost" onClick={() => setConfirmLeave(false)} disabled={busy}>
                Ở lại lớp
              </button>
              <button type="button" className="cls-btn cls-btn-danger" onClick={doLeave} disabled={busy}>
                {busy ? 'Đang xử lý…' : 'Xác nhận rời lớp'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
