import { useEffect, useRef, useState } from 'react';
import { get, post } from '../../api';
import { MathText } from '../../ui/MathText';
import { go, Icon, Loading, topicName, useApp } from '../../ui/kit';
import { saveBuilderHandoff } from '../../utils/examHandoff';

interface QuestionItem {
  id: number;
  type: 'mcq' | 'tf' | 'short';
  stem: string;
  options: string[];
  answer: any;
  explanation: string;
  topic: string;
  level: number;
  status: string;
  source: string;
  stats?: { n: number; p: number } | null;
  problems?: string[];
  explanationDraft?: string | null;
  approvals?: number[];
  sample?: number;
}

const TYPE_LABEL: Record<string, string> = {
  mcq: 'Trắc nghiệm',
  tf: 'Đúng / Sai',
  short: 'Trả lời ngắn',
};

const LEVEL_LABEL: Record<number, string> = {
  1: 'Biết',
  2: 'Hiểu',
  3: 'Vận dụng',
};

export function InfiniteQuestionBank({
  onEdit,
  onHistory,
  onDiscuss,
  onCreateExamFromIds,
  classId = null,
}: {
  onEdit?: (q: QuestionItem) => void;
  onHistory?: (id: number) => void;
  onDiscuss?: (id: number) => void;
  onCreateNew?: () => void;
  onCreateExamFromIds?: (ids: number[]) => void;
  classId?: number | null;
}) {
  const { meta, toast } = useApp();

  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [offset, setOffset] = useState<number>(0);

  // Filters (single unified row)
  const [search, setSearch] = useState<string>('');
  const [status, setStatus] = useState<string>('all');
  const [type, setType] = useState<string>('');
  const [topic, setTopic] = useState<string>('');
  const [grade, setGrade] = useState<string>('');
  const [level, setLevel] = useState<string>('');

  // Multi-select & bulk state
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [lastBulkId, setLastBulkId] = useState<number | null>(null);
  const [busyBulk, setBusyBulk] = useState(false);

  // Selected for quick preview drawer
  const [previewQuestion, setPreviewQuestion] = useState<QuestionItem | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadBatch = async (reset = false) => {
    if (loading && !reset) return;
    setLoading(true);

    const currentOffset = reset ? 0 : offset;
    const params = new URLSearchParams();
    params.set('limit', '25');
    params.set('offset', String(currentOffset));
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    if (topic) params.set('topic', topic);
    if (grade) params.set('grade', grade);
    if (level) params.set('level', level);
    if (search.trim()) params.set('q', search.trim());

    try {
      const res = await get<any>(`/api/questions?${params.toString()}`);
      const newItems: QuestionItem[] = res.questions || [];
      setTotalCount(res.total ?? newItems.length);
      setHasMore(res.hasMore ?? newItems.length === 25);

      if (reset) {
        setQuestions(newItems);
        setOffset(newItems.length);
      } else {
        setQuestions((prev) => {
          const existing = new Set(prev.map((x) => x.id));
          return [...prev, ...newItems.filter((x) => !existing.has(x.id))];
        });
        setOffset(currentOffset + newItems.length);
      }
    } catch (err: any) {
      toast(err.message || 'Lỗi khi tải ngân hàng câu hỏi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBatch(true);
  }, [status, type, topic, grade, level, search]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadBatch(false);
        }
      },
      { threshold: 0.1, rootMargin: '200px' },
    );

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, loading, offset]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleBulkApprove = async () => {
    if (!selectedIds.length) return;
    setBusyBulk(true);
    try {
      const r = await post<any>('/api/questions/approve', { ids: selectedIds });
      toast(
        `Đã duyệt ${r.approved.length} câu${r.pending?.length ? `, ${r.pending.length} câu chờ lượt 2` : ''}${r.rejected?.length ? `, ${r.rejected.length} câu thiếu thông tin` : ''}.`,
      );
      setSelectedIds([]);
      loadBatch(true);
    } catch (e: any) {
      toast(e.message || 'Không duyệt được câu hỏi.');
    } finally {
      setBusyBulk(false);
    }
  };

  const handleBulkUpdate = async (action: 'set_topic' | 'set_level', value: string) => {
    if (!value || !selectedIds.length) return;
    setBusyBulk(true);
    try {
      const r = await post<any>('/api/questions/bulk', { ids: selectedIds, action, value });
      setLastBulkId(r.batchId);
      toast(`Đã cập nhật ${r.changed} câu hỏi.`);
      loadBatch(true);
    } catch (e: any) {
      toast(e.message || 'Không cập nhật hàng loạt được.');
    } finally {
      setBusyBulk(false);
    }
  };

  const handleUndoBulk = async () => {
    if (!lastBulkId) return;
    try {
      const r = await post<any>(`/api/questions/bulk/${lastBulkId}/undo`, {});
      toast(`Đã hoàn tác ${r.restored} câu hỏi.`);
      setLastBulkId(null);
      loadBatch(true);
    } catch (e: any) {
      toast(e.message || 'Không hoàn tác được.');
    }
  };

  const handleArchiveSelected = async () => {
    if (!selectedIds.length) return;
    if (!confirm(`Ẩn ${selectedIds.length} câu khỏi ngân hàng? Đề cũ đã dùng câu này vẫn giữ nguyên.`)) return;
    setBusyBulk(true);
    try {
      await post('/api/questions/archive', { ids: selectedIds });
      toast(`Đã ẩn ${selectedIds.length} câu hỏi.`);
      setSelectedIds([]);
      loadBatch(true);
    } catch (e: any) {
      toast(e.message || 'Lỗi khi ẩn câu hỏi.');
    } finally {
      setBusyBulk(false);
    }
  };

  const handleOpenInBuilder = async () => {
    if (!selectedIds.length) return;
    setBusyBulk(true);
    try {
      await post('/api/questions/approve', { ids: selectedIds }).catch(() => {});
      const chosen = questions.filter((q) => selectedIds.includes(q.id));
      const questionsMap: Record<number, any> = {};
      for (const q of chosen) questionsMap[q.id] = q;
      saveBuilderHandoff({
        title: `Đề chọn lọc từ ngân hàng (${chosen.length} câu)`,
        durationMin: Math.max(15, Math.round(chosen.length * 2)),
        items: chosen.map((q) => ({
          qid: q.id,
          type: q.type,
          topic: q.topic,
          level: q.level,
        })),
        questions: questionsMap,
        classId,
        source: 'bank',
      });
      go(`/ra-de?handoff=1${classId ? `&classId=${classId}` : ''}`);
    } catch (e: any) {
      toast(e.message || 'Không chuyển được sang Xưởng A4.');
    } finally {
      setBusyBulk(false);
    }
  };


  const allLoadedSelected = questions.length > 0 && questions.every((q) => selectedIds.includes(q.id));

  return (
    <div className="stack" style={{ position: 'relative', gap: 12 }}>
      {/* Single-Row Unified Filter Bar */}
      <div className="teacher-filter-bar">
        <div style={{ flex: '1 1 220px', position: 'relative' }}>
          <input
            type="text"
            className="input"
            style={{ width: '100%', paddingLeft: 32, minHeight: 34, fontSize: 13 }}
            placeholder="Tìm nội dung câu hỏi, công thức…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ position: 'absolute', left: 10, top: 9, color: 'var(--ink-3)', pointerEvents: 'none' }}>
            <Icon name="search" />
          </div>
          {search && (
            <button
              type="button"
              className="btn ghost sm"
              style={{ position: 'absolute', right: 4, top: 3, padding: '2px 6px' }}
              onClick={() => setSearch('')}
              aria-label="Xóa tìm kiếm"
            >
              ✕
            </button>
          )}
        </div>

        <select
          className="input"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          style={{ width: 'auto', minHeight: 34, fontSize: 12.5, maxWidth: 200 }}
          aria-label="Chuyên đề"
        >
          <option value="">Tất cả chuyên đề</option>
          {meta.topics.map((t) => (
            <option key={t.code} value={t.code}>
              Lớp {t.grade}: {t.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          className={`btn sm ${showMoreFilters || grade || type || level || status !== 'all' ? 'primary' : ''}`}
          aria-expanded={showMoreFilters}
          onClick={() => setShowMoreFilters((v) => !v)}
        >
          Lọc{[grade, type, level, status !== 'all' ? status : ''].filter(Boolean).length ? ` (${[grade, type, level, status !== 'all' ? status : ''].filter(Boolean).length})` : ''}
        </button>
        <span className="tiny muted tabular-nums" style={{ marginLeft: 'auto' }}>
          {questions.length}/{totalCount} câu
        </span>
      </div>

      {showMoreFilters && (
        <div className="teacher-filter-bar">
        <select
          className="input"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          style={{ width: 'auto', minHeight: 34, fontSize: 12.5 }}
          aria-label="Khối lớp"
        >
          <option value="">Mọi khối</option>
          <option value="12">Khối 12</option>
          <option value="11">Khối 11</option>
          <option value="10">Khối 10</option>
        </select>

          <select
          className="input"
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={{ width: 'auto', minHeight: 34, fontSize: 12.5 }}
          aria-label="Loại câu hỏi"
        >
          <option value="">Mọi dạng câu</option>
          <option value="mcq">Trắc nghiệm 4 chọn 1</option>
          <option value="tf">Đúng / Sai (4 ý)</option>
          <option value="short">Trả lời ngắn</option>
        </select>

          <select
          className="input"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          style={{ width: 'auto', minHeight: 34, fontSize: 12.5 }}
          aria-label="Mức độ nhận thức"
        >
          <option value="">Mọi mức độ</option>
          <option value="1">Biết</option>
          <option value="2">Hiểu</option>
          <option value="3">Vận dụng</option>
        </select>

          <select
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ width: 'auto', minHeight: 34, fontSize: 12.5 }}
          aria-label="Trạng thái"
        >
          <option value="all">Mọi trạng thái</option>
          <option value="approved">Đã duyệt</option>
          <option value="draft">Bản nháp</option>
        </select>
        </div>
      )}

      {/* Multi-Select & Batch Action Bar */}
      <div className="teacher-batch-bar">
        <label className="row tiny strong" style={{ gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={allLoadedSelected}
            onChange={() =>
              setSelectedIds(allLoadedSelected ? [] : questions.map((q) => q.id))
            }
          />
          {selectedIds.length > 0 ? `Đã chọn ${selectedIds.length} câu` : 'Chọn nhiều câu để soạn đề hoặc sửa hàng loạt'}
        </label>

        {selectedIds.length > 0 && (
          <>
            <button type="button" className="btn primary sm" disabled={busyBulk} onClick={handleOpenInBuilder}>
              Đưa vào Xưởng A4
            </button>
            {onCreateExamFromIds && (
              <button type="button" className="btn sm" disabled={busyBulk} onClick={() => onCreateExamFromIds(selectedIds)}>
                Lưu thành đề mới
              </button>
            )}
            <button type="button" className="btn good sm" disabled={busyBulk} onClick={handleBulkApprove}>
              Duyệt
            </button>
            <select
              className="input sm"
              style={{ width: 'auto', minHeight: 30, fontSize: 12 }}
              value=""
              disabled={busyBulk}
              onChange={(e) => handleBulkUpdate('set_topic', e.target.value)}
              aria-label="Đổi chuyên đề hàng loạt"
            >
              <option value="">Đổi chuyên đề…</option>
              {meta.topics.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              className="input sm"
              style={{ width: 'auto', minHeight: 30, fontSize: 12 }}
              value=""
              disabled={busyBulk}
              onChange={(e) => handleBulkUpdate('set_level', e.target.value)}
              aria-label="Đổi mức độ hàng loạt"
            >
              <option value="">Đổi mức độ…</option>
              {[1, 2, 3].map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </select>
            <button type="button" className="btn danger sm" disabled={busyBulk} onClick={handleArchiveSelected}>
              Ẩn
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setSelectedIds([])}>
              Bỏ chọn
            </button>
          </>
        )}

        {lastBulkId && (
          <button type="button" className="btn sm" style={{ marginLeft: 'auto' }} onClick={handleUndoBulk}>
            Hoàn tác hàng loạt
          </button>
        )}
      </div>

      {/* Questions Stream */}
      <div className="su-card su-bank-list">
        {questions.map((q) => {
          const isPreview = previewQuestion?.id === q.id;
          const isChecked = selectedIds.includes(q.id);

          return (
            <div
              key={q.id}
              className={`su-bank-row ${isChecked ? 'is-checked' : ''} ${isPreview ? 'is-preview' : ''}`}
              onClick={() => setPreviewQuestion(q)}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleSelect(q.id)}
                aria-label={`Chọn câu #${q.id}`}
              />
              <div className="su-row-main">
                <div className="su-bank-stem"><MathText text={q.stem.replace(/\[\[img:\d+\]\]/g, '[hình]').replace(/\s+/g, ' ')} /></div>
                <div className="su-row-meta">
                  <span className="tabular-nums">#{q.id}</span>
                  <span className={`su-chip ${q.status === 'approved' ? 'is-good' : 'is-warn'}`}>{q.status === 'approved' ? 'Đã duyệt' : 'Nháp'}</span>
                  <span>{TYPE_LABEL[q.type] || q.type}</span>
                  <span>· {LEVEL_LABEL[q.level] || `Mức ${q.level}`}</span>
                  <span>· {topicName(meta, q.topic)}</span>
                </div>
              </div>
              <div className="su-bank-actions" onClick={(e) => e.stopPropagation()}>
                {onEdit && <button type="button" className="btn ghost sm" onClick={() => onEdit(q)}>Sửa</button>}
                {onHistory && <button type="button" className="btn ghost sm" onClick={() => onHistory(q.id)}>Lịch sử</button>}
                {onDiscuss && <button type="button" className="btn ghost sm" onClick={() => onDiscuss(q.id)}>Góp ý</button>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Infinite Scroll Sentinel */}
      <div ref={sentinelRef} style={{ height: 56, display: 'grid', placeItems: 'center' }}>
        {loading && <Loading text="Đang tải thêm câu hỏi…" />}
        {!loading && questions.length === 0 && (
          <span className="small muted">Không tìm thấy câu hỏi nào khớp bộ lọc.</span>
        )}
        {!loading && !hasMore && questions.length > 0 && (
          <span className="tiny muted">✓ Đã hiển thị toàn bộ {totalCount} câu hỏi khớp bộ lọc</span>
        )}
      </div>

      {/* Quick Preview Slide-out Panel */}
      {previewQuestion && (
        <div className="quick-preview-panel">
          <div className="row between mb" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
            <div className="meta-inline-line">
              <strong className="tabular-nums" style={{ color: 'var(--ink)' }}>#{previewQuestion.id}</strong>
              <span>·</span>
              <span>{TYPE_LABEL[previewQuestion.type] || previewQuestion.type}</span>
              <span>·</span>
              <span>{LEVEL_LABEL[previewQuestion.level] || ''}</span>
            </div>
            <button type="button" className="btn ghost sm" onClick={() => setPreviewQuestion(null)}>
              ✕ Đóng
            </button>
          </div>

          <div className="tiny muted mb strong">{topicName(meta, previewQuestion.topic)}</div>

          <div className="mb" style={{ fontSize: 15.5, lineHeight: 1.55 }}>
            <MathText as="div" text={previewQuestion.stem} />
          </div>

          {previewQuestion.type !== 'short' && (
            <div className="stack mb" style={{ gap: 8 }}>
              {previewQuestion.options?.map((opt, i) => {
                const ok =
                  previewQuestion.type === 'mcq'
                    ? previewQuestion.answer === i
                    : Array.isArray(previewQuestion.answer)
                    ? previewQuestion.answer[i]
                    : null;
                return (
                  <div
                    key={i}
                    className="card flat"
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      background: ok ? '#f0fdf4' : '#ffffff',
                      border: ok ? '1px solid #86efac' : '1px solid var(--line)',
                    }}
                  >
                    <b>{previewQuestion.type === 'mcq' ? 'ABCD'[i] + '.' : 'abcd'[i] + ')'}</b> <MathText text={opt} />
                    {ok && (
                      <span className="small strong" style={{ marginLeft: 8, color: 'var(--good)' }}>
                        ✓ Đúng
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {previewQuestion.type === 'short' && (
            <div className="card flat mb" style={{ background: '#f8fafc', padding: 12, borderRadius: 10 }}>
              Đáp án số: <b>{String(previewQuestion.answer ?? '—')}</b>
            </div>
          )}

          {previewQuestion.explanation && (
            <div className="feedback-box" style={{ background: '#f0f7ff', border: '1px solid #bfdbfe', color: '#1e40af' }}>
              <div className="strong small mb">Lời giải chi tiết</div>
              <MathText as="div" text={previewQuestion.explanation} />
            </div>
          )}

          <div className="row between mt" style={{ paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            {onEdit && (
              <button
                type="button"
                className="btn primary sm"
                onClick={() => {
                  onEdit(previewQuestion);
                  setPreviewQuestion(null);
                }}
              >
                Chỉnh sửa câu này
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
