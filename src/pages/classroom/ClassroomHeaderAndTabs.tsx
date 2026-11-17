import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Bell,
  BookOpen,
  BookOpenCheck,
  ChevronDown,
  ClipboardCheck,
  Copy,
  Info,
  Layers,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Plus,
  Users,
} from 'lucide-react';
import type { ClassInfo, ClassroomSummary, ClassroomTab } from './types';

interface ClassroomHeaderAndTabsProps {
  cls: ClassInfo;
  role: 'student' | 'teacher' | 'admin';
  activeTab: ClassroomTab;
  onSelectTab: (tab: ClassroomTab) => void;
  onBackToDirectory: () => void;
  onCopyCode: () => void;
  allClasses?: ClassroomSummary[];
  onSwitchClass?: (classId: number) => void;
  onRequestLeave?: () => void;
  counts?: {
    modules?: number;
    openQuizzes?: number;
    openHomework?: number;
    announcements?: number;
    members?: number;
    appeals?: number;
  };
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
}

export function ClassroomHeaderAndTabs({
  cls,
  role,
  activeTab,
  onSelectTab,
  onBackToDirectory,
  onCopyCode,
  allClasses = [],
  onSwitchClass,
  onRequestLeave,
  counts = {},
  primaryAction,
}: ClassroomHeaderAndTabsProps) {
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreMenuOpen(false);
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setHeaderMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreMenuOpen(false);
        setHeaderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const isExtraActive = activeTab === 'announcements' || activeTab === 'people' || activeTab === 'info';
  const extraLabel =
    activeTab === 'announcements'
      ? 'Thông báo'
      : activeTab === 'people'
      ? 'Thành viên'
      : activeTab === 'info'
      ? 'Thông tin lớp'
      : 'Thêm';

  const switchableClasses = role === 'student' ? allClasses.filter((c) => c.enrolled) : allClasses;

  return (
    <div className="cls-header-shell">
      {/* Compact Breadcrumb Back Navigation */}
      <div className="cls-breadcrumb-row">
        <button type="button" className="cls-back-link" onClick={onBackToDirectory}>
          <ArrowLeft size={15} />
          <span>Lớp học của tôi</span>
        </button>
      </div>

      {/* Compact Class Header */}
      <header className="cls-course-header">
        <div className="cls-course-header-left">
          <div className={`cls-subject-tile cls-subject-tile-lg grade-tint-${cls.grade}`} aria-hidden="true">
            <BookOpen size={22} />
          </div>
          <div className="cls-course-heading">
            <h1 className="cls-course-title">
              {cls.subject || 'Toán học'} {cls.name}
            </h1>
            <p className="cls-course-meta">
              <span>{cls.teacher || 'Giáo viên bộ môn'}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{cls.students} học sinh</span>
              <span aria-hidden="true">·</span>
              <span>Năm học {cls.academicYear || '2026–2027'}</span>
            </p>
          </div>
        </div>

        <div className="cls-course-header-actions">
          {primaryAction && (
            <button type="button" className="cls-btn cls-btn-primary" onClick={primaryAction.onClick}>
              <Plus size={16} />
              <span>{primaryAction.label}</span>
            </button>
          )}

          {/* Secondary Details Menu (Join code, copy, switch class, leave class) */}
          <div className="cls-dropdown-wrap" ref={headerRef}>
            <button
              type="button"
              className="cls-btn cls-btn-icon"
              aria-label="Tùy chọn lớp học"
              aria-expanded={headerMenuOpen}
              onClick={() => setHeaderMenuOpen((v) => !v)}
              title="Chi tiết & tùy chọn lớp học"
            >
              <MoreHorizontal size={18} />
            </button>

            {headerMenuOpen && (
              <div className="cls-dropdown-menu align-right" role="menu">
                {cls.code && (
                  <div className="cls-dropdown-section">
                    <div className="cls-dropdown-caption">Mã tham gia lớp</div>
                    <div className="cls-code-copy-box">
                      <code>{cls.code}</code>
                      <button
                        type="button"
                        className="cls-btn cls-btn-sm cls-btn-ghost"
                        onClick={() => {
                          onCopyCode();
                          setHeaderMenuOpen(false);
                        }}
                      >
                        <Copy size={14} /> Sao chép
                      </button>
                    </div>
                  </div>
                )}

                {switchableClasses.length > 1 && onSwitchClass && (
                  <div className="cls-dropdown-section">
                    <div className="cls-dropdown-caption">Chuyển nhanh lớp học</div>
                    <div className="cls-dropdown-scroll">
                      {switchableClasses.map((other) => (
                        <button
                          key={other.id}
                          type="button"
                          role="menuitem"
                          className={`cls-dropdown-item ${other.id === cls.id ? 'is-current' : ''}`}
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            onSwitchClass(other.id);
                          }}
                        >
                          <span>Toán {other.name}</span>
                          <span className="cls-dropdown-hint">K{other.grade}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="cls-dropdown-section">
                  <button
                    type="button"
                    role="menuitem"
                    className="cls-dropdown-item"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      onSelectTab('info');
                    }}
                  >
                    <Info size={15} />
                    <span>Thông tin lớp học</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="cls-dropdown-item"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      onSelectTab('people');
                    }}
                  >
                    <Users size={15} />
                    <span>Thành viên ({counts.members ?? cls.students})</span>
                  </button>
                </div>

                {role === 'student' && onRequestLeave && (
                  <div className="cls-dropdown-section">
                    <button
                      type="button"
                      role="menuitem"
                      className="cls-dropdown-item is-danger"
                      onClick={() => {
                        setHeaderMenuOpen(false);
                        onRequestLeave();
                      }}
                    >
                      <LogOut size={15} />
                      <span>Rời lớp học</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Horizontal Tab Navigation */}
      <nav className="cls-tabs-bar" aria-label="Điều hướng trong lớp học">
        <div className="cls-tabs-scroll">
          <button
            type="button"
            className={`cls-tab ${activeTab === 'overview' ? 'is-active' : ''}`}
            onClick={() => onSelectTab('overview')}
          >
            <LayoutDashboard size={16} />
            <span>Tổng quan</span>
          </button>

          <button
            type="button"
            className={`cls-tab ${activeTab === 'modules' ? 'is-active' : ''}`}
            onClick={() => onSelectTab('modules')}
          >
            <Layers size={16} />
            <span>Học phần</span>
            {(counts.modules ?? 0) > 0 && <span className="cls-tab-count tabular-nums">{counts.modules}</span>}
          </button>

          <button
            type="button"
            className={`cls-tab ${activeTab === 'quizzes' ? 'is-active' : ''}`}
            onClick={() => onSelectTab('quizzes')}
          >
            <ClipboardCheck size={16} />
            <span>Bài kiểm tra</span>
            {(counts.openQuizzes ?? 0) > 0 && (
              <span className="cls-tab-count is-accent tabular-nums">{counts.openQuizzes}</span>
            )}
          </button>

          <button
            type="button"
            className={`cls-tab ${activeTab === 'assignments' ? 'is-active' : ''}`}
            onClick={() => onSelectTab('assignments')}
          >
            <BookOpenCheck size={16} />
            <span>Bài tập</span>
            {(counts.openHomework ?? 0) > 0 && (
              <span className="cls-tab-count is-accent tabular-nums">{counts.openHomework}</span>
            )}
          </button>

          <button
            type="button"
            className={`cls-tab ${activeTab === 'grades' ? 'is-active' : ''}`}
            onClick={() => onSelectTab('grades')}
          >
            <BarChart3 size={16} />
            <span>Điểm số</span>
            {(counts.appeals ?? 0) > 0 && (
              <span className="cls-tab-count is-warn tabular-nums">{counts.appeals}</span>
            )}
          </button>

          {/* More Dropdown inside Tabs */}
          <div className="cls-dropdown-wrap" ref={moreRef}>
            <button
              type="button"
              className={`cls-tab ${isExtraActive ? 'is-active' : ''}`}
              aria-expanded={moreMenuOpen}
              onClick={() => setMoreMenuOpen((v) => !v)}
            >
              <span>{extraLabel}</span>
              <ChevronDown size={15} />
            </button>

            {moreMenuOpen && (
              <div className="cls-dropdown-menu align-right" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className={`cls-dropdown-item ${activeTab === 'announcements' ? 'is-current' : ''}`}
                  onClick={() => {
                    onSelectTab('announcements');
                    setMoreMenuOpen(false);
                  }}
                >
                  <Bell size={15} />
                  <span>Thông báo</span>
                  {(counts.announcements ?? 0) > 0 && (
                    <span className="cls-dropdown-hint tabular-nums">{counts.announcements}</span>
                  )}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`cls-dropdown-item ${activeTab === 'people' ? 'is-current' : ''}`}
                  onClick={() => {
                    onSelectTab('people');
                    setMoreMenuOpen(false);
                  }}
                >
                  <Users size={15} />
                  <span>Thành viên</span>
                  <span className="cls-dropdown-hint tabular-nums">{counts.members ?? cls.students}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`cls-dropdown-item ${activeTab === 'info' ? 'is-current' : ''}`}
                  onClick={() => {
                    onSelectTab('info');
                    setMoreMenuOpen(false);
                  }}
                >
                  <Info size={15} />
                  <span>Thông tin lớp</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
    </div>
  );
}
