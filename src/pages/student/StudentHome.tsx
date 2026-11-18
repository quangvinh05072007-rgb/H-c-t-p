import { useMemo, useState } from 'react';
import { BookMarked, CalendarClock, CircleCheck, ClipboardList, Flame, PenLine, RotateCcw, Sparkles, Timer, Zap } from 'lucide-react';
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

  const todoCount = open.length + (practiceInProgress ? 1 : 0) + (dueCount > 0 ? 1 : 0);
  const feedback = home.teacherFeedback;
  const initial = (user.displayName || 'H').trim().split(/\s+/).pop()?.[0]?.toUpperCase() ?? 'H';

  return (
    <div className="su-page">
      {/* Đầu trang: lời chào + số liệu gọn trên một dòng */}
      <header className="su-head">
        <div className="su-hello">
          <div className="su-avatar" aria-hidden="true">{initial}</div>
          <div style={{ minWidth: 0 }}>
            <h1>{greeting}, {user.displayName}!</h1>
            <p className="su-sub">
              {user.class ? `Lớp ${user.class.name} · ` : ''}Mục tiêu tốt nghiệp THPT {exam.year}
            </p>
          </div>
        </div>
        <div className="su-stats" aria-label="Số liệu hôm nay">
          <span className="su-stat" title={`Ước tính tới kỳ thi tốt nghiệp THPT ${exam.year}`}>
            <CalendarClock size={14} aria-hidden="true" /> <b>{exam.days}</b> ngày đến kỳ thi
          </span>
          <span className={`su-stat ${streak > 0 ? 'is-warn' : ''}`}>
            <Flame size={14} aria-hidden="true" /> <b>{streak}</b> ngày liên tục
          </span>
          <span className={`su-stat ${goalPercent >= 100 ? 'is-good' : ''}`}>
            Hôm nay <b>{today.questions || 0}/{today.goal || 10}</b> câu
          </span>
        </div>
      </header>

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

      <div className="su-split">
        {/* Cột chính: một danh sách việc duy nhất */}
        <div className="su-col">
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

              {dueCount > 0 && (
                <div className="su-row">
                  <div className="su-row-icon is-warn"><RotateCcw size={17} aria-hidden="true" /></div>
                  <div className="su-row-main">
                    <div className="su-row-title">Ôn {dueCount} câu sai đến hạn</div>
                    <div className="su-row-meta">Làm lại để không quên cách giải</div>
                  </div>
                  <button type="button" className="btn sm" disabled={busy} onClick={startMistakeExam}>Ôn ngay</button>
                </div>
              )}

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

        <section className="su-card" aria-label="Luyện nhanh">
          <div className="su-card-head"><h2>Luyện nhanh</h2></div>
          <div className="su-quick is-wide">
            <button type="button" disabled={busy} onClick={startSpeedDrill}>
              <Timer size={18} aria-hidden="true" color="var(--primary)" />
              <div>Luyện tốc độ<span>12 câu · 15 phút</span></div>
            </button>
            <button type="button" onClick={() => go('/luyen-vo-han')}>
              <Zap size={18} aria-hidden="true" color="var(--primary)" />
              <div>Luyện liên tục<span>Độ khó tự điều chỉnh</span></div>
            </button>
            <button type="button" onClick={() => go('/so-tay-loi-sai')}>
              <BookMarked size={18} aria-hidden="true" color="var(--primary)" />
              <div>Sổ tay lỗi sai<span>{data.mistakes?.totalMistakes ?? 0} câu đã lưu</span></div>
            </button>
            <button type="button" onClick={() => go('/luyen-tap')}>
              <ClipboardList size={18} aria-hidden="true" color="var(--primary)" />
              <div>Kho đề<span>Thi thử có chấm điểm</span></div>
            </button>
          </div>
        </section>
        </div>

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
