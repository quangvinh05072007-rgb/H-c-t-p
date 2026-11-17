import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Edit3,
  MessageSquareText,
} from 'lucide-react';
import { fmtDateTime, fmtScore, go, scoreColor } from '../../ui/kit';
import { getAssignmentStatusMeta } from './classroomState';
import type { ClassAssignment } from './types';

interface GradesTabProps {
  assignments: ClassAssignment[];
  onStartExam: (assignmentId: number) => void;
  busy?: boolean;
}

export function GradesTab({ assignments, onStartExam, busy }: GradesTabProps) {
  const done = assignments.filter((a) => a.state === 'done');
  const graded = done.filter((a) => a.resultVisible && a.score10 !== null && a.score10 !== undefined);
  const avg = graded.length
    ? graded.reduce((sum, a) => sum + Number(a.score10 || 0), 0) / graded.length
    : null;
  const latestFeedback = done.find((a) => a.teacher_feedback || a.teacher_stamp);

  return (
    <div className="cls-grades-wrap">
      {/* Summary Strip */}
      <div className="cls-kpi-grid cls-kpi-grid-3">
        <div className="cls-kpi-card">
          <div className="cls-kpi-icon is-primary">
            <Award size={18} />
          </div>
          <div>
            <div className="cls-kpi-label">Điểm trung bình</div>
            <div className="cls-kpi-value tabular-nums" style={{ color: avg !== null ? scoreColor(avg) : undefined }}>
              {avg !== null ? `${fmtScore(avg)} đ` : 'Chưa có điểm'}
            </div>
            <div className="cls-kpi-hint">
              {graded.length > 0 ? `Tính trên ${graded.length} bài đã công bố điểm` : 'Chưa có bài được chấm điểm'}
            </div>
          </div>
        </div>

        <div className="cls-kpi-card">
          <div className="cls-kpi-icon is-good">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div className="cls-kpi-label">Bài đã hoàn thành</div>
            <div className="cls-kpi-value tabular-nums">
              {done.length}/{assignments.length}
            </div>
            <div className="cls-kpi-hint">Tổng số bài kiểm tra và bài tập</div>
          </div>
        </div>

        <div className="cls-kpi-card">
          <div className="cls-kpi-icon is-soft">
            <MessageSquareText size={18} />
          </div>
          <div>
            <div className="cls-kpi-label">Nhận xét từ giáo viên</div>
            <div className="cls-kpi-value cls-kpi-value-sm">
              {latestFeedback ? latestFeedback.teacher_stamp || 'Đã có nhận xét' : 'Chưa có nhận xét'}
            </div>
            <div className="cls-kpi-hint">
              {latestFeedback?.teacher_feedback || 'Lời phê của giáo viên hiển thị theo từng bài'}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Study Links */}
      <div className="cls-grades-links">
        <a href="#/so-tay-loi-sai" className="cls-btn cls-btn-sm cls-btn-ghost">
          <Edit3 size={14} /> Ôn tập Sổ tay lỗi sai
        </a>
        <a href="#/tu-hoc" className="cls-btn cls-btn-sm cls-btn-ghost">
          <BookOpen size={14} /> Mở tài liệu Tự học
        </a>
      </div>

      {assignments.length === 0 ? (
        <div className="cls-empty-card">
          <div className="cls-empty-icon">
            <ClipboardCheck size={22} />
          </div>
          <h3>Chưa có đầu điểm nào</h3>
          <p>Các bài kiểm tra và bài tập của lớp sẽ hiển thị điểm tại đây sau khi được giao và hoàn thành.</p>
        </div>
      ) : (
        <div className="cls-table-surface">
          <table className="cls-table">
            <thead>
              <tr>
                <th>Bài kiểm tra / Bài tập</th>
                <th>Hạn nộp</th>
                <th>Trạng thái</th>
                <th>Điểm số</th>
                <th>Nhận xét giáo viên</th>
                <th className="text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => {
                const st = getAssignmentStatusMeta(a);
                return (
                  <tr key={a.id}>
                    <td>
                      <div className="cls-table-primary">{a.title}</div>
                      <div className="cls-table-sub">
                        {a.mode === 'exam' ? 'Kiểm tra tính giờ' : 'Bài tập về nhà'} · {a.duration_min} phút
                      </div>
                    </td>
                    <td className="tabular-nums cls-muted-text">{fmtDateTime(a.close_at)}</td>
                    <td>
                      <span className={`cls-status-tag is-${st.tone}`}>
                        {st.code === 'done' || st.code === 'graded' ? (
                          <CheckCircle2 size={13} />
                        ) : st.code === 'doing' || st.code === 'open' ? (
                          <Clock size={13} />
                        ) : null}
                        <span>{a.state === 'done' && !a.resultVisible ? 'Chờ công bố điểm' : st.label}</span>
                      </span>
                    </td>
                    <td className="tabular-nums">
                      {a.resultVisible && a.score10 !== null && a.score10 !== undefined ? (
                        <strong style={{ color: scoreColor(a.score10), fontSize: 15 }}>
                          {fmtScore(a.score10)} / 10
                        </strong>
                      ) : (
                        <span className="cls-muted-text">—</span>
                      )}
                    </td>
                    <td>
                      {a.teacher_stamp || a.teacher_feedback ? (
                        <div className="cls-table-feedback">
                          {a.teacher_stamp && <strong>{a.teacher_stamp}</strong>}
                          {a.teacher_feedback && <span>{a.teacher_feedback}</span>}
                        </div>
                      ) : (
                        <span className="cls-muted-text">—</span>
                      )}
                    </td>
                    <td className="text-right">
                      {a.attempt_id && a.state === 'done' ? (
                        <a className="cls-btn cls-btn-sm cls-btn-ghost" href={`#/ket-qua/${a.attempt_id}`}>
                          Xem bài làm <ArrowRight size={14} />
                        </a>
                      ) : a.state === 'doing' && a.attempt_id ? (
                        <button
                          type="button"
                          className="cls-btn cls-btn-sm cls-btn-primary"
                          onClick={() => go(`/thi/${a.attempt_id}`)}
                        >
                          Làm tiếp
                        </button>
                      ) : a.state === 'open' ? (
                        <button
                          type="button"
                          className="cls-btn cls-btn-sm cls-btn-primary"
                          disabled={busy}
                          onClick={() => onStartExam(a.id)}
                        >
                          Làm bài
                        </button>
                      ) : (
                        <span className="cls-muted-text">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
