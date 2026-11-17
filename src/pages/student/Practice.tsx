import { matchesSearch } from '../../../shared/search.mjs';
import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Clock, FileCheck2, Grid2X2, List, Search, Users } from 'lucide-react';
import { get, post } from '../../api';
import { ErrorBox, fmtScore, go, Icon, Loading, scoreColor, topicName, useApp, useAsync } from '../../ui/kit';
import { MistakeNotebook } from './MistakeNotebook';

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

const SUBJECT_STYLES: Record<string, { bg: string; color: string; border: string; accent: string; icon: string }> = {
  'Toán': { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', accent: '#047857', icon: 'math' },
  'Vật lí': { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', accent: '#2563eb', icon: 'atom' },
  'Hóa học': { bg: '#fffbeb', color: '#b45309', border: '#fde68a', accent: '#d97706', icon: 'flask' },
  'Sinh học': { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0', accent: '#15803d', icon: 'leaf' },
  'Tiếng Anh': { bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff', accent: '#7e22ce', icon: 'language' },
};

function getSubjectStyle(subject: string) {
  return (
    SUBJECT_STYLES[subject] || {
      bg: '#f1f5f9',
      color: '#334155',
      border: '#cbd5e1',
      accent: '#1e4d3b',
      icon: 'exam',
    }
  );
}

function SubjectBadge({ subject }: { subject: string }) {
  const style = getSubjectStyle(subject);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 700,
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
      }}
    >
      <Icon name={style.icon} />
      <span>{subject}</span>
    </span>
  );
}

export function PracticeHub({ initialTab = 'exams' }: { initialTab?: 'exams' | 'mistakes' }) {
  const { meta, toast } = useApp();
  const [tab, setTab] = useState<'exams' | 'mistakes'>(initialTab);
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

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
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
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

  const handleStartMistakeExam = async () => {
    setCustomBusy(true);
    try {
      const att = await post<any>('/api/student/mistakes/practice', {
        count: 10,
        title: 'Đề Quét Sạch Lỗi Sai',
      });
      go(`/thi/${att.id}`);
    } catch (err: any) {
      toast(err.message || 'Chưa có câu sai nào để tạo đề.');
      setCustomBusy(false);
    }
  };

  const switchTab = (next: 'exams' | 'mistakes') => {
    setTab(next);
    go(next === 'mistakes' ? '/so-tay-loi-sai' : '/luyen-tap');
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

  return (
    <div className="practice-hub-container stack" style={{ gap: 14 }}>
      {/* HÀNG 1: TIÊU ĐỀ + TÌM KIẾM + CHUYỂN ĐỔI THẺ/BẢNG + TAB SỔ TAY LỖI SAI */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>
              {tab === 'mistakes' ? 'Đề thi · Sổ tay lỗi sai' : 'Kho Đề Thi'}
            </h1>
            {tab === 'exams' && !loading && (
              <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 500, marginTop: 2 }}>
                {totalCount} đề thi · {completedCount} đã hoàn thành
              </div>
            )}
          </div>

          <div className="review-filter-group" role="tablist" aria-label="Chế độ Đề thi">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'exams'}
              className={`review-filter-btn ${tab === 'exams' ? 'active' : ''}`}
              onClick={() => switchTab('exams')}
            >
              Kho đề thi ({totalCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'mistakes'}
              className={`review-filter-btn ${tab === 'mistakes' ? 'active' : ''}`}
              onClick={() => switchTab('mistakes')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <span>Sổ tay lỗi sai</span>
              {(dueInfo?.count ?? 0) > 0 ? (
                <span className="badge red tabular-nums" style={{ fontSize: 10.5, padding: '1px 6px' }}>
                  {dueInfo?.count} cần ôn
                </span>
              ) : (dueInfo?.total ?? 0) > 0 ? (
                <span className="tabular-nums" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                  ({dueInfo?.total})
                </span>
              ) : null}
            </button>
          </div>
        </div>

        {tab === 'exams' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: '1 1 auto', justifyContent: 'flex-end' }}>
            <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 260 }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: 11,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--ink-3)',
                  pointerEvents: 'none',
                }}
              />
              <input
                className="input"
                type="search"
                aria-label="Tìm theo tên đề thi"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm đề thi, giáo viên…"
                style={{
                  width: '100%',
                  fontSize: 13.5,
                  minHeight: 38,
                  padding: '6px 12px 6px 34px',
                  borderRadius: 8,
                }}
              />
            </div>

            <div
              style={{
                display: 'inline-flex',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: 2,
                background: 'var(--surface-2)',
              }}
              role="group"
              aria-label="Kiểu hiển thị kho đề"
            >
              <button
                type="button"
                onClick={() => setViewMode('card')}
                style={{
                  padding: '5px 10px',
                  border: 'none',
                  borderRadius: 6,
                  background: viewMode === 'card' ? 'var(--surface)' : 'transparent',
                  color: viewMode === 'card' ? 'var(--primary)' : 'var(--ink-3)',
                  fontWeight: viewMode === 'card' ? 700 : 500,
                  fontSize: 12.5,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  boxShadow: viewMode === 'card' ? 'var(--shadow-sm)' : 'none',
                }}
                title="Xem dạng thẻ trực quan"
              >
                <Grid2X2 size={14} /> Thẻ
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                style={{
                  padding: '5px 10px',
                  border: 'none',
                  borderRadius: 6,
                  background: viewMode === 'table' ? 'var(--surface)' : 'transparent',
                  color: viewMode === 'table' ? 'var(--primary)' : 'var(--ink-3)',
                  fontWeight: viewMode === 'table' ? 700 : 500,
                  fontSize: 12.5,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  boxShadow: viewMode === 'table' ? 'var(--shadow-sm)' : 'none',
                }}
                title="Xem dạng bảng danh sách"
              >
                <List size={14} /> Bảng
              </button>
            </div>

            <button
              type="button"
              className="btn sm"
              disabled={customBusy}
              onClick={handleStartMistakeExam}
              style={{
                background: 'var(--warn-soft)',
                color: '#b45309',
                borderColor: '#fde68a',
                fontWeight: 700,
                fontSize: 12.5,
                minHeight: 38,
                padding: '0 12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="edit" /> Đề quét 10 lỗi sai
            </button>
          </div>
        )}
      </div>

      {tab === 'mistakes' ? (
        <MistakeNotebook embedded />
      ) : loading ? (
        <Loading text="Đang mở kho đề thi khảo sát…" />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : (
        <>
          {/* HÀNG 2: CHIP LỌC MÔN HỌC + KHỐI LỚP + CHUYÊN ĐỀ + SẮP XẾP (KHÔNG TRÀN NGANG) */}
          <section
            className="card"
            style={{
              margin: 0,
              padding: '12px 14px',
              background: 'var(--surface)',
              borderRadius: 12,
              border: '1px solid var(--line)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              {/* Chips môn học & trạng thái hoàn thành */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {subjects.map((subj) => {
                  const active = selectedSubject === subj && !filterCompleted;
                  return (
                    <button
                      key={subj}
                      type="button"
                      onClick={() => {
                        setSelectedSubject(subj);
                        setSelectedFocus('all');
                        setFilterCompleted(false);
                      }}
                      style={{
                        minHeight: 34,
                        padding: '5px 12px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: active ? 700 : 500,
                        cursor: 'pointer',
                        border: active ? '1px solid var(--primary)' : '1px solid var(--line)',
                        background: active ? 'var(--primary-soft)' : 'var(--surface)',
                        color: active ? 'var(--primary)' : 'var(--ink-2)',
                        transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
                      }}
                    >
                      {subj === 'all' ? 'Tất cả môn' : subj}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setFilterCompleted(!filterCompleted)}
                  style={{
                    minHeight: 34,
                    padding: '5px 12px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: filterCompleted ? 700 : 500,
                    cursor: 'pointer',
                    border: filterCompleted ? '1px solid var(--good)' : '1px solid var(--line)',
                    background: filterCompleted ? 'var(--good-soft)' : 'var(--surface)',
                    color: filterCompleted ? 'var(--good)' : 'var(--ink-3)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
                  }}
                >
                  <FileCheck2 size={14} /> Đã hoàn thành ({completedCount})
                </button>
              </div>

              {/* Bộ lọc Khối lớp, Dạng đề / Chuyên đề & Sắp xếp */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <select
                  aria-label="Lọc theo khối lớp"
                  className="select"
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value)}
                  style={{ minHeight: 34, padding: '4px 10px', fontSize: 13, borderRadius: 8 }}
                >
                  <option value="all">Tất cả khối lớp</option>
                  <option value="12">Lớp 12 / THPT</option>
                  <option value="11">Lớp 11</option>
                  <option value="10">Lớp 10</option>
                </select>

                <select
                  aria-label="Lọc theo dạng đề hoặc chuyên đề"
                  className="select"
                  value={selectedFocus}
                  onChange={(e) => setSelectedFocus(e.target.value)}
                  style={{ minHeight: 34, padding: '4px 10px', fontSize: 13, borderRadius: 8, maxWidth: 210 }}
                >
                  <option value="all">Tất cả dạng đề &amp; chuyên đề</option>
                  {categories.length > 0 && (
                    <optgroup label="Dạng đề">
                      {categories.map((cat) => (
                        <option key={cat} value={`cat:${cat}`}>
                          {cat}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {availableTopics.length > 0 && (
                    <optgroup label="Chuyên đề">
                      {availableTopics.map((code) => (
                        <option key={code} value={`topic:${code}`}>
                          {topicName(meta, code)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>

                <select
                  aria-label="Sắp xếp danh sách đề"
                  className="select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'newest' | 'popular')}
                  style={{ minHeight: 34, padding: '4px 10px', fontSize: 13, borderRadius: 8 }}
                >
                  <option value="newest">Sắp xếp: Mới nhất</option>
                  <option value="popular">Sắp xếp: Nhiều lượt thi</option>
                </select>

                {hasActiveFilter && (
                  <button
                    type="button"
                    className="btn sm"
                    onClick={resetFilters}
                    style={{ minHeight: 34, fontSize: 12.5 }}
                  >
                    Xóa lọc
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* DANH SÁCH ĐỀ THI */}
          {filteredExams.length === 0 ? (
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 12,
                padding: '48px 16px',
                textAlign: 'center',
                color: 'var(--ink-3)',
                fontSize: 14,
              }}
            >
              <BookOpen size={30} style={{ opacity: 0.45, marginBottom: 8 }} />
              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Không tìm thấy đề thi phù hợp.</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Vui lòng chọn bộ lọc khác hoặc xóa từ khóa tìm kiếm.</div>
              {hasActiveFilter && (
                <button type="button" className="btn sm" onClick={resetFilters} style={{ marginTop: 12 }}>
                  Đặt lại bộ lọc
                </button>
              )}
            </div>
          ) : viewMode === 'table' ? (
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 12,
                overflowX: 'auto',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr
                    style={{
                      background: 'var(--surface-2)',
                      borderBottom: '1px solid var(--line)',
                      color: 'var(--ink-3)',
                      fontSize: 12,
                    }}
                  >
                    <th style={{ padding: '10px 14px', width: 82 }}>Mã đề</th>
                    <th style={{ padding: '10px 14px' }}>Tên đề thi</th>
                    <th style={{ padding: '10px 14px', width: 120 }}>Môn học</th>
                    <th style={{ padding: '10px 14px', width: 100 }}>Thời gian</th>
                    <th style={{ padding: '10px 14px', width: 95 }}>Lượt thi</th>
                    <th style={{ padding: '10px 14px', width: 115 }}>Kết quả</th>
                    <th style={{ padding: '10px 14px', width: 170, textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExams.map((exam) => {
                    const isStarting = startingId === exam.id;
                    const testCode = `DE-${String(exam.id).padStart(2, '0')}`;
                    const attempts = exam.schoolAttemptCount ?? 0;
                    return (
                      <tr
                        key={exam.id}
                        style={{
                          borderBottom: '1px solid var(--line-subtle)',
                          transition: 'background-color 0.12s ease',
                        }}
                      >
                        <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--ink-3)', fontSize: 12 }}>
                          {testCode}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 13.5 }}>{exam.title}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>
                            {exam.category || 'Chuẩn cấu trúc Bộ GD&ĐT'} ·{' '}
                            <span style={{ fontWeight: 600 }}>{exam.author || 'Tổ bộ môn'}</span>
                            {exam.grade ? ` · Khối ${exam.grade}` : ''}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <SubjectBadge subject={exam.subject} />
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          {exam.durationMin} phút · {exam.questionCount} câu
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>
                          {attempts > 0 ? `${attempts} lượt` : 'Mới'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {exam.completed ? (
                            <span
                              className="tabular-nums"
                              style={{
                                fontSize: 12.5,
                                fontWeight: 700,
                                color: scoreColor(exam.score10),
                                background: exam.score10 !== null && exam.score10 >= 8 ? 'var(--good-soft)' : 'var(--warn-soft)',
                                padding: '3px 8px',
                                borderRadius: 6,
                              }}
                            >
                              {exam.score10 !== null ? `${fmtScore(exam.score10)} đ` : 'Đã nộp'}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Chưa thi</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                            {exam.completed && exam.attemptId && (
                              <a
                                href={`#/ket-qua/${exam.attemptId}`}
                                className="btn sm"
                                style={{ minHeight: 32, padding: '2px 8px', fontSize: 12 }}
                              >
                                Xem kết quả
                              </a>
                            )}
                            <button
                              type="button"
                              className="btn sm primary"
                              disabled={isStarting}
                              onClick={() => startExam(exam.id)}
                              style={{ minHeight: 32, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}
                            >
                              {isStarting ? 'Đang mở…' : exam.completed ? 'Làm lại' : 'Vào thi →'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(305px, 1fr))',
                gap: 14,
              }}
            >
              {filteredExams.map((exam) => {
                const isStarting = startingId === exam.id;
                const counts = exam.counts || { mcq: exam.questionCount, tf: 0, short: 0 };
                const testCode = `DE-${String(exam.id).padStart(2, '0')}`;
                const subjectStyle = getSubjectStyle(exam.subject);
                const schoolAttempts = exam.schoolAttemptCount ?? 0;

                return (
                  <article
                    key={exam.id}
                    className="card"
                    style={{
                      margin: 0,
                      padding: '16px 18px',
                      background: 'var(--surface)',
                      border: exam.completed ? '1px solid #a7f3d0' : '1px solid var(--line)',
                      borderTop: `4px solid ${subjectStyle.accent}`,
                      borderRadius: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12,
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              fontSize: 11,
                              color: 'var(--ink-3)',
                              background: 'var(--surface-2)',
                              padding: '2px 6px',
                              borderRadius: 4,
                            }}
                          >
                            {testCode}
                          </span>
                          <SubjectBadge subject={exam.subject} />
                          {exam.grade && (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: 'var(--ink-2)',
                                background: 'var(--surface-2)',
                                padding: '2px 7px',
                                borderRadius: 4,
                              }}
                            >
                              Lớp {exam.grade}
                            </span>
                          )}
                        </div>

                        {exam.completed ? (
                          <span
                            className="tabular-nums"
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: scoreColor(exam.score10),
                              background: exam.score10 !== null && exam.score10 >= 8 ? 'var(--good-soft)' : 'var(--warn-soft)',
                              border: `1px solid ${exam.score10 !== null && exam.score10 >= 8 ? '#a7f3d0' : '#fde68a'}`,
                              padding: '2px 8px',
                              borderRadius: 6,
                            }}
                          >
                            {exam.score10 !== null ? `${fmtScore(exam.score10)} / 10đ` : 'Đã nộp'}
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: 11.5,
                              fontWeight: 600,
                              color: 'var(--ink-3)',
                              background: 'var(--surface-2)',
                              padding: '2px 7px',
                              borderRadius: 5,
                            }}
                          >
                            Chưa thi
                          </span>
                        )}
                      </div>

                      <h2 style={{ fontSize: 15.5, fontWeight: 700, margin: '0 0 8px', color: 'var(--ink)', lineHeight: 1.38 }}>
                        {exam.title}
                      </h2>

                      <div
                        style={{
                          fontSize: 12.5,
                          color: 'var(--ink-2)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flexWrap: 'wrap',
                          marginBottom: 8,
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                          <Clock size={13} style={{ color: 'var(--ink-3)' }} /> {exam.durationMin} phút
                        </span>
                        <span aria-hidden="true">·</span>
                        <span style={{ fontWeight: 600 }}>{exam.questionCount} câu</span>
                        <span aria-hidden="true">·</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--ink-2)', fontWeight: 600 }}>
                          <Users size={13} style={{ color: 'var(--ink-3)' }} />
                          {schoolAttempts > 0 ? `${schoolAttempts} lượt thi` : 'Đề mới'}
                        </span>
                      </div>

                      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 8 }}>
                        Giáo viên: <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{exam.author || 'Hội đồng Bộ môn'}</strong>
                        {exam.category ? <span style={{ color: 'var(--ink-3)' }}> · {exam.category}</span> : null}
                      </div>

                      {counts && (counts.tf > 0 || counts.short > 0) && (
                        <div
                          style={{
                            background: 'var(--surface-2)',
                            borderRadius: 8,
                            padding: '6px 10px',
                            fontSize: 12,
                            display: 'flex',
                            justifyContent: 'space-between',
                            color: 'var(--ink-2)',
                            border: '1px solid var(--line-subtle)',
                          }}
                        >
                          <span>Trắc nghiệm: <strong>{counts.mcq}</strong></span>
                          <span>Đúng/Sai: <strong>{counts.tf}</strong></span>
                          <span>Trả lời ngắn: <strong>{counts.short}</strong></span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      {exam.completed && exam.attemptId && (
                        <a
                          href={`#/ket-qua/${exam.attemptId}`}
                          className="btn sm"
                          style={{
                            flex: 1,
                            minHeight: 38,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12.5,
                            gap: 5,
                          }}
                        >
                          <Icon name="eye" /> Kết quả
                        </a>
                      )}
                      <button
                        type="button"
                        className="btn sm primary"
                        disabled={isStarting}
                        onClick={() => startExam(exam.id)}
                        style={{
                          flex: exam.completed ? 1 : 2,
                          minHeight: 38,
                          fontWeight: 700,
                          fontSize: 13,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                      >
                        {isStarting ? 'Đang tải…' : exam.completed ? 'Làm lại đề' : 'Bắt đầu làm bài →'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
