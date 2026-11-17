import { useState, useEffect, useRef } from 'react';
import { User, Meta, Icon, AzotaLogo, go } from './kit';
import { StudentNotifications } from './StudentNotifications';

interface AppTopbarProps {
  user: User;
  meta: Meta | null;
  path: string;
  classScreen: boolean;
  sidebarCollapsed: boolean;
  theme: 'light' | 'dark';
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
  onLogout: () => void;
}

interface SearchItem {
  id: string;
  title: string;
  category: string;
  path: string;
  icon: string;
}

export function AppTopbar({
  user,
  path,
  classScreen,
  sidebarCollapsed,
  theme,
  onToggleSidebar,
  onToggleTheme,
  onLogout,
}: AppTopbarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  // Close search dropdown on click outside or Escape
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const getSearchItems = (): SearchItem[] => {
    if (user.role === 'student') {
      return [
        { id: 'home', title: 'Tổng quan', category: 'Trang chính', path: '/', icon: 'home' },
        { id: 'practice', title: 'Kho đề thi', category: 'Đề thi', path: '/luyen-tap', icon: 'exam' },
        { id: 'mistakes', title: 'Sổ tay lỗi', category: 'Cá nhân hóa', path: '/so-tay-loi-sai', icon: 'edit' },
        { id: 'selfstudy', title: 'Tự học', category: 'Kiến thức', path: '/tu-hoc', icon: 'book' },
        { id: 'classes', title: 'Lớp học', category: 'Lớp học', path: '/lop-hoc', icon: 'class' },
        { id: 'results', title: 'Kết quả & Phân tích', category: 'Tiến độ', path: '/ket-qua', icon: 'report' },
      ];
    }
    if (user.role === 'teacher') {
      return [
        { id: 'home', title: 'Tổng quan', category: 'Trang chính', path: '/', icon: 'home' },
        { id: 'library', title: 'Kho đề', category: 'Kho đề', path: '/thu-vien', icon: 'exam' },
        { id: 'shuffler', title: 'Đảo mã đề', category: 'Khảo thí', path: '/dao-de', icon: 'refresh' },
        { id: 'create-exam', title: 'Tạo đề thi', category: 'Kho đề', path: '/ra-de', icon: 'plus' },
        { id: 'import-exam', title: 'Nhập đề Word/PDF', category: 'Ngân hàng', path: '/nhap-de', icon: 'upload' },
        { id: 'bank', title: 'Ngân hàng câu hỏi', category: 'Ngân hàng', path: '/ngan-hang', icon: 'book' },
        { id: 'classes', title: 'Lớp học', category: 'Lớp học', path: '/lop-hoc', icon: 'class' },
      ];
    }
    return [
      { id: 'home', title: 'Tổng quan', category: 'Trang chính', path: '/', icon: 'school' },
      { id: 'classes', title: 'Lớp học', category: 'Lớp học', path: '/lop-hoc', icon: 'class' },
      { id: 'shuffler', title: 'Đảo đề', category: 'Khảo thí', path: '/dao-de', icon: 'refresh' },
      { id: 'users', title: 'Người dùng', category: 'Quản trị', path: '/nguoi-dung', icon: 'user' },
      { id: 'audit', title: 'Nhật ký', category: 'Quản trị', path: '/nhat-ky', icon: 'log' },
      { id: 'reports', title: 'Báo cáo', category: 'Báo cáo', path: '/bao-cao', icon: 'report' },
    ];
  };

  const filteredItems = searchQuery.trim()
    ? getSearchItems().filter(
        (i) =>
          i.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          i.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : getSearchItems().slice(0, 6);

  const handleSelectSearch = (targetPath: string) => {
    setSearchOpen(false);
    setSearchQuery('');
    go(targetPath);
  };

  const getBreadcrumbs = () => {
    if (classScreen) {
      if (path === '/lop-hoc') return [{ label: 'Quản lý lớp & Khảo thí' }];
      const subLabel = path.includes('/ket-qua')
        ? 'Bảng điểm'
        : path.includes('/bai-giao')
        ? 'Bài giao'
        : path.includes('/cai-dat')
        ? 'Cài đặt'
        : 'Danh sách';
      return [
        { label: 'Quản lý lớp', href: '#/lop-hoc' },
        { label: subLabel },
      ];
    }

    if (path === '/') return [{ label: 'Tổng quan' }];
    if (path === '/so-tay-loi-sai' || path === '/loi-sai' || path === '/ghi-chu') return [{ label: 'Đề thi', href: '#/luyen-tap' }, { label: 'Sổ tay lỗi' }];
    if (path === '/dao-de' || path === '/tron-de') return [{ label: 'Đảo đề' }];
    if (path === '/lop-hoc') return [{ label: 'Lớp học' }];
    if (path === '/thu-vien') return [{ label: 'Kho đề' }];
    if (path === '/ngan-hang') return [{ label: 'Ngân hàng' }];
    if (path === '/nhap-de') return [{ label: 'Nhập đề' }];
    if (path === '/ra-de') return [{ label: 'Tạo đề' }];
    if (path.startsWith('/de-thi')) return [{ label: 'Kho đề', href: '#/thu-vien' }, { label: 'Chi tiết đề' }];
    if (path === '/luyen-vo-han') return [{ label: 'Luyện tập' }];
    if (path === '/ban-do-tri-thuc' || path === '/tu-hoc') return [{ label: 'Tự học' }];
    if (path === '/luyen-tap') return [{ label: 'Đề thi' }];
    if (path.startsWith('/ket-qua')) return [{ label: 'Kết quả' }];
    if (path === '/tien-bo') return [{ label: 'Tiến độ' }];
    if (path === '/khieu-nai') return [{ label: 'Khiếu nại' }];
    if (path === '/tai-khoan') return [{ label: 'Cài đặt' }];
    if (path === '/nguoi-dung') return [{ label: 'Người dùng' }];
    if (path === '/nhat-ky') return [{ label: 'Nhật ký' }];
    if (path === '/bao-cao') return [{ label: 'Báo cáo' }];
    return [{ label: 'SmartExam' }];
  };

  const breadcrumbs = getBreadcrumbs();
  const roleLabel = { admin: 'Quản lý', teacher: 'Giáo viên', student: 'Học sinh' }[user.role];
  const initials = user.displayName
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0])
    .join('');

  return (
    <header className="workspace-topbar" role="banner">
      {/* Zone 1: Sidebar Toggle & Minimal Breadcrumbs */}
      <div className="topbar-zone topbar-zone-left">
        <button
          type="button"
          className="topbar-toggle-btn"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
          title={sidebarCollapsed ? 'Mở rộng' : 'Thu gọn'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {classScreen && path !== '/lop-hoc' && (
          <a className="workspace-back" href={path.startsWith('/lop/') && path.split('/').length > 3 ? `#/lop/${path.split('/')[2]}` : '#/lop-hoc'}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true">
              <path d="m12 5-5 5 5 5" />
            </svg>
            <span>Quay lại</span>
          </a>
        )}

        <nav className="topbar-breadcrumbs" aria-label="Đường dẫn điều hướng">
          {breadcrumbs.map((crumb, idx) => (
            <span key={idx} className="breadcrumb-item">
              {idx > 0 && (
                <span className="breadcrumb-sep" aria-hidden="true">/</span>
              )}
              {crumb.href ? (
                <a href={crumb.href} className="breadcrumb-link">
                  {crumb.label}
                </a>
              ) : (
                <span className="breadcrumb-current" aria-current="page">
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      </div>

      {/* Zone 2: Focused Clean Command Search */}
      <div className="topbar-zone topbar-zone-center" ref={searchWrapRef}>
        <div className="topbar-search-box">
          <span className="search-icon" aria-hidden="true">
            <Icon name="search" />
          </span>
          <input
            ref={searchInputRef}
            type="search"
            className="topbar-search-input"
            placeholder="Tìm kiếm nhanh..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            aria-label="Tìm kiếm nhanh"
          />
          <kbd className="topbar-search-kbd" title="Phím tắt: Ctrl + K">
            ⌘K
          </kbd>

          {searchOpen && (
            <div className="topbar-search-dropdown" role="listbox">
              <div className="search-dropdown-header">
                <span>{searchQuery.trim() ? `Kết quả cho "${searchQuery}"` : 'Truy cập nhanh'}</span>
              </div>
              {filteredItems.length === 0 ? (
                <div className="search-empty">Không tìm thấy kết quả</div>
              ) : (
                filteredItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="search-result-item"
                    onClick={() => handleSelectSearch(item.path)}
                  >
                    <span className="search-result-icon">
                      <Icon name={item.icon} />
                    </span>
                    <div className="search-result-text">
                      <strong>{item.title}</strong>
                      <small>{item.category}</small>
                    </div>
                    <span className="search-result-arrow">→</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Zone 3: Notification Bell & Account Profile */}
      <div className="topbar-zone topbar-zone-right">
        {user.role === 'student' && <StudentNotifications />}

        {/* User Account Dropdown */}
        <details className="account-menu topbar-account-menu" onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.open = false; }}>
          <summary aria-label="Menu tài khoản">
            <span className="workspace-avatar" aria-hidden="true">
              {initials}
            </span>
            <div className="topbar-user-info">
              <strong className="topbar-user-name">{user.displayName}</strong>
              <small className="topbar-user-role">{roleLabel}</small>
            </div>
            <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" className="menu-chevron">
              <path d="m6 8 4 4 4-4" />
            </svg>
          </summary>
          <div className="account-options topbar-account-options" onClick={(e) => { (e.currentTarget.parentElement as HTMLDetailsElement).open = false; }}>
            <div className="account-menu-header">
              <div className="account-menu-header-info">
                <strong>{user.displayName}</strong>
                <small>{user.school.name}</small>
              </div>
              <span className="account-menu-tag">{roleLabel}</span>
            </div>
            <div className="menu-divider" />
            <button
              type="button"
              className="menu-theme-btn"
              onClick={(e) => {
                e.stopPropagation();
                onToggleTheme();
              }}
            >
              <span className="theme-icon-wrap" aria-hidden="true">
                {theme === 'dark' ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
              </span>
              <span className="menu-theme-text">{theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'}</span>
              <span className="menu-theme-pill">{theme === 'dark' ? 'Tối' : 'Sáng'}</span>
            </button>
            <a href="#/tai-khoan">
              <Icon name="user" />
              <span>Cài đặt tài khoản</span>
            </a>
            {user.role === 'admin' && (
              <>
                <a href="#/nguoi-dung">
                  <Icon name="class" />
                  <span>Người dùng & phân công</span>
                </a>
                <a href="#/nhat-ky">
                  <Icon name="log" />
                  <span>Nhật ký hệ thống</span>
                </a>
                <a href="#/bao-cao">
                  <Icon name="report" />
                  <span>Báo cáo toàn trường</span>
                </a>
              </>
            )}
            <div className="menu-divider" />
            <button type="button" className="menu-logout-btn" onClick={onLogout}>
              <Icon name="out" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
