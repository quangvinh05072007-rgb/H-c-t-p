import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, Lightbulb, Lock, Timer } from 'lucide-react';
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
          <h1 style={{ margin: '6px 0', fontSize: 22 }}>
            {data.status === 'auto_submitted' ? 'Hết giờ, đã ghi nhận bài làm' : 'Đã nộp bài'}
          </h1>
          <p className="su-sub" style={{ margin: '0 auto 14px', maxWidth: 440 }}>
            Điểm và đáp án sẽ mở {releaseLabel}, để công bằng với các bạn còn đang làm.
          </p>
          <div className="su-stats" style={{ justifyContent: 'center' }}>
            <span className="su-stat">Đã trả lời <b>{answeredCount}/{total}</b></span>
            <span className="su-stat">Nộp lúc <b style={{ fontSize: 13 }}>{data.submittedAt ? fmtDateTime(data.submittedAt) : 'vừa xong'}</b></span>
          </div>
          <div className="su-actions" style={{ justifyContent: 'center', maxWidth: 360, margin: '16px auto 0' }}>
            <button type="button" className="btn primary" onClick={reload}>Kiểm tra lại</button>
            <button type="button" className="btn" onClick={() => go('/lop-hoc')}>Về lớp học</button>
          </div>
        </section>
      </div>
    );
  }

  const r = data.result;
  const weakTopics = (r.topics ?? []).filter((t: any) => t.ratio < 0.75).sort((a: any, b: any) => a.ratio - b.ratio);
  const weak = weakTopics.slice(0, 2).map((t: any) => t.topic);
  const practice = async () => {
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

  return (
    <div className="su-page" style={{ maxWidth: 980 }}>
      <header className="su-head">
        <div>
          <button type="button" className="su-link" onClick={() => go('/ket-qua')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <ArrowLeft size={14} aria-hidden="true" /> Kết quả
          </button>
          <h1>{data.title}</h1>
          <p className="su-sub">
            {data.mode === 'mock' ? 'Thi thử THPT, chấm theo thang của Bộ' : data.kind === 'practice' ? 'Bài tự luyện' : data.status === 'auto_submitted' ? 'Hết giờ, hệ thống tự nộp' : 'Bài kiểm tra'}
            {data.submittedAt ? ` · Nộp ${fmtDateTime(data.submittedAt)}` : ''}
          </p>
        </div>
        {answersVisible && (
          <button type="button" className="btn primary" onClick={() => go(`/ket-qua/${attemptId}/dap-an`)}>
            <Eye size={15} aria-hidden="true" /> Xem đáp án & lời giải
          </button>
        )}
      </header>

      {/* Điểm + 3 phần */}
      <section className="su-card su-score-card" aria-label="Điểm">
        <div className="su-score-main">
          <div className="su-score" style={{ fontSize: 44, color: scoreColor(r.score10) }}>
            {fmtScore(r.score10)}<small>/10</small>
          </div>
          {answersVisible ? (
            <div className="su-legend" style={{ marginTop: 6 }}>
              <span><b>{correctCount}</b> đúng</span>
              <span><b>{wrongCount}</b> sai</span>
              {blankCount > 0 && <span><b>{blankCount}</b> bỏ trống</span>}
              <span>/ {total} câu</span>
            </div>
          ) : (
            <div className="su-row-meta">Đáp án mở {releaseLabel}</div>
          )}
        </div>
        <div className="su-parts">
          {(['I', 'II', 'III'] as const).map((p) =>
            r.byPart?.[p]?.max ? (
              <div key={p} className="su-part">
                <div className="su-topic-foot">
                  <span>Phần {p}</span>
                  <b className="tabular-nums" style={{ color: 'var(--ink)' }}>{fmtScore(r.byPart[p].points)}/{fmtScore(r.byPart[p].max)}</b>
                </div>
                <div className="su-bar"><span style={{ width: `${(r.byPart[p].points / r.byPart[p].max) * 100}%` }} /></div>
              </div>
            ) : null,
          )}
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

      <div className="su-split">
        <div className="su-col">
          {/* Nên ôn gì */}
          <section className="su-card" aria-label="Nên ôn">
            <div className="su-card-head">
              <h2>Nên ôn</h2>
              <button type="button" className="btn sm primary" onClick={practice} disabled={starting}>
                {starting ? 'Đang chọn câu…' : weak.length ? 'Luyện 8 câu phần yếu' : 'Luyện thêm 8 câu'}
              </button>
            </div>
            {(r.topics ?? []).length === 0 ? (
              <div className="su-row-meta">Chưa đủ dữ liệu theo chuyên đề.</div>
            ) : (
              <div className="su-list">
                {[...(r.topics ?? [])].sort((a: any, b: any) => a.ratio - b.ratio).slice(0, 5).map((t: any) => (
                  <div key={t.topic} className="su-row" style={{ padding: '8px 0' }}>
                    <div className="su-row-main">
                      <div className="su-topic-foot">
                        <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{t.name}</span>
                        <span className="tabular-nums">{Math.round(t.ratio * 100)}%</span>
                      </div>
                      <div className="su-bar" style={{ marginTop: 6 }}>
                        <span style={{ width: `${t.ratio * 100}%`, background: t.ratio < 0.5 ? 'var(--bad)' : t.ratio < 0.75 ? 'var(--warn)' : 'var(--good)' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Thời gian làm bài */}
          {ta && (
            <section className="su-card" aria-label="Thời gian làm bài">
              <div className="su-card-head">
                <h2><Timer size={15} aria-hidden="true" style={{ verticalAlign: -2 }} /> Thời gian làm bài</h2>
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
                    <span className={`su-chip ${q.correct ? 'is-good' : q.blank ? '' : 'is-bad'}`}>{q.correct ? 'Đúng' : q.blank ? 'Bỏ trống' : 'Sai'}</span>
                  </div>
                ))}
              </div>
              {ta.slowRight.length > 0 && (
                <div className="su-mistake-why" style={{ marginTop: 12 }}>
                  <div>
                    <Lightbulb size={14} aria-hidden="true" color="var(--warn)" />
                    <span>
                      <b>Đúng nhưng còn chậm:</b> {ta.slowRight.map((q: any) => q.label).join(', ')}. Em làm được nhưng mất hơn gấp đôi thời gian bình thường, nên luyện thêm dạng này cho nhanh tay.
                    </span>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="su-col">
          {/* Kiểu lỗi */}
          <section className="su-card" aria-label="Kiểu lỗi">
            <div className="su-card-head"><h2>Em hay sai kiểu gì?</h2></div>
            {errs.length === 0 ? (
              <div className="su-row-meta">Không có lỗi sai nào được ghi nhận.</div>
            ) : (
              <div className="su-list">
                {errs.map(([k, n]) => (
                  <div key={k} className="su-row" style={{ padding: '8px 0', alignItems: 'flex-start' }}>
                    <div className="su-row-main">
                      <div className="su-topic-foot">
                        <ErrorTypeBadge type={k} />
                        <b style={{ color: 'var(--ink)' }}>{n} lỗi</b>
                      </div>
                      {meta.errorTypes[k]?.hint && <div className="su-row-meta">{meta.errorTypes[k].hint}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {r.dominantError && meta.errorTypes[r.dominantError]?.action && (
              <div className="su-mistake-why" style={{ marginTop: 10 }}>
                <div>
                  <Lightbulb size={14} aria-hidden="true" color="var(--primary)" />
                  <span><b>Việc nên làm:</b> {meta.errorTypes[r.dominantError].action}.</span>
                </div>
              </div>
            )}
          </section>

          {answersVisible ? (
            <section className="su-card" aria-label="Xem lại bài">
              <div className="su-card-head"><h2>Xem lại bài</h2></div>
              <div className="su-row-meta" style={{ marginBottom: 10 }}>
                Đối chiếu bài làm với đáp án, lời giải từng câu{data.kind !== 'practice' ? ', gửi khiếu nại nếu cần' : ''}. Câu sai đã tự vào Sổ tay lỗi sai.
              </div>
              <div className="su-actions" style={{ marginTop: 0 }}>
                <button type="button" className="btn sm primary" onClick={() => go(`/ket-qua/${attemptId}/dap-an`)}>Xem đáp án</button>
                <button type="button" className="btn sm" onClick={() => go('/so-tay-loi-sai')}>Sổ tay lỗi sai</button>
              </div>
            </section>
          ) : (
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
        </div>
      </div>
    </div>
  );
}
