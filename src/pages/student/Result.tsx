import { useState } from 'react';
import { CheckCircle2, Eye, Lock } from 'lucide-react';
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

export function ResultPage({ attemptId }: { attemptId: number }) {
  const { toast } = useApp();
  const { data, error, loading, reload } = useAsync(() => get(`/api/attempts/${attemptId}/result`), [attemptId]);
  const [starting, setStarting] = useState(false);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const total = data.items?.length ?? 0;
  const answeredCount = data.answeredCount ?? Object.values(data.responses ?? {}).filter((v: any) => v !== null && v !== undefined && v !== '').length;
  const scoreVisible = data.scoreVisible !== undefined ? Boolean(data.scoreVisible) : Boolean(data.result);
  const answersVisible = data.answersVisible !== undefined ? Boolean(data.answersVisible) : Boolean(data.result?.items?.length || data.kind === 'practice');

  if (!scoreVisible || !data.result) {
    return (
      <div className="stack">
        <div className="azota-result-hero" style={{ maxWidth: 680, margin: '0 auto', width: '100%' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: '50%', background: '#dcfce7', color: '#166534', marginBottom: 10 }}>
            <CheckCircle2 size={28} />
          </div>
          <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            {data.title}
          </div>
          <h1 style={{ margin: '6px 0 4px', fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>
            {data.status === 'auto_submitted' ? 'Hết giờ — đã ghi nhận bài làm' : 'Đã nộp bài thành công'}
          </h1>
          <p className="small muted" style={{ maxWidth: 480, margin: '0 auto 14px', lineHeight: 1.5 }}>
            Giáo viên cài đặt ẩn điểm số và đáp án cho đến khi kết thúc thời gian làm bài của lớp để đảm bảo công bằng phòng thi.
          </p>
          <div className="azota-stat-grid">
            <div className="azota-stat-card">
              <span className="azota-stat-val tabular-nums" style={{ color: 'var(--primary)' }}>
                {answeredCount}/{total}
              </span>
              <span className="azota-stat-lbl">Câu đã trả lời</span>
            </div>
            <div className="azota-stat-card">
              <span className="azota-stat-val tabular-nums" style={{ fontSize: 15, color: 'var(--ink)' }}>
                {data.submittedAt ? fmtDateTime(data.submittedAt) : 'Vừa xong'}
              </span>
              <span className="azota-stat-lbl">Thời gian nộp</span>
            </div>
            <div className="azota-stat-card">
              <span className="azota-stat-val tabular-nums" style={{ fontSize: 15, color: '#9a3412' }}>
                {data.releaseAt ? fmtDateTime(data.releaseAt) : 'Khi giáo viên mở'}
              </span>
              <span className="azota-stat-lbl">Dự kiến công bố</span>
            </div>
          </div>
          <div className="row center mt" style={{ gap: 10, marginTop: 18 }}>
            <button type="button" className="btn primary" onClick={reload}>
              Kiểm tra công bố
            </button>
            <button type="button" className="btn" onClick={() => go('/lop-hoc')}>
              Về lớp học
            </button>
          </div>
        </div>
      </div>
    );
  }

  const r = data.result;
  const weak = (r.topics ?? []).filter((t: any) => t.ratio < 0.75).slice(0, 2).map((t: any) => t.topic);
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
  const wrongCount = rItems.filter((x: any) => !x.grade?.correct && x.grade && x.diagnosis?.kind !== 'blank').length;
  const blankCount = rItems.filter((x: any) => x.diagnosis?.kind === 'blank').length;

  return (
    <div className="stack">
      <div className="azota-result-hero">
        <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          {data.title}
        </div>
        <div className="azota-result-score" style={{ color: scoreColor(r.score10) }}>
          {fmtScore(r.score10)}
          <span style={{ fontSize: 20, color: 'var(--ink-3)', fontWeight: 500 }}> / 10 điểm</span>
        </div>
        <div className="small muted">
          {data.kind === 'practice' ? 'Bài luyện tập cá nhân' : data.status === 'auto_submitted' ? 'Hết giờ — hệ thống đã tự động nộp bài' : 'Đã nộp bài thành công'}
        </div>
        {answersVisible ? (
          <div className="azota-stat-grid">
            <div className="azota-stat-card">
              <span className="azota-stat-val tabular-nums" style={{ color: 'var(--good)' }}>{correctCount}</span>
              <span className="azota-stat-lbl">Số câu đúng</span>
            </div>
            <div className="azota-stat-card">
              <span className="azota-stat-val tabular-nums" style={{ color: 'var(--bad)' }}>{wrongCount}</span>
              <span className="azota-stat-lbl">Số câu sai</span>
            </div>
            <div className="azota-stat-card">
              <span className="azota-stat-val tabular-nums" style={{ color: 'var(--ink-3)' }}>{blankCount}</span>
              <span className="azota-stat-lbl">Chưa trả lời</span>
            </div>
            <div className="azota-stat-card">
              <span className="azota-stat-val tabular-nums" style={{ color: 'var(--primary)' }}>{total}</span>
              <span className="azota-stat-lbl">Tổng số câu</span>
            </div>
          </div>
        ) : (
          <div className="azota-stat-grid">
            <div className="azota-stat-card">
              <span className="azota-stat-val tabular-nums" style={{ color: 'var(--primary)' }}>
                {fmtScore(r.points)}/{fmtScore(r.max)}
              </span>
              <span className="azota-stat-lbl">Điểm quy đổi</span>
            </div>
            <div className="azota-stat-card">
              <span className="azota-stat-val tabular-nums" style={{ color: 'var(--ink)' }}>
                {answeredCount}/{total}
              </span>
              <span className="azota-stat-lbl">Câu đã trả lời</span>
            </div>
            <div className="azota-stat-card">
              <span className="azota-stat-val" style={{ fontSize: 15, color: '#9a3412' }}>Tạm ẩn</span>
              <span className="azota-stat-lbl">Đáp án & lời giải</span>
            </div>
            <div className="azota-stat-card">
              <span className="azota-stat-val tabular-nums" style={{ fontSize: 14, color: 'var(--ink-2)' }}>
                {data.releaseAt ? fmtDateTime(data.releaseAt) : 'Khi hết hạn'}
              </span>
              <span className="azota-stat-lbl">Thời điểm mở đáp án</span>
            </div>
          </div>
        )}
      </div>

      {(data.teacherFeedback || data.teacherStamp) && (
        <div
          className="card"
          style={{
            background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
            border: '1.5px solid #86efac',
            borderRadius: 14,
            padding: '16px 20px',
            boxShadow: '0 2px 10px rgba(22, 101, 52, 0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>{data.teacherStamp ? data.teacherStamp.split(' ')[0] : '🌟'}</span>
              <div>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#166534', background: '#dcfce7', padding: '3px 10px', borderRadius: 6 }}>
                  {data.teacherStamp || 'Lời phê từ Giáo viên'}
                </span>
                <span style={{ fontSize: 12, color: '#15803d', marginLeft: 8, fontWeight: 600 }}>
                  Thầy/Cô chấm và gửi nhận xét
                </span>
              </div>
            </div>
            {data.feedbackAt && (
              <span style={{ fontSize: 11.5, color: '#166534' }}>
                {fmtDateTime(data.feedbackAt)}
              </span>
            )}
          </div>
          {data.teacherFeedback && (
            <p style={{ margin: '10px 0 0', fontSize: 14, color: '#14532d', fontStyle: 'italic', lineHeight: 1.5, paddingLeft: 34 }}>
              “{data.teacherFeedback}”
            </p>
          )}
        </div>
      )}

      {r.late && !r.late.accepted && (
        <div className="alert warn small">Một phần bài làm lúc mất mạng được gửi sau giờ nộp. Giáo viên sẽ xem xét có tính hay không.</div>
      )}

      <div className="card row between">
        <div className="small">
          {weak.length ? <>Nên luyện thêm: <b>{weak.length} chuyên đề</b> còn yếu nhất trong bài này.</> : 'Làm tốt lắm! Hãy duy trì phong độ làm bài.'}
        </div>
        <button className="btn primary" onClick={practice} disabled={starting}>
          {starting ? 'Đang chọn câu…' : 'Luyện lại phần yếu'}
        </button>
      </div>

      <ResultSummary data={data} />

      {answersVisible ? (
        <div className="card row between" style={{ gap: 16, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 14, alignItems: 'center', flex: 1, minWidth: 260 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: 'var(--primary-soft)',
                color: 'var(--primary)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Eye size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
                Xem đáp án, bài làm của em & lời giải chi tiết
              </div>
              <p className="small muted" style={{ margin: '3px 0 0', lineHeight: 1.5 }}>
                Mở giao diện phòng xem bài từng câu kèm bảng đối chiếu câu trả lời của em, đáp án đúng, lời giải chi tiết và lưu ghi chú vào Sổ tay lỗi sai.
                {data.kind !== 'practice' ? ' Em cũng có thể gửi khiếu nại trực tiếp tại từng câu.' : ''}
              </p>
            </div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <a className="btn" href="#/so-tay-loi-sai">
              Sổ tay lỗi sai
            </a>
            <button
              type="button"
              className="btn primary"
              onClick={() => go(`/ket-qua/${attemptId}/dap-an`)}
            >
              Xem đáp án & lời giải →
            </button>
          </div>
        </div>
      ) : (
        <div className="card row between" style={{ gap: 14, flexWrap: 'wrap', background: '#fffbeb', borderColor: '#fde68a' }}>
          <div className="row" style={{ gap: 12, alignItems: 'flex-start', flex: 1, minWidth: 260 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#fef3c7', color: '#b45309', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Lock size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#92400e' }}>Đáp án chi tiết & lời giải đang được tạm ẩn</div>
              <p className="small" style={{ margin: '4px 0 0', color: '#78350f', lineHeight: 1.5 }}>
                Để chống lộ đáp án khi lớp vẫn còn thời gian thi, lời giải từng câu và chức năng khiếu nại sẽ tự động mở vào lúc{' '}
                <b>{data.releaseAt ? fmtDateTime(data.releaseAt) : 'khi đóng bài'}</b> (hoặc ngay khi giáo viên công bố).
              </p>
            </div>
          </div>
          <button type="button" className="btn sm" onClick={reload}>
            Kiểm tra đã mở chưa
          </button>
        </div>
      )}
    </div>
  );
}
