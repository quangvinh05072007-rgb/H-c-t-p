import { useMemo, useState } from 'react';
import { get, post } from '../../api';
import { ErrorBox, fmtDateTime, fmtScore, go, Icon, Loading, scoreColor, useApp, useAsync } from '../../ui/kit';

// SVG Đồ họa Bàn học & Tri thức số (Study Desk & AI Learning Illustration)
function StudyDeskIllustration() {
  return (
    <svg width="120" height="90" viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="bookGrad" x1="20" y1="40" x2="140" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1e4d3b" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
        <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#f59e0b" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id="glowGrad" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#38bdf8" stopOpacity="0.35" />
          <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="80" cy="60" r="50" fill="url(#glowGrad)" />
      <ellipse cx="80" cy="100" rx="65" ry="12" fill="#e2e8f0" opacity="0.7" />
      <rect x="35" y="80" width="55" height="12" rx="3" fill="#cbd5e1" />
      <rect x="38" y="70" width="50" height="11" rx="3" fill="url(#bookGrad)" />
      <rect x="42" y="60" width="45" height="11" rx="3" fill="#3b82f6" opacity="0.85" />
      <line x1="45" y1="62" x2="45" y2="69" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="41" y1="72" x2="41" y2="79" stroke="#fcd34d" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="80" y="42" width="52" height="38" rx="4" fill="#1e293b" />
      <rect x="83" y="45" width="46" height="32" rx="2" fill="#0f172a" />
      <path d="M88 68 Q98 48 106 62 T124 50" stroke="#38bdf8" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="106" cy="62" r="2.5" fill="#f59e0b" />
      <path d="M72 82 H140 L135 88 H77 L72 82Z" fill="#94a3b8" />
      <rect x="25" y="55" width="6" height="38" rx="2" transform="rotate(-25 25 55)" fill="url(#accentGrad)" />
      <polygon points="12,94 15,90 19,92" fill="#475569" />
      <path d="M125 25 L127 31 L133 33 L127 35 L125 41 L123 35 L117 33 L123 31 Z" fill="#fbbf24" />
      <path d="M50 30 L51.5 34 L55.5 35.5 L51.5 37 L50 41 L48.5 37 L44.5 35.5 L48.5 34 Z" fill="#38bdf8" opacity="0.9" />
    </svg>
  );
}

// Vòng quay đo điểm số tròn (Circular Score Gauge)
function CircularScoreGauge({ score, maxScore = 10, size = 76 }: { score: number | null; maxScore?: number; size?: number }) {
  const safeScore = score !== null ? Math.max(0, Math.min(maxScore, score)) : 0;
  const percentage = (safeScore / maxScore) * 100;
  const strokeWidth = 7;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const color =
    score === null
      ? '#94a3b8'
      : safeScore >= 8
      ? '#10b981'
      : safeScore >= 5
      ? '#f59e0b'
      : '#ef4444';

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--line)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </svg>
      <div style={{ position: 'absolute', textAlign: 'center', lineHeight: 1 }}>
        <div style={{ fontSize: size < 80 ? 17 : 20, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
          {score !== null ? fmtScore(score) : '--'}
        </div>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink-3)', marginTop: 1 }}>
          /{maxScore}đ
        </div>
      </div>
    </div>
  );
}

// Nhãn hạn nộp thông minh tính theo thời gian thực
function formatDeadlineInfo(closeAt: number) {
  const diff = closeAt - Date.now();
  if (diff <= 0) return { label: 'Đã hết hạn', color: '#64748b', bg: '#f1f5f9' };
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 2) {
    const mins = Math.max(1, Math.floor(diff / (1000 * 60)));
    return { label: `Sắp đóng: còn ${mins} phút`, color: '#b91c1c', bg: '#fee2e2' };
  }
  if (hours < 24) {
    return { label: `Hôm nay: còn ${hours} giờ`, color: '#b45309', bg: '#fef3c7' };
  }
  const days = Math.floor(hours / 24);
  return { label: `Còn ${days} ngày · Hạn ${fmtDateTime(closeAt)}`, color: '#0369a1', bg: '#e0f2fe' };
}

// Thẻ thông báo Lời phê từ Thầy Cô
function TeacherFeedbackCard({ feedback }: { feedback: any }) {
  if (!feedback) return null;
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
        border: '1.5px solid #86efac',
        borderRadius: 14,
        padding: '12px 16px',
        boxShadow: '0 2px 10px rgba(22, 101, 52, 0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0, flex: 1 }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 10,
            background: '#dcfce7',
            display: 'grid',
            placeItems: 'center',
            fontSize: 22,
            flexShrink: 0,
          }}
        >
          {feedback.teacherStamp ? feedback.teacherStamp.split(' ')[0] : '🌟'}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#166534', background: '#dcfce7', padding: '2px 8px', borderRadius: 6 }}>
              {feedback.teacherStamp || 'Lời phê từ Giáo viên'}
            </span>
            <span style={{ fontSize: 11.5, color: '#15803d', fontWeight: 600 }}>
              Thầy/Cô {feedback.teacherName || 'bộ môn'} · {feedback.title}
            </span>
          </div>
          {feedback.teacherFeedback && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#14532d', fontStyle: 'italic', lineHeight: 1.4 }}>
              “{feedback.teacherFeedback}”
            </p>
          )}
        </div>
      </div>
      <a
        href={`#/ket-qua/${feedback.id}`}
        className="btn sm"
        style={{
          background: '#166534',
          color: '#ffffff',
          fontWeight: 700,
          borderRadius: 8,
          border: 'none',
          whiteSpace: 'nowrap',
          fontSize: 12.5,
          padding: '8px 14px',
          textDecoration: 'none',
        }}
      >
        Xem bài làm & lời phê →
      </a>
    </div>
  );
}

export function StudentHome() {
  const { user, toast } = useApp();
  const { data, error, loading, reload } = useAsync(async () => {
    const [home, mistakes] = await Promise.all([
      get<any>('/api/student/home'),
      get<any>('/api/student/mistakes').catch(() => ({
        mistakes: [],
        totalMistakes: 0,
        dueCount: 0,
        notedCount: 0,
        topWeakTopics: [],
      })),
    ]);
    return { home, mistakes };
  }, []);

  const [busy, setBusy] = useState(false);
  const [filterTab, setFilterTab] = useState<'open' | 'done' | 'all'>('open');

  // Lời chào theo thời gian trong ngày
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Chào buổi sáng';
    if (hour < 18) return 'Chào buổi chiều';
    return 'Chào buổi tối';
  }, []);

  // Đếm ngược kỳ thi THPT Quốc gia (Kỳ thi đợt tới tính từ thời điểm học sinh đang học)
  const daysUntilExam = useMemo(() => {
    const currentYear = new Date().getFullYear();
    let target = new Date(`${currentYear}-06-26T07:30:00+07:00`).getTime();
    if (Date.now() > target) {
      target = new Date(`${currentYear + 1}-06-26T07:30:00+07:00`).getTime();
    }
    const diff = target - Date.now();
    return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, []);

  if (loading) return <Loading text="Đang mở bàn học thông minh..." />;
  if (error || !data) return <ErrorBox error={error ?? 'Không tải được dữ liệu.'} onRetry={reload} />;

  const home = data.home;
  const mistakeData = data.mistakes;
  const assignments = home.assignments ?? [];
  const open = assignments.filter((a: any) => a.state === 'open' || a.state === 'doing');
  const done = assignments.filter((a: any) => a.state === 'done');
  const upcoming = assignments.filter((a: any) => a.state === 'upcoming');
  const next = open[0];

  const recentAttempt = home.recentAttempt || done[0] || null;
  const practiceInProgress = home.practiceInProgress;
  const recommendations = home.recommendations ?? [];
  const topRecommendation = recommendations[0] || null;

  const dueCount = mistakeData?.dueCount ?? 0;

  const today = home.today ?? { questions: 0, correct: 0, goal: 10 };
  const streak = home.streak ?? 0;
  const goalPercent = Math.min(100, Math.round(((today.questions || 0) / (today.goal || 10)) * 100));

  const startAssignment = async (assignmentId: number) => {
    setBusy(true);
    try {
      const a = await post<{ id: number }>('/api/attempts/start', { assignmentId });
      go(`/thi/${a.id}`);
    } catch (e: any) {
      toast(e.message || 'Không thể bắt đầu bài làm.');
      setBusy(false);
    }
  };

  const startQuickChallenge = async () => {
    setBusy(true);
    try {
      const a = await post<{ id: number }>('/api/practice/start', {
        mode: 'weak',
        count: 3,
      });
      go(`/thi/${a.id}`);
    } catch (e: any) {
      toast(e.message || 'Không thể bắt đầu thử thách 3 câu.');
      setBusy(false);
    }
  };

  const startSpeedDrill = async () => {
    setBusy(true);
    try {
      const a = await post<{ id: number }>('/api/practice/start', {
        mode: 'speed_drill',
        count: 12,
      });
      go(`/thi/${a.id}`);
    } catch (e: any) {
      toast(e.message || 'Không thể bắt đầu luyện phản xạ tốc độ.');
      setBusy(false);
    }
  };

  const startMistakeExam = async (topic?: string) => {
    setBusy(true);
    try {
      const a = await post<{ id: number }>('/api/student/mistakes/practice', {
        topic,
        count: 8,
        title: 'Ôn tập câu sai nhanh',
      });
      go(`/thi/${a.id}`);
    } catch (e: any) {
      toast(e.message || 'Không thể tạo đề ôn câu sai.');
      setBusy(false);
    }
  };

  const retakeAttempt = async (attemptId: number) => {
    setBusy(true);
    try {
      const a = await post<{ id: number }>(`/api/attempts/${attemptId}/retake`);
      go(`/thi/${a.id}`);
    } catch (e: any) {
      toast(e.message || 'Không thể tạo đề làm lại.');
      setBusy(false);
    }
  };

  const startTopicPractice = async (topicCode: string, name?: string) => {
    setBusy(true);
    try {
      const a = await post<{ id: number }>('/api/practice/start', {
        mode: 'topic',
        topics: [topicCode],
        count: 8,
      });
      go(`/thi/${a.id}`);
    } catch (e: any) {
      toast(e.message || `Không thể tạo bài luyện tập chuyên đề ${name || topicCode}.`);
      setBusy(false);
    }
  };

  const filteredAssignments =
    filterTab === 'open'
      ? [...open, ...upcoming]
      : filterTab === 'done'
      ? done
      : assignments;

  return (
    <div className="student-bento-dashboard stack" style={{ gap: 14 }}>
      {/* ========================================================
          1. TOP COCKPIT: BANNER BÀN HỌC TINH GỌN (THÂN THIỆN MOBILE)
          ======================================================== */}
      <section
        className="card"
        style={{
          padding: '16px',
          background: 'linear-gradient(135deg, #ffffff 0%, #f6fbf8 100%)',
          border: '1px solid #d1e5db',
          borderRadius: 14,
          boxShadow: '0 2px 12px rgba(30, 77, 59, 0.04)',
        }}
      >
        <div className="student-cockpit">
          {/* Hàng 1: Avatar + Tên + Level & Lớp */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #1e4d3b 0%, #0f766e 100%)',
                color: '#ffffff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 900,
                fontSize: 18,
                flexShrink: 0,
                boxShadow: '0 3px 10px rgba(30, 77, 59, 0.2)',
              }}
            >
              {user?.displayName ? user.displayName.slice(0, 1).toUpperCase() : 'A'}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f291e', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {greeting}, {user?.displayName || 'Học sinh'}!
                </h1>
                <span
                  style={{
                    background: '#e6f4ea',
                    color: '#137333',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: 5,
                  }}
                >
                  Lớp {user?.class?.name || '12A1'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                {goalPercent >= 100 ? (
                  <span style={{ color: 'var(--good)', fontWeight: 600 }}>🎉 Đã hoàn thành 100% mục tiêu hôm nay! Giỏi lắm!</span>
                ) : (
                  <span>Chuẩn bị bứt phá mục tiêu tốt nghiệp THPT 2026</span>
                )}
              </div>
            </div>

            {/* Minh họa thu nhỏ hiển thị trên máy tính */}
            <div className="hide-on-mobile">
              <StudyDeskIllustration />
            </div>
          </div>

          {/* Hàng 2: Cụm 3 Thẻ Chỉ Số Đo Lường (Cân đối 3 cột trên cả Mobile) */}
          <div className="student-metrics-row">
            {/* 1. Đếm ngược */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '8px 10px',
                textAlign: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Đếm ngược
              </div>
              <div className="tabular-nums" style={{ fontSize: 18, fontWeight: 900, color: 'var(--primary)', lineHeight: 1.15, marginTop: 1 }}>
                {daysUntilExam}
              </div>
              <div style={{ fontSize: 9.5, color: '#94a3b8' }}>ngày thi THPT</div>
            </div>

            {/* 2. Chuỗi học */}
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 10,
                padding: '8px 10px',
                textAlign: 'center',
                boxShadow: '0 1px 3px rgba(180, 83, 9, 0.03)',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                <Icon name="flame" /> Chuỗi học
              </div>
              <div className="tabular-nums" style={{ fontSize: 18, fontWeight: 900, color: '#b45309', lineHeight: 1.15, marginTop: 1 }}>
                {streak}
              </div>
              <div style={{ fontSize: 9.5, color: '#d97706' }}>ngày liên tục</div>
            </div>

            {/* 3. Tiến độ ngày */}
            <div
              style={{
                background: goalPercent >= 100 ? '#f0fdf4' : '#ffffff',
                border: goalPercent >= 100 ? '1px solid #86efac' : '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '8px 10px',
                textAlign: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: goalPercent >= 100 ? '#15803d' : '#475569', textTransform: 'uppercase' }}>
                Hôm nay
              </div>
              <div className="tabular-nums" style={{ fontSize: 18, fontWeight: 900, color: goalPercent >= 100 ? 'var(--good)' : 'var(--primary)', lineHeight: 1.15, marginTop: 1 }}>
                {today.questions}/{today.goal}
              </div>
              <div style={{ fontSize: 9.5, color: goalPercent >= 100 ? '#16a34a' : '#94a3b8' }}>câu ({goalPercent}%)</div>
            </div>
          </div>
        </div>
      </section>

      {/* THÔNG BÁO LỜI PHÊ TỪ GIÁO VIÊN */}
      {home.teacherFeedback && (
        <TeacherFeedbackCard feedback={home.teacherFeedback} />
      )}

      {/* ========================================================
          2. BENTO ROW 1: BÀI ƯU TIÊN & ĐỀ THI VỪA HOÀN THÀNH
          ======================================================== */}
      <div className="student-hero-grid">
        {/* CARD 1: BÀI TẬP / ĐỀ KIỂM TRA ƯU TIÊN HOẶC THỬ THÁCH 3 CÂU */}
        <section
          className="card"
          style={{
            margin: 0,
            padding: '16px 18px',
            background: '#ffffff',
            border: '1px solid var(--line)',
            borderLeft: practiceInProgress ? '5px solid #b45309' : next ? '5px solid var(--primary)' : '5px solid #10b981',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 12,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: practiceInProgress ? '#b45309' : next ? 'var(--primary)' : '#10b981',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: practiceInProgress ? '#f59e0b' : next ? 'var(--primary)' : '#10b981' }} />
                {practiceInProgress ? 'Bài thi đang làm dở' : next ? 'Bài kiểm tra cần nộp' : 'Thử thách mỗi ngày'}
              </span>

              {next && (
                (() => {
                  const d = formatDeadlineInfo(next.close_at);
                  return (
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: d.color, background: d.bg, padding: '2px 7px', borderRadius: 5 }}>
                      {d.label}
                    </span>
                  );
                })()
              )}
            </div>

            {practiceInProgress ? (
              <div>
                <h2 style={{ fontSize: 15.5, fontWeight: 800, margin: '0 0 4px', color: 'var(--ink)', lineHeight: 1.35 }}>
                  {practiceInProgress.title}
                </h2>
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.45 }}>
                  Bạn đang có bài tự luyện chưa nộp. Hoàn thành để cập nhật điểm và chuỗi học.
                </p>
              </div>
            ) : next ? (
              <div>
                <h2 style={{ fontSize: 15.5, fontWeight: 800, margin: '0 0 4px', color: 'var(--ink)', lineHeight: 1.35 }}>
                  {next.title}
                </h2>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
                    {next.mode === 'exam' ? `⏱ ${next.duration_min} phút` : '📝 Bài tập'}
                  </span>
                  <span>·</span>
                  <span>Lớp {user?.class?.name || '12A1'}</span>
                </div>
              </div>
            ) : (
              <div>
                <h2 style={{ fontSize: 15.5, fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>
                  ⚡ Thử thách 3 câu khởi động
                </h2>
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.45 }}>
                  Đã hoàn thành bài trên lớp! Hãy làm 3 câu trắc nghiệm nhanh để rèn luyện phản xạ và duy trì thói quen học.
                </p>
              </div>
            )}
          </div>

          <div style={{ marginTop: 2 }}>
            {practiceInProgress ? (
              <button
                type="button"
                className="btn primary mobile-full-btn"
                disabled={busy}
                onClick={() => go(`/thi/${practiceInProgress.id}`)}
                style={{ fontWeight: 700, fontSize: 13.5, borderRadius: 10 }}
              >
                Tiếp tục làm bài →
              </button>
            ) : next ? (
              <button
                type="button"
                className="btn primary mobile-full-btn"
                disabled={busy}
                onClick={() => (next.attempt_id ? go(`/thi/${next.attempt_id}`) : startAssignment(next.id))}
                style={{ fontWeight: 700, fontSize: 13.5, borderRadius: 10 }}
              >
                {next.state === 'doing' ? 'Làm tiếp bài thi →' : 'Vào làm bài ngay →'}
              </button>
            ) : (
              <button
                type="button"
                className="btn primary mobile-full-btn"
                disabled={busy}
                onClick={startQuickChallenge}
                style={{ fontWeight: 700, fontSize: 13.5, borderRadius: 10 }}
              >
                ⚡ Làm 3 câu nhanh ngay (3 phút) →
              </button>
            )}
          </div>
        </section>

        {/* CARD 2: ĐỀ THI VỪA HOÀN THÀNH & PHÂN TÍCH ĐÚNG / SAI */}
        <section
          className="card"
          style={{
            margin: 0,
            padding: '16px 18px',
            background: '#ffffff',
            border: '1px solid var(--line)',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 12,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-3)' }}>
                Đề thi vừa hoàn thành
              </span>
              {recentAttempt?.submitted_at && (
                <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                  {fmtDateTime(recentAttempt.submitted_at)}
                </span>
              )}
            </div>

            {recentAttempt ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <CircularScoreGauge score={recentAttempt.score10} size={70} />

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h2 style={{ fontSize: 14.5, fontWeight: 800, margin: '0 0 3px', color: 'var(--ink)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {recentAttempt.title}
                    </h2>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.4 }}>
                      {recentAttempt.points !== null && recentAttempt.max_points !== null ? (
                        <div>Đạt <strong className="tabular-nums" style={{ color: 'var(--ink)' }}>{recentAttempt.points}/{recentAttempt.max_points}</strong> điểm quy đổi</div>
                      ) : (
                        <div>{recentAttempt.kind === 'practice' ? 'Bài tự luyện tập' : 'Bài kiểm tra lớp'}</div>
                      )}
                      {recentAttempt.score10 === null || recentAttempt.score10 === undefined ? (
                        <div style={{ fontWeight: 600, marginTop: 1, color: '#9a3412', fontSize: 11.5 }}>
                          Điểm & đáp án sẽ mở sau khi đóng đề
                        </div>
                      ) : (
                        <div style={{ fontWeight: 600, marginTop: 1, color: recentAttempt.score10 >= 8 ? 'var(--good)' : recentAttempt.score10 >= 5 ? 'var(--warn)' : 'var(--bad)', fontSize: 11.5 }}>
                          {recentAttempt.score10 >= 8 ? '✨ Giữ vững phong độ' : recentAttempt.score10 >= 5 ? '⚡ Cần cải thiện câu vận dụng' : '⚠️ Nên làm lại để ôn lý thuyết'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Vạch phổ phân tích tỷ lệ Đúng / Sai / Chưa làm */}
                {recentAttempt.stats && recentAttempt.stats.total > 0 && (
                  <div style={{ marginTop: 10, background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    {/* Thanh ngang 3 màu */}
                    <div style={{ display: 'flex', height: 6, borderRadius: 99, overflow: 'hidden', width: '100%' }}>
                      <div style={{ width: `${(recentAttempt.stats.correct / recentAttempt.stats.total) * 100}%`, background: '#10b981' }} title={`${recentAttempt.stats.correct} Đúng`} />
                      <div style={{ width: `${(recentAttempt.stats.wrong / recentAttempt.stats.total) * 100}%`, background: '#ef4444' }} title={`${recentAttempt.stats.wrong} Sai`} />
                      <div style={{ width: `${(recentAttempt.stats.blank / recentAttempt.stats.total) * 100}%`, background: '#cbd5e1' }} title={`${recentAttempt.stats.blank} Chưa làm`} />
                    </div>
                    {/* Chú thích chi tiết */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginTop: 5, flexWrap: 'wrap', gap: 4 }}>
                      <span style={{ color: '#059669' }}>● {recentAttempt.stats.correct} câu đúng</span>
                      <span style={{ color: '#dc2626' }}>● {recentAttempt.stats.wrong} câu sai</span>
                      {recentAttempt.stats.blank > 0 && <span style={{ color: '#64748b' }}>● {recentAttempt.stats.blank} bỏ trống</span>}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '6px 0' }}>
                <h2 style={{ fontSize: 14.5, fontWeight: 700, margin: '0 0 4px', color: 'var(--ink-2)' }}>
                  Chưa có kết quả thi gần đây
                </h2>
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.4 }}>
                  Hãy làm một bài thi thử để xem phân tích điểm số và biểu đồ đo lường năng lực tại đây.
                </p>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            {recentAttempt ? (
              <>
                <button
                  type="button"
                  className="btn sm primary"
                  disabled={busy}
                  onClick={() => retakeAttempt(recentAttempt.id)}
                  style={{ flex: 1, minHeight: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontWeight: 700, fontSize: 12.5, borderRadius: 8 }}
                >
                  <Icon name="refresh" /> Làm lại đề
                </button>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => go(`/ket-qua/${recentAttempt.id}`)}
                  style={{ flex: 1, minHeight: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 12.5, borderRadius: 8 }}
                >
                  <Icon name="eye" /> {recentAttempt.answersVisible === false ? 'Xem bài nộp' : 'Xem kết quả'}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn sm primary mobile-full-btn"
                onClick={() => go('/luyen-tap')}
                style={{ fontWeight: 700, borderRadius: 8 }}
              >
                Khảo sát năng lực 2026 →
              </button>
            )}
          </div>
        </section>
      </div>

      {/* ========================================================
          3. BENTO ROW 2: 3 THẺ TIỆN ÍCH HỌC TẬP (CÂN ĐỐI 3 CỘT)
          ======================================================== */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: 'var(--ink)' }}>
            Lối tắt học tập & Luyện thi
          </h2>
          <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>1-chạm mở nhanh</span>
        </div>

        <section className="student-actions-grid">
          {/* TIỆN ÍCH 1: ÔN CÂU SAI */}
          <div
            onClick={() => (dueCount > 0 ? startMistakeExam() : go('/so-tay-loi-sai'))}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && (dueCount > 0 ? startMistakeExam() : go('/so-tay-loi-sai'))}
            className="quick-action-card"
            style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              minHeight: 64,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: '#fef3c7',
                color: '#b45309',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Icon name="edit" />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#92400e', lineHeight: 1.2 }}>
                Ôn câu sai
              </div>
              <div style={{ fontSize: 11, color: dueCount > 0 ? '#b45309' : '#a16207', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {dueCount > 0 ? `⚡ ${dueCount} câu cần ôn` : '✅ Sổ lỗi sạch'}
              </div>
            </div>
          </div>

          {/* TIỆN ÍCH 2: LUYỆN TỐC ĐỘ 15 PHÚT */}
          <div
            onClick={startSpeedDrill}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && startSpeedDrill()}
            className="quick-action-card"
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              minHeight: 64,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: '#fee2e2',
                color: '#dc2626',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 18 }}>⚡</span>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#991b1b', lineHeight: 1.2 }}>
                Luyện tốc độ
              </div>
              <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                15' phản xạ 12 câu
              </div>
            </div>
          </div>

          {/* TIỆN ÍCH 3: KHO ĐỀ 2026 */}
          <div
            onClick={() => go('/luyen-tap')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && go('/luyen-tap')}
            className="quick-action-card"
            style={{
              background: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              minHeight: 64,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: '#e0f2fe',
                color: '#0284c7',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Icon name="exam" />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0369a1', lineHeight: 1.2 }}>
                Kho đề 2026
              </div>
              <div style={{ fontSize: 11, color: '#0284c7', fontWeight: 500, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                12+ đề chuẩn Bộ
              </div>
            </div>
          </div>

          {/* TIỆN ÍCH 3: BẢN ĐỒ CHUYÊN ĐỀ */}
          <div
            onClick={() => go('/tu-hoc')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && go('/tu-hoc')}
            className="quick-action-card"
            style={{
              background: '#faf5ff',
              border: '1px solid #e9d5ff',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              minHeight: 64,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: '#f3e8ff',
                color: '#7e22ce',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Icon name="book" />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#6b21a8', lineHeight: 1.2 }}>
                Tự học
              </div>
              <div style={{ fontSize: 11, color: '#7e22ce', fontWeight: 500, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Lý thuyết & Bài tập
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ========================================================
          4. BENTO ROW 3: DANH SÁCH BÀI TẬP LỚP & ĐỀ XUẤT CỦNG CỐ
          ======================================================== */}
      <div className="student-main-grid">
        {/* CỘT CHÍNH: BÀI TẬP & ĐỀ THI TRÊN LỚP */}
        <section
          className="card"
          style={{
            margin: 0,
            padding: '16px',
            background: 'var(--surface)',
            borderRadius: 12,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>
              Bài tập & Đề thi lớp
            </h2>

            <div className="seg" role="tablist" style={{ width: '100%', maxWidth: 300, display: 'flex' }}>
              <button
                type="button"
                className={filterTab === 'open' ? 'on' : ''}
                onClick={() => setFilterTab('open')}
                style={{ flex: 1, textAlign: 'center', padding: '6px 4px', fontSize: 12 }}
              >
                Cần làm ({open.length})
              </button>
              <button
                type="button"
                className={filterTab === 'done' ? 'on' : ''}
                onClick={() => setFilterTab('done')}
                style={{ flex: 1, textAlign: 'center', padding: '6px 4px', fontSize: 12 }}
              >
                Đã nộp ({done.length})
              </button>
              <button
                type="button"
                className={filterTab === 'all' ? 'on' : ''}
                onClick={() => setFilterTab('all')}
                style={{ flex: 1, textAlign: 'center', padding: '6px 4px', fontSize: 12 }}
              >
                Tất cả ({assignments.length})
              </button>
            </div>
          </div>

          {filteredAssignments.length === 0 ? (
            <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>🎉</div>
              {filterTab === 'open' ? 'Không còn bài tập nào chưa hoàn thành.' : 'Chưa có bài thi nào trong mục này.'}
            </div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {filteredAssignments.map((a: any) => {
                const isDone = a.state === 'done';
                const isDoing = a.state === 'doing';
                const isUpcoming = a.state === 'upcoming';
                const deadline = !isDone && !isUpcoming ? formatDeadlineInfo(a.close_at) : null;

                return (
                  <div key={a.id} className="student-assignment-card">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.35 }}>
                        {a.title}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
                          {a.mode === 'exam' ? '⏱ Thi tính giờ' : '📝 Bài tập'}
                        </span>
                        <span>·</span>
                        {isUpcoming ? (
                          <span>Mở: {fmtDateTime(a.open_at)}</span>
                        ) : isDone ? (
                          <span style={{ color: 'var(--good)', fontWeight: 600 }}>Đã nộp bài</span>
                        ) : deadline ? (
                          <span style={{ color: deadline.color, fontWeight: 700, background: deadline.bg, padding: '1px 6px', borderRadius: 4 }}>
                            {deadline.label}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                      {isDone ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="tabular-nums" style={{ fontSize: 13.5, fontWeight: 800, color: scoreColor(a.score10) }}>
                            {a.score10 !== null ? `${fmtScore(a.score10)} đ` : 'Đã nộp'}
                          </span>
                          <a href={`#/ket-qua/${a.attempt_id}`} className="btn sm" style={{ minHeight: 36, display: 'inline-flex', alignItems: 'center' }}>
                            {a.score10 === null ? 'Bài nộp' : 'Kết quả'}
                          </a>
                        </div>
                      ) : isUpcoming ? (
                        <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 500 }}>Chưa mở</span>
                      ) : (
                        <button
                          type="button"
                          className="btn sm primary"
                          disabled={busy}
                          onClick={() => (a.attempt_id ? go(`/thi/${a.attempt_id}`) : startAssignment(a.id))}
                          style={{ fontWeight: 700, minHeight: 36 }}
                        >
                          {isDoing ? 'Làm tiếp' : 'Vào làm'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* CỘT PHỤ: GỢI Ý CỦNG CỐ & GHI CHÚ LỖI SAI */}
        <div className="stack" style={{ gap: 14 }}>
          {/* GỢI Ý CHUYÊN ĐỀ YẾU */}
          <section
            className="card"
            style={{
              margin: 0,
              padding: '16px',
              background: '#ffffff',
              borderRadius: 12,
              border: '1px solid #d1e5db',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#16a34a', display: 'grid' }}>
                  <Icon name="sparkle" />
                </span>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>
                  Đề xuất củng cố
                </h2>
              </div>
              <a
                href="#/ban-do-tri-thuc"
                style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}
              >
                Cây kiến thức →
              </a>
            </div>

            {topRecommendation ? (
              <div
                style={{
                  background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                    {topRecommendation.name}
                  </span>
                  <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 700, color: '#d97706', background: '#fef3c7', padding: '1px 6px', borderRadius: 4 }}>
                    Thành thạo {Math.round(topRecommendation.mastery * 100)}%
                  </span>
                </div>

                <div style={{ width: '100%', height: 5, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.round(topRecommendation.mastery * 100)}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #f59e0b 0%, #10b981 100%)',
                      borderRadius: 99,
                    }}
                  />
                </div>

                <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.45 }}>
                  {topRecommendation.tip || topRecommendation.reason}
                </div>

                <button
                  type="button"
                  className="btn sm"
                  disabled={busy}
                  onClick={() => startTopicPractice(topRecommendation.topic, topRecommendation.name)}
                  style={{
                    alignSelf: 'flex-start',
                    background: 'var(--primary)',
                    color: '#ffffff',
                    fontWeight: 700,
                    padding: '6px 12px',
                    borderRadius: 7,
                    border: 'none',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  ⚡ Luyện 8 câu chuyên đề →
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.45 }}>
                Chưa phát hiện lỗ hổng lớn. Hãy tiếp tục làm đề để nhận gợi ý cải thiện điểm số.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
