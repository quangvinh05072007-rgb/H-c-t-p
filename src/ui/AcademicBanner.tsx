import { useState } from 'react';
import { Icon } from './kit';

export interface StudentAcademicBannerProps {
  user: {
    displayName: string;
    class?: { name: string } | null;
    school: { name: string };
  };
  data: {
    streak: number;
    xp?: number;
    today: {
      questions: number;
      goal: number;
    };
  };
  onSelectTopic?: (topicName: string) => void;
}

export function StudentAcademicBanner({ user, data, onSelectTopic }: StudentAcademicBannerProps) {
  const [activeSubject, setActiveSubject] = useState<'calc' | 'geo' | 'prob' | 'integ'>('calc');
  const firstName = user.displayName.split(' ').slice(-1)[0];
  const goalPct = Math.min(1, data.today.questions / Math.max(1, data.today.goal));

  const subjects = [
    {
      id: 'calc' as const,
      name: 'Giải tích & Hàm số',
      icon: '📈',
      formula: "f'(x) = 0 \\implies x_0",
      tip: 'Trọng tâm: Đơn điệu, cực trị & tiệm cận đồ thị hàm phân thức và hàm đa thức bậc 3.',
    },
    {
      id: 'geo' as const,
      name: 'Hình học Oxyz',
      icon: '📐',
      formula: '(x-a)^2 + (y-b)^2 + (z-c)^2 = R^2',
      tip: 'Trọng tâm: Véctơ pháp tuyến, khoảng cách từ điểm đến mặt phẳng và phương trình mặt cầu.',
    },
    {
      id: 'integ' as const,
      name: 'Tích phân & Ứng dụng',
      icon: '∫',
      formula: 'S = \\int_a^b |f(x) - g(x)| dx',
      tip: 'Trọng tâm: Tính diện tích hình phẳng giới hạn bởi đồ thị và thể tích vật thể tròn xoay.',
    },
    {
      id: 'prob' as const,
      name: 'Xác suất Thống kê',
      icon: '🎲',
      formula: 'P(A|B) = \\frac{P(A \\cap B)}{P(B)}',
      tip: 'Trọng tâm: Xác suất có điều kiện, công thức Bayes và sơ đồ hình cây theo chuẩn mới.',
    },
  ];

  const currentTopic = subjects.find((s) => s.id === activeSubject)!;

  return (
    <section className="academic-banner student-academic-banner" aria-label="Khảo thí & Học tập Toán THPT">
      {/* Background ambient lighting effects */}
      <div className="academic-banner-mesh" aria-hidden="true" />

      <div className="academic-banner-inner">
        {/* Left Column: Context, Greeting, Streak & Subject Explorer */}
        <div className="academic-banner-main">
          {/* Unboxed clean metadata kicker */}
          <div className="academic-kicker">
            <span className="academic-kicker-dot" aria-hidden="true" />
            <span className="academic-kicker-text">Toán học THPT · Chương trình GDPT 2018</span>
            <span className="academic-sep" aria-hidden="true">·</span>
            <span>Lớp {user.class?.name ?? '12A1'}</span>
            <span className="academic-sep" aria-hidden="true">·</span>
            <span>{user.school.name}</span>
          </div>

          <h1 className="academic-title">
            Chào {firstName}, sẵn sàng chinh phục mục tiêu Toán hôm nay!
          </h1>

          <p className="academic-subtitle">
            Hệ thống chuẩn bị lộ trình ôn luyện trọng tâm, phân tích lỗ hổng kiến thức và gợi ý bài thi thích ứng theo năng lực.
          </p>

          {/* Interactive Subject Module Navigator */}
          <div className="academic-subject-tabs" role="tablist" aria-label="Chuyên đề trọng tâm">
            {subjects.map((sub) => {
              const isActive = activeSubject === sub.id;
              return (
                <button
                  key={sub.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`academic-subject-tab ${isActive ? 'is-active' : ''}`}
                  onClick={() => {
                    setActiveSubject(sub.id);
                    onSelectTopic?.(sub.name);
                  }}
                >
                  <span className="academic-tab-icon" aria-hidden="true">{sub.icon}</span>
                  <span className="academic-tab-name">{sub.name}</span>
                </button>
              );
            })}
          </div>

          {/* Dynamic Subject Quick Tip bar */}
          <div className="academic-subject-insight">
            <span className="insight-badge" aria-hidden="true">Trọng tâm</span>
            <span className="insight-text">{currentTopic.tip}</span>
          </div>

          {/* Integrated Student Gamification & Progress Strip */}
          <div className="academic-stats-row">
            <div className="academic-stat-card streak-card" title="Chuỗi ngày học liên tục">
              <span className="stat-card-icon" aria-hidden="true">🔥</span>
              <div className="stat-card-data">
                <span className="stat-card-label">Chuỗi ngày</span>
                <span className="stat-card-val streak-val tabular-nums">{data.streak} ngày</span>
              </div>
            </div>

            <div className="academic-stat-card goal-card" title="Tiến độ mục tiêu câu hỏi hôm nay">
              <div className="stat-goal-header">
                <span className="stat-card-label">Mục tiêu hôm nay</span>
                <span className="stat-card-val goal-val tabular-nums">{data.today.questions}/{data.today.goal} câu</span>
              </div>
              <div className="stat-card-track" aria-hidden="true">
                <span style={{ width: `${goalPct * 100}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: AI-Generated Academic Subject Artwork (High-Fidelity SVG) */}
        <div className="academic-banner-visual" aria-hidden="true">
          <div className="academic-visual-glow" />
          <svg className="academic-illustration-svg" viewBox="0 0 280 240" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="acad-gradient-primary" x1="20" y1="20" x2="260" y2="220" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="50%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#c084fc" />
              </linearGradient>

              <linearGradient id="acad-mesh-glow" x1="140" y1="30" x2="140" y2="210" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.08" />
              </linearGradient>

              <linearGradient id="acad-integral-fill" x1="40" y1="120" x2="240" y2="210" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.04" />
              </linearGradient>

              <radialGradient id="acad-poly-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Glowing Backdrop Circle */}
            <circle cx="140" cy="115" r="95" fill="url(#acad-poly-glow)" />

            {/* 3D Isometric Cartesian Coordinate Grid Planes */}
            <g opacity="0.45" stroke="#94a3b8" strokeWidth="0.75" strokeDasharray="3 3">
              <line x1="140" y1="115" x2="245" y2="60" />
              <line x1="140" y1="115" x2="35" y2="60" />
              <line x1="140" y1="115" x2="140" y2="225" />
              <line x1="140" y1="115" x2="140" y2="15" />
              {/* Grid ellipses */}
              <ellipse cx="140" cy="115" rx="85" ry="42" fill="none" stroke="#60a5fa" strokeWidth="1" opacity="0.4" />
            </g>

            {/* 3D Polyhedron / Dodecahedron facet structure */}
            <g className="polyhedron-group">
              {/* Back facets */}
              <polygon points="140,40 195,75 195,145 140,180 85,145 85,75" fill="url(#acad-mesh-glow)" stroke="url(#acad-gradient-primary)" strokeWidth="1.5" />
              {/* Inner central 3D cube / octahedron projection */}
              <polygon points="140,55 180,82 140,110 100,82" fill="rgba(56, 189, 248, 0.18)" stroke="#38bdf8" strokeWidth="1.75" />
              <polygon points="100,82 140,110 140,158 100,130" fill="rgba(129, 140, 248, 0.22)" stroke="#818cf8" strokeWidth="1.75" />
              <polygon points="180,82 140,110 140,158 180,130" fill="rgba(192, 132, 252, 0.26)" stroke="#c084fc" strokeWidth="1.75" />
            </g>

            {/* Smooth Calculus Distribution & Integral Curve */}
            <path
              d="M 40,175 Q 85,175 110,125 T 140,80 T 170,125 Q 195,175 240,175"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.5"
            />
            {/* Shaded Area Under Integral Curve */}
            <path
              d="M 110,125 T 140,80 T 170,125 L 170,175 L 110,175 Z"
              fill="url(#acad-integral-fill)"
              stroke="none"
            />

            {/* Floating Academic Badges & KaTeX Mathematical Tokens */}
            <g className="floating-math-tokens">
              {/* Integration symbol badge */}
              <g transform="translate(32, 45)">
                <rect width="36" height="36" rx="10" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.2" opacity="0.95" />
                <text x="18" y="24" textAnchor="middle" fill="#38bdf8" fontSize="19" fontWeight="bold" fontFamily="serif">∫</text>
              </g>

              {/* Function notation badge */}
              <g transform="translate(205, 35)">
                <rect width="46" height="32" rx="8" fill="#1e293b" stroke="#c084fc" strokeWidth="1.2" opacity="0.95" />
                <text x="23" y="21" textAnchor="middle" fill="#c084fc" fontSize="13" fontWeight="bold" fontFamily="monospace">f(x)</text>
              </g>

              {/* Coordinate Vector 3D label */}
              <g transform="translate(215, 138)">
                <rect width="40" height="28" rx="7" fill="#1e293b" stroke="#34d399" strokeWidth="1.2" opacity="0.95" />
                <text x="20" y="19" textAnchor="middle" fill="#34d399" fontSize="12" fontWeight="bold" fontFamily="monospace">Oxyz</text>
              </g>

              {/* Summation / Sigma badge */}
              <g transform="translate(30, 140)">
                <rect width="34" height="34" rx="9" fill="#1e293b" stroke="#818cf8" strokeWidth="1.2" opacity="0.95" />
                <text x="17" y="23" textAnchor="middle" fill="#818cf8" fontSize="16" fontWeight="bold" fontFamily="serif">∑</text>
              </g>

              {/* Glowing Coordinate Axis pointers */}
              <circle cx="140" cy="55" r="3.5" fill="#38bdf8" />
              <circle cx="180" cy="82" r="3" fill="#818cf8" />
              <circle cx="100" cy="82" r="3" fill="#c084fc" />
              <circle cx="140" cy="110" r="3.5" fill="#34d399" />
              <circle cx="140" cy="158" r="3" fill="#38bdf8" />
            </g>
          </svg>
        </div>
      </div>
    </section>
  );
}

export interface TeacherAcademicBannerProps {
  user: {
    displayName: string;
    school?: { name: string };
  };
  data: {
    classes: any[];
    assignments: any[];
    counts?: any;
  };
  runningCount: number;
  totalStudents: number;
}

export function TeacherAcademicBanner({
  user,
  data,
  runningCount,
  totalStudents,
}: TeacherAcademicBannerProps) {
  return (
    <section className="academic-banner teacher-academic-banner" aria-label="Trung tâm Khảo thí & Ra đề Toán THPT">
      <div className="academic-banner-mesh" aria-hidden="true" />

      <div className="academic-banner-inner">
        {/* Left Column: Context, Educator Controls, Metrics & Actions */}
        <div className="academic-banner-main">
          {/* Educator Metadata Kicker */}
          <div className="academic-kicker">
            <span className="academic-kicker-dot educator-dot" aria-hidden="true" />
            <span className="academic-kicker-text">Trung tâm Khảo thí & Quản trị Học thuật</span>
            <span className="academic-sep" aria-hidden="true">·</span>
            <span>Bộ môn Toán THPT</span>
            {user.school?.name && (
              <>
                <span className="academic-sep" aria-hidden="true">·</span>
                <span>{user.school.name}</span>
              </>
            )}
          </div>

          <h1 className="academic-title">
            Xin chào, Thầy/Cô {user.displayName}
          </h1>

          <p className="academic-subtitle">
            Hệ thống hỗ trợ ra đề thi chuẩn ma trận 4 mức độ tư duy (BGD), tự động trộn đề trắc nghiệm khách quan và phân tích phổ điểm thời gian thực.
          </p>

          {/* Quick Metrics Bar */}
          <div className="teacher-quick-metrics">
            <div className="teacher-metric-pill">
              <span className="metric-icon" aria-hidden="true">🏫</span>
              <span className="metric-text">
                <strong className="tabular-nums">{data.classes.length}</strong> lớp phụ trách
              </span>
            </div>
            <span className="academic-sep" aria-hidden="true">·</span>
            <div className="teacher-metric-pill">
              <span className="metric-icon" aria-hidden="true">👥</span>
              <span className="metric-text">
                <strong className="tabular-nums">{totalStudents}</strong> học sinh
              </span>
            </div>
            <span className="academic-sep" aria-hidden="true">·</span>
            <div className="teacher-metric-pill">
              <span className="metric-icon" aria-hidden="true">⏱️</span>
              <span className="metric-text">
                <strong className="tabular-nums">{runningCount}</strong> bài thi đang mở
              </span>
            </div>
            <span className="academic-sep" aria-hidden="true">·</span>
            <div className="teacher-metric-pill">
              <span className="metric-icon" aria-hidden="true">📚</span>
              <span className="metric-text">
                <strong className="tabular-nums">{data.counts?.approved ?? 0}</strong> câu trong ngân hàng
              </span>
            </div>
          </div>

          {/* Primary Quick Actions for Educators */}
          <div className="academic-banner-actions">
            <a className="academic-btn primary-btn" href="#/ra-de">
              <Icon name="plus" />
              <span>Tạo đề thi mới</span>
            </a>
            <a className="academic-btn secondary-btn" href="#/nhap-de">
              <Icon name="upload" />
              <span>Nhập đề thông minh</span>
            </a>
            <a className="academic-btn secondary-btn" href="#/lop-hoc">
              <Icon name="class" />
              <span>Quản lý lớp</span>
            </a>
          </div>
        </div>

        {/* Right Column: High-Fidelity SVG Academic Analytics & Exam Matrix Art */}
        <div className="academic-banner-visual" aria-hidden="true">
          <div className="academic-visual-glow" />
          <svg className="academic-illustration-svg" viewBox="0 0 280 240" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="teacher-grad-primary" x1="20" y1="20" x2="260" y2="220" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="50%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>

              <linearGradient id="bar-grad-1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#0284c7" />
              </linearGradient>
              <linearGradient id="bar-grad-2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#4f46e5" />
              </linearGradient>
              <linearGradient id="bar-grad-3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c084fc" />
                <stop offset="100%" stopColor="#9333ea" />
              </linearGradient>
              <linearGradient id="bar-grad-4" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f472b6" />
                <stop offset="100%" stopColor="#db2777" />
              </linearGradient>
            </defs>

            {/* Glowing Analytical Circle Backdrop */}
            <circle cx="140" cy="120" r="90" fill="rgba(59, 130, 246, 0.12)" />

            {/* Exam Paper / Tablet Matrix Sheet Base */}
            <g transform="translate(50, 30)">
              {/* Paper shadow */}
              <rect x="4" y="6" width="172" height="175" rx="14" fill="#000000" opacity="0.25" />
              {/* Paper body */}
              <rect x="0" y="0" width="172" height="175" rx="14" fill="#131d32" stroke="url(#teacher-grad-primary)" strokeWidth="1.5" />

              {/* Sheet Header with Matrix Badge */}
              <rect x="16" y="18" width="80" height="8" rx="4" fill="#38bdf8" opacity="0.8" />
              <rect x="16" y="32" width="140" height="4" rx="2" fill="#475569" opacity="0.6" />
              <rect x="16" y="42" width="110" height="4" rx="2" fill="#475569" opacity="0.4" />

              {/* 4 Cognitive Bloom Taxonomy Distribution Bars */}
              {/* Nhận biết */}
              <rect x="22" y="115" width="22" height="38" rx="4" fill="url(#bar-grad-1)" />
              {/* Thông hiểu */}
              <rect x="54" y="90" width="22" height="63" rx="4" fill="url(#bar-grad-2)" />
              {/* Vận dụng */}
              <rect x="86" y="102" width="22" height="51" rx="4" fill="url(#bar-grad-3)" />
              {/* Vận dụng cao */}
              <rect x="118" y="128" width="22" height="25" rx="4" fill="url(#bar-grad-4)" />

              {/* Baseline axis */}
              <line x1="16" y1="155" x2="152" y2="155" stroke="#475569" strokeWidth="1" strokeDasharray="2 2" />

              {/* Bell Curve Normal Distribution Overlay */}
              <path
                d="M 18,145 Q 60,145 70,80 T 115,110 Q 135,150 152,150"
                fill="none"
                stroke="#34d399"
                strokeWidth="2"
              />
            </g>

            {/* Floating Stamp / Quality Seal */}
            <g transform="translate(185, 140)">
              <circle cx="28" cy="28" r="26" fill="#1e293b" stroke="#38bdf8" strokeWidth="2" />
              <circle cx="28" cy="28" r="21" fill="none" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3 2" />
              <text x="28" y="27" textAnchor="middle" fill="#38bdf8" fontSize="10" fontWeight="bold">GDPT</text>
              <text x="28" y="38" textAnchor="middle" fill="#34d399" fontSize="10" fontWeight="bold">2018</text>
            </g>

            {/* Floating AI Analytics Hologram Badge */}
            <g transform="translate(25, 145)">
              <rect width="44" height="44" rx="12" fill="#1e293b" stroke="#c084fc" strokeWidth="1.5" />
              <text x="22" y="28" textAnchor="middle" fill="#c084fc" fontSize="18" fontWeight="bold">AI</text>
            </g>

            {/* Floating Top Indicator */}
            <g transform="translate(195, 25)">
              <rect width="65" height="30" rx="8" fill="#1e293b" stroke="#34d399" strokeWidth="1.2" />
              <text x="32" y="20" textAnchor="middle" fill="#34d399" fontSize="12" fontWeight="bold" fontFamily="monospace">10.0 đ</text>
            </g>
          </svg>
        </div>
      </div>
    </section>
  );
}
