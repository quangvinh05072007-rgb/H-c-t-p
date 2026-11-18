import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookmarkPlus,
  CheckCircle2,
  Lock,
  MessageSquareWarning,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { get, post } from '../../api';
import {
  ErrorBox,
  fmtDateTime,
  fmtScore,
  go,
  Loading,
  Modal,
  scoreColor,
  topicName,
  useApp,
  useAsync,
} from '../../ui/kit';
import { Item, QuestionView } from '../../ui/Question';
import { ImageZoomModal } from '../../ui/ImageZoomModal';

type FilterMode = 'all' | 'wrong' | 'right';
type QuestionStatus = 'right' | 'half' | 'wrong' | 'blank';

function getQuestionStatus(entry: any): QuestionStatus {
  if (!entry) return 'blank';
  if (entry.grade?.correct) return 'right';
  if (entry.diagnosis?.kind === 'blank') return 'blank';
  if ((entry.grade?.points ?? 0) > 0) return 'half';
  return 'wrong';
}

function formatStudentAnswer(item: Item, response: any): string {
  if (item.type === 'mcq') {
    return Number.isInteger(response) ? `Phương án ${'ABCD'[response] ?? '?'}` : 'Chưa trả lời';
  }
  if (item.type === 'tf') {
    if (!Array.isArray(response) || !response.some((v) => typeof v === 'boolean')) {
      return 'Chưa trả lời';
    }
    return ['a', 'b', 'c', 'd']
      .map((label, idx) => `${label}) ${response[idx] === true ? 'Đ' : response[idx] === false ? 'S' : '—'}`)
      .join(' · ');
  }
  return typeof response === 'string' && response.trim() !== '' ? response.trim() : 'Chưa trả lời';
}

function formatCorrectAnswer(item: Item, correctAnswer: any): string {
  if (correctAnswer === undefined || correctAnswer === null) return '—';
  if (item.type === 'mcq') {
    return Number.isInteger(correctAnswer) ? `Phương án ${'ABCD'[correctAnswer] ?? '?'}` : String(correctAnswer);
  }
  if (item.type === 'tf') {
    if (!Array.isArray(correctAnswer)) return String(correctAnswer);
    return ['a', 'b', 'c', 'd']
      .map((label, idx) => `${label}) ${correctAnswer[idx] === true ? 'Đ' : 'S'}`)
      .join(' · ');
  }
  return String(correctAnswer).split(';')[0];
}

const STATUS_META: Record<QuestionStatus, { label: string; badgeClass: string }> = {
  right: { label: 'Chính xác', badgeClass: 'green' },
  half: { label: 'Đúng một phần', badgeClass: 'amber' },
  wrong: { label: 'Chưa đúng', badgeClass: 'red' },
  blank: { label: 'Bỏ trống', badgeClass: '' },
};

export function AnswerReviewRoom({ attemptId }: { attemptId: number }) {
  const { toast, meta } = useApp();
  const { data, error, loading, reload } = useAsync(
    () => get<any>(`/api/attempts/${attemptId}/result`),
    [attemptId],
  );

  const [curIdx, setCurIdx] = useState(0);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  const [editingNoteQid, setEditingNoteQid] = useState<number | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [savedNotes, setSavedNotes] = useState<Record<number, string>>({});
  const [savingNote, setSavingNote] = useState(false);

  const [appealQid, setAppealQid] = useState<number | null>(null);
  const [appealReason, setAppealReason] = useState('');
  const [submittingAppeal, setSubmittingAppeal] = useState(false);

  const items: Item[] = data?.items ?? [];
  const r = data?.result;

  const byQ = useMemo(() => {
    const map: Record<number, any> = {};
    for (const entry of r?.items ?? []) {
      map[entry.qid] = entry;
    }
    return map;
  }, [r]);

  const counts = useMemo(() => {
    let right = 0;
    let half = 0;
    let wrong = 0;
    let blank = 0;
    for (const it of items) {
      const st = getQuestionStatus(byQ[it.qid]);
      if (st === 'right') right++;
      else if (st === 'half') half++;
      else if (st === 'wrong') wrong++;
      else blank++;
    }
    return { right, half, wrong, blank, notRight: items.length - right };
  }, [items, byQ]);

  const filteredIndices = useMemo(() => {
    return items
      .map((it, idx) => ({ it, idx, st: getQuestionStatus(byQ[it.qid]) }))
      .filter(({ st }) => {
        if (filter === 'all') return true;
        if (filter === 'right') return st === 'right';
        return st !== 'right';
      })
      .map((x) => x.idx);
  }, [items, byQ, filter]);

  const goTo = useCallback((idx: number) => {
    setCurIdx(idx);
    setEditingNoteQid(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const changeFilter = (next: FilterMode) => {
    setFilter(next);
    const matching = items
      .map((it, idx) => ({ idx, st: getQuestionStatus(byQ[it.qid]) }))
      .filter(({ st }) => (next === 'all' ? true : next === 'right' ? st === 'right' : st !== 'right'))
      .map((x) => x.idx);
    if (matching.length > 0 && !matching.includes(curIdx)) {
      setCurIdx(matching[0]);
      setEditingNoteQid(null);
    }
  };

  // Lần đầu mở: ưu tiên xem câu chưa đúng
  const [autoFocused, setAutoFocused] = useState(false);
  useEffect(() => {
    if (autoFocused || !items.length || !r) return;
    setAutoFocused(true);
    if (counts.notRight > 0 && counts.notRight < items.length) {
      setFilter('wrong');
      const first = items.findIndex((it) => getQuestionStatus(byQ[it.qid]) !== 'right');
      if (first >= 0) setCurIdx(first);
    }
  }, [autoFocused, items, r, counts.notRight, byQ]);

  const posInFiltered = filteredIndices.indexOf(curIdx);
  const activeItem =
    filteredIndices.length > 0
      ? items[posInFiltered >= 0 ? curIdx : filteredIndices[0]]
      : null;

  const stepFiltered = useCallback(
    (delta: -1 | 1) => {
      if (filteredIndices.length === 0) return;
      const curPos = filteredIndices.indexOf(curIdx);
      const basePos = curPos >= 0 ? curPos : 0;
      const nextPos = basePos + delta;
      if (nextPos >= 0 && nextPos < filteredIndices.length) {
        goTo(filteredIndices[nextPos]);
      }
    },
    [filteredIndices, curIdx, goTo],
  );

  // Phím tắt phòng xem bài: mũi tên trái/phải chuyển câu, Z phóng to hình
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';
      if (isInput || appealQid !== null) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepFiltered(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepFiltered(1);
      } else if (e.key.toLowerCase() === 'z' && activeItem) {
        const m = activeItem.stem?.match(/\[\[img:(\d+)\]\]/);
        if (m) {
          e.preventDefault();
          setZoomImageUrl((prev) => (prev ? null : `/api/images/${m[1]}`));
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stepFiltered, activeItem, appealQid]);

  if (loading) return <Loading text="Đang mở phòng xem đáp án…" />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const scoreVisible = data.scoreVisible !== undefined ? Boolean(data.scoreVisible) : Boolean(data.result);
  const answersVisible =
    data.answersVisible !== undefined
      ? Boolean(data.answersVisible)
      : Boolean(data.result?.items?.length || data.kind === 'practice');

  if (!scoreVisible || !answersVisible || !r || !items.length) {
    return (
      <div className="exam-zen-mode">
        <header className="exam-top-bar">
          <div className="exam-top-left">
            <button type="button" className="exam-exit-btn" onClick={() => go(`/ket-qua/${attemptId}`)}>
              <ArrowLeft size={15} />
              <span>Quay lại kết quả</span>
            </button>
            <div className="exam-info-block">
              <h1 className="exam-main-title">{data?.title || 'Xem đáp án'}</h1>
              <div className="exam-sub-meta">Chưa mở đáp án chi tiết</div>
            </div>
          </div>
        </header>
        <div className="exam-focus-workspace" style={{ justifyContent: 'center' }}>
          <div className="card" style={{ maxWidth: 560, width: '100%', padding: 28, textAlign: 'center' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: '#fef3c7',
                color: '#b45309',
                display: 'inline-grid',
                placeItems: 'center',
                marginBottom: 12,
              }}
            >
              <Lock size={22} />
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Đáp án & lời giải đang được tạm ẩn</h2>
            <p className="small muted" style={{ lineHeight: 1.55, margin: '0 0 18px' }}>
              Giáo viên cài đặt chỉ mở đáp án sau khi kết thúc thời gian làm bài của lớp (dự kiến:{' '}
              <b>{data?.releaseAt ? fmtDateTime(data.releaseAt) : 'khi giáo viên công bố'}</b>).
            </p>
            <div className="row center" style={{ gap: 10 }}>
              <button type="button" className="btn primary" onClick={reload}>
                Kiểm tra lại
              </button>
              <button type="button" className="btn" onClick={() => go(`/ket-qua/${attemptId}`)}>
                Về trang kết quả
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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

  const handleSubmitAppeal = async () => {
    if (!appealQid) return;
    if (appealReason.trim().length < 10) {
      toast('Vui lòng nhập lý do khiếu nại ít nhất 10 ký tự.');
      return;
    }
    setSubmittingAppeal(true);
    try {
      await post(`/api/attempts/${data.id}/appeals`, {
        qid: appealQid,
        reason: appealReason.trim(),
      });
      toast('Đã gửi khiếu nại. Giáo viên sẽ xem xét và phản hồi em.');
      setAppealQid(null);
      setAppealReason('');
    } catch (e: any) {
      toast(e.message || 'Không thể gửi khiếu nại.');
    } finally {
      setSubmittingAppeal(false);
    }
  };

  const activeEntry = activeItem ? byQ[activeItem.qid] : null;
  const activeStatus = activeItem ? getQuestionStatus(activeEntry) : 'blank';
  const activeResponse = activeItem ? data.responses?.[activeItem.qid] : undefined;
  const activeNote = activeItem ? savedNotes[activeItem.qid] : undefined;
  const activeIdxInFiltered = activeItem ? filteredIndices.indexOf(items.indexOf(activeItem)) : -1;

  return (
    <div className="exam-zen-mode">
      {/* 1. Sticky Top Bar giống Phòng thi */}
      <header className="exam-top-bar">
        <div className="exam-top-left">
          <button
            type="button"
            className="exam-exit-btn"
            onClick={() => go(`/ket-qua/${attemptId}`)}
            title="Quay lại trang tổng kết điểm"
          >
            <ArrowLeft size={15} />
            <span>Quay lại kết quả</span>
          </button>

          <div className="exam-info-block">
            <h1 className="exam-main-title">{data.title}</h1>
            <div className="exam-sub-meta">
              <span>{data.kind === 'practice' ? 'Xem lại luyện tập' : 'Xem lại bài thi'}</span>
              {activeItem && (
                <>
                  <span>·</span>
                  <span className="tabular-nums">
                    Câu {activeItem.no}/{items.length}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="exam-top-right">
          {/* Bộ lọc nhanh theo trạng thái đúng/sai */}
          <div className="review-filter-group" role="tablist" aria-label="Lọc câu hỏi">
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'all'}
              className={`review-filter-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => changeFilter('all')}
            >
              Tất cả ({items.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'wrong'}
              className={`review-filter-btn ${filter === 'wrong' ? 'active' : ''}`}
              onClick={() => changeFilter('wrong')}
            >
              Chưa đúng ({counts.notRight})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'right'}
              className={`review-filter-btn ${filter === 'right' ? 'active' : ''}`}
              onClick={() => changeFilter('right')}
            >
              Đúng ({counts.right})
            </button>
          </div>

          <div
            className="exam-countdown-timer tabular-nums"
            style={{ color: scoreColor(r.score10) }}
            title="Điểm bài làm"
          >
            {fmtScore(r.score10)} / 10 đ
          </div>

          <button
            type="button"
            className={`exam-palette-toggle-btn ${paletteOpen ? 'active' : ''}`}
            onClick={() => setPaletteOpen((v) => !v)}
            title="Bật/Tắt bảng câu hỏi"
          >
            {paletteOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
            <span className="tabular-nums">
              {counts.right}/{items.length}
            </span>
          </button>
        </div>
      </header>

      {/* 2. Main Focus Workspace */}
      <div className="exam-focus-workspace">
        <main className="exam-question-viewport">
          {!activeItem ? (
            <div className="card exam-question-card" style={{ alignItems: 'center', textAlign: 'center', padding: 40 }}>
              <CheckCircle2 size={36} color="var(--good)" />
              <h2 style={{ margin: '6px 0 4px', fontSize: 18 }}>
                {filter === 'wrong' ? 'Không có câu nào sai hoặc bỏ trống!' : 'Không có câu hỏi phù hợp bộ lọc'}
              </h2>
              <p className="small muted" style={{ margin: '0 0 14px' }}>
                {filter === 'wrong'
                  ? 'Em đã làm đúng toàn bộ các câu hỏi trong bài này.'
                  : 'Chọn "Tất cả" để xem toàn bộ đề và lời giải.'}
              </p>
              <button type="button" className="btn primary" onClick={() => changeFilter('all')}>
                Xem tất cả {items.length} câu
              </button>
            </div>
          ) : (
            <div className="card exam-question-card">
              {/* Question Header Row */}
              <div className="exam-card-nav-row">
                <div className="question-identity">
                  <span className="question-order-badge">Câu {activeItem.no}</span>
                  <span className="academic-sep" aria-hidden="true">·</span>
                  <span className="question-type-label">
                    {activeItem.type === 'mcq'
                      ? 'Trắc nghiệm 4 lựa chọn'
                      : activeItem.type === 'tf'
                      ? 'Đúng / Sai'
                      : 'Trả lời ngắn'}
                  </span>
                  {activeItem.topic && (
                    <>
                      <span className="academic-sep" aria-hidden="true">·</span>
                      <span className="question-topic-label">{topicName(meta, activeItem.topic)}</span>
                    </>
                  )}
                </div>

                <div className="row" style={{ gap: 8 }}>
                  <span className={`badge ${STATUS_META[activeStatus].badgeClass}`}>
                    {STATUS_META[activeStatus].label}
                  </span>
                  {Number(data?.times?.[activeItem.qid]) > 0 && (
                    <span className="su-chip" title="Thời gian em làm câu này">
                      {Math.floor(data.times[activeItem.qid] / 60) > 0 ? `${Math.floor(data.times[activeItem.qid] / 60)} phút ` : ''}
                      {Math.round(data.times[activeItem.qid] % 60)} giây
                    </span>
                  )}
                  {activeEntry?.grade && (
                    <span className="small strong tabular-nums" style={{ color: 'var(--ink-2)' }}>
                      {(activeEntry.grade.points / 1000).toLocaleString('vi-VN')} /{' '}
                      {(activeEntry.grade.max / 1000).toLocaleString('vi-VN')} đ
                    </span>
                  )}
                </div>
              </div>

              {/* Tóm tắt đối chiếu Câu trả lời của bạn vs Đáp án đúng */}
              <div className="answer-compare-strip">
                <div className="answer-compare-col">
                  <span className="muted">Câu trả lời của bạn:</span>
                  <strong
                    className="tabular-nums"
                    style={{
                      color:
                        activeStatus === 'right'
                          ? 'var(--good)'
                          : activeStatus === 'blank'
                          ? 'var(--ink-3)'
                          : activeStatus === 'half'
                          ? '#b45309'
                          : 'var(--bad)',
                    }}
                  >
                    {formatStudentAnswer(activeItem, activeResponse)}
                  </strong>
                </div>
                <div className="answer-compare-col">
                  <span className="muted">Đáp án đúng:</span>
                  <strong className="tabular-nums" style={{ color: 'var(--good)' }}>
                    {formatCorrectAnswer(activeItem, activeEntry?.correctAnswer)}
                  </strong>
                </div>
              </div>

              {/* Nội dung câu hỏi + lựa chọn + phân tích lỗi + lời giải */}
              <div className="exam-question-content">
                <QuestionView
                  item={activeItem}
                  response={activeResponse}
                  review={
                    activeEntry
                      ? {
                          correctAnswer: activeEntry.correctAnswer,
                          explanation: activeEntry.explanation,
                          grade: activeEntry.grade,
                          diagnosis: activeEntry.diagnosis,
                        }
                      : null
                  }
                  onZoomImage={(url) => setZoomImageUrl(url)}
                />
              </div>

              {/* Ghi chú Sổ tay lỗi sai & Khiếu nại */}
              {activeNote && editingNoteQid !== activeItem.qid && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    fontSize: 13,
                    color: '#92400e',
                  }}
                >
                  <strong>Note đã lưu vào Sổ tay: </strong>“{activeNote}”
                </div>
              )}

              {editingNoteQid === activeItem.qid ? (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: 'var(--surface-subtle)',
                    border: '1px solid var(--line)',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                    Viết ghi chú rút kinh nghiệm cho Câu {activeItem.no}:
                  </div>
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="Ví dụ: Nhớ kiểm tra điều kiện xác định hoặc đổi đúng đơn vị..."
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
                      onClick={() => handleSaveNote(activeItem.qid)}
                      disabled={savingNote}
                    >
                      {savingNote ? 'Đang lưu…' : 'Lưu vào Sổ tay lỗi sai'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => {
                      setEditingNoteQid(activeItem.qid);
                      setDraftNote(activeNote || '');
                    }}
                  >
                    <BookmarkPlus size={14} />
                    <span>{activeNote ? 'Sửa ghi chú' : 'Ghi chú vào Sổ tay'}</span>
                  </button>
                  {data.kind !== 'practice' && (
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => {
                        setAppealQid(activeItem.qid);
                        setAppealReason('');
                      }}
                    >
                      <MessageSquareWarning size={14} />
                      <span>Khiếu nại câu này</span>
                    </button>
                  )}
                </div>
              )}

              {/* Bottom Navigation Row */}
              <div className="exam-card-action-bar">
                <button
                  type="button"
                  className="btn secondary-btn"
                  disabled={activeIdxInFiltered <= 0}
                  onClick={() => stepFiltered(-1)}
                >
                  ← Câu trước
                </button>

                <div className="action-bar-center-tip">
                  <span className="kbd-shortcut-hint">
                    Phím tắt: <strong>← →</strong> chuyển câu · <strong>Z</strong> phóng to hình
                  </span>
                </div>

                {activeIdxInFiltered < filteredIndices.length - 1 ? (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => stepFiltered(1)}
                  >
                    Câu tiếp →
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn good"
                    onClick={() => go(`/ket-qua/${attemptId}`)}
                  >
                    Về trang kết quả
                  </button>
                )}
              </div>
            </div>
          )}
        </main>

        {/* Right Floating / Docked Answer Palette */}
        {paletteOpen && (
          <aside className="exam-floating-palette" aria-label="Bảng đáp án">
            <div className="palette-header">
              <div className="palette-title-group">
                <h3>Bảng đáp án</h3>
                <span className="palette-count-pill tabular-nums">
                  {counts.right}/{items.length} đúng
                </span>
              </div>
              <button
                type="button"
                className="palette-close-btn"
                onClick={() => setPaletteOpen(false)}
                title="Thu gọn bảng câu hỏi"
              >
                ✕
              </button>
            </div>

            <div className="palette-progress-wrap">
              <div className="palette-progress-bar" aria-hidden="true" style={{ display: 'flex' }}>
                <span
                  style={{
                    width: `${(counts.right / items.length) * 100}%`,
                    background: 'var(--good)',
                    borderRadius: 0,
                  }}
                />
                {counts.half > 0 && (
                  <span
                    style={{
                      width: `${(counts.half / items.length) * 100}%`,
                      background: '#f59e0b',
                      borderRadius: 0,
                    }}
                  />
                )}
                {counts.wrong > 0 && (
                  <span
                    style={{
                      width: `${(counts.wrong / items.length) * 100}%`,
                      background: 'var(--bad)',
                      borderRadius: 0,
                    }}
                  />
                )}
              </div>
              <span className="palette-progress-text tabular-nums">
                Tỷ lệ đúng: {Math.round((counts.right / items.length) * 100)}%
              </span>
            </div>

            <div className="palette-parts-container">
              {(['mcq', 'tf', 'short'] as const).map((type) => {
                const partItems = items.map((x, i) => ({ x, i })).filter(({ x }) => x.type === type);
                if (!partItems.length) return null;
                const partLabel = {
                  mcq: 'Phần I: Trắc nghiệm 4 lựa chọn',
                  tf: 'Phần II: Đúng / Sai',
                  short: 'Phần III: Trả lời ngắn',
                }[type];

                return (
                  <div key={type} className="palette-part-section">
                    <div className="palette-part-title">{partLabel}</div>
                    <div className="palette-grid">
                      {partItems.map(({ x, i }) => {
                        const st = getQuestionStatus(byQ[x.qid]);
                        const isCur = activeItem?.qid === x.qid;
                        const hasNote = Boolean(savedNotes[x.qid]);
                        return (
                          <button
                            key={x.qid}
                            type="button"
                            className={`palette-num-btn ${st} ${isCur ? 'cur' : ''} ${hasNote ? 'has-note' : ''}`}
                            onClick={() => {
                              if (filter !== 'all' && !filteredIndices.includes(i)) {
                                setFilter('all');
                              }
                              goTo(i);
                            }}
                            aria-current={isCur ? 'step' : undefined}
                            aria-label={`Câu ${x.no}, ${STATUS_META[st].label}`}
                          >
                            <span className="num-text tabular-nums">{x.no}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="palette-legend">
              <div className="legend-item">
                <span className="legend-box right" />
                <span>Đúng ({counts.right})</span>
              </div>
              {counts.half > 0 && (
                <div className="legend-item">
                  <span className="legend-box half" />
                  <span>Một phần ({counts.half})</span>
                </div>
              )}
              <div className="legend-item">
                <span className="legend-box wrong" />
                <span>Sai ({counts.wrong})</span>
              </div>
              {counts.blank > 0 && (
                <div className="legend-item">
                  <span className="legend-box blank" />
                  <span>Trống ({counts.blank})</span>
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn primary palette-submit-btn"
              onClick={() => go(`/ket-qua/${attemptId}`)}
            >
              Về tổng kết kết quả
            </button>
            <a
              className="btn sm"
              href="#/so-tay-loi-sai"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Mở Sổ tay lỗi sai →
            </a>
          </aside>
        )}
      </div>

      {/* Modal Khiếu nại (thay thế window.prompt) */}
      {appealQid !== null && (
        <Modal
          title={`Khiếu nại Câu ${items.find((x) => x.qid === appealQid)?.no ?? ''}`}
          onClose={() => !submittingAppeal && setAppealQid(null)}
          width={480}
        >
          <div className="stack" style={{ gap: 12 }}>
            <p className="small muted" style={{ margin: 0, lineHeight: 1.5 }}>
              Nêu rõ lý do em cho rằng đáp án hoặc cách chấm câu này chưa chính xác (tối thiểu 10 ký tự). Giáo viên bộ môn sẽ xem xét và phản hồi trực tiếp.
            </p>
            <textarea
              className="input"
              rows={4}
              autoFocus
              placeholder="Ví dụ: Ở bước biến đổi cuối, kết quả đúng phải là 2,5 vì điều kiện x > 0..."
              value={appealReason}
              onChange={(e) => setAppealReason(e.target.value)}
              style={{ width: '100%', fontSize: 13.5 }}
            />
            <div className="row end" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn"
                disabled={submittingAppeal}
                onClick={() => setAppealQid(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={submittingAppeal || appealReason.trim().length < 10}
                onClick={handleSubmitAppeal}
              >
                {submittingAppeal ? 'Đang gửi…' : 'Gửi khiếu nại'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Image Zoom Modal */}
      <ImageZoomModal
        isOpen={Boolean(zoomImageUrl)}
        onClose={() => setZoomImageUrl(null)}
        imageUrl={zoomImageUrl ?? ''}
        title={activeItem ? `Đồ thị / Hình vẽ minh họa - Câu ${activeItem.no}` : 'Phóng to hình vẽ'}
      />
    </div>
  );
}
