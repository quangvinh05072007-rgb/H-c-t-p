import { matchesSearch } from '../../../shared/search.mjs';
import { EXAM_CATEGORIES } from '../../../shared/examCategory.mjs';
import { useMemo, useState } from 'react';
import { BookMarked, BookOpenCheck, ChevronRight, Clock, ListChecks, Search, Timer, Trophy } from 'lucide-react';
import { get, post } from '../../api';
import { ErrorBox, fmtDateTime, fmtScore, go, Loading, Modal, scoreColor, useApp, useAsync } from '../../ui/kit';

type Attempt = { id: number; mode: 'practice' | 'timed'; score10: number | null; at: number };
type PracticeExam = {
  id: number;
  title: string;
  category: string;
  categoryLabel: string;
  grade?: number | null;
  createdAt?: number;
  durationMin: number;
  questionCount: number;
  counts?: { mcq: number; tf: number; short: number };
  author: string | null;
  completed: boolean;
  inProgress?: boolean;
  inProgressId?: number | null;
  inProgressMode?: 'practice' | 'timed' | null;
  attemptCount?: number;
  schoolAttemptCount?: number;
  bestScore: number | null;
  bestTimedScore: number | null;
  history: Attempt[];
};
type PracticeResponse = { exams: PracticeExam[]; totalCount: number; completedCount: number };

const CAT_TONE: Record<string, string> = {
  'giua-ky': 'sky',
  'cuoi-ky': 'violet',
  thpt: 'rose',
  'khao-sat': 'amber',
  'kiem-tra': 'teal',
  'on-tap': 'green',
};

export function PracticeHub() {
  const { toast } = useApp();
  const { data, error, loading, reload } = useAsync(() => get<PracticeResponse>('/api/student/practice-exams'), []);
  const { data: dueInfo } = useAsync(
    () => get<{ count: number; total: number }>('/api/student/review/due').catch(() => ({ count: 0, total: 0 })),
    [],
  );
  const [cat, setCat] = useState<string>('all');
  const [grade, setGrade] = useState<string>('all');
  const [status, setStatus] = useState<'all' | 'todo' | 'done'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'popular'>('newest');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<PracticeExam | null>(null);
  const [mockBusy, setMockBusy] = useState(false);

  const exams = data?.exams ?? [];
  const catCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of exams) m[e.category] = (m[e.category] ?? 0) + 1;
    return m;
  }, [exams]);

  const filtered = useMemo(() => {
    const list = exams.filter((e) => {
      if (cat !== 'all' && e.category !== cat) return false;
      if (grade !== 'all' && String(e.grade ?? '') !== grade) return false;
      if (status === 'todo' && e.completed) return false;
      if (status === 'done' && !e.completed) return false;
      if (search.trim() && !matchesSearch(e.title, search) && !matchesSearch(e.author || '', search)) return false;
      return true;
    });
    return [...list].sort((a, b) =>
      sortBy === 'popular'
        ? (b.schoolAttemptCount ?? 0) - (a.schoolAttemptCount ?? 0) || b.id - a.id
        : (b.createdAt ?? b.id) - (a.createdAt ?? a.id) || b.id - a.id,
    );
  }, [exams, cat, grade, status, search, sortBy]);

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

  const dueCount = dueInfo?.count ?? 0;
  const doneCount = data?.completedCount ?? 0;

  return (
    <div className="su-page">
      <header className="su-head">
        <div>
          <h1>Đề thi</h1>
          <p className="su-sub">{`${data?.totalCount ?? 0} đề · đã làm ${doneCount}`}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {dueCount > 0 && (
            <button type="button" className="btn" onClick={() => go('/so-tay-loi-sai')}>
              <BookMarked size={15} aria-hidden="true" /> {dueCount} câu cần ôn
            </button>
          )}
          <button type="button" className="btn primary" disabled={mockBusy} onClick={startMock} title="Ghép ngẫu nhiên từ ngân hàng: 12 trắc nghiệm, 4 đúng/sai, 6 trả lời ngắn, 90 phút">
            <Timer size={15} aria-hidden="true" /> {mockBusy ? 'Đang ghép đề…' : 'Thi thử THPT ngẫu nhiên'}
          </button>
        </div>
      </header>

      {loading ? (
        <Loading text="Đang mở kho đề…" />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : (
        <>
          <nav className="ex-cats" aria-label="Loại đề">
            <button type="button" className={`ex-cat ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>
              Tất cả <span>{exams.length}</span>
            </button>
            {EXAM_CATEGORIES.filter((c) => catCounts[c.code]).map((c) => (
              <button key={c.code} type="button" className={`ex-cat is-${CAT_TONE[c.code]} ${cat === c.code ? 'on' : ''}`} onClick={() => setCat(c.code)}>
                <i aria-hidden="true" /> {c.label} <span>{catCounts[c.code]}</span>
              </button>
            ))}
          </nav>

          <div className="su-filterbar">
            <label style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: '1 1 200px', maxWidth: 320 }}>
              <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, color: 'var(--ink-3)' }} />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm đề…" aria-label="Tìm theo tên đề" style={{ paddingLeft: 30, width: '100%', minHeight: 34 }} />
            </label>
            <span className="su-grow" />
            <select value={status} onChange={(e) => setStatus(e.target.value as any)} aria-label="Trạng thái">
              <option value="all">Mọi trạng thái</option>
              <option value="todo">Chưa làm</option>
              <option value="done">Đã làm</option>
            </select>
            <select value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Khối lớp">
              <option value="all">Mọi khối</option>
              <option value="12">Lớp 12</option>
              <option value="11">Lớp 11</option>
              <option value="10">Lớp 10</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} aria-label="Sắp xếp">
              <option value="newest">Mới nhất</option>
              <option value="popular">Nhiều bạn làm</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="su-card su-empty">Không có đề phù hợp.</div>
          ) : (
            <div className="ex-grid">
              {filtered.map((exam) => (
                <button key={exam.id} type="button" className={`ex-card is-${CAT_TONE[exam.category] ?? 'teal'}`} onClick={() => setPicked(exam)}>
                  <div className="ex-card-top">
                    <span className="ex-card-cat">{exam.categoryLabel}</span>
                    {exam.inProgress ? (
                      <span className="su-chip is-warn">Đang làm</span>
                    ) : exam.bestScore !== null ? (
                      <span className="ex-best" style={{ color: scoreColor(exam.bestScore) }}>
                        <Trophy size={13} aria-hidden="true" /> {fmtScore(exam.bestScore)}
                      </span>
                    ) : (
                      <span className="ex-new">Chưa làm</span>
                    )}
                  </div>
                  <div className="ex-card-title">{exam.title}</div>
                  <div className="ex-card-meta">
                    <span><Clock size={13} aria-hidden="true" /> {exam.durationMin} phút</span>
                    <span><ListChecks size={13} aria-hidden="true" /> {exam.questionCount} câu</span>
                    {exam.grade ? <span>Lớp {exam.grade}</span> : null}
                  </div>
                  <div className="ex-card-foot">
                    <span>{exam.attemptCount ? `Đã làm ${exam.attemptCount} lần` : exam.author ?? ''}</span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {picked && <ExamModeModal exam={picked} onClose={() => setPicked(null)} />}
    </div>
  );
}

function ExamModeModal({ exam, onClose }: { exam: PracticeExam; onClose: () => void }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState<'practice' | 'timed' | null>(null);
  const start = async (mode: 'practice' | 'timed') => {
    setBusy(mode);
    try {
      const att = await post<any>('/api/student/practice-exams/start', { examId: exam.id, mode });
      go(`/thi/${att.id}`);
    } catch (err: any) {
      toast(err.message || 'Không mở được đề.');
      setBusy(null);
    }
  };
  const c = exam.counts;
  const resume = (mode: 'practice' | 'timed') => exam.inProgress && exam.inProgressMode === mode;
  return (
    <Modal title={exam.title} onClose={onClose} width={620}>
      <div className="ex-modal-meta">
        <span className={`ex-card-cat is-${CAT_TONE[exam.category] ?? 'teal'}`}>{exam.categoryLabel}</span>
        <span><Clock size={13} aria-hidden="true" /> {exam.durationMin} phút</span>
        <span>{exam.questionCount} câu{c ? ` (${c.mcq} trắc nghiệm · ${c.tf} đúng/sai · ${c.short} trả lời ngắn)` : ''}</span>
      </div>

      <div className="ex-modes">
        <button type="button" className="ex-mode is-practice" disabled={busy !== null} onClick={() => start('practice')}>
          <div className="ex-mode-icon"><BookOpenCheck size={22} aria-hidden="true" /></div>
          <div className="ex-mode-name">{resume('practice') ? 'Luyện tập tiếp' : 'Luyện tập'}</div>
          <ul>
            <li>Không giới hạn thời gian</li>
            <li>Kiểm tra đáp án từng câu ngay</li>
            <li>Xem lời giải khi cần</li>
          </ul>
          <span className="ex-mode-go">{busy === 'practice' ? 'Đang mở…' : 'Bắt đầu luyện →'}</span>
        </button>
        <button type="button" className="ex-mode is-timed" disabled={busy !== null} onClick={() => start('timed')}>
          <div className="ex-mode-icon"><Timer size={22} aria-hidden="true" /></div>
          <div className="ex-mode-name">{resume('timed') ? 'Thi tiếp' : 'Thi thật'}</div>
          <ul>
            <li>Tính giờ {exam.durationMin} phút, hết giờ tự nộp</li>
            <li>Chỉ xem đáp án sau khi nộp</li>
            <li>Chấm theo thang của Bộ, ghi vào Hồ sơ</li>
          </ul>
          <span className="ex-mode-go">{busy === 'timed' ? 'Đang mở…' : 'Vào phòng thi →'}</span>
        </button>
      </div>

      {exam.history.length > 0 && (
        <div className="ex-history">
          <div className="ex-history-head">
            Các lần đã làm
            {exam.bestTimedScore !== null && <span>Điểm thi thật cao nhất <b style={{ color: scoreColor(exam.bestTimedScore) }}>{fmtScore(exam.bestTimedScore)}</b></span>}
          </div>
          {exam.history.map((h) => (
            <a key={h.id} className="ex-history-row" href={`#/ket-qua/${h.id}`}>
              <span className={`su-chip ${h.mode === 'timed' ? 'is-bad' : ''}`}>{h.mode === 'timed' ? 'Thi thật' : 'Luyện tập'}</span>
              <span className="ex-history-date">{fmtDateTime(h.at)}</span>
              <b style={{ color: scoreColor(h.score10) }}>{h.score10 === null ? '—' : fmtScore(h.score10)}</b>
              <ChevronRight size={15} aria-hidden="true" />
            </a>
          ))}
        </div>
      )}
    </Modal>
  );
}
