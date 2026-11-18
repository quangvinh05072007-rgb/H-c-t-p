import { useState } from 'react';
import { ArrowLeft, CheckCircle2, CircleAlert, Dumbbell, Eye, Lightbulb, LineChart, Lock, Target, Timer, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react';
import { get, post } from '../../api';
import { Bar, ErrorBox, ErrorTypeBadge, fmtDateTime, fmtScore, go, Loading, pct, scoreColor, useApp, useAsync } from '../../ui/kit';
import { QuestionView } from '../../ui/Question';

export function AttemptReview({ data, showAll = false, onAppeal }: { data: any; showAll?: boolean; onAppeal?: (qid: number) => void }) {
  const { toast } = useApp();
  const [filter, setFilter] = useState<'wrong' | 'all'>(showAll ? 'all' : 'wrong');
  const [editingNoteQid, setEditingNoteQid] = useState<number | null>(null);
  const [draftNote, setDraftNote] = useState<string>('');
  const [savedNotes, setSavedNotes] = useState<Record<number, string>>({});
  const [savingNote, setSavingNote] = useState<boolean>(false);

  const r = data.result;
  const byQ = Object.fromEntries((r?.items ?? []).map((x: any) => [x.qid, x]));
  const list = data.items.filter((it: any) => filter === 'all' || !byQ[it.qid]?.grade?.correct);

  const handleSaveNote = async (qid: number) => {
    setSavingNote(true);
    try {
      await post('/api/student/mistakes/note', {
        qid,
        note: draftNote,
        tag: 'important',
      });
      setSavedNotes((prev) => ({ ...prev, [qid]: draftNote.trim() }));
      setEditingNoteQid(null);
      toast('Đã lưu ghi chú lỗi sai vào Sổ tay cá nhân!');
    } catch (e: any) {
      toast(e.message || 'Không thể lưu ghi chú.');
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Xem lại từng câu & Ghi chú lỗi sai</h2>
          <p className="tiny muted" style={{ margin: '2px 0 0' }}>
            Bấm "Lưu Note vào Sổ tay" ở bất kỳ câu nào để hệ thống nhắc lại trước kỳ thi tiếp theo.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <a className="btn sm" href="#/so-tay-loi-sai">
            Mở Sổ tay lỗi sai & Note →
          </a>
          <div className="seg">
            <button className={filter === 'wrong' ? 'on' : ''} onClick={() => setFilter('wrong')}>
              Câu chưa đúng
            </button>
            <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
              Tất cả
            </button>
          </div>
        </div>
      </div>
      {list.length === 0 && <div className="empty">Không có câu sai. Tuyệt vời!</div>}
      <div className="stack">
        {list.map((it: any) => {
          const x = byQ[it.qid];
          const isEditing = editingNoteQid === it.qid;
          const savedNote = savedNotes[it.qid];
          return (
            <div key={it.qid} className="card flat">
              <QuestionView
                item={it}
                response={data.responses?.[it.qid]}
                review={
                  x
                    ? {
                        correctAnswer: x.correctAnswer,
                        explanation: x.explanation,
                        source: x.source,
                        grade: x.grade,
                        diagnosis: x.diagnosis,
                      }
                    : null
                }
              />

              {savedNote && !isEditing && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    fontSize: 13,
                    color: '#92400e',
                  }}
                >
                  <strong>Note đã lưu vào Sổ tay: </strong>“{savedNote}”
                </div>
              )}

              {isEditing ? (
                <div
                  style={{
                    marginTop: 10,
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                    Viết ghi chú rút kinh nghiệm cho câu hỏi này:
                  </div>
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="Ví dụ: Cẩn thận đổi đơn vị hoặc điều kiện xác định của hàm số..."
                    value={draftNote}
                    onChange={(e) => setDraftNote(e.target.value)}
                    style={{ width: '100%', fontSize: 13, marginBottom: 8 }}
                  />
                  <div className="row end" style={{ gap: 8 }}>
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => setEditingNoteQid(null)}
                      disabled={savingNote}
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      className="btn sm primary"
                      onClick={() => handleSaveNote(it.qid)}
                      disabled={savingNote}
                    >
                      {savingNote ? 'Đang lưu…' : 'Lưu vào Sổ tay lỗi sai'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="row mt" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => {
                      setEditingNoteQid(it.qid);
                      setDraftNote(savedNote || '');
                    }}
                    style={{ borderColor: '#fecaca', color: '#b91c1c', fontWeight: 600 }}
                  >
                    {savedNote ? '✎ Sửa Note lỗi sai' : '+ Lưu Note lỗi sai vào Sổ tay'}
                  </button>
                  {onAppeal && (
                    <button className="btn ghost sm" onClick={() => onAppeal(it.qid)}>
                      Em muốn khiếu nại câu này
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ResultSummary({ data }: { data: any }) {
  const { meta } = useApp();
  const r = data.result;
  const errs = Object.entries(r.errorCount ?? {}).filter(([, n]) => (n as number) > 0) as [string, number][];
  const maxErr = Math.max(1, ...errs.map(([, n]) => n));
  return (
    <div className="grid-2">
      <div className="card">
        <h2>Điểm từng phần</h2>
        {(['I', 'II', 'III'] as const).map((p) =>
          r.byPart?.[p]?.max ? (
            <div key={p} className="mb">
              <div className="row between small">
                <span>Phần {p}</span>
                <b>
                  {fmtScore(r.byPart[p].points)} / {fmtScore(r.byPart[p].max)}
                </b>
              </div>
              <Bar value={r.byPart[p].points / r.byPart[p].max} />
            </div>
          ) : null,
        )}
        <h3 className="mt">Theo chuyên đề</h3>
        {(r.topics ?? []).map((t: any) => (
          <div key={t.topic} className="mb">
            <div className="row between small">
              <span>{t.name}</span>
              <span className="muted">{pct(t.ratio)}</span>
            </div>
            <Bar value={t.ratio} />
          </div>
        ))}
      </div>
      <div className="card">
        <h2>Em hay sai kiểu gì?</h2>
        {errs.length === 0 ? (
          <p className="muted">Không có lỗi sai nào được ghi nhận.</p>
        ) : (
          <div className="stack">
            {errs
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => (
                <div key={k}>
                  <div className="row between small">
                    <ErrorTypeBadge type={k} />
                    <b>{n} lỗi</b>
                  </div>
                  <div className="bar mt" style={{ marginTop: 4 }}>
                    <span style={{ width: `${(n / maxErr) * 100}%`, background: 'var(--violet)' }} />
                  </div>
                  <div className="tiny muted">{meta.errorTypes[k]?.hint}</div>
                </div>
              ))}
          </div>
        )}
        {r.dominantError && (
          <div className="alert info mt small">
            <b>Việc nên làm:</b> {meta.errorTypes[r.dominantError]?.action}.
          </div>
        )}
      </div>
    </div>
  );
}

/** Đổi số giây sang "1 phút 20 giây" ngắn gọn. */
function fmtDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} giây`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} phút ${r} giây` : `${m} phút`;
}

/**
 * Phân tích thời gian từng câu (từ dữ liệu phòng thi đã ghi): tổng thời gian, trung bình,
 * câu tốn thời gian nhất và câu "đúng nhưng chậm" (lâu hơn gấp đôi trung vị).
 */
function timeAnalysis(data: any) {
  const times: Record<string, number> = data.times ?? {};
  const byQ = Object.fromEntries((data.result?.items ?? []).map((x: any) => [x.qid, x]));
  const rows = (data.items ?? [])
    .map((it: any, idx: number) => ({
      idx,
      label: it.no ? `Câu ${it.no} · P.${({ mcq: 'I', tf: 'II', short: 'III' } as Record<string, string>)[it.type] ?? ''}` : `Câu ${idx + 1}`,
      qid: it.qid,
      sec: Number(times[it.qid] ?? 0),
      correct: byQ[it.qid]?.grade ? Boolean(byQ[it.qid].grade.correct) : null,
      blank: byQ[it.qid]?.diagnosis?.kind === 'blank',
    }))
    .filter((r: any) => r.sec > 0);
  if (rows.length < 3) return null;
  const total = rows.reduce((a: number, r: any) => a + r.sec, 0);
  const sorted = [...rows].map((r: any) => r.sec).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const slowest = [...rows].sort((a: any, b: any) => b.sec - a.sec).slice(0, 3);
  const slowRight = rows.filter((r: any) => r.correct === true && r.sec > Math.max(60, median * 2));
  const maxSec = slowest[0]?.sec || 1;
  return { total, avg: total / rows.length, median, slowest, slowRight, maxSec, count: rows.length };
}

type Note = { tone: 'bad' | 'warn' | 'good' | 'info'; title: string; body: string; action?: { label: string; run: () => void } };

/** Rút ra tối đa 3 điều cần chú ý nhất của bài (theo quy tắc, không dùng AI). */
function buildNotes(data: any, meta: any, ta: ReturnType<typeof timeAnalysis>, onPractice: (topics?: string[]) => void): Note[] {
  const r = data.result;
  const items = r.items ?? [];
  const notes: Note[] = [];
  const topics = [...(r.topics ?? [])].sort((a: any, b: any) => a.ratio - b.ratio);
  const weakest = topics.find((t: any) => t.ratio < 0.75);
  if (weakest) {
    notes.push({
      tone: weakest.ratio < 0.5 ? 'bad' : 'warn',
      title: `${weakest.name}: mới đúng ${Math.round(weakest.ratio * 100)}%`,
      body: 'Đây là chuyên đề kéo điểm xuống nhiều nhất trong bài này.',
      action: { label: 'Luyện chuyên đề này', run: () => onPractice([weakest.topic]) },
    });
  }
  const errs = Object.entries(r.errorCount ?? {}).filter(([, n]) => (n as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number)) as [string, number][];
  if (errs.length && errs[0][1] >= 2) {
    const [k, n] = errs[0];
    notes.push({ tone: 'warn', title: `Hay sai kiểu "${meta.errorTypes[k]?.label ?? k}" (${n} câu)`, body: meta.errorTypes[k]?.action ? `${meta.errorTypes[k].action}.` : meta.errorTypes[k]?.hint ?? '' });
  }
  const blanks = items.filter((x: any) => x.diagnosis?.kind === 'blank').length;
  if (blanks > 0) {
    notes.push({ tone: 'warn', title: `Bỏ trống ${blanks} câu`, body: 'Đề không trừ điểm câu sai. Còn thời gian thì đừng để trống, hãy chọn hoặc điền đáp án hợp lý nhất.' });
  }
  const parts = (['I', 'II', 'III'] as const)
    .map((p) => ({ p, ...(r.byPart?.[p] ?? {}) }))
    .filter((x: any) => x.max)
    .map((x: any) => ({ ...x, ratio: x.points / x.max }))
    .sort((a: any, b: any) => a.ratio - b.ratio);
  if (parts.length > 1 && parts[0].ratio < 0.5) {
    const name = { I: 'trắc nghiệm', II: 'đúng/sai', III: 'trả lời ngắn' }[parts[0].p as 'I' | 'II' | 'III'];
    notes.push({ tone: 'bad', title: `Phần ${parts[0].p} (${name}) mới đạt ${fmtScore(parts[0].points)}/${fmtScore(parts[0].max)} điểm`, body: parts[0].p === 'II' ? 'Ở phần đúng/sai, đúng 3/4 ý chỉ được 0,5 điểm: soát kỹ từng ý.' : 'Phần này đang thấp hơn hẳn các phần khác.' });
  }
  if (ta?.slowRight?.length) {
    notes.push({ tone: 'info', title: `Đúng nhưng còn chậm: ${ta.slowRight.map((q: any) => q.label).join(', ')}`, body: 'Làm được nhưng mất hơn gấp đôi thời gian bình thường. Luyện thêm dạng này cho nhanh tay.' });
  }
  if (data.previous && data.previous.score10 !== null) {
    const d = r.score10 - data.previous.score10;
    if (d >= 0.25) notes.push({ tone: 'good', title: `Tăng ${fmtScore(d)} điểm so với lần trước`, body: 'Giữ nhịp ôn như vừa rồi.' });
    else if (d <= -0.25) notes.push({ tone: 'bad', title: `Giảm ${fmtScore(-d)} điểm so với lần trước`, body: 'Xem lại các câu sai mới để biết vì sao.' });
  }
  if (!notes.length) notes.push({ tone: 'good', title: 'Bài làm rất tốt', body: 'Không có điểm yếu rõ rệt. Thử một đề khó hơn hoặc thi thật có tính giờ.' });
  return notes.slice(0, 3);
}

function verdict(score: number) {
  if (score >= 9) return 'Xuất sắc';
  if (score >= 8) return 'Giỏi';
  if (score >= 6.5) return 'Khá';
  if (score >= 5) return 'Trung bình';
  return 'Cần cố gắng';
}

export function ResultPage({ attemptId }: { attemptId: number }) {
  const { toast, meta } = useApp();
  const { data, error, loading, reload } = useAsync(() => get(`/api/attempts/${attemptId}/result`), [attemptId]);
  const [starting, setStarting] = useState(false);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const total = data.items?.length ?? 0;
  const answeredCount = data.answeredCount ?? Object.values(data.responses ?? {}).filter((v: any) => v !== null && v !== undefined && v !== '').length;
  const scoreVisible = data.scoreVisible !== undefined ? Boolean(data.scoreVisible) : Boolean(data.result);
  const answersVisible = data.answersVisible !== undefined ? Boolean(data.answersVisible) : Boolean(data.result?.items?.length || data.kind === 'practice');
  const releaseLabel = data.releaseAt ? fmtDateTime(data.releaseAt) : 'khi giáo viên công bố';

  // Bài đã nộp nhưng điểm còn ẩn
  if (!scoreVisible || !data.result) {
    return (
      <div className="su-page" style={{ maxWidth: 720 }}>
        <section className="su-card" style={{ textAlign: 'center', padding: 28 }}>
          <CheckCircle2 size={36} color="var(--good)" aria-hidden="true" />
          <div className="su-row-meta" style={{ justifyContent: 'center', marginTop: 8 }}>{data.title}</div>
          <h1 style={{ margin: '6px 0', fontSize: 22 }}>{data.status === 'auto_submitted' ? 'Hết giờ, đã ghi nhận bài làm' : 'Đã nộp bài'}</h1>
          <p className="su-sub" style={{ margin: '0 auto 14px', maxWidth: 440 }}>
            Điểm và đáp án sẽ mở {releaseLabel}, để công bằng với các bạn còn đang làm.
          </p>
          <div className="su-stats" style={{ justifyContent: 'center' }}>
            <span className="su-stat">Đã trả lời <b>{answeredCount}/{total}</b></span>
            <span className="su-stat">Nộp lúc <b style={{ fontSize: 13 }}>{data.submittedAt ? fmtDateTime(data.submittedAt) : 'vừa xong'}</b></span>
          </div>
          <div className="su-actions" style={{ justifyContent: 'center', maxWidth: 360, margin: '16px auto 0' }}>
            <button type="button" className="btn primary" onClick={reload}>Kiểm tra lại</button>
            <button type="button" className="btn" onClick={() => go('/ho-so')}>Về Hồ sơ</button>
          </div>
        </section>
      </div>
    );
  }

  const r = data.result;
  const practice = async (topics?: string[]) => {
    const weak = topics ?? (r.topics ?? []).filter((t: any) => t.ratio < 0.75).sort((a: any, b: any) => a.ratio - b.ratio).slice(0, 2).map((t: any) => t.topic);
    setStarting(true);
    try {
      const a = await post('/api/practice/start', weak.length ? { mode: 'topic', topics: weak, count: 8 } : { mode: 'weak', count: 8 });
      go(`/thi/${a.id}`);
    } catch (e: any) {
      toast(e.message);
      setStarting(false);
    }
  };
  const rItems = r.items ?? [];
  const correctCount = rItems.filter((x: any) => x.grade?.correct).length;
  const blankCount = rItems.filter((x: any) => x.diagnosis?.kind === 'blank').length;
  const wrongCount = rItems.length - correctCount - blankCount;
  const errs = Object.entries(r.errorCount ?? {}).filter(([, n]) => (n as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number)) as [string, number][];
  const ta = answersVisible ? timeAnalysis(data) : null;
  const notes = buildNotes(data, meta, ta, practice);
  const delta = data.previous?.score10 != null ? r.score10 - data.previous.score10 : null;
  const target = data.targetScore as number | null;
  const tone = r.score10 >= 8 ? 'good' : r.score10 >= 6.5 ? 'primary' : r.score10 >= 5 ? 'warn' : 'bad';
  const modeLabel = data.mode === 'mock' ? 'Thi thử THPT' : data.mode === 'timed' ? 'Thi thật' : data.kind === 'practice' ? 'Luyện tập' : 'Bài được giao';
  const NOTE_ICON = { bad: TriangleAlert, warn: CircleAlert, good: TrendingUp, info: Lightbulb } as const;

  return (
    <div className="su-page" style={{ maxWidth: 980 }}>
      <header className="su-head">
        <div>
          <button type="button" className="su-link" onClick={() => go('/ho-so')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <ArrowLeft size={14} aria-hidden="true" /> Hồ sơ
          </button>
          <h1>{data.title}</h1>
          <p className="su-sub">
            {modeLabel}
            {data.status === 'auto_submitted' ? ' · hết giờ, tự nộp' : ''}
            {data.submittedAt ? ` · ${fmtDateTime(data.submittedAt)}` : ''}
          </p>
        </div>
      </header>

      <section className={`rp-hero is-${tone}`} aria-label="Điểm bài làm">
        <div className="rp-score">
          <div className="rp-score-num">{fmtScore(r.score10)}<small>/10</small></div>
          <div className="rp-verdict">{verdict(r.score10)}</div>
          <div className="rp-chips">
            {delta !== null && Math.abs(delta) >= 0.01 && (
              <span className={`rp-chip ${delta > 0 ? 'is-up' : 'is-down'}`}>
                {delta > 0 ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}
                {delta > 0 ? '+' : '−'}{fmtScore(Math.abs(delta))} so với lần trước
              </span>
            )}
            {target ? (
              <span className="rp-chip">
                <Target size={13} aria-hidden="true" />
                {r.score10 >= target ? `Đạt mục tiêu ${fmtScore(target)}` : `Mục tiêu ${fmtScore(target)} · còn ${fmtScore(target - r.score10)}`}
              </span>
            ) : null}
          </div>
        </div>
        <div className="rp-body">
          {answersVisible ? (
            <div className="rp-counts">
              <div className="is-good"><b>{correctCount}</b><span>đúng</span></div>
              <div className="is-bad"><b>{wrongCount}</b><span>sai</span></div>
              <div className="is-mute"><b>{blankCount}</b><span>bỏ trống</span></div>
            </div>
          ) : (
            <div className="su-row-meta">Đáp án mở {releaseLabel}</div>
          )}
          <div className="rp-parts">
            {(['I', 'II', 'III'] as const).map((p) =>
              r.byPart?.[p]?.max ? (
                <div key={p} className="rp-part">
                  <span>Phần {p}</span>
                  <div className="su-bar"><span style={{ width: `${(r.byPart[p].points / r.byPart[p].max) * 100}%` }} /></div>
                  <b className="tabular-nums">{fmtScore(r.byPart[p].points)}/{fmtScore(r.byPart[p].max)}</b>
                </div>
              ) : null,
            )}
          </div>
          <div className="rp-actions">
            {answersVisible && (
              <button type="button" className="btn primary" onClick={() => go(`/ket-qua/${attemptId}/dap-an`)}>
                <Eye size={15} aria-hidden="true" /> Xem lời giải
              </button>
            )}
            <button type="button" className="btn" onClick={() => practice()} disabled={starting}>
              <Dumbbell size={15} aria-hidden="true" /> {starting ? 'Đang chọn câu…' : 'Luyện phần yếu'}
            </button>
            <button type="button" className="btn" onClick={() => go('/ho-so')}>
              <LineChart size={15} aria-hidden="true" /> Hồ sơ của em
            </button>
          </div>
        </div>
      </section>

      {(data.teacherFeedback || data.teacherStamp) && (
        <section className="su-card su-feedback" aria-label="Lời phê của giáo viên">
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{data.teacherStamp || 'Lời phê của giáo viên'}</strong>
            {data.feedbackAt && <span className="su-row-meta" style={{ display: 'inline-flex', marginLeft: 8 }}>{fmtDateTime(data.feedbackAt)}</span>}
            {data.teacherFeedback && <p>“{data.teacherFeedback}”</p>}
          </div>
        </section>
      )}
      {r.late && !r.late.accepted && (
        <div className="su-card" style={{ background: 'var(--warn-soft)', borderColor: 'transparent', fontSize: 13 }}>
          Một phần bài làm lúc mất mạng được gửi sau giờ nộp. Giáo viên sẽ xem xét có tính hay không.
        </div>
      )}

      <section aria-label="Điều cần chú ý">
        <h2 className="rp-h2">Điều cần chú ý</h2>
        <div className="rp-notes">
          {notes.map((n, i) => {
            const I = NOTE_ICON[n.tone];
            return (
              <div key={i} className={`rp-note is-${n.tone}`}>
                <div className="rp-note-icon"><I size={17} aria-hidden="true" /></div>
                <div className="rp-note-main">
                  <strong>{n.title}</strong>
                  <p>{n.body}</p>
                  {n.action && (
                    <button type="button" className="su-link" onClick={n.action.run} disabled={starting}>{n.action.label} →</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {!answersVisible && (
        <section className="su-card" style={{ background: 'var(--warn-soft)', borderColor: 'transparent' }} aria-label="Đáp án tạm ẩn">
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Lock size={18} color="var(--warn)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Đáp án và lời giải đang tạm ẩn</strong>
              <div className="su-row-meta">Sẽ mở {releaseLabel} (hoặc khi giáo viên công bố). Khiếu nại cũng mở lúc đó.</div>
              <button type="button" className="btn sm" style={{ marginTop: 10 }} onClick={reload}>Kiểm tra lại</button>
            </div>
          </div>
        </section>
      )}

      <h2 className="rp-h2">Chi tiết</h2>
      <div className="rp-detail">
        <section className="su-card" aria-label="Theo chuyên đề">
          <div className="su-card-head"><h2>Theo chuyên đề</h2></div>
          {(r.topics ?? []).length === 0 ? (
            <div className="su-row-meta">Chưa đủ dữ liệu theo chuyên đề.</div>
          ) : (
            <div className="su-list">
              {[...(r.topics ?? [])].sort((a: any, b: any) => a.ratio - b.ratio).map((t: any) => (
                <div key={t.topic} style={{ padding: '7px 0' }}>
                  <div className="su-topic-foot">
                    <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{t.name}</span>
                    <span className="tabular-nums">{Math.round(t.ratio * 100)}%</span>
                  </div>
                  <div className="su-bar" style={{ marginTop: 6 }}>
                    <span style={{ width: `${t.ratio * 100}%`, background: t.ratio < 0.5 ? 'var(--bad)' : t.ratio < 0.75 ? 'var(--warn)' : 'var(--good)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="su-card" aria-label="Kiểu lỗi">
          <div className="su-card-head"><h2>Kiểu lỗi</h2></div>
          {errs.length === 0 ? (
            <div className="su-row-meta">Không có lỗi sai nào được ghi nhận.</div>
          ) : (
            <div className="su-list">
              {errs.map(([k, n]) => (
                <div key={k} style={{ padding: '7px 0' }}>
                  <div className="su-topic-foot">
                    <ErrorTypeBadge type={k} />
                    <b style={{ color: 'var(--ink)' }}>{n} câu</b>
                  </div>
                  {meta.errorTypes[k]?.hint && <div className="su-row-meta">{meta.errorTypes[k].hint}</div>}
                </div>
              ))}
            </div>
          )}
        </section>
        {ta && (
          <section className="su-card" aria-label="Thời gian làm bài">
            <div className="su-card-head">
              <h2><Timer size={15} aria-hidden="true" style={{ verticalAlign: -2 }} /> Thời gian</h2>
              <span className="su-row-meta" style={{ margin: 0 }}>Tổng {fmtDuration(ta.total)} · TB {fmtDuration(ta.avg)}/câu</span>
            </div>
            <div className="su-row-meta" style={{ marginBottom: 8 }}>Tốn thời gian nhất</div>
            <div className="su-list">
              {ta.slowest.map((q: any) => (
                <div key={q.qid} className="su-time-row">
                  <span className="su-time-label">{q.label}</span>
                  <div className="su-bar" style={{ flex: 1 }}>
                    <span style={{ width: `${(q.sec / ta.maxSec) * 100}%`, background: q.correct ? 'var(--good)' : q.blank ? 'var(--ink-3)' : 'var(--bad)' }} />
                  </div>
                  <span className="tabular-nums su-time-sec">{fmtDuration(q.sec)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
