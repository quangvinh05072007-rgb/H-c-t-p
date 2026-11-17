import { useEffect, useState } from 'react';
import { Check, Clock, Send, Users, X } from 'lucide-react';
import { get, post } from '../api';
import { ErrorBox, go, Loading, useApp, useAsync } from './kit';

const toLocal = (ms: number) => {
  const d = new Date(ms - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

export interface AssignExamDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  examId: number;
  examTitle: string;
  durationMin?: number;
  defaultClassId?: number | null;
  onAssigned?: (classIds: number[]) => void;
}

export function AssignExamDrawer({
  isOpen,
  onClose,
  examId,
  examTitle,
  durationMin = 90,
  defaultClassId = null,
  onAssigned,
}: AssignExamDrawerProps) {
  const { toast } = useApp();
  const { data, error, loading, reload } = useAsync(
    () => (isOpen ? get<{ classes: any[] }>('/api/classes?limit=50') : Promise.resolve({ classes: [] })),
    [isOpen],
  );

  const [classIds, setClassIds] = useState<number[]>(defaultClassId ? [defaultClassId] : []);
  const [mode, setMode] = useState<'exam' | 'homework'>('exam');
  const [openAt, setOpenAt] = useState(() => toLocal(Date.now()));
  const [closeAt, setCloseAt] = useState(() => toLocal(Date.now() + 7 * 86400000));
  const [duration, setDuration] = useState<number>(durationMin);
  const [variantMode, setVariantMode] = useState<'per_student' | 'random'>('per_student');
  const [showResult, setShowResult] = useState<'score_only_until_close' | 'after_close' | 'after_submit'>('score_only_until_close');
  const [resultCustom, setResultCustom] = useState(false);
  const [busy, setBusy] = useState(false);

  const selectMode = (next: 'exam' | 'homework') => {
    setMode(next);
    if (!resultCustom) {
      setShowResult(next === 'exam' ? 'score_only_until_close' : 'after_submit');
    }
  };

  useEffect(() => {
    setDuration(durationMin);
  }, [durationMin, examId]);

  useEffect(() => {
    if (defaultClassId && isOpen) {
      setClassIds((prev) => (prev.includes(defaultClassId) ? prev : [...prev, defaultClassId]));
    }
  }, [defaultClassId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const classes = data?.classes ?? [];
  const validSelected = classIds.filter((cid) => classes.some((c: any) => c.id === cid));

  const toggleClass = (cid: number) => {
    setClassIds((prev) => (prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]));
  };

  const handleSubmit = async (stayHere = false) => {
    if (!validSelected.length) {
      toast('Vui lòng chọn ít nhất một lớp học.');
      return;
    }
    setBusy(true);
    try {
      await post('/api/assignments', {
        examId,
        classIds: validSelected,
        mode,
        variantMode,
        openAt: new Date(openAt).getTime(),
        closeAt: new Date(closeAt).getTime(),
        durationMin: mode === 'exam' ? Math.max(5, Number(duration) || durationMin) : durationMin,
        showResult,
      });
      toast(`Đã giao đề "${examTitle}" cho ${validSelected.length} lớp!`);
      onAssigned?.(validSelected);
      onClose();
      if (!stayHere) {
        go(validSelected.length === 1 ? `/lop/${validSelected[0]}/bai-giao` : '/lop-hoc');
      }
    } catch (e: any) {
      toast(e.message || 'Không giao được bài cho lớp.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="assign-drawer-backdrop no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-drawer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="assign-drawer-panel">
        <header className="assign-drawer-head">
          <div style={{ minWidth: 0 }}>
            <span className="assign-drawer-kicker">Giao đề tức thì</span>
            <h2 id="assign-drawer-title">{examTitle}</h2>
          </div>
          <button type="button" className="btn ghost sm" onClick={onClose} aria-label="Đóng ngăn kéo giao bài">
            <X size={16} />
          </button>
        </header>

        <div className="assign-drawer-body stack" style={{ gap: 16 }}>
          {loading ? (
            <Loading text="Đang tải danh sách lớp…" />
          ) : error ? (
            <ErrorBox error={error} onRetry={reload} />
          ) : (
            <>
              <section className="stack" style={{ gap: 8 }}>
                <div className="row between" style={{ alignItems: 'center' }}>
                  <label className="small strong">Chọn lớp nhận bài ({validSelected.length} đã chọn)</label>
                  {classes.length > 1 && (
                    <button
                      type="button"
                      className="btn ghost sm"
                      style={{ fontSize: 12 }}
                      onClick={() =>
                        setClassIds(validSelected.length === classes.length ? [] : classes.map((c: any) => c.id))
                      }
                    >
                      {validSelected.length === classes.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                    </button>
                  )}
                </div>

                {classes.length === 0 ? (
                  <div className="alert warn small">Bạn chưa phụ trách lớp nào. Hãy tạo lớp trước ở mục Lớp học.</div>
                ) : (
                  <div className="assign-class-grid">
                    {classes.map((c: any) => {
                      const checked = validSelected.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleClass(c.id)}
                          className={`assign-class-tile ${checked ? 'is-checked' : ''}`}
                          aria-pressed={checked}
                        >
                          <div className="assign-class-check">
                            {checked && <Check size={13} />}
                          </div>
                          <div style={{ minWidth: 0, textAlign: 'left', flex: 1 }}>
                            <div className="assign-class-name">{c.name}</div>
                            <div className="assign-class-meta tabular-nums">
                              <Users size={11} /> {c.students ?? 0} học sinh · Khối {c.grade || 12}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="stack" style={{ gap: 8 }}>
                <label className="small strong">Hình thức giao bài</label>
                <div className="seg" style={{ width: '100%', display: 'flex' }}>
                  <button
                    type="button"
                    style={{ flex: 1 }}
                    className={mode === 'exam' ? 'on' : ''}
                    onClick={() => selectMode('exam')}
                  >
                    Thi online (tính giờ)
                  </button>
                  <button
                    type="button"
                    style={{ flex: 1 }}
                    className={mode === 'homework' ? 'on' : ''}
                    onClick={() => selectMode('homework')}
                  >
                    Bài tập tự luyện
                  </button>
                </div>
              </section>

              <section className="grid-2" style={{ gap: 10 }}>
                <div className="field">
                  <label htmlFor="drawer-open-at">Mở đề lúc</label>
                  <input
                    id="drawer-open-at"
                    className="input"
                    type="datetime-local"
                    value={openAt}
                    onChange={(e) => setOpenAt(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="drawer-close-at">Hạn đóng bài</label>
                  <input
                    id="drawer-close-at"
                    className="input"
                    type="datetime-local"
                    value={closeAt}
                    onChange={(e) => setCloseAt(e.target.value)}
                  />
                </div>
              </section>

              {mode === 'exam' && (
                <div className="field">
                  <label htmlFor="drawer-duration" className="row" style={{ gap: 6, alignItems: 'center' }}>
                    <Clock size={14} /> Thời gian làm bài (phút)
                  </label>
                  <input
                    id="drawer-duration"
                    className="input"
                    type="number"
                    min={5}
                    max={300}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                  />
                </div>
              )}

              <section className="grid-2" style={{ gap: 10 }}>
                <div className="field">
                  <label htmlFor="drawer-variants">Phân bổ mã đề</label>
                  <select
                    id="drawer-variants"
                    className="input"
                    value={variantMode}
                    onChange={(e) => setVariantMode(e.target.value as any)}
                  >
                    <option value="per_student">Mỗi học sinh một thứ tự riêng</option>
                    <option value="random">Chia đều các mã đề đã tạo</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="drawer-results">Công bố điểm & đáp án</label>
                  <select
                    id="drawer-results"
                    className="input"
                    value={showResult}
                    onChange={(e) => {
                      setResultCustom(true);
                      setShowResult(e.target.value as any);
                    }}
                  >
                    <option value="score_only_until_close">Xem điểm ngay, ẩn đáp án tới khi đóng bài (Khuyên dùng)</option>
                    <option value="after_close">Ẩn cả điểm & đáp án tới khi đóng bài</option>
                    <option value="after_submit">Mở điểm & đáp án ngay sau khi nộp</option>
                  </select>
                </div>
              </section>

              <div className="tiny muted">
                Cần chỉ định mã đề riêng cho từng học sinh?{' '}
                <a
                  href={`#/de-thi/${examId}?tab=assign${defaultClassId ? `&classId=${defaultClassId}` : ''}`}
                  onClick={onClose}
                >
                  Mở cài đặt giao bài nâng cao →
                </a>
              </div>
            </>
          )}
        </div>

        <footer className="assign-drawer-foot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Để sau
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !validSelected.length}
            onClick={() => handleSubmit(true)}
          >
            Giao &amp; Ở lại
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy || !validSelected.length}
            onClick={() => handleSubmit(false)}
          >
            <Send size={14} /> {busy ? 'Đang giao…' : `Giao cho ${validSelected.length || '…'} lớp`}
          </button>
        </footer>
      </aside>
    </div>
  );
}
