import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  Database,
  Eye,
  FilePlus2,
  FolderOpen,
  GraduationCap,
  Shuffle,
  Upload,
  Users,
} from 'lucide-react';
import { get } from '../../api';
import { ErrorBox, fmtDateTime, fmtScore, go, Loading, useApp, useAsync } from '../../ui/kit';
import { TeacherNotifications } from '../../ui/TeacherNotifications';

function TeachingDeskIllustration() {
  return (
    <svg width="116" height="86" viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="gvBoardGrad" x1="25" y1="20" x2="135" y2="95" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563eb" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id="gvGlowGrad" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#60a5fa" stopOpacity="0.28" />
          <stop offset="1" stopColor="#60a5fa" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="80" cy="60" r="48" fill="url(#gvGlowGrad)" />
      <ellipse cx="80" cy="102" rx="64" ry="11" fill="#dbeafe" opacity="0.85" />
      <rect x="30" y="24" width="100" height="62" rx="8" fill="#1e293b" />
      <rect x="35" y="29" width="90" height="52" rx="4" fill="url(#gvBoardGrad)" />
      <path d="M46 66 Q62 42 78 56 T112 40" stroke="#93c5fd" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="78" cy="56" r="3" fill="#fbbf24" />
      <circle cx="112" cy="40" r="3" fill="#34d399" />
      <rect x="46" y="38" width="26" height="4" rx="2" fill="#e0f2fe" opacity="0.85" />
      <rect x="46" y="46" width="18" height="3" rx="1.5" fill="#bfdbfe" opacity="0.7" />
      <rect x="24" y="88" width="112" height="8" rx="4" fill="#cbd5e1" />
      <rect x="36" y="76" width="38" height="10" rx="3" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
      <line x1="42" y1="81" x2="64" y2="81" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CircularScoreGauge({
  score,
  maxScore = 10,
  size = 70,
}: {
  score: number | null;
  maxScore?: number;
  size?: number;
}) {
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
      ? '#16a34a'
      : safeScore >= 5
      ? '#2563eb'
      : '#dc2626';

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--line)" strokeWidth={strokeWidth} fill="none" />
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
          style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </svg>
      <div style={{ position: 'absolute', textAlign: 'center', lineHeight: 1 }}>
        <div style={{ fontSize: 16.5, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
          {score !== null ? fmtScore(score) : '--'}
        </div>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink-3)', marginTop: 1 }}>/{maxScore}đ</div>
      </div>
    </div>
  );
}

function formatRemainingInfo(closeAt: number, now: number) {
  const diff = closeAt - now;
  if (diff <= 0) return { label: 'Đã đóng', color: '#64748b', bg: '#f1f5f9' };
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 2) {
    const mins = Math.max(1, Math.floor(diff / (1000 * 60)));
    return { label: `Còn ${mins} phút`, color: '#b91c1c', bg: '#fee2e2' };
  }
  if (hours < 24) {
    return { label: `Hôm nay: còn ${hours} giờ`, color: '#b45309', bg: '#fef3c7' };
  }
  const days = Math.floor(hours / 24);
  return { label: `Còn ${days} ngày · Đóng ${fmtDateTime(closeAt)}`, color: '#0369a1', bg: '#e0f2fe' };
}

export function TeacherHome() {
  const { user } = useApp();
  const { data, error, loading, reload } = useAsync(async () => {
    const [classes, assignments, drafts, exams, jobsRes] = await Promise.all([
      get<{ classes: any[] }>('/api/classes?limit=50'),
      get<{ assignments: any[] }>('/api/assignments'),
      get<{ questions: any[]; counts: any }>('/api/questions?status=draft'),
      get<{ exams: any[] }>('/api/exams').catch(() => ({ exams: [] })),
      get<{ jobs: any[] }>('/api/import/jobs').catch(() => ({ jobs: [] })),
    ]);
    return {
      classes: classes.classes ?? [],
      assignments: assignments.assignments ?? [],
      drafts: drafts.questions ?? [],
      counts: drafts.counts ?? {},
      exams: exams.exams ?? [],
      importJobs: jobsRes.jobs ?? [],
    };
  }, []);

  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [filterTab, setFilterTab] = useState<'open' | 'closed' | 'all'>('open');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Chào buổi sáng';
    if (hour < 18) return 'Chào buổi chiều';
    return 'Chào buổi tối';
  }, []);

  if (loading && !data) return <Loading text="Đang mở bàn làm việc giảng dạy…" />;
  if (error || !data) return <ErrorBox error={error ?? 'Không tải được dữ liệu.'} onRetry={reload} />;

  const now = currentTime;
  const running = data.assignments.filter((a: any) => a.open_at <= now && a.close_at >= now);
  const closed = data.assignments.filter((a: any) => a.close_at < now);
  const upcoming = data.assignments.filter((a: any) => a.open_at > now);

  const primaryLive = running[0] ?? null;
  const latestGraded =
    closed.find((a: any) => a.avg !== null && a.avg !== undefined) ??
    data.assignments.find((a: any) => a.avg !== null && a.avg !== undefined) ??
    null;

  const totalStudents = data.classes.reduce((sum: number, c: any) => sum + Number(c.students ?? 0), 0);
  const initials = (user?.displayName || 'GV').trim().split(/\s+/).slice(-2).map((p) => p[0]).join('').toUpperCase();

  const filteredAssignments =
    filterTab === 'open'
      ? [...running, ...upcoming]
      : filterTab === 'closed'
      ? closed
      : data.assignments;

  const liveDeadline = primaryLive ? formatRemainingInfo(primaryLive.close_at, now) : null;
  const livePct =
    primaryLive && primaryLive.students > 0
      ? Math.min(100, Math.round(((primaryLive.submitted ?? 0) / primaryLive.students) * 100))
      : 0;

  const gradedTotal = latestGraded ? Math.max(1, Number(latestGraded.students || 0)) : 1;
  const gradedSubmitted = latestGraded ? Number(latestGraded.submitted || 0) : 0;
  const gradedPending = Math.max(0, gradedTotal - gradedSubmitted);
  const unfinishedImports = (data.importJobs ?? []).filter((j: any) => j.state === 'completed' && !j.savedIds);
  const latestImportDraft = unfinishedImports[0] ?? null;

  return (
    <div className="student-bento-dashboard stack" style={{ gap: 14 }}>
      {/* ========================================================
          1. TOP COCKPIT: BANNER GIẢNG DẠY TINH GỌN (ĐỒNG BỘ HỌC SINH)
          ======================================================== */}
      <section
        className="card"
        style={{
          padding: '16px',
          background: 'linear-gradient(135deg, #ffffff 0%, #f5f9ff 100%)',
          border: '1px solid #dbe7f5',
          borderRadius: 14,
          boxShadow: '0 2px 12px rgba(37, 99, 235, 0.04)',
          margin: 0,
        }}
      >
        <div className="student-cockpit">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
                fontSize: 16,
                flexShrink: 0,
                boxShadow: '0 3px 10px rgba(37, 99, 235, 0.22)',
              }}
            >
              {initials}
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <h1
                  style={{
                    margin: 0,
                    fontSize: 17,
                    fontWeight: 800,
                    color: '#14263d',
                    letterSpacing: '-0.01em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {greeting}, {user?.displayName || 'Giáo viên'}!
                </h1>
                <span
                  style={{
                    background: '#eaf3ff',
                    color: '#2563eb',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 6,
                  }}
                >
                  {user?.role === 'admin' ? 'Quản lý trường' : 'Giáo viên'}
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>
                Theo dõi lớp học, tổ chức kiểm tra &amp; chấm điểm chuẩn GDPT 2018
              </div>
            </div>

            <div className="hide-on-mobile">
              <TeachingDeskIllustration />
            </div>
            <TeacherNotifications variant="cockpit" />
          </div>

          {/* 3 Thẻ Chỉ Số Đo Lường */}
          <div className="student-metrics-row">
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '8px 12px',
                textAlign: 'center',
                minWidth: 86,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Lớp học
              </div>
              <div className="tabular-nums" style={{ fontSize: 18, fontWeight: 900, color: '#2563eb', lineHeight: 1.15, marginTop: 1 }}>
                {data.classes.length}
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>{totalStudents} học sinh</div>
            </div>

            <div
              style={{
                background: running.length > 0 ? '#fffbeb' : '#ffffff',
                border: running.length > 0 ? '1px solid #fde68a' : '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '8px 12px',
                textAlign: 'center',
                minWidth: 86,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: running.length > 0 ? '#b45309' : '#64748b', textTransform: 'uppercase' }}>
                Đang mở
              </div>
              <div className="tabular-nums" style={{ fontSize: 18, fontWeight: 900, color: running.length > 0 ? '#b45309' : '#14263d', lineHeight: 1.15, marginTop: 1 }}>
                {running.length}
              </div>
              <div style={{ fontSize: 10, color: running.length > 0 ? '#d97706' : '#94a3b8' }}>ca kiểm tra</div>
            </div>

            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '8px 12px',
                textAlign: 'center',
                minWidth: 86,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Kho đề
              </div>
              <div className="tabular-nums" style={{ fontSize: 18, fontWeight: 900, color: '#16a34a', lineHeight: 1.15, marginTop: 1 }}>
                {data.exams.length}
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>
                {data.drafts.length > 0 ? `${data.drafts.length} câu nháp` : 'sẵn sàng giao'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {latestImportDraft && (
        <div
          className="card"
          style={{
            margin: 0,
            padding: '11px 16px',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 13, color: '#92400e', minWidth: 0 }}>
            <strong>Bản nháp nhập đề chưa lưu:</strong> {latestImportDraft.name || 'Tài liệu đã tách'}
            {latestImportDraft.draftQuestions?.length ? ` (${latestImportDraft.draftQuestions.length} câu đang sửa)` : ''}
            {unfinishedImports.length > 1 ? ` · còn ${unfinishedImports.length - 1} file khác` : ''}
          </div>
          <a href="#/nhap-de" className="btn sm primary">
            Tiếp tục nhập đề <ArrowRight size={14} />
          </a>
        </div>
      )}

      {/* ========================================================
          2. BENTO ROW 1: CA THI ĐANG MỞ & KẾT QUẢ BÀI THI GẦN NHẤT
          ======================================================== */}
      <div className="student-hero-grid">
        {/* CARD 1: CA THI ĐANG MỞ / TÁC VỤ ƯU TIÊN */}
        <section
          className="card"
          style={{
            margin: 0,
            padding: '16px 18px',
            background: '#ffffff',
            border: '1px solid #e5edf5',
            borderLeft: primaryLive ? '5px solid #2563eb' : data.drafts.length > 0 ? '5px solid #d97706' : '5px solid #16a34a',
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
                  color: primaryLive ? '#2563eb' : data.drafts.length > 0 ? '#b45309' : '#16a34a',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: primaryLive ? '#2563eb' : data.drafts.length > 0 ? '#f59e0b' : '#16a34a',
                  }}
                />
                {primaryLive ? 'Ca kiểm tra đang mở' : data.drafts.length > 0 ? 'Câu hỏi chờ duyệt' : 'Sẵn sàng ra đề'}
              </span>

              {liveDeadline && (
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: liveDeadline.color,
                    background: liveDeadline.bg,
                    padding: '2px 8px',
                    borderRadius: 6,
                  }}
                >
                  {liveDeadline.label}
                </span>
              )}
            </div>

            {primaryLive ? (
              <div>
                <h2 style={{ fontSize: 15.5, fontWeight: 800, margin: '0 0 6px', color: '#14263d', lineHeight: 1.35 }}>
                  {primaryLive.title}
                </h2>
                <div style={{ fontSize: 12.5, color: '#64748b', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, color: '#14263d' }}>Lớp {primaryLive.class_name}</span>
                  <span>·</span>
                  <span className="tabular-nums">
                    Đã nộp <strong>{primaryLive.submitted ?? 0}/{primaryLive.students ?? 0}</strong> bài ({livePct}%)
                  </span>
                </div>
                <div style={{ marginTop: 10, height: 6, borderRadius: 99, background: '#eaf3ff', overflow: 'hidden' }}>
                  <div style={{ width: `${livePct}%`, height: '100%', background: '#2563eb', borderRadius: 99 }} />
                </div>
              </div>
            ) : data.drafts.length > 0 ? (
              <div>
                <h2 style={{ fontSize: 15.5, fontWeight: 800, margin: '0 0 4px', color: '#14263d' }}>
                  {data.drafts.length} câu hỏi nháp cần duyệt
                </h2>
                <p style={{ margin: 0, fontSize: 12.5, color: '#64748b', lineHeight: 1.45 }}>
                  Kiểm tra lại lời giải, đáp án và gắn thẻ chuyên đề để đưa câu hỏi vào ngân hàng chung của trường.
                </p>
              </div>
            ) : (
              <div>
                <h2 style={{ fontSize: 15.5, fontWeight: 800, margin: '0 0 4px', color: '#14263d' }}>
                  Tạo đề thi &amp; giao bài cho lớp
                </h2>
                <p style={{ margin: 0, fontSize: 12.5, color: '#64748b', lineHeight: 1.45 }}>
                  Soạn đề mới chuẩn ma trận THPT 2026, nhập đề từ Word/PDF hoặc đảo mã đề in cho học sinh.
                </p>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            {primaryLive ? (
              <>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => go(`/lop/${primaryLive.class_id}/ket-qua/${primaryLive.id}`)}
                  style={{ flex: 1, fontWeight: 700, fontSize: 13, borderRadius: 9, background: '#2563eb', borderColor: '#2563eb' }}
                >
                  Theo dõi bảng điểm <ArrowRight size={15} />
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => go(`/lop/${primaryLive.class_id}`)}
                  style={{ fontWeight: 600, fontSize: 13, borderRadius: 9 }}
                >
                  Vào lớp
                </button>
              </>
            ) : data.drafts.length > 0 ? (
              <button
                type="button"
                className="btn primary mobile-full-btn"
                onClick={() => go('/ngan-hang')}
                style={{ fontWeight: 700, fontSize: 13.5, borderRadius: 9, background: '#2563eb', borderColor: '#2563eb' }}
              >
                Duyệt câu hỏi ngay <ArrowRight size={15} />
              </button>
            ) : (
              <button
                type="button"
                className="btn primary mobile-full-btn"
                onClick={() => go('/ra-de')}
                style={{ fontWeight: 700, fontSize: 13.5, borderRadius: 9, background: '#2563eb', borderColor: '#2563eb' }}
              >
                Tạo đề thi mới <ArrowRight size={15} />
              </button>
            )}
          </div>
        </section>

        {/* CARD 2: KẾT QUẢ BÀI THI GẦN NHẤT (ĐỒNG BỘ VÒNG ĐIỂM HỌC SINH) */}
        <section
          className="card"
          style={{
            margin: 0,
            padding: '16px 18px',
            background: '#ffffff',
            border: '1px solid #e5edf5',
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
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>
                Kết quả bài thi gần nhất
              </span>
              {latestGraded?.close_at && (
                <span style={{ fontSize: 11.5, color: '#64748b' }}>{fmtDateTime(latestGraded.close_at)}</span>
              )}
            </div>

            {latestGraded ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <CircularScoreGauge score={latestGraded.avg} size={70} />

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h2
                      style={{
                        fontSize: 14.5,
                        fontWeight: 800,
                        margin: '0 0 3px',
                        color: '#14263d',
                        lineHeight: 1.3,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {latestGraded.title}
                    </h2>
                    <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>
                      <div>
                        Lớp <strong style={{ color: '#14263d' }}>{latestGraded.class_name}</strong> ·{' '}
                        <span className="tabular-nums">
                          {gradedSubmitted}/{gradedTotal} bài đã nộp
                        </span>
                      </div>
                      <div
                        style={{
                          fontWeight: 600,
                          marginTop: 2,
                          color: Number(latestGraded.avg ?? 0) >= 6.5 ? '#16a34a' : '#d97706',
                          fontSize: 11.5,
                        }}
                      >
                        {Number(latestGraded.avg ?? 0) >= 6.5
                          ? 'Mặt bằng điểm lớp ổn định'
                          : 'Nên giao thêm bài củng cố chuyên đề yếu'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Vạch phổ tỷ lệ nộp bài */}
                <div style={{ marginTop: 10, background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5edf5' }}>
                  <div style={{ display: 'flex', height: 6, borderRadius: 99, overflow: 'hidden', width: '100%' }}>
                    <div style={{ width: `${(gradedSubmitted / gradedTotal) * 100}%`, background: '#2563eb' }} />
                    <div style={{ width: `${(gradedPending / gradedTotal) * 100}%`, background: '#cbd5e1' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, marginTop: 5 }}>
                    <span style={{ color: '#2563eb' }}>{gradedSubmitted} học sinh đã nộp</span>
                    <span style={{ color: '#64748b' }}>
                      {gradedPending > 0 ? `${gradedPending} chưa nộp` : 'Hoàn thành 100%'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '6px 0' }}>
                <h2 style={{ fontSize: 14.5, fontWeight: 700, margin: '0 0 4px', color: '#14263d' }}>
                  Chưa có bài kiểm tra đã chấm
                </h2>
                <p style={{ margin: 0, fontSize: 12.5, color: '#64748b', lineHeight: 1.45 }}>
                  Sau khi học sinh nộp bài, điểm trung bình và thống kê phân tích lớp sẽ hiển thị tại đây.
                </p>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            {latestGraded ? (
              <>
                <button
                  type="button"
                  className="btn sm primary"
                  onClick={() => go(`/lop/${latestGraded.class_id}/ket-qua/${latestGraded.id}`)}
                  style={{
                    flex: 1,
                    minHeight: 38,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    fontWeight: 700,
                    fontSize: 12.5,
                    borderRadius: 8,
                    background: '#2563eb',
                    borderColor: '#2563eb',
                  }}
                >
                  <Eye size={14} /> Xem bảng điểm
                </button>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => go(`/lop/${latestGraded.class_id}/ket-qua?view=analysis`)}
                  style={{
                    flex: 1,
                    minHeight: 38,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    fontSize: 12.5,
                    borderRadius: 8,
                  }}
                >
                  <BarChart3 size={14} /> Phân tích lớp
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn sm primary mobile-full-btn"
                onClick={() => go('/thu-vien')}
                style={{ fontWeight: 700, borderRadius: 8, background: '#2563eb', borderColor: '#2563eb' }}
              >
                Mở Kho đề thi <ArrowRight size={14} />
              </button>
            )}
          </div>
        </section>
      </div>

      {/* ========================================================
          3. BENTO ROW 2: 4 LỐI TẮT GIẢNG DẠY & QUẢN LÝ ĐỀ (ĐỒNG BỘ HỌC SINH)
          ======================================================== */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: '#14263d' }}>
            Lối tắt soạn đề &amp; Giảng dạy
          </h2>
          <span style={{ fontSize: 11.5, color: '#64748b' }}>1-chạm mở nhanh</span>
        </div>

        <section className="student-actions-grid">
          <div
            onClick={() => go('/ra-de')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && go('/ra-de')}
            className="quick-action-card"
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
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
                background: '#dbeafe',
                color: '#2563eb',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <FilePlus2 size={18} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1e40af', lineHeight: 1.2 }}>
                Tạo đề mới
              </div>
              <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Soạn theo ma trận
              </div>
            </div>
          </div>

          <div
            onClick={() => go('/nhap-de')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && go('/nhap-de')}
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
              <Upload size={18} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0369a1', lineHeight: 1.2 }}>
                Nhập đề
              </div>
              <div style={{ fontSize: 11, color: '#0284c7', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Word, PDF, Văn bản
              </div>
            </div>
          </div>

          <div
            onClick={() => go('/dao-de')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && go('/dao-de')}
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
              <Shuffle size={18} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#6b21a8', lineHeight: 1.2 }}>
                Đảo đề
              </div>
              <div style={{ fontSize: 11, color: '#7e22ce', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Trộn mã &amp; đáp án
              </div>
            </div>
          </div>

          <div
            onClick={() => go('/ngan-hang')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && go('/ngan-hang')}
            className="quick-action-card"
            style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
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
                background: '#dcfce7',
                color: '#15803d',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Database size={18} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#166534', lineHeight: 1.2 }}>
                Ngân hàng câu
              </div>
              <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {data.drafts.length > 0 ? `${data.drafts.length} câu chờ duyệt` : 'Kho câu hỏi chuẩn'}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ========================================================
          4. BENTO ROW 3: BÀI GIAO CÁC LỚP & CỘT PHỤ LỚP HỌC / KHO ĐỀ
          ======================================================== */}
      <div className="student-main-grid">
        {/* CỘT CHÍNH: BÀI KIỂM TRA & BÀI TẬP ĐÃ GIAO */}
        <section
          className="card"
          style={{
            margin: 0,
            padding: '16px',
            background: '#ffffff',
            border: '1px solid #e5edf5',
            borderRadius: 12,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#14263d' }}>
              Bài kiểm tra &amp; Bài tập đã giao
            </h2>

            <div className="seg" role="tablist" style={{ width: '100%', maxWidth: 300, display: 'flex' }}>
              <button
                type="button"
                className={filterTab === 'open' ? 'on' : ''}
                onClick={() => setFilterTab('open')}
                style={{ flex: 1, textAlign: 'center', padding: '6px 4px', fontSize: 12 }}
              >
                Đang mở ({running.length + upcoming.length})
              </button>
              <button
                type="button"
                className={filterTab === 'closed' ? 'on' : ''}
                onClick={() => setFilterTab('closed')}
                style={{ flex: 1, textAlign: 'center', padding: '6px 4px', fontSize: 12 }}
              >
                Đã đóng ({closed.length})
              </button>
              <button
                type="button"
                className={filterTab === 'all' ? 'on' : ''}
                onClick={() => setFilterTab('all')}
                style={{ flex: 1, textAlign: 'center', padding: '6px 4px', fontSize: 12 }}
              >
                Tất cả ({data.assignments.length})
              </button>
            </div>
          </div>

          {filteredAssignments.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              <div style={{ display: 'inline-flex', padding: 10, borderRadius: 10, background: '#eaf3ff', color: '#2563eb', marginBottom: 8 }}>
                <ClipboardCheck size={20} />
              </div>
              <div>
                {filterTab === 'open'
                  ? 'Hiện chưa có ca kiểm tra nào đang mở.'
                  : 'Chưa có bài giao nào trong danh mục này.'}
              </div>
            </div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {filteredAssignments.slice(0, 6).map((a: any) => {
                const isLive = a.open_at <= now && a.close_at >= now;
                const isUpcoming = a.open_at > now;
                const dl = isLive ? formatRemainingInfo(a.close_at, now) : null;

                return (
                  <div key={a.id} className="student-assignment-card">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#14263d', lineHeight: 1.35 }}>
                        {a.title}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: '#14263d' }}>Lớp {a.class_name}</span>
                        <span>·</span>
                        <span>{a.mode === 'exam' ? 'Kiểm tra' : 'Bài tập'}</span>
                        <span>·</span>
                        <span className="tabular-nums">
                          {a.submitted ?? 0}/{a.students ?? 0} đã nộp
                        </span>
                        {isUpcoming ? (
                          <span style={{ color: '#0369a1', fontWeight: 600 }}>· Mở {fmtDateTime(a.open_at)}</span>
                        ) : dl ? (
                          <span style={{ color: dl.color, fontWeight: 700, background: dl.bg, padding: '1px 6px', borderRadius: 4 }}>
                            {dl.label}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                      {a.avg !== null && a.avg !== undefined && (
                        <span className="tabular-nums" style={{ fontSize: 13.5, fontWeight: 800, color: '#2563eb' }}>
                          {fmtScore(a.avg)} đ
                        </span>
                      )}
                      <a
                        href={`#/lop/${a.class_id}/ket-qua/${a.id}`}
                        className="btn sm"
                        style={{ minHeight: 34, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        Bảng điểm
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* CỘT PHỤ: LỚP HỌC PHỤ TRÁCH & KHO ĐỀ THI */}
        <div className="stack" style={{ gap: 14 }}>
          <section
            className="card"
            style={{
              margin: 0,
              padding: '16px',
              background: '#ffffff',
              borderRadius: 12,
              border: '1px solid #e5edf5',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <GraduationCap size={17} style={{ color: '#2563eb' }} />
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#14263d' }}>
                  Lớp học phụ trách ({data.classes.length})
                </h2>
              </div>
              <a href="#/lop-hoc" style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>
                Tất cả lớp →
              </a>
            </div>

            <div className="stack" style={{ gap: 8 }}>
              {data.classes.slice(0, 4).map((c: any) => (
                <a
                  key={c.id}
                  href={`#/lop/${c.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: '#f8fbff',
                    border: '1px solid #e5edf5',
                    textDecoration: 'none',
                    color: '#14263d',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>Toán học {c.name}</div>
                    <div style={{ fontSize: 11.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Users size={12} /> {c.students ?? 0} học sinh · Khối {c.grade || 12}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    Vào lớp <ArrowRight size={13} />
                  </span>
                </a>
              ))}
            </div>
          </section>

          <section
            className="card"
            style={{
              margin: 0,
              padding: '16px',
              background: '#ffffff',
              borderRadius: 12,
              border: '1px solid #e5edf5',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FolderOpen size={17} style={{ color: '#2563eb' }} />
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#14263d' }}>
                  Kho đề sẵn sàng giao ({data.exams.length})
                </h2>
              </div>
              <a href="#/thu-vien" style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>
                Mở Kho đề →
              </a>
            </div>

            {data.exams.length === 0 ? (
              <div style={{ fontSize: 12.5, color: '#64748b' }}>Chưa có đề thi nào trong kho.</div>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {data.exams.slice(0, 4).map((ex: any) => {
                  const totalQ = (ex.counts?.mcq || 0) + (ex.counts?.tf || 0) + (ex.counts?.short || 0);
                  return (
                    <div
                      key={ex.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 10,
                        background: '#f8fafc',
                        border: '1px solid #e5edf5',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: '#14263d',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {ex.title}
                        </div>
                        <div className="tabular-nums" style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                          {totalQ} câu · {ex.durationMin} phút
                        </div>
                      </div>
                      <a href={`#/de-thi/${ex.id}`} className="btn sm" style={{ flexShrink: 0 }}>
                        Giao lớp
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default TeacherHome;
