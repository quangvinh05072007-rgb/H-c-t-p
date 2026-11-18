import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CircleCheck, Clock, Database, FileCheck2, FilePlus2, GraduationCap, MessageSquareWarning, Shuffle, Upload } from 'lucide-react';
import { get } from '../../api';
import { ErrorBox, fmtDateTime, fmtScore, go, Loading, scoreColor, useApp, useAsync } from '../../ui/kit';
import { TeacherNotifications } from '../../ui/TeacherNotifications';

function TeachingDeskIllustration() {
  return (
    <svg width="116" height="86" viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="gvBoardGrad" x1="25" y1="20" x2="135" y2="95" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1e4d3b" />
          <stop offset="1" stopColor="#0f766e" />
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

type TodoItem = { kind: 'appeal' | 'closing' | 'review' | 'drafts' | 'import'; label: string; meta: string; href: string; closeAt?: number };

function remainingLabel(closeAt: number, now: number): { label: string; tone: string } {
  const diff = closeAt - now;
  if (diff <= 0) return { label: 'Đã đóng', tone: '' };
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 2) return { label: `Còn ${Math.max(1, Math.floor(diff / 60_000))} phút`, tone: 'is-bad' };
  if (hours < 24) return { label: `Hôm nay · còn ${hours} giờ`, tone: 'is-warn' };
  return { label: `Đóng ${fmtDateTime(closeAt)} · còn ${Math.floor(hours / 24)} ngày`, tone: 'is-info' };
}

const TODO_ICON: Record<TodoItem['kind'], { icon: JSX.Element; tone: string }> = {
  appeal: { icon: <MessageSquareWarning size={17} aria-hidden="true" />, tone: 'is-warn' },
  closing: { icon: <Clock size={17} aria-hidden="true" />, tone: 'is-warn' },
  review: { icon: <BarChart3 size={17} aria-hidden="true" />, tone: '' },
  drafts: { icon: <FileCheck2 size={17} aria-hidden="true" />, tone: '' },
  import: { icon: <Upload size={17} aria-hidden="true" />, tone: '' },
};

export function TeacherHome() {
  const { user } = useApp();
  const { data, error, loading, reload } = useAsync(async () => {
    const [classes, assignments, exams, todo] = await Promise.all([
      get<{ classes: any[] }>('/api/classes?limit=50'),
      get<{ assignments: any[] }>('/api/assignments'),
      get<{ exams: any[] }>('/api/exams').catch(() => ({ exams: [] })),
      get<{ items: TodoItem[] }>('/api/teacher/todo').catch(() => ({ items: [] })),
    ]);
    return {
      classes: classes.classes ?? [],
      assignments: assignments.assignments ?? [],
      exams: exams.exams ?? [],
      todo: todo.items ?? [],
    };
  }, []);
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  }, []);

  if (loading && !data) return <Loading text="Đang mở bàn làm việc…" />;
  if (error || !data) return <ErrorBox error={error ?? 'Không tải được dữ liệu.'} onRetry={reload} />;

  const now = nowTs;
  const running = data.assignments.filter((a: any) => a.open_at <= now && a.close_at >= now);
  const upcoming = data.assignments.filter((a: any) => a.open_at > now);
  const closed = data.assignments.filter((a: any) => a.close_at < now);
  const latest = closed.find((a: any) => a.avg !== null && a.avg !== undefined) ?? null;
  const totalStudents = data.classes.reduce((sum: number, c: any) => sum + Number(c.students ?? 0), 0);
  const initials = (user?.displayName || 'GV').trim().split(/\s+/).slice(-2).map((p) => p[0]).join('').toUpperCase();
  const list = tab === 'open' ? [...running, ...upcoming] : closed;
  const readyExams = data.exams.slice(0, 4);

  return (
    <div className="su-page">
      {/* Lời chào + số liệu */}
      <section className="su-hero" aria-label="Lời chào">
        <div className="su-hero-who">
          <div className="su-hero-avatar" aria-hidden="true">{initials}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="su-hero-name">
              <h1>{greeting}, {user?.displayName || 'Thầy/Cô'}!</h1>
              <span className="su-hero-class">{user?.role === 'admin' ? 'Quản lý trường' : 'Giáo viên'}</span>
            </div>
            <div className="su-hero-sub">
              {data.todo.length ? `Có ${data.todo.length} việc cần xử lý hôm nay.` : 'Không có việc tồn đọng. Một ngày dạy nhẹ nhàng!'}
            </div>
          </div>
          <div className="hide-on-mobile"><TeachingDeskIllustration /></div>
          <TeacherNotifications variant="cockpit" />
        </div>
        <div className="su-hero-metrics">
          <div className="su-metric">
            <span className="su-metric-label">Lớp học</span>
            <b>{data.classes.length}</b>
            <span className="su-metric-hint">{totalStudents} học sinh</span>
          </div>
          <div className={`su-metric ${running.length ? 'is-amber' : ''}`}>
            <span className="su-metric-label">Đang mở</span>
            <b>{running.length}</b>
            <span className="su-metric-hint">bài kiểm tra</span>
          </div>
          <div className="su-metric is-green">
            <span className="su-metric-label">Kho đề</span>
            <b>{data.exams.length}</b>
            <span className="su-metric-hint">sẵn sàng giao</span>
          </div>
        </div>
      </section>

      {/* Lối tắt nhiều màu */}
      <section className="su-tiles" aria-label="Lối tắt soạn đề">
        <button type="button" className="su-tile is-sky" onClick={() => go('/ra-de')}>
          <span className="su-tile-icon"><FilePlus2 size={18} aria-hidden="true" /></span>
          <span className="su-tile-text"><strong>Tạo đề mới</strong><small>Theo ma trận, in A4</small></span>
        </button>
        <button type="button" className="su-tile is-teal" onClick={() => go('/nhap-de')}>
          <span className="su-tile-icon"><Upload size={18} aria-hidden="true" /></span>
          <span className="su-tile-text"><strong>Nhập đề</strong><small>Gói chuẩn, Word, Excel</small></span>
        </button>
        <button type="button" className="su-tile is-violet" onClick={() => go('/dao-de')}>
          <span className="su-tile-icon"><Shuffle size={18} aria-hidden="true" /></span>
          <span className="su-tile-text"><strong>Đảo đề</strong><small>Trộn mã, đáp án chéo</small></span>
        </button>
        <button type="button" className="su-tile is-amber" onClick={() => go('/ngan-hang')}>
          <span className="su-tile-icon"><Database size={18} aria-hidden="true" /></span>
          <span className="su-tile-text"><strong>Ngân hàng</strong><small>Duyệt, sửa câu hỏi</small></span>
        </button>
        <button type="button" className="su-tile is-rose" onClick={() => go('/lop-hoc')}>
          <span className="su-tile-icon"><GraduationCap size={18} aria-hidden="true" /></span>
          <span className="su-tile-text"><strong>Lớp học</strong><small>Giao bài, bảng điểm</small></span>
        </button>
      </section>

      <div className="su-split">
        <div className="su-col">
          <section className="su-card" aria-label="Việc cần xử lý">
            <div className="su-card-head"><h2>Việc cần xử lý</h2></div>
            {data.todo.length === 0 ? (
              <div className="su-row">
                <div className="su-row-icon is-good"><CircleCheck size={17} aria-hidden="true" /></div>
                <div className="su-row-main">
                  <div className="su-row-title">Không có việc tồn đọng</div>
                  <div className="su-row-meta">Khiếu nại, bài sắp đóng, câu nháp và file nhập sẽ hiện ở đây.</div>
                </div>
              </div>
            ) : (
              <div className="su-list">
                {data.todo.map((t, i) => (
                  <div key={i} className="su-row">
                    <div className={`su-row-icon ${TODO_ICON[t.kind].tone}`}>{TODO_ICON[t.kind].icon}</div>
                    <div className="su-row-main">
                      <div className="su-row-title" style={{ fontSize: 13.5 }}>{t.label}</div>
                      <div className="su-row-meta">
                        {t.kind === 'closing' && t.closeAt ? (
                          <span className={`su-chip ${remainingLabel(t.closeAt, now).tone}`}>{remainingLabel(t.closeAt, now).label}</span>
                        ) : null}
                        <span>{t.kind === 'closing' ? t.meta.split(' · ')[0] : t.meta}</span>
                      </div>
                    </div>
                    <button type="button" className="btn sm" onClick={() => go(t.href)}>
                      {t.kind === 'appeal' ? 'Trả lời' : t.kind === 'closing' ? 'Theo dõi' : t.kind === 'review' ? 'Xem' : t.kind === 'drafts' ? 'Duyệt' : 'Đối chiếu'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="su-card" aria-label="Bài đã giao">
            <div className="su-card-head">
              <h2>Bài đã giao</h2>
              <div className="seg" role="tablist">
                <button type="button" role="tab" aria-selected={tab === 'open'} className={tab === 'open' ? 'on' : ''} onClick={() => setTab('open')}>
                  Đang mở ({running.length + upcoming.length})
                </button>
                <button type="button" role="tab" aria-selected={tab === 'closed'} className={tab === 'closed' ? 'on' : ''} onClick={() => setTab('closed')}>
                  Đã đóng ({closed.length})
                </button>
              </div>
            </div>
            {list.length === 0 ? (
              <div className="su-empty">{tab === 'open' ? 'Chưa có bài nào đang mở.' : 'Chưa có bài đã đóng.'} <button type="button" className="su-link" onClick={() => go('/thu-vien')}>Giao đề từ Kho đề</button></div>
            ) : (
              <div className="su-list">
                {list.slice(0, 8).map((a: any) => {
                  const isUpcoming = a.open_at > now;
                  const rem = remainingLabel(a.close_at, now);
                  const pct = a.students ? Math.round(((a.submitted ?? 0) / a.students) * 100) : 0;
                  return (
                    <div key={a.id} className="su-row">
                      <div className="su-row-main">
                        <div className="su-row-title" style={{ fontSize: 13.5 }}>{a.title}</div>
                        <div className="su-row-meta">
                          <span>Lớp {a.class_name}</span>
                          <span>· {a.submitted ?? 0}/{a.students ?? 0} đã nộp</span>
                          {isUpcoming ? <span className="su-chip">Mở {fmtDateTime(a.open_at)}</span> : tab === 'open' ? <span className={`su-chip ${rem.tone}`}>{rem.label}</span> : null}
                        </div>
                        {tab === 'open' && !isUpcoming && (
                          <div className="su-bar" style={{ marginTop: 6, maxWidth: 240 }}><span style={{ width: `${pct}%` }} /></div>
                        )}
                      </div>
                      {tab === 'closed' && a.avg !== null && a.avg !== undefined && (
                        <strong className="tabular-nums" style={{ color: scoreColor(a.avg) }}>{fmtScore(a.avg)}</strong>
                      )}
                      <button type="button" className="btn sm" onClick={() => go(`/lop/${a.class_id}/ket-qua/${a.id}`)}>Bảng điểm</button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="su-col">
          <section className="su-card" aria-label="Kết quả gần nhất">
            <div className="su-card-head"><h2>Kết quả gần nhất</h2></div>
            {latest ? (
              <>
                <div className="su-result">
                  <div className="su-score" style={{ color: scoreColor(latest.avg) }}>{fmtScore(latest.avg)}<small>/10</small></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="su-row-title">{latest.title}</div>
                    <div className="su-row-meta">Lớp {latest.class_name} · {latest.submitted}/{latest.students} bài · điểm TB</div>
                  </div>
                </div>
                <div className="su-actions">
                  <button type="button" className="btn sm" onClick={() => go(`/lop/${latest.class_id}/ket-qua/${latest.id}`)}>Bảng điểm</button>
                  <button type="button" className="btn sm" onClick={() => go(`/lop/${latest.class_id}/ket-qua?view=analysis`)}>Phân tích lớp</button>
                </div>
              </>
            ) : (
              <div className="su-row-meta">Chưa có bài nào đã chấm.</div>
            )}
          </section>

          <section className="su-card" aria-label="Lớp phụ trách">
            <div className="su-card-head">
              <h2>Lớp phụ trách</h2>
              <a className="su-link" href="#/lop-hoc">Tất cả</a>
            </div>
            {data.classes.length === 0 ? (
              <div className="su-row-meta">Chưa được phân công lớp nào.</div>
            ) : (
              <div className="su-list">
                {data.classes.slice(0, 5).map((c: any) => (
                  <div key={c.id} className="su-row" style={{ padding: '8px 0' }}>
                    <div className="su-row-main">
                      <div className="su-row-title" style={{ fontSize: 13.5 }}>{c.subject || 'Toán'} {c.name}</div>
                      <div className="su-row-meta">{c.students} học sinh{c.grade ? ` · Khối ${c.grade}` : ''}</div>
                    </div>
                    <button type="button" className="btn sm" onClick={() => go(`/lop/${c.id}`)}>Vào lớp</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="su-card" aria-label="Đề sẵn sàng giao">
            <div className="su-card-head">
              <h2>Đề sẵn sàng giao</h2>
              <a className="su-link" href="#/thu-vien">Kho đề</a>
            </div>
            {readyExams.length === 0 ? (
              <div className="su-row-meta">Kho đề trống. <button type="button" className="su-link" onClick={() => go('/nhap-de')}>Nhập gói đề</button></div>
            ) : (
              <div className="su-list">
                {readyExams.map((ex: any) => {
                  const totalQ = (ex.counts?.mcq || 0) + (ex.counts?.tf || 0) + (ex.counts?.short || 0);
                  return (
                    <div key={ex.id} className="su-row" style={{ padding: '8px 0' }}>
                      <div className="su-row-main">
                        <div className="su-row-title" style={{ fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ex.title}</div>
                        <div className="su-row-meta">{totalQ || ex.questionCount || '?'} câu · {ex.durationMin} phút</div>
                      </div>
                      <a href={`#/de-thi/${ex.id}`} className="btn sm">Giao lớp</a>
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
