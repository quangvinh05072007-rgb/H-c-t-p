import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  KeyRound,
  Layers,
  LayoutGrid,
  List,
  Plus,
  Search,
  Sparkles,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { ErrorBox, fmtScore, Modal } from '../../ui/kit';
import {
  DirectoryFilterState,
  formatDeadlineShort,
  loadDirectoryState,
  saveDirectoryState,
} from './classroomState';
import type { ClassroomSummary } from './types';

interface ClassDirectoryGridProps {
  role: 'student' | 'teacher' | 'admin';
  classes: ClassroomSummary[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenClass: (cls: ClassroomSummary) => void | Promise<void>;
  onJoinByCode?: (code: string) => Promise<void>;
  onCreateClass?: (name: string, grade: number) => Promise<void>;
  adminScope?: 'mine' | 'all';
  onAdminScopeChange?: (scope: 'mine' | 'all') => void;
  totalAllCount?: number;
  myCount?: number;
}

const GRADE_THEME: Record<number, { tint: string; iconColor: string; label: string }> = {
  12: { tint: 'grade-tint-12', iconColor: '#2563EB', label: 'Khối 12' },
  11: { tint: 'grade-tint-11', iconColor: '#0284C7', label: 'Khối 11' },
  10: { tint: 'grade-tint-10', iconColor: '#4F46E5', label: 'Khối 10' },
};

export function ClassDirectoryGrid({
  role,
  classes,
  loading,
  error,
  onRetry,
  onOpenClass,
  onJoinByCode,
  onCreateClass,
  adminScope,
  onAdminScopeChange,
  totalAllCount,
  myCount,
}: ClassDirectoryGridProps) {
  const [filters, setFilters] = useState<DirectoryFilterState>(() =>
    loadDirectoryState(role === 'admin' ? 'all' : 'mine'),
  );
  const [openingId, setOpeningId] = useState<number | null>(null);

  // Student Join Modal
  const [showJoin, setShowJoin] = useState(false);
  const [joinTargetClass, setJoinTargetClass] = useState<ClassroomSummary | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [busyModal, setBusyModal] = useState(false);

  // Teacher Create Class Modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGrade, setNewGrade] = useState(12);
  const [createErr, setCreateErr] = useState<string | null>(null);

  useEffect(() => {
    saveDirectoryState(filters);
  }, [filters]);

  const updateFilter = <K extends keyof DirectoryFilterState>(key: K, val: DirectoryFilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: val }));
  };

  // Học sinh ít lớp: không cần ô tìm kiếm/bộ lọc (và bỏ qua bộ lọc đã lưu để không ẩn nhầm lớp).
  const showToolbar = role !== 'student' || classes.length > 5;
  const filteredClasses = useMemo(() => {
    if (!showToolbar) return classes;
    const q = filters.search.trim().toLowerCase();
    return classes.filter((c) => {
      if (filters.statusFilter !== 'all') {
        const st = c.status ?? 'active';
        if (st !== filters.statusFilter) return false;
      }
      if (filters.gradeFilter !== 'all' && c.grade !== Number(filters.gradeFilter)) {
        return false;
      }
      if (q) {
        const hay = `${c.name} ${c.code ?? ''} ${c.teacher ?? ''} ${c.subject ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [classes, filters.gradeFilter, filters.search, filters.statusFilter, showToolbar]);

  const statusCounts = useMemo(() => {
    const active = classes.filter((c) => (c.status ?? 'active') === 'active').length;
    const ended = classes.filter((c) => c.status === 'ended').length;
    return { all: classes.length, active, ended };
  }, [classes]);

  const handleCardClick = async (cls: ClassroomSummary) => {
    if (role === 'student' && !cls.enrolled) {
      setJoinTargetClass(cls);
      setJoinErr(null);
      setShowJoin(true);
      return;
    }
    if (openingId !== null) return;
    setOpeningId(cls.id);
    try {
      await onOpenClass(cls);
    } finally {
      setOpeningId(null);
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onJoinByCode) return;
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setJoinErr('Vui lòng nhập mã lớp học.');
      return;
    }
    setBusyModal(true);
    setJoinErr(null);
    try {
      await onJoinByCode(code);
      setShowJoin(false);
      setJoinCode('');
    } catch (err: any) {
      setJoinErr(err.message || 'Mã lớp không hợp lệ hoặc không tìm thấy lớp.');
    } finally {
      setBusyModal(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateClass) return;
    if (!newName.trim()) {
      setCreateErr('Vui lòng nhập tên lớp.');
      return;
    }
    setBusyModal(true);
    setCreateErr(null);
    try {
      await onCreateClass(newName.trim(), newGrade);
      setShowCreate(false);
      setNewName('');
    } catch (err: any) {
      setCreateErr(err.message || 'Không thể tạo lớp học.');
    } finally {
      setBusyModal(false);
    }
  };

  const totalStudents = classes.reduce((s, c) => s + Number(c.students || 0), 0);
  const activeTasksCount =
    role === 'student'
      ? classes.reduce((s, c) => s + Number(c.pending_count || 0), 0)
      : classes.reduce((s, c) => s + Number(c.active_assignments || 0), 0);

  return (
    <div className="cls-scope cls-directory">
      {/* Header */}
      <header className="cls-dir-header">
        <div>
          <h1 className="cls-dir-title">Lớp học của tôi</h1>
          <p className="cls-dir-subtitle">
            {classes.length} lớp học
            {totalStudents > 0 && role !== 'student' ? ` · ${totalStudents} học sinh` : ''}
            {activeTasksCount > 0
              ? role === 'student'
                ? ` · ${activeTasksCount} nhiệm vụ cần hoàn thành`
                : ` · ${activeTasksCount} bài đang mở`
              : ''}
          </p>
        </div>

        <div className="cls-dir-actions">
          {role === 'admin' && onAdminScopeChange && (
            <div className="cls-segmented" role="group" aria-label="Phạm vi lớp">
              <button
                type="button"
                className={adminScope === 'mine' ? 'is-active' : ''}
                onClick={() => onAdminScopeChange('mine')}
              >
                Phụ trách ({myCount ?? 0})
              </button>
              <button
                type="button"
                className={adminScope === 'all' ? 'is-active' : ''}
                onClick={() => onAdminScopeChange('all')}
              >
                Toàn trường ({totalAllCount ?? classes.length})
              </button>
            </div>
          )}

          {role === 'student' && onJoinByCode && (
            <button
              type="button"
              className="cls-btn cls-btn-primary"
              onClick={() => {
                setJoinTargetClass(null);
                setJoinErr(null);
                setShowJoin(true);
              }}
            >
              <KeyRound size={16} />
              <span>Tham gia lớp bằng mã</span>
            </button>
          )}

          {role !== 'student' && onCreateClass && (
            <button
              type="button"
              className="cls-btn cls-btn-primary"
              onClick={() => {
                setCreateErr(null);
                setShowCreate(true);
              }}
            >
              <Plus size={16} />
              <span>Tạo lớp mới</span>
            </button>
          )}
        </div>
      </header>

      {role === 'student' && !loading && classes.length > 0 && <StudentClassSummary classes={classes} />}

      {/* Compact Filter Toolbar */}
      {showToolbar && (
      <div className="cls-filter-bar">
        <div className="cls-filter-left">
          <div className="cls-search-box">
            <Search size={16} className="cls-search-icon" />
            <input
              type="search"
              aria-label="Tìm lớp học theo tên hoặc mã"
              placeholder="Tìm lớp theo tên, mã lớp hoặc giáo viên…"
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
            />
            {filters.search && (
              <button
                type="button"
                className="cls-search-clear"
                onClick={() => updateFilter('search', '')}
                aria-label="Xóa từ khóa tìm kiếm"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="cls-segmented" role="group" aria-label="Lọc trạng thái lớp">
            {(
              [
                ['all', `Tất cả (${statusCounts.all})`],
                ['active', `Đang học (${statusCounts.active})`],
                ['ended', `Đã kết thúc (${statusCounts.ended})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={filters.statusFilter === key ? 'is-active' : ''}
                onClick={() => updateFilter('statusFilter', key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="cls-filter-right">
          <select
            aria-label="Lọc theo khối lớp"
            className="cls-select"
            value={filters.gradeFilter}
            onChange={(e) => updateFilter('gradeFilter', e.target.value as DirectoryFilterState['gradeFilter'])}
          >
            <option value="all">Tất cả khối</option>
            <option value="12">Khối 12</option>
            <option value="11">Khối 11</option>
            <option value="10">Khối 10</option>
          </select>

          {role !== 'student' && (
            <div className="cls-segmented" role="group" aria-label="Kiểu hiển thị">
              <button
                type="button"
                className={filters.viewMode === 'grid' ? 'is-active' : ''}
                onClick={() => updateFilter('viewMode', 'grid')}
                title="Dạng thẻ lớp học"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                className={filters.viewMode === 'table' ? 'is-active' : ''}
                onClick={() => updateFilter('viewMode', 'table')}
                title="Dạng bảng"
              >
                <List size={15} />
              </button>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="cls-card-grid" aria-label="Đang tải danh sách lớp">
          {[1, 2, 3].map((n) => (
            <div key={n} className="cls-class-card is-skeleton">
              <div className="cls-skel-line w-40" />
              <div className="cls-skel-line w-70" />
              <div className="cls-skel-line w-55" />
              <div className="cls-skel-bar" />
              <div className="cls-skel-line w-100" />
            </div>
          ))}
        </div>
      )}

      {!loading && error && <ErrorBox error={error} onRetry={onRetry} />}

      {/* Empty State */}
      {!loading && !error && filteredClasses.length === 0 && (
        <div className="cls-empty-card">
          <div className="cls-empty-icon">
            <BookOpen size={24} />
          </div>
          <h2>
            {classes.length > 0 ? 'Không tìm thấy lớp học phù hợp' : 'Chưa có lớp học nào'}
          </h2>
          <p>
            {classes.length > 0
              ? 'Hãy thử xóa từ khóa tìm kiếm hoặc chuyển sang bộ lọc tất cả lớp.'
              : role === 'student'
              ? 'Nhập mã lớp do giáo viên cung cấp để tham gia vào lớp học của bạn.'
              : 'Tạo lớp học đầu tiên để bắt đầu xây dựng học phần và giao bài tập.'}
          </p>
          <div className="cls-empty-actions">
            {classes.length > 0 && (
              <button
                type="button"
                className="cls-btn cls-btn-ghost"
                onClick={() =>
                  setFilters((p) => ({ ...p, search: '', statusFilter: 'all', gradeFilter: 'all' }))
                }
              >
                Xóa bộ lọc
              </button>
            )}
            {role === 'student' && onJoinByCode && (
              <button type="button" className="cls-btn cls-btn-primary" onClick={() => setShowJoin(true)}>
                <KeyRound size={16} /> Tham gia bằng mã
              </button>
            )}
            {role !== 'student' && onCreateClass && (
              <button type="button" className="cls-btn cls-btn-primary" onClick={() => setShowCreate(true)}>
                <Plus size={16} /> Tạo lớp mới
              </button>
            )}
          </div>
        </div>
      )}

      {role === 'student' && !loading && !error && filteredClasses.length > 0 && (
        <div className="sc-grid">
          {filteredClasses.map((c) => (
            <StudentClassCard key={c.id} c={c} busy={openingId === c.id} onOpen={() => handleCardClick(c)} />
          ))}
        </div>
      )}

      {/* Class Cards Grid (giáo viên / quản lý) */}
      {!loading && !error && filteredClasses.length > 0 && (role as string) !== 'student' && filters.viewMode === 'grid' && (
        <div className="cls-card-grid">
          {filteredClasses.map((c) => {
            const theme = GRADE_THEME[c.grade] ?? GRADE_THEME[12];
            const isEnded = c.status === 'ended';
            const dl = c.next_deadline ? formatDeadlineShort(c.next_deadline) : null;
            const progressPct =
              role === 'student'
                ? c.progressPct ?? 0
                : c.total_assignments
                ? Math.round(((c.completed_assignments ?? 0) / c.total_assignments) * 100)
                : 0;
            const pendingCount = role === 'student' ? c.pending_count ?? 0 : c.active_assignments ?? 0;

            return (
              <button
                key={c.id}
                type="button"
                className={`cls-class-card ${c.enrolled ? 'is-enrolled' : ''} ${openingId === c.id ? 'is-busy' : ''}`}
                onClick={() => handleCardClick(c)}
              >
                {/* Top: Subject Pastel Icon + Status */}
                <div className="cls-class-card-top">
                  <div className={`cls-subject-tile ${theme.tint}`} aria-hidden="true">
                    <BookOpen size={20} style={{ color: theme.iconColor }} />
                  </div>
                  <div className="cls-class-card-top-meta">
                    <span className="cls-grade-text">
                      {theme.label} · {c.academicYear || '2026–2027'}
                    </span>
                    {c.enrolled && (
                      <span className="cls-status-tag is-primary">
                        <UserCheck size={12} /> Lớp đang học
                      </span>
                    )}
                    {!c.enrolled && isEnded && (
                      <span className="cls-status-tag is-muted">Đã kết thúc</span>
                    )}
                  </div>
                </div>

                {/* Class Title & Teacher */}
                <div className="cls-class-card-heading">
                  <h2 className="cls-class-card-title">
                    {c.subject || 'Toán học'} {c.name}
                  </h2>
                  <p className="cls-class-card-teacher">
                    Giáo viên: <span>{c.teacher || 'Bộ môn Toán'}</span>
                  </p>
                </div>

                {/* Clean Stats Line */}
                <div className="cls-class-card-stats">
                  <span>
                    <Users size={14} /> {c.students} học sinh
                  </span>
                  <span className="cls-dot" aria-hidden="true">·</span>
                  <span>
                    <Layers size={14} /> {c.module_count ?? 0} học phần
                  </span>
                  {role !== 'student' && c.code && (
                    <>
                      <span className="cls-dot" aria-hidden="true">·</span>
                      <span className="cls-code-inline">{c.code}</span>
                    </>
                  )}
                </div>

                {/* Học sinh: chỉ một nhãn nhỏ khi có bài cần làm (cả thẻ đã bấm được để vào lớp) */}
                {role === 'student' ? (
                  pendingCount > 0 || openingId === c.id || !c.enrolled ? (
                    <div className="cls-class-card-deadline">
                      {openingId === c.id ? (
                        <span className="is-muted">Đang mở lớp…</span>
                      ) : !c.enrolled ? (
                        <span className="is-active"><KeyRound size={14} /> Tham gia bằng mã</span>
                      ) : (
                        <span className={dl?.urgent ? 'is-urgent' : 'is-active'}>
                          <Clock size={14} />
                          {pendingCount} bài cần làm{dl ? ` · ${dl.label}` : ''}
                        </span>
                      )}
                    </div>
                  ) : null
                ) : (
                  <>
                {/* Progress Bar */}
                  <div className="cls-class-card-progress">
                  <div className="cls-progress-label">
                    <span>Tiến độ bài giao</span>
                    <strong className="tabular-nums">{progressPct}%</strong>
                  </div>
                  <div className="cls-progress-track">
                    <div
                      className="cls-progress-fill"
                      style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
                    />
                  </div>
                  </div>

                  {/* Pending / Nearest Deadline */}
                  <div className="cls-class-card-deadline">
                  {pendingCount > 0 ? (
                    <span className={dl?.urgent ? 'is-urgent' : 'is-active'}>
                      <Clock size={14} />
                      {pendingCount} bài đang mở
                      {dl ? ` · ${dl.label}` : ''}
                    </span>
                  ) : c.avg_score !== null && c.avg_score !== undefined ? (
                    <span className="is-good">
                      <Sparkles size={14} />
                      Điểm TB lớp: {fmtScore(c.avg_score)} đ
                    </span>
                  ) : (
                    <span className="is-muted">
                      {dl ? (
                        <>
                          <Calendar size={14} /> {dl.label}
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={14} /> Không có bài sắp đến hạn
                        </>
                      )}
                    </span>
                  )}
                  </div>

                  </>
                )}

                {/* Chân thẻ "Vào lớp học" chỉ còn cho giáo viên/quản lý */}
                {role !== 'student' && (
                <div className="cls-class-card-cta">
                  <span>
                    {openingId === c.id ? 'Đang mở lớp…' : 'Vào lớp học'}
                  </span>
                  <ArrowRight size={16} />
                </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Teacher Optional Table View */}
      {!loading && !error && filteredClasses.length > 0 && role !== 'student' && filters.viewMode === 'table' && (
        <div className="cls-table-surface">
          <table className="cls-table">
            <thead>
              <tr>
                <th>Lớp học</th>
                <th>Khối</th>
                <th>Sĩ số</th>
                <th>Học phần</th>
                <th>Mã tham gia</th>
                <th>Đang mở</th>
                <th className="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredClasses.map((c) => (
                <tr key={c.id} className="cls-table-row-click" onClick={() => handleCardClick(c)}>
                  <td>
                    <div className="cls-table-primary">
                      {c.subject || 'Toán học'} {c.name}
                    </div>
                    <div className="cls-table-sub">{c.teacher || 'Chưa phân công'} · {c.academicYear || '2026–2027'}</div>
                  </td>
                  <td>Khối {c.grade}</td>
                  <td className="tabular-nums">{c.students} HS</td>
                  <td className="tabular-nums">{c.module_count ?? 0}</td>
                  <td>
                    <code className="cls-code-chip">{c.code}</code>
                  </td>
                  <td>
                    {(c.active_assignments ?? 0) > 0 ? (
                      <span className="cls-status-tag is-good">{c.active_assignments} bài mở</span>
                    ) : (
                      <span className="cls-muted-text">{c.total_assignments ?? 0} bài</span>
                    )}
                  </td>
                  <td className="text-right">
                    <span className="cls-inline-link">
                      Vào lớp học <ArrowRight size={14} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Student Join by Code Modal */}
      {showJoin && (
        <Modal
          title={joinTargetClass ? `Tham gia lớp ${joinTargetClass.subject || 'Toán học'} ${joinTargetClass.name}` : 'Tham gia lớp bằng mã'}
          onClose={() => {
            setShowJoin(false);
            setJoinTargetClass(null);
          }}
          width={440}
        >
          <form onSubmit={handleJoinSubmit} className="stack" style={{ gap: 16 }}>
            {joinErr && <div className="cls-alert is-bad">{joinErr}</div>}
            <p className="cls-modal-desc">
              {joinTargetClass
                ? `Lớp ${joinTargetClass.name} yêu cầu mã tham gia từ giáo viên (${joinTargetClass.teacher || 'Bộ môn Toán'}).`
                : <>Nhập mã lớp gồm 6–10 ký tự do giáo viên bộ môn cung cấp (ví dụ: <strong>12A1-8842</strong>).</>}
            </p>
            <label className="field">
              <span>Mã tham gia lớp</span>
              <input
                className="input"
                placeholder="VD: 12A1-8842"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                autoFocus
                required
              />
            </label>
            <div className="row end" style={{ gap: 8 }}>
              <button type="button" className="cls-btn cls-btn-ghost" onClick={() => setShowJoin(false)} disabled={busyModal}>
                Hủy
              </button>
              <button type="submit" className="cls-btn cls-btn-primary" disabled={busyModal}>
                {busyModal ? 'Đang kiểm tra…' : 'Tham gia lớp'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Teacher Create Class Modal */}
      {showCreate && (
        <Modal title="Tạo lớp học mới" onClose={() => setShowCreate(false)} width={440}>
          <form onSubmit={handleCreateSubmit} className="stack" style={{ gap: 16 }}>
            {createErr && <div className="cls-alert is-bad">{createErr}</div>}
            <label className="field">
              <span>Tên lớp</span>
              <input
                className="input"
                placeholder="VD: 12A1, 11B2, 10C3…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                required
              />
            </label>
            <label className="field">
              <span>Khối lớp</span>
              <select className="select" value={newGrade} onChange={(e) => setNewGrade(Number(e.target.value))}>
                <option value={10}>Khối 10</option>
                <option value={11}>Khối 11</option>
                <option value={12}>Khối 12</option>
              </select>
            </label>
            <p className="cls-modal-desc">
              Hệ thống tự động tạo mã tham gia riêng để học sinh nhập mã vào lớp.
            </p>
            <div className="row end" style={{ gap: 8 }}>
              <button type="button" className="cls-btn cls-btn-ghost" onClick={() => setShowCreate(false)} disabled={busyModal}>
                Hủy
              </button>
              <button type="submit" className="cls-btn cls-btn-primary" disabled={busyModal}>
                {busyModal ? 'Đang tạo…' : 'Tạo lớp ngay'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}


// ===================== Học sinh: thẻ lớp & dải tóm tắt =====================
const SC_TONE: Record<number, string> = { 12: 'is-g12', 11: 'is-g11', 10: 'is-g10' };

function initialsOf(name?: string | null) {
  const parts = String(name ?? '').replace(/^(Thầy|Cô)\s+/i, '').trim().split(/\s+/);
  return parts.slice(-2).map((p) => p[0] ?? '').join('').toUpperCase() || 'GV';
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct));
  return (
    <svg className="sc-ring" viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r={r} className="sc-ring-bg" />
      <circle cx="28" cy="28" r={r} className="sc-ring-fg" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 28 28)" />
      <text x="28" y="32" textAnchor="middle" className="sc-ring-text">{Math.round(v)}%</text>
    </svg>
  );
}

function StudentClassCard({ c, busy, onOpen }: { c: ClassroomSummary; busy: boolean; onOpen: () => void }) {
  const pending = c.pending_count ?? 0;
  const next = c.nextUrgent ?? null;
  const dl = next ? formatDeadlineShort(next.closeAt) : c.next_deadline ? formatDeadlineShort(c.next_deadline) : null;
  const total = c.totalTasks ?? c.total_assignments ?? 0;
  const done = c.doneTasks ?? c.done_count ?? 0;
  return (
    <button type="button" className={`sc-card ${SC_TONE[c.grade] ?? 'is-g12'} ${busy ? 'is-busy' : ''}`} onClick={onOpen} aria-label={`Vào lớp ${c.name}`}>
      <div className="sc-banner">
        <div className="sc-banner-text">
          <span className="sc-kicker">{c.subject || 'Toán học'} · Khối {c.grade}</span>
          <strong className="sc-name">{c.name}</strong>
        </div>
        {c.enrolled ? <span className="sc-badge"><UserCheck size={12} aria-hidden="true" /> Đang học</span> : <span className="sc-badge"><KeyRound size={12} aria-hidden="true" /> Cần mã lớp</span>}
      </div>
      <div className="sc-teacher">
        <span className="sc-avatar" aria-hidden="true">{initialsOf(c.teacher)}</span>
        <span>
          <small>Giáo viên</small>
          <b>{c.teacher || 'Tổ Toán'}</b>
        </span>
      </div>
      <div className="sc-body">
        <ProgressRing pct={c.progressPct ?? (total ? (done / total) * 100 : 0)} />
        <div className="sc-body-text">
          <b>{total ? `Đã xong ${done}/${total} việc` : 'Chưa có bài giao'}</b>
          {busy ? (
            <span className="sc-next">Đang mở lớp…</span>
          ) : pending > 0 ? (
            <span className={`sc-next ${dl?.urgent ? 'is-urgent' : ''}`}>
              <Clock size={13} aria-hidden="true" />
              {next ? next.title : `${pending} bài cần làm`}
              {dl ? ` · ${dl.label}` : ''}
            </span>
          ) : (
            <span className="sc-next is-done"><CheckCircle2 size={13} aria-hidden="true" /> Không còn bài phải làm</span>
          )}
        </div>
        {pending > 0 && <span className="sc-pending" title="Bài cần làm">{pending}</span>}
      </div>
      <div className="sc-foot">
        <span><Users size={13} aria-hidden="true" /> {c.students} học sinh</span>
        <span><Layers size={13} aria-hidden="true" /> {c.module_count ?? 0} học phần</span>
        <span className="sc-go">Vào lớp <ArrowRight size={14} aria-hidden="true" /></span>
      </div>
    </button>
  );
}

function StudentClassSummary({ classes }: { classes: ClassroomSummary[] }) {
  const mine = classes.filter((c) => c.enrolled !== false);
  const pending = mine.reduce((s, c) => s + Number(c.pending_count || 0), 0);
  const done = mine.reduce((s, c) => s + Number(c.doneTasks ?? c.done_count ?? 0), 0);
  const total = mine.reduce((s, c) => s + Number(c.totalTasks ?? c.total_assignments ?? 0), 0);
  const nearest = mine
    .map((c) => ({ c, at: c.nextUrgent?.closeAt ?? c.next_deadline ?? null }))
    .filter((x) => x.at && x.at > Date.now())
    .sort((a, b) => (a.at as number) - (b.at as number))[0];
  const dl = nearest ? formatDeadlineShort(nearest.at) : null;
  return (
    <div className="sc-summary">
      <div className={`sc-sum ${pending ? 'is-warn' : 'is-good'}`}>
        <span>Bài cần làm</span>
        <b>{pending}</b>
      </div>
      <div className={`sc-sum ${dl?.urgent ? 'is-bad' : ''}`}>
        <span>Hạn gần nhất</span>
        <b className="sc-sum-small">{dl ? dl.label : 'Không có'}</b>
        {nearest?.c.nextUrgent?.title && <small>{nearest.c.nextUrgent.title}</small>}
      </div>
      <div className="sc-sum">
        <span>Đã hoàn thành</span>
        <b>{done}<small>/{total}</small></b>
      </div>
    </div>
  );
}
