import { useMemo, useState } from 'react';
import { BookOpen, CalendarClock, CircleCheck, ClipboardList, Flame, PenLine, Sparkles, Timer, Zap } from 'lucide-react';
import { get, post } from '../../api';
import { ErrorBox, fmtDateTime, fmtScore, go, Loading, scoreColor, useApp, useAsync } from '../../ui/kit';

type Tone = 'bad' | 'warn' | 'info' | '';

/** Nhãn hạn nộp theo thời gian thực. */
function deadlineInfo(closeAt: number): { label: string; tone: Tone } {
  const diff = closeAt - Date.now();
  if (diff <= 0) return { label: 'Đã hết hạn', tone: '' };
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 2) return { label: `Còn ${Math.max(1, Math.floor(diff / 60_000))} phút`, tone: 'bad' };
  if (hours < 24) return { label: `Hôm nay · còn ${hours} giờ`, tone: 'warn' };
  return { label: `Hạn ${fmtDateTime(closeAt)} · còn ${Math.floor(hours / 24)} ngày`, tone: 'info' };
}

/** Ngày thi tốt nghiệp THPT tiếp theo (ước tính cuối tháng 6). */
function nextExam() {
  const year = new Date().getFullYear();
  let target = new Date(`${year}-06-26T07:30:00+07:00`).getTime();
  let examYear = year;
  if (Date.now() > target) {
    examYear = year + 1;
    target = new Date(`${examYear}-06-26T07:30:00+07:00`).getTime();
  }
  return { year: examYear, days: Math.max(1, Math.ceil((target - Date.now()) / 86_400_000)) };
}

// Hình minh họa bàn học (giữ từ bản cũ, chỉ hiện trên màn hình rộng)
function StudyDeskIllustration() {
  return (
    <svg width="110" height="82" viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
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
      <rect x="80" y="42" width="52" height="38" rx="4" fill="#1e293b" />
      <rect x="83" y="45" width="46" height="32" rx="2" fill="#0f172a" />
      <path d="M88 68 Q98 48 106 62 T124 50" stroke="#38bdf8" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="106" cy="62" r="2.5" fill="#f59e0b" />
      <path d="M72 82 H140 L135 88 H77 L72 82Z" fill="#94a3b8" />
      <rect x="25" y="55" width="6" height="38" rx="2" transform="rotate(-25 25 55)" fill="url(#accentGrad)" />
      <path d="M125 25 L127 31 L133 33 L127 35 L125 41 L123 35 L117 33 L123 31 Z" fill="#fbbf24" />
      <path d="M50 30 L51.5 34 L55.5 35.5 L51.5 37 L50 41 L48.5 37 L44.5 35.5 L48.5 34 Z" fill="#38bdf8" opacity="0.9" />
    </svg>
  );
}

export function StudentHome() {
  const { user, toast } = useApp();
  const { data, error, loading, reload } = useAsync(async () => {
    const [home, mistakes] = await Promise.all([
      get<any>('/api/student/home'),
      get<any>('/api/student/mistakes').catch(() => ({ mistakes: [], totalMistakes: 0, dueCount: 0, notedCount: 0, topWeakTopics: [] })),
    ]);
    return { home, mistakes };
  }, []);

  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'todo' | 'done'>('todo');

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  }, []);
  const exam = useMemo(nextExam, []);

  if (loading) return <Loading text="Đang mở bàn học..." />;
  if (error || !data) return <ErrorBox error={error ?? 'Không tải được dữ liệu.'} onRetry={reload} />;

  const home = data.home;
  const assignments: any[] = home.assignments ?? [];
  const open = assignments
    .filter((a) => a.state === 'open' || a.state === 'doing')
    .sort((a, b) => (a.state === 'doing' ? -1 : 0) - (b.state === 'doing' ? -1 : 0) || (a.close_at ?? Infinity) - (b.close_at ?? Infinity));
  const upcoming = assignments.filter((a) => a.state === 'upcoming');
  const done = assignments.filter((a) => a.state === 'done');

  const recent = home.recentAttempt || done[0] || null;
  const practiceInProgress = home.practiceInProgress;
  const rec = (home.recommendations ?? [])[0] || null;
  const dueCount: number = data.mistakes?.dueCount ?? 0;

  const today = home.today ?? { questions: 0, correct: 0, goal: 10 };
  const streak = home.streak ?? 0;
  const goalPercent = Math.min(100, Math.round(((today.questions || 0) / (today.goal || 10)) * 100));

  const run = async (fn: () => Promise<{ id: number }>, failMsg: string) => {
    setBusy(true);
    try {
      const a = await fn();
      go(`/thi/${a.id}`);
    } catch (e: any) {
      toast(e.message || failMsg);
      setBusy(false);
    }
  };
  const startAssignment = (assignmentId: number) =>
    run(() => post('/api/attempts/start', { assignmentId }), 'Không thể bắt đầu bài làm.');
  const startQuickChallenge = () =>
    run(() => post('/api/practice/start', { mode: 'weak', count: 3 }), 'Không thể bắt đầu thử thách 3 câu.');
  const startSpeedDrill = () =>
    run(() => post('/api/practice/start', { mode: 'speed_drill', count: 12 }), 'Không thể bắt đầu luyện tốc độ.');
  const startMistakeExam = () =>
    run(() => post('/api/student/mistakes/practice', { count: 8, title: 'Ôn tập câu sai nhanh' }), 'Không thể tạo đề ôn câu sai.');
  const retakeAttempt = (attemptId: number) =>
    run(() => post(`/api/attempts/${attemptId}/retake`), 'Không thể tạo đề làm lại.');
  const startTopicPractice = (topic: string, name?: string) =>
    run(() => post('/api/practice/start', { mode: 'topic', topics: [topic], count: 8 }), `Không thể tạo bài luyện chuyên đề ${name || topic}.`);

  const todoCount = open.length + (practiceInProgress ? 1 : 0);
  const feedback = home.teacherFeedback;
  const initial = (user.displayName || 'H').trim().split(/\s+/).pop()?.[0]?.toUpperCase() ?? 'H';

  return (
    <div className="su-page">
      {/* Lời chào + 3 ô số liệu (giữ màu sắc bản cũ) */}
      <section className="su-hero" aria-label="Lời chào">
        <div className="su-hero-who">
          <div className="su-hero-avatar" aria-hidden="true">{initial}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="su-hero-name">
              <h1>{greeting}, {user.displayName}!</h1>
              {user.class && <span className="su-hero-class">Lớp {user.class.name}</span>}
            </div>
            <div className="su-hero-sub">
              {goalPercent >= 100 ? (
                <span style={{ color: 'var(--good)', fontWeight: 600 }}>Đã xong mục tiêu hôm nay. Giỏi lắm!</span>
              ) : (
                <span>Chuẩn bị bứt phá mục tiêu tốt nghiệp THPT {exam.year}</span>
              )}
            </div>
          </div>
          <div className="hide-on-mobile"><StudyDeskIllustration /></div>
        </div>
        <div className="su-hero-metrics">
          <div className="su-metric" title={`Ước tính tới kỳ thi tốt nghiệp THPT ${exam.year}`}>
            <span className="su-metric-label">Đếm ngược</span>
            <b>{exam.days}</b>
            <span className="su-metric-hint">ngày thi THPT</span>
          </div>
          <div className="su-metric is-amber">
            <span className="su-metric-label"><Flame size={11} aria-hidden="true" /> Chuỗi học</span>
            <b>{streak}</b>
            <span className="su-metric-hint">ngày liên tục</span>
          </div>
          <div className={`su-metric ${goalPercent >= 100 ? 'is-green' : ''}`}>
            <span className="su-metric-label">Hôm nay</span>
            <b>{today.questions || 0}/{today.goal || 10}</b>
            <span className="su-metric-hint">câu ({goalPercent}%)</span>
          </div>
        </div>
      </section>

      {feedback && (
        <section className="su-card su-feedback" aria-label="Lời phê của giáo viên">
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ fontSize: 13.5 }}>{feedback.teacherStamp || 'Lời phê của giáo viên'}</strong>
            <span className="su-row-meta" style={{ display: 'inline-flex', marginLeft: 8 }}>
              Thầy/Cô {feedback.teacherName || 'bộ môn'} · {feedback.title}
            </span>
            {feedback.teacherFeedback && <p>“{feedback.teacherFeedback}”</p>}
          </div>
          <a className="btn sm" href={`#/ket-qua/${feedback.id}`}>Xem bài & lời phê</a>
        </section>
      )}

      {/* Lối tắt 1 chạm, mỗi ô một màu như bản cũ */}
      <section className="su-tiles" aria-label="Lối tắt học tập">
        <button type="button" className="su-tile is-amber" disabled={busy} onClick={() => (dueCount > 0 ? startMistakeExam() : go('/so-tay-loi-sai'))}>
          <span className="su-tile-icon"><PenLine size={18} aria-hidden="true" /></span>
          <span className="su-tile-text">
            <strong>Ôn câu sai</strong>
            <small>{dueCount > 0 ? `${dueCount} câu cần ôn` : 'Sổ lỗi sạch'}</small>
          </span>
        </button>
        <button type="button" className="su-tile is-rose" disabled={busy} onClick={startSpeedDrill}>
          <span className="su-tile-icon"><Timer size={18} aria-hidden="true" /></span>
          <span className="su-tile-text">
            <strong>Luyện tốc độ</strong>
            <small>15 phút · 12 câu</small>
          </span>
        </button>
        <button type="button" className="su-tile is-teal" onClick={() => go('/luyen-vo-han')}>
          <span className="su-tile-icon"><Zap size={18} aria-hidden="true" /></span>
          <span className="su-tile-text">
            <strong>Luyện liên tục</strong>
            <small>Tự chỉnh độ khó</small>
          </span>
        </button>
        <button type="button" className="su-tile is-sky" onClick={() => go('/luyen-tap')}>
          <span className="su-tile-icon"><ClipboardList size={18} aria-hidden="true" /></span>
          <span className="su-tile-text">
            <strong>Kho đề</strong>
            <small>Thi thử chấm điểm</small>
          </span>
        </button>
        <button type="button" className="su-tile is-violet" onClick={() => go('/tu-hoc')}>
          <span className="su-tile-icon"><BookOpen size={18} aria-hidden="true" /></span>
          <span className="su-tile-text">
            <strong>Tự học</strong>
            <small>Lý thuyết & bài tập</small>
          </span>
        </button>
      </section>

      <div className="su-split">
        {/* Cột chính: một danh sách việc duy nhất */}
        <section className="su-card" aria-label="Việc cần làm">
          <div className="su-card-head">
            <h2>Việc cần làm</h2>
            <div className="seg" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'todo'} className={tab === 'todo' ? 'on' : ''} onClick={() => setTab('todo')}>
                Cần làm ({todoCount})
              </button>
              <button type="button" role="tab" aria-selected={tab === 'done'} className={tab === 'done' ? 'on' : ''} onClick={() => setTab('done')}>
                Đã nộp ({done.length})
              </button>
            </div>
          </div>

          {tab === 'todo' ? (
            <div className="su-list">
              {practiceInProgress && (
                <div className="su-row">
                  <div className="su-row-icon is-warn"><PenLine size={17} aria-hidden="true" /></div>
                  <div className="su-row-main">
                    <div className="su-row-title">{practiceInProgress.title}</div>
                    <div className="su-row-meta"><span className="su-chip is-warn">Đang làm dở</span> Bài tự luyện chưa nộp</div>
                  </div>
                  <button type="button" className="btn sm primary" disabled={busy} onClick={() => go(`/thi/${practiceInProgress.id}`)}>
                    Làm tiếp
                  </button>
                </div>
              )}

              {open.map((a, i) => {
                const d = deadlineInfo(a.close_at);
                const first = i === 0 && !practiceInProgress;
                return (
                  <div key={a.id} className={`su-row ${first ? 'is-first' : ''}`}>
                    <div className="su-row-icon"><ClipboardList size={17} aria-hidden="true" /></div>
                    <div className="su-row-main">
                      <div className="su-row-title">{a.title}</div>
                      <div className="su-row-meta">
                        <span className={`su-chip ${d.tone ? `is-${d.tone}` : ''}`}>{d.label}</span>
                        <span>{a.mode === 'exam' ? `Thi tính giờ${a.duration_min ? ` · ${a.duration_min} phút` : ''}` : 'Bài tập'}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`btn sm ${first || a.state === 'doing' ? 'primary' : ''}`}
                      disabled={busy}
                      onClick={() => (a.attempt_id ? go(`/thi/${a.attempt_id}`) : startAssignment(a.id))}
                    >
                      {a.state === 'doing' ? 'Làm tiếp' : 'Vào làm'}
                    </button>
                  </div>
                );
              })}

              {upcoming.map((a) => (
                <div key={a.id} className="su-row">
                  <div className="su-row-icon"><CalendarClock size={17} aria-hidden="true" /></div>
                  <div className="su-row-main">
                    <div className="su-row-title">{a.title}</div>
                    <div className="su-row-meta"><span className="su-chip">Mở lúc {fmtDateTime(a.open_at)}</span></div>
                  </div>
                  <span className="su-row-meta">Chưa mở</span>
                </div>
              ))}

              {todoCount === 0 && upcoming.length === 0 && (
                <div className="su-row">
                  <div className="su-row-icon is-good"><CircleCheck size={17} aria-hidden="true" /></div>
                  <div className="su-row-main">
                    <div className="su-row-title">Đã xong bài trên lớp</div>
                    <div className="su-row-meta">Làm 3 câu nhanh để giữ chuỗi học</div>
                  </div>
                  <button type="button" className="btn sm primary" disabled={busy} onClick={startQuickChallenge}>Bắt đầu</button>
                </div>
              )}
            </div>
          ) : done.length === 0 ? (
            <div className="su-empty">Chưa nộp bài nào.</div>
          ) : (
            <div className="su-list">
              {done.map((a) => (
                <div key={a.id} className="su-row">
                  <div className="su-row-main">
                    <div className="su-row-title">{a.title}</div>
                    <div className="su-row-meta">{a.mode === 'exam' ? 'Thi tính giờ' : 'Bài tập'} · Đã nộp</div>
                  </div>
                  {a.score10 !== null && a.score10 !== undefined && (
                    <strong className="tabular-nums" style={{ color: scoreColor(a.score10) }}>{fmtScore(a.score10)}</strong>
                  )}
                  <a className="btn sm" href={`#/ket-qua/${a.attempt_id}`}>{a.score10 === null ? 'Bài nộp' : 'Kết quả'}</a>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Cột phụ */}
        <div className="su-col">
          <section className="su-card" aria-label="Kết quả gần nhất">
            <div className="su-card-head">
              <h2>Kết quả gần nhất</h2>
              <a className="su-link" href="#/ket-qua">Tất cả</a>
            </div>
            {recent ? (
              <>
                <div className="su-result">
                  <div className="su-score" style={{ color: scoreColor(recent.score10) }}>
                    {recent.score10 === null || recent.score10 === undefined ? '--' : fmtScore(recent.score10)}
                    <small>/10</small>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="su-row-title">{recent.title}</div>
                    <div className="su-row-meta">
                      {recent.score10 === null || recent.score10 === undefined
                        ? 'Điểm mở sau khi đóng đề'
                        : recent.submitted_at
                          ? `Nộp ${fmtDateTime(recent.submitted_at)}`
                          : recent.kind === 'practice' ? 'Bài tự luyện' : 'Bài kiểm tra lớp'}
                    </div>
                  </div>
                </div>
                {recent.stats?.total > 0 && (
                  <>
                    <div className="su-split-bar" aria-hidden="true">
                      <span className="ok" style={{ width: `${(recent.stats.correct / recent.stats.total) * 100}%` }} />
                      <span className="no" style={{ width: `${(recent.stats.wrong / recent.stats.total) * 100}%` }} />
                    </div>
                    <div className="su-legend">
                      <span><b>{recent.stats.correct}</b> đúng</span>
                      <span><b>{recent.stats.wrong}</b> sai</span>
                      {recent.stats.blank > 0 && <span><b>{recent.stats.blank}</b> bỏ trống</span>}
                    </div>
                  </>
                )}
                <div className="su-actions">
                  <button type="button" className="btn sm" onClick={() => go(`/ket-qua/${recent.id}`)}>
                    {recent.answersVisible === false ? 'Xem bài nộp' : 'Xem kết quả'}
                  </button>
                  <button type="button" className="btn sm" disabled={busy} onClick={() => retakeAttempt(recent.id)}>
                    Làm lại
                  </button>
                </div>
              </>
            ) : (
              <div className="su-empty" style={{ padding: '12px 0' }}>
                Chưa có kết quả. <a className="su-link" href="#/luyen-tap">Làm một đề thử</a>
              </div>
            )}
          </section>

          {rec && (
            <section className="su-card" aria-label="Nên củng cố">
              <div className="su-card-head">
                <h2><Sparkles size={15} aria-hidden="true" style={{ verticalAlign: -2, color: 'var(--primary)' }} /> Nên củng cố</h2>
                <a className="su-link" href="#/tu-hoc">Tự học</a>
              </div>
              <div className="su-row-title">{rec.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
                <div className="su-bar" style={{ flex: 1 }}>
                  <span style={{ width: `${Math.round((rec.mastery ?? 0) * 100)}%`, background: 'var(--warn)' }} />
                </div>
                <span className="su-row-meta" style={{ margin: 0 }}>{Math.round((rec.mastery ?? 0) * 100)}%</span>
              </div>
              {(rec.tip || rec.reason) && <div className="su-row-meta" style={{ marginBottom: 10 }}>{rec.tip || rec.reason}</div>}
              <button type="button" className="btn sm primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy} onClick={() => startTopicPractice(rec.topic, rec.name)}>
                Luyện 8 câu chuyên đề này
              </button>
            </section>
          )}


        </div>
      </div>
    </div>
  );
}
