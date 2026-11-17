import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  BookOpenCheck,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  HelpCircle,
  Lock,
  Plus,
  Search,
  Timer,
  Users,
  X,
} from 'lucide-react';
import { fmtDateTime, fmtScore, go } from '../../ui/kit';
import { formatDeadlineShort, getAssignmentStatusMeta, padWeek } from './classroomState';
import type { ClassAssignment, ClassModule } from './types';

interface AssessmentTabProps {
  mode: 'exam' | 'homework';
  role: 'student' | 'teacher' | 'admin';
  classId: number;
  totalStudents: number;
  assignments: ClassAssignment[];
  modules: ClassModule[];
  onStartExam?: (assignmentId: number) => void;
  busy?: boolean;
}

type StatusFilter = 'all' | 'open' | 'upcoming' | 'done' | 'missed';

export function AssessmentTab({
  mode,
  role,
  classId,
  totalStudents,
  assignments,
  modules,
  onStartExam,
  busy,
}: AssessmentTabProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const modMap = useMemo(() => new Map(modules.map((m) => [m.id, m])), [modules]);
  const nowMs = Date.now();

  const scoped = useMemo(
    () => assignments.filter((a) => a.mode === mode),
    [assignments, mode],
  );

  const getBucket = (a: ClassAssignment): Exclude<StatusFilter, 'all'> => {
    if (role === 'student') {
      if (a.state === 'done') return 'done';
      if (a.state === 'upcoming') return 'upcoming';
      if (a.state === 'missed') return 'missed';
      return 'open';
    }
    if (nowMs < a.open_at) return 'upcoming';
    if (nowMs > a.close_at) return 'done';
    return 'open';
  };

  const counts = useMemo(() => {
    const c = { all: scoped.length, open: 0, upcoming: 0, done: 0, missed: 0 };
    for (const a of scoped) c[getBucket(a)]++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, role]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped.filter((a) => {
      if (filter !== 'all' && getBucket(a) !== filter) return false;
      if (q && !a.title.toLowerCase().includes(q)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, filter, search, role]);

  const title = mode === 'exam' ? 'Bài kiểm tra & Đánh giá' : 'Bài tập về nhà';
  const subtitle =
    mode === 'exam'
      ? 'Các bài kiểm tra tính giờ và khảo sát năng lực trong lớp.'
      : 'Bài tập củng cố và phiếu luyện tập theo chuyên đề.';

  return (
    <div className="cls-assessment-wrap">
      <div className="cls-section-head">
        <div>
          <h2 className="cls-section-title">{title}</h2>
          <p className="cls-section-subtitle">{subtitle}</p>
        </div>
        {role !== 'student' && (
          <a className="cls-btn cls-btn-primary" href={`#/thu-vien?classId=${classId}`}>
            <Plus size={16} />
            <span>{mode === 'exam' ? 'Giao đề kiểm tra' : 'Giao bài tập'}</span>
          </a>
        )}
      </div>

      {/* Filter Toolbar */}
      <div className="cls-modules-toolbar">
        <div className="cls-segmented" role="group" aria-label="Lọc trạng thái bài">
          <button type="button" className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>
            Tất cả ({counts.all})
          </button>
          <button type="button" className={filter === 'open' ? 'is-active' : ''} onClick={() => setFilter('open')}>
            {role === 'student' ? `Cần làm (${counts.open})` : `Đang mở (${counts.open})`}
          </button>
          <button type="button" className={filter === 'upcoming' ? 'is-active' : ''} onClick={() => setFilter('upcoming')}>
            Sắp mở ({counts.upcoming})
          </button>
          <button type="button" className={filter === 'done' ? 'is-active' : ''} onClick={() => setFilter('done')}>
            {role === 'student' ? `Đã nộp (${counts.done})` : `Đã đóng (${counts.done})`}
          </button>
          {role === 'student' && counts.missed > 0 && (
            <button type="button" className={filter === 'missed' ? 'is-active' : ''} onClick={() => setFilter('missed')}>
              Quá hạn ({counts.missed})
            </button>
          )}
        </div>

        <div className="cls-search-box cls-search-sm">
          <Search size={15} className="cls-search-icon" />
          <input
            type="search"
            placeholder={mode === 'exam' ? 'Tìm bài kiểm tra…' : 'Tìm bài tập…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="cls-search-clear" onClick={() => setSearch('')}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="cls-empty-card">
          <div className="cls-empty-icon">
            {mode === 'exam' ? <ClipboardCheck size={22} /> : <BookOpenCheck size={22} />}
          </div>
          <h3>
            {scoped.length === 0
              ? mode === 'exam'
                ? 'Chưa có bài kiểm tra nào'
                : 'Chưa có bài tập nào'
              : 'Không có bài phù hợp bộ lọc'}
          </h3>
          <p>
            {scoped.length === 0
              ? role === 'student'
                ? 'Khi giáo viên giao bài mới cho lớp, bài sẽ xuất hiện tại đây.'
                : 'Chọn một đề từ Kho đề để giao cho lớp học này.'
              : 'Thử chuyển sang mục Tất cả hoặc xóa từ khóa tìm kiếm.'}
          </p>
        </div>
      ) : (
        <div className="cls-assessment-list">
          {filtered.map((a) => {
            const mod = a.module_id ? modMap.get(a.module_id) : undefined;
            const modLocked = Boolean(mod?.locked);
            const st = getAssignmentStatusMeta(a, nowMs);
            const dl = formatDeadlineShort(a.close_at, nowMs);
            const teacherState =
              nowMs < a.open_at
                ? { label: 'Sắp mở', tone: 'muted' as const }
                : nowMs > a.close_at
                ? { label: 'Đã đóng', tone: 'muted' as const }
                : { label: 'Đang mở', tone: 'good' as const };

            return (
              <article key={a.id} className="cls-assessment-card">
                <div className="cls-assessment-main">
                  <div className="cls-assessment-top-meta">
                    {mod && <span className="cls-week-code">{padWeek(mod.week_no)}</span>}
                    {role === 'student' ? (
                      <span className={`cls-status-tag is-${st.tone}`}>
                        {st.code === 'done' || st.code === 'graded' ? (
                          <CheckCircle2 size={13} />
                        ) : st.code === 'doing' || st.code === 'open' ? (
                          <Clock size={13} />
                        ) : null}
                        <span>{st.label}</span>
                      </span>
                    ) : (
                      <span className={`cls-status-tag is-${teacherState.tone}`}>
                        <span>{teacherState.label}</span>
                      </span>
                    )}
                  </div>

                  <h3 className="cls-assessment-title">{a.title}</h3>

                  <div className="cls-assessment-specs">
                    <span>
                      <Timer size={14} /> <span className="tabular-nums">{a.duration_min}</span> phút
                    </span>
                    {a.question_count ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          <HelpCircle size={14} /> <span className="tabular-nums">{a.question_count}</span> câu hỏi
                        </span>
                      </>
                    ) : null}
                    <span aria-hidden="true">·</span>
                    <span>
                      <Award size={14} /> Thang điểm 10
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className={dl.urgent && st.code !== 'done' && st.code !== 'graded' ? 'cls-text-warn' : ''}>
                      <Calendar size={14} /> Mở {fmtDateTime(a.open_at)} – Đóng {fmtDateTime(a.close_at)}
                    </span>
                  </div>

                  {role === 'student' && (a.teacher_stamp || a.teacher_feedback) && (
                    <div className="cls-feedback-snippet">
                      <strong>{a.teacher_stamp || 'Nhận xét giáo viên'}:</strong>{' '}
                      <span>{a.teacher_feedback}</span>
                    </div>
                  )}
                </div>

                <div className="cls-assessment-side">
                  {role === 'student' ? (
                    <>
                      {st.code === 'graded' && a.score10 !== null && a.score10 !== undefined && (
                        <div className="cls-big-score tabular-nums">
                          {fmtScore(a.score10)} <span>/ 10</span>
                        </div>
                      )}

                      {modLocked && a.state !== 'done' ? (
                        <span className="cls-locked-note">
                          <Lock size={14} /> Học phần đang khóa
                        </span>
                      ) : a.state === 'doing' && a.attempt_id ? (
                        <button
                          type="button"
                          className="cls-btn cls-btn-primary"
                          onClick={() => go(`/thi/${a.attempt_id}`)}
                        >
                          Tiếp tục làm bài <ArrowRight size={15} />
                        </button>
                      ) : a.state === 'open' ? (
                        <button
                          type="button"
                          className="cls-btn cls-btn-primary"
                          disabled={busy}
                          onClick={() => onStartExam?.(a.id)}
                        >
                          Vào làm bài <ArrowRight size={15} />
                        </button>
                      ) : a.state === 'done' && a.attempt_id ? (
                        <a className="cls-btn cls-btn-ghost" href={`#/ket-qua/${a.attempt_id}`}>
                          Xem chi tiết <ArrowRight size={15} />
                        </a>
                      ) : a.state === 'upcoming' ? (
                        <span className="cls-muted-text">Mở lúc {fmtDateTime(a.open_at)}</span>
                      ) : (
                        <span className="cls-text-bad">Đã hết hạn nộp</span>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="cls-teacher-stat-col">
                        <div className="cls-teacher-submit-count tabular-nums">
                          <Users size={14} />
                          <span>
                            <strong>{a.submitted ?? 0}</strong>/{totalStudents} đã nộp
                          </span>
                        </div>
                        {a.avg !== null && a.avg !== undefined && (
                          <div className="cls-teacher-avg tabular-nums">
                            Trung bình: <strong>{fmtScore(a.avg)} đ</strong>
                          </div>
                        )}
                      </div>
                      <a className="cls-btn cls-btn-ghost" href={`#/lop/${classId}/ket-qua/${a.id}`}>
                        Xem báo cáo <ArrowRight size={15} />
                      </a>
                    </>
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
