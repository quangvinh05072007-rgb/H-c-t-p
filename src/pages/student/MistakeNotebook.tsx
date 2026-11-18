import { useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Lightbulb, PenLine, RotateCcw, Search, TriangleAlert } from 'lucide-react';
import { get, post } from '../../api';
import { ErrorBox, go, Loading, useApp, useAsync } from '../../ui/kit';
import { MathText } from '../../ui/MathText';

interface MistakeItem {
  qid: number;
  type: 'mcq' | 'tf' | 'short';
  stem: string;
  options: string[];
  answer: any;
  explanation: string;
  topic: string;
  topicName: string;
  grade: number;
  level: number;
  wrongCount: number;
  lastWrongAt: number;
  errorType: string;
  errorName: string;
  errorHint: string;
  errorAction: string;
  box: number;
  dueDay: string;
  isDue: boolean;
  note: string;
  tag: 'important' | 'formula_trap' | 'careless' | 'mastered';
  noteUpdatedAt: number | null;
}

interface MistakesResponse {
  mistakes: MistakeItem[];
  totalMistakes: number;
  dueCount: number;
  notedCount: number;
  errorBreakdown: Record<string, number>;
  topWeakTopics: { topic: string; name: string; wrongCount: number }[];
}

type FilterMode = 'all' | 'due' | 'noted' | 'careless' | 'formula' | 'concept';

const TAG_OPTIONS: { key: MistakeItem['tag']; label: string }[] = [
  { key: 'important', label: 'Trọng tâm' },
  { key: 'formula_trap', label: 'Bẫy công thức' },
  { key: 'careless', label: 'Bất cẩn' },
  { key: 'mastered', label: 'Đã khắc phục' },
];
const TAG_LABELS: Record<string, string> = Object.fromEntries(TAG_OPTIONS.map((t) => [t.key, t.label]));

const ERROR_LABELS: Record<string, { label: string; tone: string }> = {
  concept: { label: 'Nhầm khái niệm', tone: 'is-info' },
  formula: { label: 'Nhầm công thức', tone: 'is-warn' },
  transform: { label: 'Lỗi biến đổi', tone: 'is-info' },
  careless: { label: 'Bất cẩn', tone: 'is-bad' },
  blank: { label: 'Bỏ trống', tone: '' },
  flagged: { label: 'Đã đánh dấu', tone: 'is-info' },
};

const TYPE_LABELS: Record<MistakeItem['type'], string> = { mcq: 'Trắc nghiệm', tf: 'Đúng/Sai', short: 'Trả lời ngắn' };
const LEVEL_LABELS: Record<number, string> = { 1: 'Nhận biết', 2: 'Thông hiểu', 3: 'Vận dụng', 4: 'Vận dụng cao' };

/** Bỏ ký hiệu LaTeX/hình để làm dòng xem trước ngắn gọn. */
function previewText(stem: string) {
  return stem
    .replace(/\[\[img:\d+\]\]/g, '[hình]')
    .replace(/\s+/g, ' ')
    .trim();
}

export function MistakeNotebook() {
  const { toast } = useApp();
  const { data, error, loading, reload } = useAsync(() => get<MistakesResponse>('/api/student/mistakes'), []);

  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [openQid, setOpenQid] = useState<number | null>(null);
  const [editingQid, setEditingQid] = useState<number | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [draftTag, setDraftTag] = useState<MistakeItem['tag']>('important');
  const [savingNote, setSavingNote] = useState(false);
  const [startingPractice, setStartingPractice] = useState(false);
  const [showSolution, setShowSolution] = useState<Record<number, boolean>>({});
  const [localNotes, setLocalNotes] = useState<Record<number, { note: string; tag: MistakeItem['tag'] }>>({});
  const [masteredIds, setMasteredIds] = useState<number[]>([]);

  const mistakes = useMemo(() => {
    return (data?.mistakes ?? [])
      .filter((m) => !masteredIds.includes(m.qid))
      .map((m) => (localNotes[m.qid] ? { ...m, ...localNotes[m.qid] } : m));
  }, [data, localNotes, masteredIds]);

  const topics = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of mistakes) map.set(m.topic, m.topicName);
    return Array.from(map.entries());
  }, [mistakes]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return mistakes
      .filter((m) => {
        if (filterMode === 'due' && !m.isDue) return false;
        if (filterMode === 'noted' && !m.note.trim()) return false;
        if (['careless', 'formula', 'concept'].includes(filterMode) && m.errorType !== filterMode) return false;
        if (selectedTopic !== 'all' && m.topic !== selectedTopic) return false;
        if (q && !m.stem.toLowerCase().includes(q) && !m.note.toLowerCase().includes(q) && !m.topicName.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => Number(b.isDue) - Number(a.isDue) || b.wrongCount - a.wrongCount);
  }, [mistakes, filterMode, selectedTopic, searchQuery]);

  if (loading) return <Loading text="Đang mở Sổ tay lỗi sai..." />;
  if (error || !data) return <ErrorBox error={error ?? 'Không tải được sổ tay lỗi sai.'} onRetry={reload} />;

  const dueCount = mistakes.filter((m) => m.isDue).length;
  const notedCount = mistakes.filter((m) => m.note.trim()).length;
  const countOf = (type: string) => mistakes.filter((m) => m.errorType === type).length;
  const topWeak = data.topWeakTopics?.[0] ?? null;
  const examCount = Math.min(10, Math.max(5, (dueCount || filtered.length) || 5));

  const startEditNote = (item: MistakeItem) => {
    setEditingQid(item.qid);
    setDraftNote(item.note);
    setDraftTag(item.tag || 'important');
  };

  const saveNote = async (qid: number) => {
    setSavingNote(true);
    try {
      await post('/api/student/mistakes/note', { qid, note: draftNote, tag: draftTag });
      setLocalNotes((prev) => ({ ...prev, [qid]: { note: draftNote.trim(), tag: draftTag } }));
      setEditingQid(null);
      toast('Đã lưu ghi chú.');
    } catch (err: any) {
      toast(err.message || 'Không thể lưu ghi chú.');
    } finally {
      setSavingNote(false);
    }
  };

  const markMastered = async (qid: number) => {
    try {
      await post('/api/student/mistakes/note', { qid, note: localNotes[qid]?.note || 'Đã hiểu và khắc phục', tag: 'mastered' });
      setMasteredIds((prev) => [...prev, qid]);
      setOpenQid(null);
      toast('Đã chuyển câu này vào mục Đã thuộc.');
    } catch (err: any) {
      toast(err.message || 'Không thể cập nhật trạng thái.');
    }
  };

  const startExam = async (topic?: string) => {
    setStartingPractice(true);
    try {
      const target = topic ?? (selectedTopic !== 'all' ? selectedTopic : undefined);
      const att = await post<{ id: number }>('/api/student/mistakes/practice', {
        topic: target,
        count: examCount,
        title: target ? 'Ôn lỗi sai theo chuyên đề' : 'Ôn lỗi sai tổng hợp',
      });
      go(`/thi/${att.id}`);
    } catch (err: any) {
      toast(err.message || 'Không thể tạo đề ôn.');
      setStartingPractice(false);
    }
  };

  const filters: [FilterMode, string, number][] = [
    ['all', 'Tất cả', mistakes.length],
    ['due', 'Cần ôn', dueCount],
    ['noted', 'Có ghi chú', notedCount],
    ['careless', 'Bất cẩn', countOf('careless')],
    ['formula', 'Công thức', countOf('formula')],
    ['concept', 'Khái niệm', countOf('concept')],
  ];

  const resetFilters = () => {
    setFilterMode('all');
    setSelectedTopic('all');
    setSearchQuery('');
  };

  return (
    <div className="su-page">
      <header className="su-head">
        <div>
          <button type="button" className="su-link" onClick={() => go('/luyen-tap')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <ArrowLeft size={14} aria-hidden="true" /> Đề thi
          </button>
          <h1>Sổ tay lỗi sai</h1>
          <p className="su-sub">Câu làm sai được hẹn ôn lại theo lịch, trả lời đúng nhiều lần sẽ tự rời sổ.</p>
        </div>
        <button type="button" className="btn primary" disabled={startingPractice || mistakes.length === 0} onClick={() => startExam()}>
          <RotateCcw size={15} aria-hidden="true" />
          {dueCount > 0 ? `Ôn ${examCount} câu đến hạn` : `Làm đề ôn ${examCount} câu`}
        </button>
      </header>

      <div className="su-stats" aria-label="Tổng quan sổ tay">
        <span className="su-stat">Đang lưu <b>{mistakes.length}</b> câu</span>
        <span className={`su-stat ${dueCount > 0 ? 'is-warn' : 'is-good'}`}>Cần ôn hôm nay <b>{dueCount}</b></span>
        <span className="su-stat">Có ghi chú <b>{notedCount}</b></span>
        {topWeak && (
          <span className="su-stat" title="Chuyên đề sai nhiều nhất">
            Hay sai nhất <b style={{ fontSize: 13 }}>{topWeak.name}</b>
          </span>
        )}
      </div>

      <div className="su-filterbar">
        <div className="su-pills" role="group" aria-label="Lọc câu sai">
          {filters
            .filter(([key, , n]) => key === 'all' || n > 0 || filterMode === key)
            .map(([key, label, n]) => (
              <button key={key} type="button" aria-pressed={filterMode === key} className={`su-pill ${filterMode === key ? 'on' : ''}`} onClick={() => setFilterMode(key)}>
                {label} {n}
              </button>
            ))}
        </div>
        <span className="su-grow" />
        <div className="su-filter-tools">
          {topics.length > 1 && (
            <select className="su-select" value={selectedTopic} onChange={(e) => setSelectedTopic(e.target.value)} aria-label="Lọc theo chuyên đề">
              <option value="all">Mọi chuyên đề</option>
              {topics.map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          )}
          {mistakes.length > 8 && (
            <label style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, color: 'var(--ink-3)' }} />
              <input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Tìm câu, ghi chú…" aria-label="Tìm câu sai" style={{ paddingLeft: 30, width: 180, minHeight: 32 }} />
            </label>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="su-card su-empty">
          {mistakes.length === 0
            ? 'Sổ tay đang trống. Câu nào làm sai sẽ tự được lưu vào đây.'
            : filterMode === 'due'
              ? 'Hôm nay không có câu nào đến hạn ôn.'
              : 'Không có câu nào trong mục này.'}{' '}
          {(filterMode !== 'all' || selectedTopic !== 'all' || searchQuery) && (
            <button type="button" className="su-link" onClick={resetFilters}>Xem tất cả</button>
          )}
        </div>
      ) : (
        <section className="su-card" style={{ padding: '4px 16px' }} aria-label="Danh sách câu sai">
          <div className="su-list">
            {filtered.map((item) => {
              const open = openQid === item.qid;
              const err = ERROR_LABELS[item.errorType] ?? { label: item.errorName || 'Cần lưu ý', tone: '' };
              const isEditing = editingQid === item.qid;
              return (
                <div key={item.qid} className={`su-mistake ${open ? 'is-open' : ''}`}>
                  {/* Dòng thu gọn: bấm để mở chi tiết */}
                  <button type="button" className="su-mistake-head" aria-expanded={open} onClick={() => setOpenQid(open ? null : item.qid)}>
                    <span className="su-row-main">
                      {!open && <span className="su-mistake-preview"><MathText text={previewText(item.stem)} /></span>}
                      <span className="su-row-meta">
                        <span className={`su-chip ${err.tone}`}>{err.label}</span>
                        <span>{item.topicName}</span>
                        <span>· {TYPE_LABELS[item.type]}</span>
                        {item.note && <span className="su-chip"><PenLine size={11} aria-hidden="true" /> {TAG_LABELS[item.tag] ?? 'Ghi chú'}</span>}
                      </span>
                    </span>
                    <span className="su-mistake-side">
                      {item.isDue ? <span className="su-chip is-warn">Ôn hôm nay</span> : <span className="su-chip">Hẹn {item.dueDay}</span>}
                      <span className="su-row-meta" style={{ margin: 0 }}>{item.wrongCount > 0 ? `Sai ${item.wrongCount} lần` : 'Chưa sai'}</span>
                    </span>
                    <ChevronDown size={16} aria-hidden="true" className="su-mistake-caret" />
                  </button>

                  {open && (
                    <div className="su-mistake-body">
                      <div className="su-mistake-q">
                        <MathText text={item.stem} as="div" />
                      </div>

                      {item.type === 'mcq' && item.options?.length > 0 && (
                        <div className="su-mistake-options">
                          {item.options.map((opt, i) => {
                            const ok = Number(item.answer) === i;
                            return (
                              <div key={i} className={`su-mistake-opt ${ok ? 'is-correct' : ''}`}>
                                <b>{'ABCD'[i]}</b>
                                <span style={{ flex: 1, minWidth: 0 }}><MathText text={opt} /></span>
                                {ok && <Check size={14} aria-hidden="true" />}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {item.type === 'tf' && item.options?.length > 0 && (
                        <div className="su-mistake-options is-single">
                          {item.options.map((opt, i) => {
                            const truth = Array.isArray(item.answer) ? !!item.answer[i] : null;
                            return (
                              <div key={i} className="su-mistake-opt">
                                <b>{'abcd'[i]})</b>
                                <span style={{ flex: 1, minWidth: 0 }}><MathText text={opt} /></span>
                                {truth !== null && <span className={`su-chip ${truth ? 'is-good' : 'is-bad'}`}>{truth ? 'Đúng' : 'Sai'}</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {item.type === 'short' && (
                        <div className="su-mistake-opt is-correct" style={{ alignSelf: 'flex-start' }}>
                          <b>Đáp số</b> <MathText text={String(item.answer ?? '')} />
                        </div>
                      )}

                      <div className="su-mistake-why">
                        <div>
                          <TriangleAlert size={14} aria-hidden="true" color="var(--warn)" />
                          <span><b>Nguyên nhân:</b> {item.errorHint || 'Nhầm ở bước biến đổi hoặc chưa xét đủ điều kiện.'}</span>
                        </div>
                        {item.errorAction && (
                          <div>
                            <Lightbulb size={14} aria-hidden="true" color="var(--primary)" />
                            <span><b>Cách khắc phục:</b> {item.errorAction}</span>
                          </div>
                        )}
                      </div>

                      {/* Ghi chú cá nhân */}
                      {isEditing ? (
                        <div className="su-mistake-note">
                          <div className="su-pills" style={{ flexWrap: 'wrap' }}>
                            {TAG_OPTIONS.map((opt) => (
                              <button key={opt.key} type="button" className={`su-pill ${draftTag === opt.key ? 'on' : ''}`} onClick={() => setDraftTag(opt.key)}>
                                {opt.label}
                              </button>
                            ))}
                          </div>
                          <textarea
                            className="input"
                            rows={2}
                            value={draftNote}
                            onChange={(e) => setDraftNote(e.target.value)}
                            placeholder="Ví dụ: quên đổi dấu khi nhân liên hợp…"
                            style={{ width: '100%', fontSize: 13 }}
                          />
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button type="button" className="btn sm" onClick={() => setEditingQid(null)} disabled={savingNote}>Hủy</button>
                            <button type="button" className="btn sm primary" onClick={() => saveNote(item.qid)} disabled={savingNote}>
                              {savingNote ? 'Đang lưu…' : 'Lưu ghi chú'}
                            </button>
                          </div>
                        </div>
                      ) : item.note ? (
                        <button type="button" className="su-mistake-note is-filled" onClick={() => startEditNote(item)} title="Sửa ghi chú">
                          <PenLine size={13} aria-hidden="true" /> “{item.note}”
                        </button>
                      ) : null}

                      {showSolution[item.qid] && (
                        <div className="su-mistake-solution">
                          <b>Lời giải</b>
                          <MathText text={item.explanation || 'Chưa có lời giải chi tiết cho câu này.'} as="div" />
                        </div>
                      )}

                      <div className="su-mistake-actions">
                        <button type="button" className="btn sm" onClick={() => setShowSolution((p) => ({ ...p, [item.qid]: !p[item.qid] }))}>
                          {showSolution[item.qid] ? 'Ẩn lời giải' : 'Xem lời giải'}
                        </button>
                        {!isEditing && (
                          <button type="button" className="btn sm" onClick={() => startEditNote(item)}>
                            <PenLine size={13} aria-hidden="true" /> {item.note ? 'Sửa ghi chú' : 'Ghi chú'}
                          </button>
                        )}
                        <button type="button" className="btn sm" disabled={startingPractice} onClick={() => startExam(item.topic)}>
                          Luyện chuyên đề này
                        </button>
                        <span className="su-grow" />
                        <span className="su-row-meta" style={{ margin: 0 }} title="Trả lời đúng khi ôn sẽ lên hộp cao hơn và giãn lịch ôn">
                          Hộp {item.box}/5 · Mức {LEVEL_LABELS[item.level] ?? item.level}
                        </span>
                        <button type="button" className="btn sm primary" onClick={() => markMastered(item.qid)}>
                          <Check size={13} aria-hidden="true" /> Đã thuộc
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
