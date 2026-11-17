import { useState, useMemo } from 'react';
import { get, post } from '../../api';
import { ErrorBox, go, Icon, Loading, useApp, useAsync } from '../../ui/kit';
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

const TAG_OPTIONS: { key: MistakeItem['tag']; label: string }[] = [
  { key: 'important', label: '⭐ Trọng tâm cần nhớ' },
  { key: 'formula_trap', label: '📐 Bẫy công thức' },
  { key: 'careless', label: '⚠️ Lỗi bất cẩn' },
  { key: 'mastered', label: '✅ Đã khắc phục' },
];

const TAG_LABELS: Record<string, string> = {
  important: '⭐ Trọng tâm',
  formula_trap: '📐 Bẫy công thức',
  careless: '⚠️ Bất cẩn',
  mastered: '✅ Đã thuộc',
};

// Huy hiệu phân loại kiểu lỗi sai chuyên biệt
function ErrorTypeBadge({ type, name }: { type: string; name?: string }) {
  const meta: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
    concept: { label: name || 'Nhầm khái niệm', color: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe', icon: 'sparkle' },
    formula: { label: name || 'Nhầm công thức', color: '#b45309', bg: '#fffbeb', border: '#fde68a', icon: 'book' },
    transform: { label: name || 'Lỗi biến đổi', color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd', icon: 'refresh' },
    careless: { label: name || 'Lỗi bất cẩn', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', icon: 'flame' },
    blank: { label: 'Bỏ trống câu', color: '#475569', bg: '#f1f5f9', border: '#cbd5e1', icon: 'clock' },
  };

  const style = meta[type] || { label: name || 'Cần lưu ý', color: '#475569', bg: '#f1f5f9', border: '#cbd5e1', icon: 'flag' };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 5,
        fontSize: 11.5,
        fontWeight: 700,
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
      }}
    >
      <Icon name={style.icon} />
      <span>{style.label}</span>
    </span>
  );
}

export function MistakeNotebook({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useApp();
  const { data, error, loading, reload } = useAsync(
    () => get<MistakesResponse>('/api/student/mistakes'),
    []
  );

  const [filterMode, setFilterMode] = useState<'all' | 'due' | 'noted' | 'careless' | 'formula' | 'concept'>('all');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingQid, setEditingQid] = useState<number | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [draftTag, setDraftTag] = useState<MistakeItem['tag']>('important');
  const [savingNote, setSavingNote] = useState(false);
  const [startingPractice, setStartingPractice] = useState(false);
  const [expandedSolutions, setExpandedSolutions] = useState<Record<number, boolean>>({});
  const [localNotes, setLocalNotes] = useState<Record<number, { note: string; tag: MistakeItem['tag'] }>>({});
  const [masteredIds, setMasteredIds] = useState<number[]>([]);

  const mistakes = useMemo(() => {
    const raw = data?.mistakes ?? [];
    return raw
      .filter((m) => !masteredIds.includes(m.qid))
      .map((m) => {
        const override = localNotes[m.qid];
        return override ? { ...m, note: override.note, tag: override.tag } : m;
      });
  }, [data, localNotes, masteredIds]);

  const topics = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of mistakes) {
      map.set(m.topic, m.topicName);
    }
    return Array.from(map.entries());
  }, [mistakes]);

  const filteredMistakes = useMemo(() => {
    return mistakes.filter((m) => {
      if (filterMode === 'due' && !m.isDue) return false;
      if (filterMode === 'noted' && !m.note.trim()) return false;
      if (filterMode === 'careless' && m.errorType !== 'careless') return false;
      if (filterMode === 'formula' && m.errorType !== 'formula') return false;
      if (filterMode === 'concept' && m.errorType !== 'concept') return false;
      if (selectedTopic !== 'all' && m.topic !== selectedTopic) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inStem = m.stem.toLowerCase().includes(q);
        const inNote = m.note.toLowerCase().includes(q);
        const inTopic = m.topicName.toLowerCase().includes(q);
        if (!inStem && !inNote && !inTopic) return false;
      }
      return true;
    });
  }, [mistakes, filterMode, selectedTopic, searchQuery]);

  if (loading) return <Loading text="Đang mở Sổ tay lỗi sai cá nhân..." />;
  if (error || !data) return <ErrorBox error={error ?? 'Không tải được sổ tay lỗi sai.'} onRetry={reload} />;

  const notedCount = mistakes.filter((m) => m.note.trim().length > 0).length;
  const dueCount = mistakes.filter((m) => m.isDue).length;
  const topWeakTopic = data.topWeakTopics?.[0] || null;

  const startEditNote = (item: MistakeItem) => {
    setEditingQid(item.qid);
    setDraftNote(item.note);
    setDraftTag(item.tag || 'important');
  };

  const handleSaveNote = async (qid: number) => {
    setSavingNote(true);
    try {
      await post('/api/student/mistakes/note', {
        qid,
        note: draftNote,
        tag: draftTag,
      });
      setLocalNotes((prev) => ({
        ...prev,
        [qid]: { note: draftNote.trim(), tag: draftTag },
      }));
      setEditingQid(null);
      toast('Đã lưu ghi chú kinh nghiệm vào Sổ tay!');
    } catch (err: any) {
      toast(err.message || 'Không thể lưu ghi chú.');
    } finally {
      setSavingNote(false);
    }
  };

  const handleMarkMastered = async (qid: number) => {
    try {
      await post('/api/student/mistakes/note', {
        qid,
        note: localNotes[qid]?.note || 'Đã hiểu và khắc phục',
        tag: 'mastered',
      });
      setMasteredIds((prev) => [...prev, qid]);
      toast('Chúc mừng! Đã khắc phục câu hỏi và chuyển vào mục Đã thuộc.');
    } catch (err: any) {
      toast(err.message || 'Không thể cập nhật trạng thái.');
    }
  };

  const handleStartMistakeExam = async (opts?: { topic?: string }) => {
    setStartingPractice(true);
    try {
      const targetTopic = opts?.topic ?? (selectedTopic !== 'all' ? selectedTopic : undefined);
      const count = Math.min(10, Math.max(5, filteredMistakes.length || 5));
      const att = await post<{ id: number }>('/api/student/mistakes/practice', {
        topic: targetTopic,
        count,
        title: targetTopic ? 'Đề Quét Sạch Lỗi Sai Chuyên Đề' : 'Đề Quét Sạch Lỗi Sai Tổng Hợp',
      });
      go(`/thi/${att.id}`);
    } catch (err: any) {
      toast(err.message || 'Không thể khởi tạo đề ôn.');
      setStartingPractice(false);
    }
  };

  const toggleSolution = (qid: number) => {
    setExpandedSolutions((prev) => ({ ...prev, [qid]: !prev[qid] }));
  };

  const formatCorrectAnswer = (item: MistakeItem) => {
    if (item.type === 'mcq') {
      const idx = Number(item.answer);
      const letter = ['A', 'B', 'C', 'D'][idx] ?? '?';
      const content = item.options?.[idx] ?? '';
      return `Đáp án chính xác: ${letter}${content ? ` — ${content}` : ''}`;
    }
    if (item.type === 'tf' && Array.isArray(item.answer)) {
      return item.answer
        .map((val: boolean, i: number) => `${['a', 'b', 'c', 'd'][i]}) ${val ? 'Đúng' : 'Sai'}`)
        .join(' · ');
    }
    return `Đáp số chính xác: ${String(item.answer ?? '')}`;
  };

  return (
    <div className="mistake-notebook-page stack" style={{ gap: 16 }}>
      {/* 1. THANH TIÊU ĐỀ & NÚT HÀNH ĐỘNG CHÍNH */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          {!embedded && (
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--ink)' }}>
              Sổ Tay Lỗi Sai
            </h1>
          )}
          <p style={{ margin: embedded ? 0 : '2px 0 0', fontSize: 12.5, color: 'var(--ink-3)' }}>
            Hệ thống lặp lại ngắt quãng (Leitner) biến các lỗ hổng kiến thức thành điểm số vững chắc.
          </p>
        </div>

        <button
          type="button"
          className="btn sm primary"
          disabled={startingPractice || mistakes.length === 0}
          onClick={() => handleStartMistakeExam()}
          style={{ fontWeight: 700, padding: '8px 16px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}
        >
          <Icon name="refresh" /> Làm đề quét lỗi sai ({Math.min(10, Math.max(5, filteredMistakes.length))} câu)
        </button>
      </div>

      {/* 2. DASHBOARD TIẾN ĐỘ HỌC TẬP (4 THẺ THỐNG KÊ GỌN GÀNG) */}
      <div className="mistake-dashboard-strip">
        <div className="mistake-stat-card">
          <div className="stat-card-icon-wrap" style={{ color: '#0369a1' }}>
            <span>📚</span>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-value tabular-nums">{mistakes.length}</span>
            <span className="stat-card-label">Câu sai đang lưu</span>
          </div>
        </div>

        <div className={`mistake-stat-card ${dueCount > 0 ? 'is-urgent' : ''}`}>
          <div className="stat-card-icon-wrap" style={{ color: dueCount > 0 ? '#b91c1c' : '#15803d' }}>
            <span>{dueCount > 0 ? '⚡' : '✅'}</span>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-value tabular-nums" style={{ color: dueCount > 0 ? '#b91c1c' : 'var(--ink)' }}>
              {dueCount}
            </span>
            <span className="stat-card-label">
              {dueCount > 0 ? 'Cần ôn hôm nay (Leitner)' : 'Đã ôn xong hôm nay'}
            </span>
          </div>
        </div>

        <div className="mistake-stat-card">
          <div className="stat-card-icon-wrap" style={{ color: '#b45309' }}>
            <span>📝</span>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-value tabular-nums">{notedCount}</span>
            <span className="stat-card-label">Câu có ghi chú mẹo nhớ</span>
          </div>
        </div>

        <div className="mistake-stat-card">
          <div className="stat-card-icon-wrap" style={{ color: '#6d28d9' }}>
            <span>🎯</span>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-value" style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {topWeakTopic ? topWeakTopic.name : 'Duy trì tốt'}
            </span>
            <span className="stat-card-label">
              {topWeakTopic ? `Chuyên đề sai nhiều (${topWeakTopic.wrongCount} lần)` : 'Không có chuyên đề lệch'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. BỘ LỌC TINH GỌN, HIỆN ĐẠI */}
      <div className="mistake-clean-filter-bar">
        {/* Nhóm Tabs Phân Loại Lỗi */}
        <div className="mistake-filter-tabs" role="tablist" aria-label="Lọc theo dạng lỗi">
          <button
            type="button"
            className={`mistake-tab-chip ${filterMode === 'all' ? 'is-active' : ''}`}
            onClick={() => setFilterMode('all')}
          >
            Tất cả <span className="tab-count-badge">{mistakes.length}</span>
          </button>
          <button
            type="button"
            className={`mistake-tab-chip ${filterMode === 'due' ? 'is-active' : ''} ${dueCount > 0 ? 'is-urgent' : ''}`}
            onClick={() => setFilterMode('due')}
          >
            <span>⚡ Cần ôn</span>
            {dueCount > 0 && <span className="tab-count-badge urgent">{dueCount}</span>}
          </button>
          <button
            type="button"
            className={`mistake-tab-chip ${filterMode === 'noted' ? 'is-active' : ''}`}
            onClick={() => setFilterMode('noted')}
          >
            <span>📝 Đã note</span>
            <span className="tab-count-badge">{notedCount}</span>
          </button>
          <button
            type="button"
            className={`mistake-tab-chip ${filterMode === 'careless' ? 'is-active' : ''}`}
            onClick={() => setFilterMode('careless')}
          >
            <span>⚠️ Bất cẩn</span>
            <span className="tab-count-badge">{data.errorBreakdown?.careless ?? 0}</span>
          </button>
          <button
            type="button"
            className={`mistake-tab-chip ${filterMode === 'formula' ? 'is-active' : ''}`}
            onClick={() => setFilterMode('formula')}
          >
            <span>📐 Công thức</span>
            <span className="tab-count-badge">{data.errorBreakdown?.formula ?? 0}</span>
          </button>
          <button
            type="button"
            className={`mistake-tab-chip ${filterMode === 'concept' ? 'is-active' : ''}`}
            onClick={() => setFilterMode('concept')}
          >
            <span>💡 Khái niệm</span>
            <span className="tab-count-badge">{data.errorBreakdown?.concept ?? 0}</span>
          </button>
        </div>

        {/* Lọc theo chuyên đề + Tìm kiếm */}
        <div className="mistake-controls-group">
          {topics.length > 0 && (
            <select
              className="mistake-topic-select"
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              aria-label="Lọc theo chuyên đề"
            >
              <option value="all">Tất cả chuyên đề ({topics.length})</option>
              {topics.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          )}

          <div className="mistake-search-wrap">
            <span className="mistake-search-icon" aria-hidden="true">🔍</span>
            <input
              className="mistake-search-input"
              type="search"
              placeholder="Tìm câu hỏi, công thức, ghi chú…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Tìm kiếm câu sai"
            />
            {searchQuery && (
              <button
                type="button"
                className="mistake-clear-search-btn"
                onClick={() => setSearchQuery('')}
                title="Xóa tìm kiếm"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. DANH SÁCH THẺ CÂU HỎI LỖI SAI (THIẾT KẾ RÕ RÀNG, CHUYÊN SÂU HỌC TẬP) */}
      {filteredMistakes.length === 0 ? (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: '56px 20px',
            textAlign: 'center',
            color: 'var(--ink-3)',
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 10 }}>🎉</div>
          <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 16 }}>Không có câu sai nào trong mục này!</div>
          <div style={{ fontSize: 13, marginTop: 6, maxWidth: 420, marginInline: 'auto' }}>
            {filterMode === 'due'
              ? 'Tất cả các câu sai đều chưa đến hạn ôn tập hôm nay theo lịch ngắt quãng Leitner.'
              : 'Hãy tiếp tục làm đề để hệ thống tự động ghi nhận và đồng hành cùng bạn sửa chữa mọi điểm yếu.'}
          </div>
          {(filterMode !== 'all' || selectedTopic !== 'all' || searchQuery) && (
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                setFilterMode('all');
                setSelectedTopic('all');
                setSearchQuery('');
              }}
              style={{ marginTop: 14, borderRadius: 6 }}
            >
              Xem tất cả câu sai
            </button>
          )}
        </div>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          {filteredMistakes.map((item, idx) => {
            const isEditing = editingQid === item.qid;
            const showSol = !!expandedSolutions[item.qid];

            return (
              <article
                key={item.qid}
                className={`mistake-question-card ${item.isDue ? 'is-due' : ''}`}
              >
                {/* THANH THÔNG TIN ĐẦU THẺ (CARD TOPBAR) */}
                <div className="mistake-card-topbar">
                  <div className="mistake-meta-left">
                    <span className="mistake-index-chip">#{idx + 1}</span>
                    <span className="mistake-topic-crumb">{item.topicName}</span>
                    <span className="mistake-level-tag">
                      {item.level === 1 ? 'Mức 1 · Nhận biết' : item.level === 2 ? 'Mức 2 · Thông hiểu' : item.level === 3 ? 'Mức 3 · Vận dụng' : 'Mức 4 · Vận dụng cao'}
                    </span>
                    <span className="mistake-level-tag">
                      {item.type === 'mcq' ? 'Trắc nghiệm 4 lựa chọn' : item.type === 'tf' ? 'Đúng / Sai' : 'Trả lời ngắn'}
                    </span>
                    <ErrorTypeBadge type={item.errorType} name={item.errorName} />
                  </div>

                  <div className="mistake-meta-right">
                    <span className="leitner-box-badge" title="Phương pháp Leitner: Trả lời đúng trong đề quét lỗi sẽ tăng bậc">
                      Hộp {item.box}/5
                    </span>

                    {item.isDue ? (
                      <span className="due-status-badge urgent">
                        ⚡ Cần ôn hôm nay
                      </span>
                    ) : (
                      <span className="due-status-badge scheduled">
                        Hẹn ôn: {item.dueDay}
                      </span>
                    )}

                    <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                      Sai <strong className="tabular-nums" style={{ color: '#b91c1c' }}>{item.wrongCount}</strong> lần
                    </span>

                    <button
                      type="button"
                      className="btn-mark-mastered"
                      onClick={() => handleMarkMastered(item.qid)}
                      title="Đã thành thạo câu này, lưu trữ khỏi danh sách cần ôn"
                    >
                      <Icon name="check" /> Đã thuộc
                    </button>
                  </div>
                </div>

                {/* THÂN CÂU HỎI (QUESTION STEM) */}
                <div className="mistake-question-stem">
                  <MathText text={item.stem} as="div" />
                </div>

                {/* CÁC PHƯƠNG ÁN LỰA CHỌN (OPTIONS DISPLAY) */}
                {item.options && item.options.length > 0 && item.type === 'mcq' && (
                  <div className="mistake-options-list">
                    {item.options.map((opt, oIdx) => {
                      const isCorrect = Number(item.answer) === oIdx;
                      const letter = ['A', 'B', 'C', 'D'][oIdx];
                      return (
                        <div
                          key={oIdx}
                          className={`mistake-option-row ${isCorrect ? 'is-correct' : ''}`}
                        >
                          <span className="option-letter-badge">{letter}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <MathText text={opt} />
                          </div>
                          {isCorrect && (
                            <span className="option-correct-tag">
                              <Icon name="check" /> Đáp án đúng
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* DẠNG ĐÚNG / SAI (TF OPTIONS) */}
                {item.options && item.options.length > 0 && item.type === 'tf' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {item.options.map((opt, oIdx) => {
                      const prefix = ['a', 'b', 'c', 'd'][oIdx];
                      const isTrue = Array.isArray(item.answer) ? !!item.answer[oIdx] : null;
                      return (
                        <div
                          key={oIdx}
                          style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: 10,
                            padding: '8px 12px',
                            borderRadius: 8,
                            background: 'var(--surface-subtle)',
                            border: '1px solid var(--line)',
                            fontSize: 13,
                          }}
                        >
                          <strong style={{ color: 'var(--ink)' }}>{prefix})</strong>
                          <div style={{ flex: 1 }}>
                            <MathText text={opt} />
                          </div>
                          {isTrue !== null && (
                            <span
                              style={{
                                fontSize: 11.5,
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 5,
                                background: isTrue ? '#dcfce7' : '#fee2e2',
                                color: isTrue ? '#166534' : '#991b1b',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {isTrue ? '✓ Đúng' : '✗ Sai'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* KHỐI CHẨN ĐOÁN LỖI & HƯỚNG KHẮC PHỤC */}
                <div className="mistake-diagnostic-card">
                  <div className="diagnostic-row">
                    <span className="diagnostic-label">⚠️ Bẫy & Nguyên nhân:</span>
                    <span className="diagnostic-text">
                      {item.errorHint || 'Thường nhầm lẫn trong các bước biến đổi hoặc chưa xác định đủ điều kiện.'}
                    </span>
                  </div>
                  {item.errorAction && (
                    <div className="diagnostic-row">
                      <span className="diagnostic-label" style={{ color: '#0284c7' }}>💡 Hướng khắc phục:</span>
                      <span className="diagnostic-action-text">{item.errorAction}</span>
                    </div>
                  )}
                </div>

                {/* KHỐI GHI CHÚ KINH NGHIỆM CÁ NHÂN */}
                <div className="mistake-note-wrapper">
                  <div className="mistake-note-header">
                    <div className="mistake-note-title">
                      <span>📝 Ghi nhớ cá nhân</span>
                      {item.tag && (
                        <span className="mistake-tag-badge">
                          {TAG_LABELS[item.tag] || item.tag}
                        </span>
                      )}
                    </div>

                    {!isEditing && (
                      <button
                        type="button"
                        className="btn-edit-note"
                        onClick={() => startEditNote(item)}
                      >
                        <Icon name="edit" /> {item.note ? 'Sửa ghi chú' : '+ Thêm ghi chú'}
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="stack" style={{ gap: 8, marginTop: 4 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {TAG_OPTIONS.map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            className={`tag-choice-chip ${draftTag === opt.key ? 'active' : ''}`}
                            onClick={() => setDraftTag(opt.key)}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        className="input"
                        rows={2}
                        value={draftNote}
                        onChange={(e) => setDraftNote(e.target.value)}
                        placeholder="Ghi lại lưu ý cho riêng bạn: VD: Quên đổi dấu khi nhân liên hợp, nhầm cực trị y với điểm cực trị x..."
                        style={{ width: '100%', fontSize: 13, borderRadius: 8, padding: '8px 10px', background: 'var(--surface)' }}
                      />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => setEditingQid(null)}
                          disabled={savingNote}
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          className="btn sm primary"
                          onClick={() => handleSaveNote(item.qid)}
                          disabled={savingNote}
                        >
                          {savingNote ? 'Đang lưu…' : 'Lưu ghi chú'}
                        </button>
                      </div>
                    </div>
                  ) : item.note ? (
                    <div className="mistake-note-content">
                      “{item.note}”
                    </div>
                  ) : (
                    <div
                      className="mistake-note-empty-prompt"
                      onClick={() => startEditNote(item)}
                    >
                      + Nhấp để ghi lại mẹo nhớ hoặc nguyên nhân bạn đã làm sai câu này...
                    </div>
                  )}
                </div>

                {/* KHỐI LỜI GIẢI CHI TIẾT & BÀI CHỮA */}
                <div className="mistake-solution-pane">
                  <div className="mistake-solution-bar">
                    <div className="correct-answer-pill">
                      <Icon name="check" />
                      <span>{formatCorrectAnswer(item)}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        className="btn-toggle-solution"
                        onClick={() => toggleSolution(item.qid)}
                      >
                        <Icon name="eye" />
                        <span>{showSol ? 'Thu gọn lời giải' : 'Xem lời giải chi tiết'}</span>
                      </button>

                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => handleStartMistakeExam({ topic: item.topic })}
                        title="Tạo đề luyện tập gồm các câu hỏi thuộc chuyên đề này"
                        style={{ fontSize: 11.5, padding: '5px 10px', borderRadius: 6 }}
                      >
                        Luyện chuyên đề này →
                      </button>
                    </div>
                  </div>

                  {showSol && (
                    <div className="mistake-full-solution">
                      <div className="solution-subhead">Lời giải chi tiết từng bước:</div>
                      <MathText text={item.explanation || 'Chưa có bài giải chi tiết cho câu này.'} as="div" />
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
