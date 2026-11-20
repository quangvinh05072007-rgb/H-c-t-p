import { Component, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  LineChart,
  BookOpen,
  ListChecks,
  BookmarkCheck,
  ChevronRight,
  ClipboardList,
  Compass,
  Database,
  FilePlus2,
  FolderOpen,
  GraduationCap,
  Home,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Search,
  Shuffle,
  Sun,
  Upload,
  User as UserIcon,
  Users as UsersIcon,
  ScanLine,
  Grid3X3,
  Wrench,
} from 'lucide-react';
import { get, post, setSessionToken, setUnauthorizedHandler } from './api';
import { AppCtx, AzotaLogo, ErrorBox, go, Loading, Meta, Modal, User, useRoute } from './ui/kit';
import { Login } from './pages/Login';
import { Setup } from './pages/Setup';
import { Account } from './pages/Account';
import { TeacherHome } from './pages/teacher/TeacherHome';
import { Bank } from './pages/teacher/Bank';
import { ImportPage } from './pages/teacher/Import';
import { ExamBuilder } from './pages/teacher/ExamBuilder';
import { ExamDetail, Exams } from './pages/teacher/Exams';
import { Report } from './pages/teacher/Report';
import { StudentProfilePage, TeacherAttemptView } from './pages/teacher/ClassView';
import { Classes } from './pages/teacher/Classes';
import { StudentHome } from './pages/student/StudentHome';
import { StudentClass } from './pages/student/StudentClass';
import { SelfStudy } from './pages/student/SelfStudy';
import { ExamRoom } from './pages/student/ExamRoom';
import { ResultPage } from './pages/student/Result';
import { AnswerReviewRoom } from './pages/student/AnswerReviewRoom';
import { PracticeHub } from './pages/student/Practice';
import { OmrPage } from './pages/teacher/OmrPage';
import { BankCoverage, BankQuality } from './pages/teacher/BankInsights';
import { MistakeNotebook } from './pages/student/MistakeNotebook';
import { EndlessPracticeStream } from './pages/student/EndlessPracticeStream';
import { AdminHome, Audit, Users } from './pages/admin/Admin';
import { LessonAdmin } from './pages/admin/Lessons';
import { CurriculumAdmin } from './pages/admin/Curriculum';
import { PeriodicReports } from './pages/teacher/PeriodicReports';
import { Family } from './pages/Family';
import { InstallApp } from './ui/InstallApp';
import { ClassWorkspace } from './pages/teacher/ClassWorkspace';
import { StudentResults } from './pages/student/StudentResults';
import { StudentProfile } from './pages/student/StudentProfile';
import { VariantShuffler } from './pages/teacher/VariantShuffler';
import { TeacherNotifications } from './ui/TeacherNotifications';

type PopoverKey = 'library' | 'create' | 'utilities';

type SubItem = {
  path?: string;
  label: string;
  icon: typeof Home;
  action?: () => void;
  danger?: boolean;
};

function match(pattern: string, path: string) {
  const normPath = (path.startsWith('/') ? path : '/' + path).replace(/\/+$/, '') || '/';
  const normPat = (pattern.startsWith('/') ? pattern : '/' + pattern).replace(/\/+$/, '') || '/';
  const re = new RegExp('^' + normPat.replace(/:(\w+)/g, '([^/]+)') + '$');
  const m = normPath.match(re);
  return m ? m.slice(1) : null;
}

function pathMatchesAny(path: string, prefixes: string[]) {
  const clean = (path.startsWith('/') ? path : '/' + path).replace(/\/+$/, '') || '/';
  return prefixes.some((p) => clean === p || clean.startsWith(p + '/'));
}

class PageErrorBoundary extends Component<
  { resetKey: string; children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { resetKey: string; children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err: Error) {
    return { hasError: true, message: err?.message || 'Lỗi hiển thị giao diện.' };
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, message: '' });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ maxWidth: 560, margin: '40px auto', padding: 28, textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Trang gặp sự cố hiển thị</h2>
          <p className="small muted" style={{ margin: '0 0 16px', lineHeight: 1.5 }}>
            {this.state.message}
          </p>
          <div className="row center" style={{ gap: 10 }}>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                go('/');
              }}
            >
              Về trang chủ
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => window.location.reload()}
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [toastMsg, setToast] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const { path } = useRoute();

  const [openPopover, setOpenPopover] = useState<PopoverKey | null>(null);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const navShellRef = useRef<HTMLDivElement>(null);
  const mobilePopoverRef = useRef<HTMLDivElement>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('smartexam_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('smartexam_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('smartexam_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {}
    return 'light';
  });
  const toggleTheme = () => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  };
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('smartexam_theme', theme);
    } catch {}
  }, [theme]);

  // Close popovers on route change
  useEffect(() => {
    setOpenPopover(null);
  }, [path]);

  // Scroll main workspace on route change
  useEffect(() => {
    document.getElementById('main-content')?.scrollTo({ top: 0 });
  }, [path]);

  // Close popovers on outside click or Escape key
  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const inSidebar = navShellRef.current?.contains(target);
      const inMobilePopover = mobilePopoverRef.current?.contains(target);
      if (!inSidebar && !inMobilePopover) {
        setOpenPopover(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenPopover(null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickSearchOpen((v) => !v);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const refreshUser = useCallback(() => {
    get('/api/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    get('/api/meta').then(setMeta).catch((e) => setBootError(e.message));
    get('/api/setup').then((r) => setNeedsSetup(r.needsSetup)).catch(() => setNeedsSetup(false));
    refreshUser();
  }, [refreshUser]);

  const toast = useCallback((s: string) => {
    setToast(s);
    setTimeout(() => setToast((t) => (t === s ? null : t)), 3500);
  }, []);

  if (path === '/phu-huynh') return <div className="public-app"><Family /><InstallApp /></div>;
  if (bootError) return <div className="main"><ErrorBox error={bootError} onRetry={() => location.reload()} /></div>;
  if (!meta || user === undefined || needsSetup === null) return <Loading text="Đang mở SmartExam…" />;
  if (!user && needsSetup) return <Setup onDone={(u) => { setNeedsSetup(false); setUser(u); go('/'); }} />;
  if (!user) return <><Login onLogin={(u) => { setUser(u); go('/'); }} /><InstallApp /></>;

  const logout = async () => {
    setOpenPopover(null);
    await post('/api/logout').catch(() => {});
    setSessionToken(null);
    setUser(null);
    go('/');
  };

  const routes: [string, (p: string[]) => JSX.Element][] =
    user.role === 'student'
      ? [
          ['/', () => <StudentHome />],
          ['/so-tay-loi-sai', () => <MistakeNotebook />],
          ['/loi-sai', () => <MistakeNotebook />],
          ['/ghi-chu', () => <MistakeNotebook />],
          ['/luyen-vo-han', () => <EndlessPracticeStream />],
          ['/nhiem-vu', () => <EndlessPracticeStream />],
          ['/ban-do-tri-thuc', () => <SelfStudy />],
          ['/tu-hoc', () => <SelfStudy />],
          ['/mon-hoc', () => <SelfStudy />],
          ['/hoc-phan', () => <SelfStudy />],
          ['/on-tap', () => <SelfStudy />],
          ['/chuyen-de', () => <SelfStudy />],
          ['/lop', () => <StudentClass initialView="directory" />],
          ['/lop-hoc', () => <StudentClass initialView="directory" />],
          ['/danh-sach-lop', () => <StudentClass initialView="directory" />],
          ['/tat-ca-lop', () => <StudentClass initialView="directory" />],
          ['/lop/:id', ([id]) => <StudentClass initialClassId={id} initialView="class" initialTab="overview" />],
          ['/lop-hoc/:id', ([id]) => <StudentClass initialClassId={id} initialView="class" initialTab="overview" />],
          ['/lop/:id/hoc-phan', ([id]) => <StudentClass initialClassId={id} initialView="class" initialTab="modules" />],
          ['/lop/:id/bai-giao', ([id]) => <StudentClass initialClassId={id} initialView="class" initialTab="quizzes" />],
          ['/lop/:id/bai-tap', ([id]) => <StudentClass initialClassId={id} initialView="class" initialTab="assignments" />],
          ['/lop/:id/ket-qua', ([id]) => <StudentClass initialClassId={id} initialView="class" initialTab="grades" />],
          ['/lop/:id/ket-qua/:aid', ([id]) => <StudentClass initialClassId={id} initialView="class" initialTab="grades" />],
          ['/bai-giao', () => <StudentClass initialView="class" initialTab="quizzes" />],
          ['/bai-giao/:id', () => <StudentClass initialView="class" initialTab="quizzes" />],
          ['/bai-tap', () => <StudentClass initialView="class" initialTab="assignments" />],
          ['/lich-thi', () => <StudentClass initialView="class" initialTab="quizzes" />],
          ['/thong-bao', () => <StudentClass initialView="class" initialTab="announcements" />],
          ['/luyen-tap', () => <PracticeHub />],
          ['/de-thi', () => <PracticeHub />],
          ['/de-thi/:id', () => <PracticeHub />],
          ['/kho-de', () => <PracticeHub />],
          ['/thu-vien', () => <PracticeHub />],
          ['/phong-thi', () => <PracticeHub />],
          ['/ngan-hang', () => <SelfStudy />],
          ['/thi/:id', ([id]) => <ExamRoom key={id} attemptId={Number(id)} />],
          ['/ket-qua/:id/dap-an', ([id]) => <AnswerReviewRoom key={id} attemptId={Number(id)} />],
          ['/ket-qua/:id', ([id]) => <ResultPage key={id} attemptId={Number(id)} />],
          ['/ho-so', () => <StudentProfile key="profile" />],
          ['/ket-qua', () => <StudentProfile key="profile" />],
          ['/tien-bo', () => <StudentResults key="progress" initial="progress" />],
          ['/khieu-nai', () => <StudentResults key="appeals" initial="appeals" />],
          ['/tai-khoan', () => <Account onLogout={logout} />],
        ]
      : [
          ['/', () => (user.role === 'admin' ? <AdminHome /> : <TeacherHome />)],
          ['/dao-de', () => <VariantShuffler />],
          ['/cham-phieu', () => <OmrPage />],
          ['/do-phu', () => <BankCoverage />],
          ['/can-sua', () => <BankQuality />],
          ['/tron-de', () => <VariantShuffler />],
          ['/thu-vien', () => <Exams />],
          ['/kho-de', () => <Exams />],
          ['/tai-lieu', () => <Exams />],
          ['/ngan-hang', () => <Bank />],
          ['/nhap-de', () => <ImportPage />],
          ['/ra-de', () => <ExamBuilder />],
          ['/soan-de', () => <ExamBuilder />],
          ['/de-thi-moi', () => <ExamBuilder />],
          ['/de-thi', () => <Exams />],
          ['/de-thi/:id', ([id]) => <ExamDetail key={id} id={Number(id)} />],
          ['/bai-giao', () => <Classes />],
          ['/khieu-nai', () => <Classes />],
          ['/bao-cao', () => (user.role === 'admin' ? <PeriodicReports /> : <Classes />)],
          ['/lop', () => <Classes />],
          ['/lop-hoc', () => <Classes />],
          ['/danh-sach-lop', () => <Classes />],
          ['/tat-ca-lop', () => <Classes />],
          ['/bai-giao/:id', ([id]) => <Report key={id} id={Number(id)} />],
          ['/lop/:id', ([id]) => <ClassWorkspace key={id} id={Number(id)} tab="overview" />],
          ['/lop-hoc/:id', ([id]) => <ClassWorkspace key={id} id={Number(id)} tab="overview" />],
          ['/lop/:id/hoc-phan', ([id]) => <ClassWorkspace key={id} id={Number(id)} tab="modules" />],
          ['/lop/:id/bai-giao', ([id]) => <ClassWorkspace key={id} id={Number(id)} tab="quizzes" />],
          ['/lop/:id/bai-tap', ([id]) => <ClassWorkspace key={id} id={Number(id)} tab="assignments" />],
          ['/lop/:id/ket-qua', ([id]) => <ClassWorkspace key={id} id={Number(id)} tab="grades" />],
          ['/lop/:id/ket-qua/:assignmentId', ([id, aid]) => <ClassWorkspace key={id} id={Number(id)} tab="grades" assignmentId={Number(aid)} />],
          ['/lop/:id/cai-dat', ([id]) => <ClassWorkspace key={id} id={Number(id)} tab="info" />],
          ['/hoc-sinh/:id', ([id]) => <StudentProfilePage key={id} id={Number(id)} />],
          ['/bai-lam/:id', ([id]) => <TeacherAttemptView key={id} id={Number(id)} />],
          ['/nguoi-dung', () => <Users />],
          ['/nhat-ky', () => <Audit />],
          ['/bai-tu-hoc', () => (user.role === 'admin' ? <LessonAdmin /> : <Classes />)],
          ['/chuong-trinh', () => (user.role === 'admin' ? <CurriculumAdmin /> : <Classes />)],
          ['/tien-bo', () => <Classes />],
          ['/tai-khoan', () => <Account onLogout={logout} />],
        ];

  let page: JSX.Element | null = null;
  for (const [pat, render] of routes) {
    const m = match(pat, path);
    if (m) {
      page = render(m);
      break;
    }
  }

  const inExam = path.startsWith('/thi/') || /^\/ket-qua\/\d+\/dap-an(?:\/|$)/.test(path);
  const classScreen = pathMatchesAny(path, ['/lop-hoc', '/lop', '/danh-sach-lop', '/tat-ca-lop']);

  // Active state matchers for primary navigation & nested child routes
  const isHomeActive = path === '/' || path === '';
  // Đề thi: kho đề, soạn, đảo & in, chấm phiếu tô. Ngân hàng: câu hỏi, nhập, độ phủ, cần sửa.
  const isLibraryActive = pathMatchesAny(path, ['/thu-vien', '/kho-de', '/de-thi', '/tai-lieu', '/ra-de', '/soan-de', '/de-thi-moi', '/dao-de', '/tron-de', '/cham-phieu']);
  const isCreateActive = pathMatchesAny(path, ['/ngan-hang', '/nhap-de', '/do-phu', '/can-sua']);
  const isClassesActive = pathMatchesAny(path, [
    '/lop-hoc',
    '/lop',
    '/danh-sach-lop',
    '/tat-ca-lop',
    '/hoc-sinh',
    '/bai-giao',
    '/bai-tap',
    '/bai-lam',
    '/khieu-nai',
    '/lich-thi',
    '/thong-bao',
  ]);
  const isUtilitiesActive = pathMatchesAny(path, ['/tai-khoan', '/nguoi-dung', '/nhat-ky', '/bao-cao']);

  // Student active matchers
  const isStudentExamsActive = pathMatchesAny(path, [
    '/luyen-tap',
    '/de-thi',
    '/kho-de',
    '/thu-vien',
    '/phong-thi',
    '/so-tay-loi-sai',
    '/loi-sai',
    '/ghi-chu',
  ]);
  const isStudentStudyActive = pathMatchesAny(path, ['/tu-hoc', '/ban-do-tri-thuc', '/mon-hoc', '/hoc-phan', '/on-tap', '/chuyen-de', '/luyen-vo-han', '/nhiem-vu']);
  const isStudentResultsActive = pathMatchesAny(path, ['/ho-so', '/ket-qua', '/tien-bo', '/khieu-nai']);

  const librarySubItems: SubItem[] = [
    { path: '/thu-vien', label: 'Kho đề', icon: FolderOpen },
    { path: '/ra-de', label: 'Soạn đề', icon: FilePlus2 },
    { path: '/dao-de', label: 'Đảo đề & In', icon: Shuffle },
    { path: '/cham-phieu', label: 'Chấm phiếu tô', icon: ScanLine },
  ];

  const createSubItems: SubItem[] = [
    { path: '/ngan-hang', label: 'Câu hỏi', icon: Database },
    { path: '/nhap-de', label: 'Nhập', icon: Upload },
    { path: '/do-phu', label: 'Độ phủ', icon: Grid3X3 },
    { path: '/can-sua', label: 'Cần sửa', icon: Wrench },
  ];

  const utilitySubItems: SubItem[] = [
    { path: '/tai-khoan', label: 'Hồ sơ & Tài khoản', icon: UserIcon },
    {
      label: 'Tìm kiếm nhanh (Ctrl+K)',
      icon: Search,
      action: () => {
        setOpenPopover(null);
        setQuickSearchOpen(true);
      },
    },
    {
      label: theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối',
      icon: theme === 'dark' ? Sun : Moon,
      action: () => {
        toggleTheme();
        setOpenPopover(null);
      },
    },
    ...(user.role === 'admin'
      ? [
          { path: '/nguoi-dung', label: 'Quản lý người dùng', icon: UsersIcon },
          { path: '/chuong-trinh', label: 'Chương trình chuẩn', icon: ListChecks },
          { path: '/bai-tu-hoc', label: 'Bài tự học', icon: BookOpen },
          { path: '/nhat-ky', label: 'Nhật ký hệ thống', icon: ScrollText },
          { path: '/bao-cao', label: 'Báo cáo toàn trường', icon: BarChart3 },
        ]
      : []),
    {
      label: 'Đăng xuất',
      icon: LogOut,
      action: logout,
      danger: true,
    },
  ];

  const roleLabel = { admin: 'Quản lý trường', teacher: 'Giáo viên', student: 'Học sinh' }[user.role];
  const initials = user.displayName.trim().split(/\s+/).slice(-2).map((p) => p[0]).join('');

  const studentNavItems = [
    { path: '/', label: 'Tổng quan', icon: Home, active: isHomeActive },
    { path: '/luyen-tap', label: 'Đề thi', icon: ClipboardList, active: isStudentExamsActive },
    { path: '/tu-hoc', label: 'Tự học', icon: BookOpen, active: isStudentStudyActive },
    { path: '/lop-hoc', label: 'Lớp học', icon: GraduationCap, active: isClassesActive },
    { path: '/ho-so', label: 'Hồ sơ', icon: LineChart, active: isStudentResultsActive },
  ];

  const getSearchItems = () => {
    if (user.role === 'student') {
      return [
        { title: 'Tổng quan bàn học', desc: 'Nhiệm vụ & bài tập cần làm', path: '/', icon: Home },
        { title: 'Kho đề thi', desc: 'Bộ đề khảo sát THPT & ôn tập', path: '/luyen-tap', icon: ClipboardList },
        { title: 'Sổ tay lỗi sai', desc: 'Xem lại câu làm sai, ghi chú và ôn lại', path: '/so-tay-loi-sai', icon: BookmarkCheck },
        { title: 'Tự học kiến thức', desc: 'Chuyên đề, công thức & bài tập', path: '/tu-hoc', icon: BookOpen },
        { title: 'Lớp học của tôi', desc: 'Học phần, bài kiểm tra & điểm số', path: '/lop-hoc', icon: GraduationCap },
        { title: 'Hồ sơ học tập', desc: 'Xu hướng điểm, lịch sử & vấn đề cần chú ý', path: '/ho-so', icon: LineChart },
        { title: 'Tài khoản cá nhân', desc: 'Thông tin cá nhân & giao diện', path: '/tai-khoan', icon: UserIcon },
      ];
    }
    const items = [
      { title: 'Tổng quan giảng dạy', desc: 'Trung tâm điều hành lớp & đề thi', path: '/', icon: Home },
      { title: 'Kho đề thi', desc: 'Danh sách đề đã lưu & giao lớp', path: '/thu-vien', icon: FolderOpen },
      { title: 'Ngân hàng câu hỏi', desc: 'Kho câu hỏi trắc nghiệm & tự luận', path: '/ngan-hang', icon: Database },
      { title: 'Tạo đề mới', desc: 'Soạn đề thi mới chuẩn GDPT 2018', path: '/ra-de', icon: FilePlus2 },
      { title: 'Nhập đề', desc: 'Tách câu hỏi từ Word, PDF hoặc văn bản', path: '/nhap-de', icon: Upload },
      { title: 'Đảo đề', desc: 'Trộn mã đề & xuất bảng đáp án', path: '/dao-de', icon: Shuffle },
      { title: 'Lớp học của tôi', desc: 'Quản lý học phần, bài giao & điểm số', path: '/lop-hoc', icon: GraduationCap },
      { title: 'Hồ sơ & Tài khoản', desc: 'Thông tin giảng viên & mật khẩu', path: '/tai-khoan', icon: UserIcon },
    ];
    if (user.role === 'admin') {
      items.push(
        { title: 'Quản lý người dùng', desc: 'Phân quyền giáo viên & học sinh', path: '/nguoi-dung', icon: UsersIcon },
        { title: 'Chương trình chuẩn', desc: 'Yêu cầu cần đạt theo lớp, chuyên đề; độ phủ ngân hàng', path: '/chuong-trinh', icon: ListChecks },
        { title: 'Bài tự học', desc: 'Lý thuyết tự học: bài đang dùng, lịch sử, khôi phục', path: '/bai-tu-hoc', icon: BookOpen },
        { title: 'Nhật ký hệ thống', desc: 'Theo dõi hoạt động bảo mật', path: '/nhat-ky', icon: ScrollText },
        { title: 'Báo cáo toàn trường', desc: 'Thống kê kết quả thi', path: '/bao-cao', icon: BarChart3 },
      );
    }
    return items;
  };

  const filteredSearchItems = getSearchItems().filter(
    (item) =>
      !searchFilter.trim() ||
      item.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      item.desc.toLowerCase().includes(searchFilter.toLowerCase()),
  );

  const renderPopoverMenu = (items: SubItem[], isUtility = false, label = 'Menu con') => (
    <div
      className={`nav-popover ${isUtility ? 'is-utility' : ''}`}
      role="menu"
      aria-label={label}
    >
      {isUtility && (
        <div className="nav-popover-header">
          <strong>{user.displayName}</strong>
          <small>{roleLabel}</small>
        </div>
      )}
      {items.map((sub, idx) => {
        const IconComp = sub.icon;
        const active = sub.path ? pathMatchesAny(path, [sub.path]) : false;
        if (sub.path) {
          return (
            <a
              key={sub.path}
              href={`#${sub.path}`}
              role="menuitem"
              className={`nav-popover-item ${active ? 'is-active' : ''}`}
              onClick={() => setOpenPopover(null)}
            >
              <IconComp size={16} />
              <span>{sub.label}</span>
            </a>
          );
        }
        return (
          <div key={sub.label}>
            {sub.danger && idx > 0 && <div className="nav-popover-divider" />}
            <button
              type="button"
              role="menuitem"
              className={`nav-popover-item ${sub.danger ? 'is-danger' : ''}`}
              onClick={() => sub.action?.()}
            >
              <IconComp size={16} />
              <span>{sub.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );

  const togglePopover = (key: PopoverKey) => {
    setOpenPopover((prev) => (prev === key ? null : key));
  };

  return (
    <AppCtx.Provider value={{ meta, user, refreshUser, toast }}>
      <div
        className={`app ${inExam ? 'exam-app' : 'workspace-app'} ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}
      >
        <a
          href="#main-content"
          className="skip-link"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('main-content')?.focus();
          }}
        >
          Đến nội dung chính
        </a>

        {/* DESKTOP SIDEBAR (5 Primary Items) */}
        {!inExam && (
          <aside
            ref={navShellRef}
            className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}
            aria-label="Thanh điều hướng chính"
          >
            {/* Brand & Collapse Header */}
            <div className="sidebar-header">
              <a className="brand workspace-brand" href="#/" aria-label="SmartExam — Trang chủ" title="SmartExam">
                <AzotaLogo size={sidebarCollapsed ? 26 : 28} />
                {!sidebarCollapsed && <span className="brand-title">SmartExam</span>}
              </a>
              <button
                type="button"
                className="sidebar-collapse-toggle"
                onClick={toggleSidebar}
                title={sidebarCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
                aria-label={sidebarCollapsed ? 'Mở rộng' : 'Thu gọn'}
              >
                {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </button>
            </div>

            {user.role === 'student' ? (
              /* STUDENT: Role-appropriate 5 items (No teacher exam tools) */
              <nav className="sidebar-nav-list" aria-label="Danh mục học sinh">
                {studentNavItems.map((item) => {
                  const IconComp = item.icon;
                  return (
                    <div key={item.path} className="nav-item-group">
                      <div className={`nav-item-row ${item.active ? 'is-active' : ''}`}>
                        <a
                          href={`#${item.path}`}
                          aria-label={item.label}
                          title={sidebarCollapsed ? item.label : undefined}
                          aria-current={item.active ? 'page' : undefined}
                          className="nav nav-primary-link"
                        >
                          <IconComp size={18} />
                          {!sidebarCollapsed && <span className="rail-label">{item.label}</span>}
                        </a>
                      </div>
                    </div>
                  );
                })}
              </nav>
            ) : (
              /* TEACHER / ADMIN: Exact 5 Primary Items with Compact Popovers */
              <nav className="sidebar-nav-list" aria-label="Danh mục giáo viên">
                {/* 1. Tổng quan */}
                <div className="nav-item-group">
                  <div className={`nav-item-row ${isHomeActive ? 'is-active' : ''}`}>
                    <a
                      href="#/"
                      aria-label="Tổng quan"
                      title={sidebarCollapsed ? 'Tổng quan' : undefined}
                      aria-current={isHomeActive ? 'page' : undefined}
                      className="nav nav-primary-link"
                    >
                      <Home size={18} />
                      {!sidebarCollapsed && <span className="rail-label">Tổng quan</span>}
                    </a>
                  </div>
                </div>

                {/* 2. Đề thi (Kho đề, Soạn đề, Đảo đề & In, Chấm phiếu tô) */}
                <div className="nav-item-group">
                  <div className={`nav-item-row ${isLibraryActive || openPopover === 'library' ? 'is-active' : ''}`}>
                    <a
                      href="#/thu-vien"
                      aria-label="Đề thi"
                      title={sidebarCollapsed ? 'Đề thi' : undefined}
                      aria-current={isLibraryActive ? 'page' : undefined}
                      className="nav nav-primary-link"
                      onClick={(e) => {
                        if (sidebarCollapsed) {
                          e.preventDefault();
                          togglePopover('library');
                        } else {
                          setOpenPopover(null);
                        }
                      }}
                    >
                      <FolderOpen size={18} />
                      {!sidebarCollapsed && <span className="rail-label">Đề thi</span>}
                    </a>
                    {!sidebarCollapsed && (
                      <button
                        type="button"
                        className="nav-chevron-btn"
                        aria-label="Mở menu con Đề thi"
                        aria-haspopup="menu"
                        aria-expanded={openPopover === 'library'}
                        onClick={() => togglePopover('library')}
                      >
                        <ChevronRight size={15} />
                      </button>
                    )}
                  </div>
                  {openPopover === 'library' && renderPopoverMenu(librarySubItems, false, 'Đề thi')}
                </div>

                {/* 3. Ngân hàng (Câu hỏi, Nhập, Độ phủ, Cần sửa) */}
                <div className="nav-item-group">
                  <div className={`nav-item-row ${isCreateActive || openPopover === 'create' ? 'is-active' : ''}`}>
                    <a
                      href="#/ngan-hang"
                      aria-label="Ngân hàng"
                      title={sidebarCollapsed ? 'Ngân hàng' : undefined}
                      aria-current={isCreateActive ? 'page' : undefined}
                      className="nav nav-primary-link"
                      onClick={(e) => {
                        if (sidebarCollapsed) {
                          e.preventDefault();
                          togglePopover('create');
                        } else {
                          setOpenPopover(null);
                        }
                      }}
                    >
                      <Database size={18} />
                      {!sidebarCollapsed && <span className="rail-label">Ngân hàng</span>}
                    </a>
                    {!sidebarCollapsed && (
                      <button
                        type="button"
                        className="nav-chevron-btn"
                        aria-label="Mở menu con Ngân hàng"
                        aria-haspopup="menu"
                        aria-expanded={openPopover === 'create'}
                        onClick={() => togglePopover('create')}
                      >
                        <ChevronRight size={15} />
                      </button>
                    )}
                  </div>
                  {openPopover === 'create' && renderPopoverMenu(createSubItems, false, 'Ngân hàng')}
                </div>

                {/* 4. Lớp học */}
                <div className="nav-item-group">
                  <div className={`nav-item-row ${isClassesActive ? 'is-active' : ''}`}>
                    <a
                      href="#/lop-hoc"
                      aria-label="Lớp học"
                      title={sidebarCollapsed ? 'Lớp học' : undefined}
                      aria-current={isClassesActive ? 'page' : undefined}
                      className="nav nav-primary-link"
                    >
                      <GraduationCap size={18} />
                      {!sidebarCollapsed && <span className="rail-label">Lớp học</span>}
                    </a>
                  </div>
                </div>
              </nav>
            )}

            <div className="spacer" />

            {/* Compact Sidebar Footer: Thông báo (GV/Admin) + Hồ sơ, Tiện ích & Tài khoản */}
            <div className="sidebar-footer-group" style={{ gap: 4 }}>
              {user.role !== 'student' && (
                <TeacherNotifications variant="sidebar" collapsed={sidebarCollapsed} />
              )}
              <div className="nav-item-group">
                <button
                  type="button"
                  aria-label="Tài khoản và tiện ích"
                  title={sidebarCollapsed ? `${user.displayName} (${roleLabel})` : 'Mở tiện ích & tài khoản'}
                  aria-haspopup="menu"
                  aria-expanded={openPopover === 'utilities'}
                  className={`sidebar-footer-account ${isUtilitiesActive || openPopover === 'utilities' ? 'is-active' : ''}`}
                  onClick={() => togglePopover('utilities')}
                >
                  <span className="workspace-avatar" style={{ width: 28, height: 28, fontSize: 11, flexShrink: 0 }} aria-hidden="true">
                    {initials}
                  </span>
                  {!sidebarCollapsed && (
                    <>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {user.displayName}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--nav-muted)' }}>{roleLabel} · Tiện ích</div>
                      </div>
                      <ChevronRight size={15} className="sidebar-footer-chevron" />
                    </>
                  )}
                </button>
                {openPopover === 'utilities' && renderPopoverMenu(utilitySubItems, true, 'Tài khoản & Tiện ích')}
              </div>
            </div>
          </aside>
        )}

        {/* MAIN CONTENT */}
        <main
          className={`main${inExam ? '' : ' workspace-main'}${classScreen ? ' class-management-main' : ''}`}
          id="main-content"
          tabIndex={-1}
        >
          <div className={inExam ? undefined : 'workspace-content'}>
            <PageErrorBoundary resetKey={path}>
              {page ?? (
                <div
                  className="card empty"
                  style={{ maxWidth: 540, margin: '48px auto', padding: '36px 24px', textAlign: 'center', borderRadius: 16 }}
                >
                  <div style={{ display: 'inline-flex', padding: 12, borderRadius: 12, background: '#eaf3ff', color: '#2563eb', marginBottom: 12 }}>
                    <Compass size={28} />
                  </div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: 'var(--ink)' }}>
                    Không tìm thấy trang yêu cầu
                  </h2>
                  <p style={{ color: 'var(--ink-3)', fontSize: 13.5, margin: '0 0 20px', lineHeight: 1.5 }}>
                    Đường dẫn <code>{path}</code> không khả dụng hoặc bạn không có quyền truy cập mục này.
                  </p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <a className="btn primary sm" href="#/">
                      <Home size={15} /> Về Tổng quan
                    </a>
                    <a className="btn sm" href="#/lop-hoc">
                      <GraduationCap size={15} /> Lớp học
                    </a>
                    {user.role === 'student' ? (
                      <a className="btn sm" href="#/luyen-tap">
                        <ClipboardList size={15} /> Đề thi
                      </a>
                    ) : (
                      <a className="btn sm" href="#/thu-vien">
                        <FolderOpen size={15} /> Kho đề
                      </a>
                    )}
                  </div>
                </div>
              )}
            </PageErrorBoundary>
          </div>
        </main>

        {/* MOBILE TABBAR (5 Primary Items + Floating Popover, No Giant Vertical Modal Buttons) */}
        {!inExam && (
          <nav className="tabbar nav-tabbar-clean" aria-label="Điều hướng di động">
            {user.role === 'student' ? (
              studentNavItems.map((item) => {
                const IconComp = item.icon;
                return (
                  <a
                    key={item.path}
                    href={`#${item.path}`}
                    aria-current={item.active ? 'page' : undefined}
                    className={item.active ? 'active' : ''}
                  >
                    <IconComp size={19} />
                    <span>{item.label}</span>
                  </a>
                );
              })
            ) : (
              <>
                <a href="#/" aria-current={isHomeActive ? 'page' : undefined} className={isHomeActive ? 'active' : ''}>
                  <Home size={19} />
                  <span>Tổng quan</span>
                </a>
                <button
                  type="button"
                  className={isLibraryActive || openPopover === 'library' ? 'active' : ''}
                  aria-haspopup="menu"
                  aria-expanded={openPopover === 'library'}
                  onClick={() => togglePopover('library')}
                >
                  <FolderOpen size={19} />
                  <span>Đề thi</span>
                </button>
                <button
                  type="button"
                  className={isCreateActive || openPopover === 'create' ? 'active' : ''}
                  aria-haspopup="menu"
                  aria-expanded={openPopover === 'create'}
                  onClick={() => togglePopover('create')}
                >
                  <Database size={19} />
                  <span>Ngân hàng</span>
                </button>
                <a
                  href="#/lop-hoc"
                  aria-current={isClassesActive ? 'page' : undefined}
                  className={isClassesActive ? 'active' : ''}
                >
                  <GraduationCap size={19} />
                  <span>Lớp học</span>
                </a>
                <button
                  type="button"
                  className={isUtilitiesActive || openPopover === 'utilities' ? 'active' : ''}
                  aria-haspopup="menu"
                  aria-expanded={openPopover === 'utilities'}
                  onClick={() => togglePopover('utilities')}
                >
                  <UserIcon size={19} />
                  <span>{user.role === 'admin' ? 'Quản trị' : 'Tài khoản'}</span>
                </button>
              </>
            )}
          </nav>
        )}

        {/* MOBILE FLOATING POPOVER (Compact dropdown above tabbar) */}
        {!inExam && openPopover && (
          <>
            <div className="nav-mobile-backdrop" onClick={() => setOpenPopover(null)} aria-hidden="true" />
            <div
              ref={mobilePopoverRef}
              className="nav-mobile-popover"
              role="menu"
              aria-label={
                openPopover === 'library' ? 'Đề thi' : openPopover === 'create' ? 'Ngân hàng' : 'Tài khoản & Tiện ích'
              }
            >
              {openPopover === 'utilities' && (
                <div className="nav-popover-header">
                  <strong>{user.displayName}</strong>
                  <small>{roleLabel}</small>
                </div>
              )}
              {(openPopover === 'library'
                ? librarySubItems
                : openPopover === 'create'
                ? createSubItems
                : utilitySubItems
              ).map((sub, idx) => {
                const IconComp = sub.icon;
                const active = sub.path ? pathMatchesAny(path, [sub.path]) : false;
                if (sub.path) {
                  return (
                    <a
                      key={sub.path}
                      href={`#${sub.path}`}
                      role="menuitem"
                      className={`nav-popover-item ${active ? 'is-active' : ''}`}
                      onClick={() => setOpenPopover(null)}
                    >
                      <IconComp size={16} />
                      <span>{sub.label}</span>
                    </a>
                  );
                }
                return (
                  <div key={sub.label}>
                    {sub.danger && idx > 0 && <div className="nav-popover-divider" />}
                    <button
                      type="button"
                      role="menuitem"
                      className={`nav-popover-item ${sub.danger ? 'is-danger' : ''}`}
                      onClick={() => sub.action?.()}
                    >
                      <IconComp size={16} />
                      <span>{sub.label}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* QUICK SEARCH MODAL (Ctrl/Cmd + K) */}
        {quickSearchOpen && (
          <Modal
            title="Tìm kiếm & Điều hướng nhanh"
            onClose={() => {
              setQuickSearchOpen(false);
              setSearchFilter('');
            }}
            width={540}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  autoFocus
                  className="input"
                  placeholder="Nhập tên chức năng, đề thi, lớp học..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  style={{ width: '100%', paddingLeft: 34, fontSize: 14 }}
                />
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--ink-3)',
                    pointerEvents: 'none',
                  }}
                />
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filteredSearchItems.length === 0 ? (
                  <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
                    Không tìm thấy mục nào khớp với &quot;{searchFilter}&quot;
                  </div>
                ) : (
                  filteredSearchItems.map((item) => {
                    const IconComp = item.icon;
                    return (
                      <a
                        key={item.path}
                        href={`#${item.path}`}
                        onClick={() => {
                          setQuickSearchOpen(false);
                          setSearchFilter('');
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '9px 12px',
                          borderRadius: 8,
                          textDecoration: 'none',
                          color: 'var(--ink)',
                          background: 'var(--surface-subtle)',
                          border: '1px solid var(--line)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <IconComp size={16} />
                          <div>
                            <div style={{ fontWeight: 650, fontSize: 13.5 }}>{item.title}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{item.desc}</div>
                          </div>
                        </div>
                        <span style={{ fontSize: 11.5, color: 'var(--primary)', fontWeight: 600 }}>Đi tới →</span>
                      </a>
                    );
                  })
                )}
              </div>
            </div>
          </Modal>
        )}

        {!inExam && <InstallApp />}
        {toastMsg && (
          <div className="toast" role="status">
            {toastMsg}
          </div>
        )}
      </div>
    </AppCtx.Provider>
  );
}
