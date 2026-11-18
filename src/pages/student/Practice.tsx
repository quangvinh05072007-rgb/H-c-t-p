import { matchesSearch } from '../../../shared/search.mjs';
import { useMemo, useState } from 'react';
import { BookMarked, Clock, Grid2X2, List, Search, SlidersHorizontal, Timer } from 'lucide-react';
import { get, post } from '../../api';
import { ErrorBox, fmtScore, go, Loading, scoreColor, topicName, useApp, useAsync } from '../../ui/kit';

type PracticeExam = {
  id: number;
  title: string;
  subject: string;
  category?: string;
  grade?: number | null;
  topics?: string[];
  createdAt?: number;
  durationMin: number;
  questionCount: number;
  counts?: { mcq: number; tf: number; short: number };
  variantCount?: number;
  author: string | null;
  completed: boolean;
  inProgress?: boolean;
  attemptCount?: number;
  schoolAttemptCount?: number;
  score10: number | null;
  attemptId: number | null;
};

type PracticeResponse = {
  exams: PracticeExam[];
  totalCount: number;
  completedCount: number;
};

function GradeTag({ grade }: { grade?: number | null }) {
  return grade ? <span className="su-chip">Lớp {grade}</span> : null;
}

export function PracticeHub() {
  const { meta, toast } = useApp();

  const { data, error, loading, reload } = useAsync(
    () => get<PracticeResponse>('/api/student/practice-exams'),
    [],
  );
  const { data: dueInfo } = useAsync(
    () => get<{ count: number; total: number }>('/api/student/review/due').catch(() => ({ count: 0, total: 0 })),
    [],
  );

  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const [selectedFocus, setSelectedFocus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'popular'>('newest');
  const [filterCompleted, setFilterCompleted] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('table');
  const [showMore, setShowMore] = useState(false);
  const [startingId, setStartingId] = useState<number | null>(null);
  const [customBusy, setCustomBusy] = useState<boolean>(false);

  const exams = data?.exams ?? [];
  const completedCount = data?.completedCount ?? 0;
  const totalCount = data?.totalCount ?? exams.length;
  const subjects = useMemo(() => ['all', ...Array.from(new Set(exams.map((e) => e.subject)))], [exams]);

  const categories = useMemo(
    () => Array.from(new Set(exams.map((e) => e.category).filter(Boolean))) as string[],
    [exams],
  );

  const availableTopics = useMemo(() => {
    const codes = new Set<string>();
    for (const ex of exams) {
      if (selectedSubject !== 'all' && ex.subject !== selectedSubject) continue;
      for (const tp of ex.topics ?? []) codes.add(tp);
    }
    return Array.from(codes).slice(0, 18);
  }, [exams, selectedSubject]);

  const filteredExams = useMemo(() => {
    const list = exams.filter((e) => {
      if (selectedSubject !== 'all' && e.subject !== selectedSubject) return false;
      if (selectedGrade !== 'all' && String(e.grade ?? '') !== selectedGrade) return false;
      if (selectedFocus !== 'all') {
        if (selectedFocus.startsWith('cat:')) {
          if (e.category !== selectedFocus.slice(4)) return false;
        } else if (selectedFocus.startsWith('topic:')) {
          const code = selectedFocus.slice(6);
          if (!(e.topics ?? []).includes(code)) return false;
        }
      }
      if (filterCompleted && !e.completed) return false;
      if (search.trim()) {
        const hit =
          matchesSearch(e.title, search) ||
          matchesSearch(e.subject, search) ||
          matchesSearch(e.author || '', search) ||
          matchesSearch(e.category || '', search);
        if (!hit) return false;
      }
      return true;
    });

    const sorted = [...list];
    if (sortBy === 'popular') {
      sorted.sort((a, b) => (b.schoolAttemptCount ?? 0) - (a.schoolAttemptCount ?? 0) || b.id - a.id);
    } else {
      sorted.sort((a, b) => (b.createdAt ?? b.id) - (a.createdAt ?? a.id) || b.id - a.id);
    }
    return sorted;
  }, [exams, filterCompleted, search, selectedFocus, selectedGrade, selectedSubject, sortBy]);

  const startExam = async (examId: number) => {
    setStartingId(examId);
    try {
      const att = await post<any>('/api/student/practice-exams/start', { examId });
      go(`/thi/${att.id}`);
    } catch (err: any) {
      toast(err.message || 'Không thể bắt đầu làm đề.');
      setStartingId(null);
    }
  };

  const [mockBusy, setMockBusy] = useState(false);
  const startMock = async () => {
    setMockBusy(true);
    try {
      const att = await post<any>('/api/practice/start', { mode: 'mock' });
      go(`/thi/${att.id}`);
    } catch (err: any) {
      toast(err.message || 'Không thể tạo đề thi thử.');
      setMockBusy(false);
    }
  };

  const resetFilters = () => {
    setSelectedSubject('all');
    setSelectedGrade('all');
    setSelectedFocus('all');
    setFilterCompleted(false);
    setSearch('');
  };

  const hasActiveFilter =
    selectedSubject !== 'all' ||
    selectedGrade !== 'all' ||
    selectedFocus !== 'all' ||
    filterCompleted ||
    search.trim().length > 0;

  const dueCount = dueInfo?.count ?? 0;

  const examAction = (exam: PracticeExam) => {
    const isStarting = startingId === exam.id;
    return (
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {exam.completed && exam.attemptId && (
          <a href={`#/ket-qua/${exam.attemptId}`} className="btn sm" onClick={(e) => e.stopPropagation()}>
            Kết quả
          </a>
        )}
        <button
          type="button"
          className={`btn sm ${exam.inProgress ? 'primary' : ''}`}
          disabled={isStarting}
          onClick={(e) => {
            e.stopPropagation();
            startExam(exam.id);
          }}
        >
          {isStarting ? 'Đang mở…' : exam.inProgress ? 'Làm tiếp' : exam.completed ? 'Làm lại' : 'Làm bài'}
        </button>
      </div>
    );
  };

  const examStatus = (exam: PracticeExam) =>
    exam.completed ? (
      <strong className="tabular-nums" style={{ color: scoreColor(exam.score10) }}>
        {exam.score10 !== null ? `${fmtScore(exam.score10)}/10` : 'Đã nộp'}
      </strong>
    ) : exam.inProgress ? (
      <span className="su-chip is-warn">Đang làm</span>
    ) : null;

  const examMeta = (exam: PracticeExam) => (
    <>
      <span>
        <Clock size={12} aria-hidden="true" style={{ verticalAlign: -1 }} /> {exam.durationMin} phút
      </span>
      <span>{exam.questionCount} câu</span>
      {exam.author && <span>{exam.author}</span>}
    </>
  );

  return (
    <div className="su-page">
      <header className="su-head">
        <div>
          <h1>Đề thi</h1>
          <p className="su-sub">{`${totalCount} đề · ${completedCount} đã làm`}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={() => go('/so-tay-loi-sai')}>
            <BookMarked size={15} aria-hidden="true" />
            Sổ tay lỗi sai{dueCount > 0 ? ` (${dueCount} cần ôn)` : ''}
          </button>
          <button type="button" className="btn primary" disabled={mockBusy} onClick={startMock} title="Đề 12 trắc nghiệm, 4 đúng/sai, 6 trả lời ngắn, 90 phút, chấm theo thang của Bộ">
            <Timer size={15} aria-hidden="true" />
            {mockBusy ? 'Đang ghép đề…' : 'Thi thử THPT · 90 phút'}
          </button>
        </div>
      </header>

      {loading ? (
        <Loading text="Đang mở kho đề…" />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : (
        <>
          {/* Một hàng lọc: môn học + tìm kiếm + nút mở bộ lọc thêm */}
          <div className="su-filterbar">
            <span className="su-grow" />
            <label style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, color: 'var(--ink-3)' }} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm đề…"
                aria-label="Tìm theo tên đề thi"
                style={{ paddingLeft: 30, width: 190, minHeight: 34 }}
              />
            </label>
            <button
              type="button"
              className={`btn sm ${showMore || hasActiveFilter ? 'primary' : ''}`}
              aria-expanded={showMore}
              onClick={() => setShowMore((v) => !v)}
            >
              <SlidersHorizontal size={14} aria-hidden="true" /> Lọc
            </button>
            <div className="seg su-hide-mobile" role="group" aria-label="Kiểu hiển thị">
              <button type="button" className={viewMode === 'table' ? 'on' : ''} aria-pressed={viewMode === 'table'} onClick={() => setViewMode('table')} title="Danh sách">
                <List size={15} aria-hidden="true" />
              </button>
              <button type="button" className={viewMode === 'card' ? 'on' : ''} aria-pressed={viewMode === 'card'} onClick={() => setViewMode('card')} title="Thẻ">
                <Grid2X2 size={15} aria-hidden="true" />
              </button>
            </div>
          </div>

          {showMore && (
            <div className="su-filterbar">
              <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)} aria-label="Lọc theo khối lớp">
                <option value="all">Mọi khối</option>
                <option value="12">Lớp 12</option>
                <option value="11">Lớp 11</option>
                <option value="10">Lớp 10</option>
              </select>
              <select value={selectedFocus} onChange={(e) => setSelectedFocus(e.target.value)} aria-label="Lọc theo dạng đề hoặc chuyên đề">
                <option value="all">Mọi dạng đề & chuyên đề</option>
                {categories.length > 0 && (
                  <optgroup label="Dạng đề">
                    {categories.map((c) => (
                      <option key={c} value={`cat:${c}`}>{c}</option>
                    ))}
                  </optgroup>
                )}
                {availableTopics.length > 0 && (
                  <optgroup label="Chuyên đề">
                    {availableTopics.map((code) => (
                      <option key={code} value={`topic:${code}`}>{topicName(meta, code)}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'newest' | 'popular')} aria-label="Sắp xếp danh sách đề">
                <option value="newest">Mới nhất</option>
                <option value="popular">Nhiều lượt thi</option>
              </select>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={filterCompleted} onChange={(e) => setFilterCompleted(e.target.checked)} />
                Chỉ đề đã làm
              </label>
              {hasActiveFilter && (
                <button type="button" className="su-link" onClick={resetFilters}>Xóa lọc</button>
              )}
            </div>
          )}

          {filteredExams.length === 0 ? (
            <div className="su-card su-empty">
              Không có đề phù hợp.{' '}
              {hasActiveFilter && <button type="button" className="su-link" onClick={resetFilters}>Xóa bộ lọc</button>}
            </div>
          ) : viewMode === 'table' ? (
            <section className="su-card" style={{ padding: '4px 16px' }} aria-label="Danh sách đề">
              <div className="su-list">
                {filteredExams.map((exam) => (
                  <div key={exam.id} className="su-row">
                    <div className="su-row-main">
                      <div className="su-row-title">{exam.title}</div>
                      <div className="su-row-meta">
                        <GradeTag grade={exam.grade} />
                        {examMeta(exam)}
                      </div>
                    </div>
                    {examStatus(exam)}
                    {examAction(exam)}
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <div className="su-exam-grid">
              {filteredExams.map((exam) => (
                <article key={exam.id} className="su-card su-exam" onClick={() => startingId === null && startExam(exam.id)}>
                  <div className="su-exam-top">
                    <GradeTag grade={exam.grade} />
                    {examStatus(exam)}
                  </div>
                  <div className="su-exam-title">{exam.title}</div>
                  <div className="su-exam-meta">{examMeta(exam)}</div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{examAction(exam)}</div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
