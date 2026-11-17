import { useState } from 'react';
import { get, post } from '../../api';
import { Icon, Bar, ErrorBox, ErrorTypeBadge, fmtDateTime, fmtScore, Loading, pct, scoreColor, useApp, useAsync } from '../../ui/kit';
import { AttemptReview, ResultSummary } from '../student/Result';
import { FamilyAccess } from '../../ui/FamilyAccess';
import { AttemptActions } from '../../ui/StaffActions';

function heatColor(v: number | undefined) {
  if (v === undefined) return { background: 'var(--surface-2)', color: 'var(--ink-3)' };
  if (v < 0.5) return { background: '#fbd5da', color: '#9b1c2b' };
  if (v < 0.75) return { background: '#fde8bf', color: '#7a5200' };
  return { background: '#c9efdc', color: '#0d6e49' };
}

export function ClassView({ id, embedded = false }: { id: number; embedded?: boolean }) {
  const { meta, toast } = useApp();
  const { data, error, loading, reload } = useAsync(() => get(`/api/classes/${id}`), [id]);
  const weak = useAsync(() => get(`/api/classes/${id}/weak-groups`), [id]);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assigningRemedial, setAssigningRemedial] = useState(false);

  const assignClassRemedial = async () => {
    setAssigningRemedial(true);
    try {
      const r = await post<{ ok: boolean; title: string; topicName: string; questionCount: number }>(`/api/teacher/classes/${id}/remedial`, {});
      toast(`Đã giao bài củng cố "${r.title}" (${r.questionCount} câu - ${r.topicName}) cho cả lớp!`);
      reload();
    } catch (e: any) {
      toast(e.message || 'Không thể tạo bài củng cố cho lớp.');
    } finally {
      setAssigningRemedial(false);
    }
  };

  const assignPractice = async (topic: string, name: string, n: number) => {
    if (!confirm(`Giao phiếu luyện "${name}" cho ${n} em yếu chuyên đề này? Các em khác trong lớp sẽ không thấy bài.`)) return;
    setAssigning(topic);
    try {
      const r = await post(`/api/classes/${id}/practice-assignment`, { topic });
      toast(`Đã giao phiếu ${r.items} câu cho ${r.students} học sinh.`);
      reload();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setAssigning(null);
    }
  };
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const topics: string[] = data.classMastery.map((m: any) => m.topic);
  const errTotal = Object.values(data.errors as Record<string, number>).reduce((a, b) => a + b, 0);
  return (
    <div className="stack">
      {!embedded && <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div><a className="small" href="#/lop-hoc">Về danh sách lớp</a><h1>Lớp {data.class.name}</h1></div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn sm"
            disabled={assigningRemedial}
            onClick={assignClassRemedial}
            style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#b45309', fontWeight: 700 }}
          >
            {assigningRemedial ? 'Đang tạo đề…' : '⚡ Giao bài củng cố 5 câu cho cả lớp'}
          </button>
          <a className="btn primary" href="#/ra-de">
            Ra đề cho lớp
          </a>
        </div>
      </div>}
      {data.actions.length > 0 && (
        <div className="widget-card">
          <div className="widget-head">
            <h2 className="widget-title">
              <span>💡</span> Việc cần làm cho lớp
            </h2>
            <span className="badge blue">{data.actions.length} đề xuất</span>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {data.actions.map((a: any, i: number) => (
              <div key={i} className="task-widget" style={{ padding: '10px 14px' }}>
                <Icon name="flag" />
                <span className="small grow" style={{ fontWeight: 500 }}>{a.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {weak.data?.groups?.length > 0 && (
        <div className="widget-card">
          <div className="widget-head">
            <h2 className="widget-title">
              <Icon name="flag" /> Nhóm học sinh cần hỗ trợ
            </h2>
            <span className="badge amber">{weak.data.groups.length} nhóm</span>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {weak.data.groups.slice(0, 6).map((g: any) => (
              <div key={g.topic} className="task-widget" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <div className="strong small" style={{ color: '#111827' }}>{g.name}</div>
                  <div className="tiny muted">{g.students.map((s: any) => `${s.name} (${Math.round(s.value * 100)}%)`).join(', ')}</div>
                </div>
                <button className="btn sm primary" disabled={assigning === g.topic} onClick={() => assignPractice(g.topic, g.name, g.students.length)}>
                  Giao phiếu luyện ({g.students.length} em)
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="card">
        <div className="card-head">
          <h2>Bản đồ năng lực: học sinh × chuyên đề</h2>
        </div>
        {topics.length === 0 ? (
          <p className="muted">Lớp chưa làm bài nào. Giao một đề để bắt đầu có dữ liệu.</p>
        ) : (
          <div className="table-wrap">
            <table className="t heat">
              <thead>
                <tr>
                  <th>Học sinh</th>
                  {topics.map((t) => (
                    <th key={t} title={meta.topics.find((x) => x.code === t)?.name} style={{ whiteSpace: 'normal', minWidth: 70, fontSize: 11, textTransform: 'none' }}>
                      {meta.topics.find((x) => x.code === t)?.name.split(' ').slice(0, 4).join(' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="strong">Cả lớp</td>
                  {data.classMastery.map((m: any) => (
                    <td key={m.topic} className="cell" style={heatColor(m.value)}>
                      {Math.round(m.value * 100)}
                    </td>
                  ))}
                </tr>
                {data.students.map((s: any) => (
                  <tr key={s.id} className="click" onClick={() => (location.hash = `/hoc-sinh/${s.id}`)}>
                    <td>
                      <a href={`#/hoc-sinh/${s.id}`}>{s.display_name}</a>
                    </td>
                    {topics.map((t) => {
                      const v = data.heat[s.id]?.[t]?.value;
                      return (
                        <td key={t} className="cell" style={heatColor(v)} title={data.heat[s.id]?.[t] ? `${data.heat[s.id][t].n} câu` : 'Chưa có dữ liệu'}>
                          {v === undefined ? '·' : Math.round(v * 100)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="tiny muted mt">Số là % năng lực ước lượng (có tính mức độ câu và độ mới của bài). Đỏ dưới 50, vàng dưới 75. Bấm tên để xem chi tiết.</p>
      </div>
      <div className="grid-2">
        <div className="card">
          <h2>Kiểu lỗi của cả lớp</h2>
          {errTotal === 0 && <p className="muted small">Chưa có dữ liệu.</p>}
          {Object.entries(data.errors as Record<string, number>)
            .filter(([k]) => k !== 'blank')
            .sort((a, b) => b[1] - a[1])
            .map(([k, n]) => (
              <div key={k} className="mb">
                <div className="row between small">
                  <ErrorTypeBadge type={k} />
                  <span>{n}</span>
                </div>
                <Bar value={n / errTotal} color="var(--violet)" />
              </div>
            ))}
        </div>
        <div className="card">
          <h2>Bài đã giao</h2>
          {data.assignments.map((a: any) => (
            <a key={a.id} className="list-item" href={`#/bai-giao/${a.id}`} style={{ color: 'inherit' }}>
              <div className="grow">
                <div className="small strong">{a.title}</div>
                <div className="tiny muted">
                  {a.submitted} bài nộp · đóng {fmtDateTime(a.close_at)}
                </div>
              </div>
              <b style={{ color: scoreColor(a.avg) }}>{fmtScore(a.avg)}</b>
            </a>
          ))}
          {data.assignments.length === 0 && <p className="muted small">Chưa giao bài nào.</p>}
        </div>
      </div>
    </div>
  );
}

export function ProfileView({ data, self }: { data: any; self?: boolean }) {
  const { meta } = useApp();
  const errs = Object.entries(data.errorCount as Record<string, number>).filter(([k, n]) => k !== 'blank' && n > 0);
  return (
    <div className="stack">
      <div className="grid-3">
        <div className="card stat">
          <span className="v">{data.attempts.filter((a: any) => a.status !== 'in_progress').length}</span>
          <span className="k">Bài đã làm</span>
        </div>
        <div className="card stat">
          <span className="v">{data.review.total}</span>
          <span className="k">Câu trong sổ lỗi sai ({data.review.due} đến hạn)</span>
        </div>
        <div className="card stat">
          <span className="v">{data.days.reduce((s: number, d: any) => s + d.questions, 0)}</span>
          <span className="k">Câu đã làm 4 tuần gần đây</span>
        </div>
      </div>
      {data.recommendations.length > 0 && (
        <div className="card">
          <h2>{self ? 'Em nên học tiếp' : 'Gợi ý cho em này'}</h2>
          {data.recommendations.map((r: any) => (
            <div key={r.topic} className="list-item">
              <div className="grow">
                <div className="strong small">{r.name}</div>
                <div className="tiny muted">
                  {r.reason} {r.tip ? `Lưu ý: ${r.tip}.` : ''}
                </div>
              </div>
            </div>
          ))}
          {self && (
            <a className="btn primary mt" href="#/luyen-tap">
              Bắt đầu luyện
            </a>
          )}
        </div>
      )}
      <div className="grid-2">
        <div className="card">
          <h2>Năng lực theo chuyên đề</h2>
          {data.mastery.length === 0 && <p className="muted small">Chưa có dữ liệu.</p>}
          {data.mastery.map((m: any) => (
            <div key={m.topic} className="mb">
              <div className="row between small">
                <span>{m.name}</span>
                <span className="muted">
                  {pct(m.value)} · {m.n} câu{m.confident ? '' : ' · ít dữ liệu'}
                </span>
              </div>
              <Bar value={m.value} />
            </div>
          ))}
        </div>
        <div className="card">
          <h2>Kiểu lỗi (60 ngày)</h2>
          {errs.length === 0 && <p className="muted small">Chưa có lỗi sai nào.</p>}
          {errs.map(([k, n]) => (
            <div key={k} className="list-item">
              <ErrorTypeBadge type={k} />
              <div className="grow tiny muted">{meta.errorTypes[k]?.hint}</div>
              <b>{n}</b>
            </div>
          ))}
          {data.blankCount > 0 && <p className="tiny muted mt">Bỏ trống {data.blankCount} câu — có thể do thiếu thời gian.</p>}
        </div>
      </div>
      <div className="card">
        <h2>Lịch sử làm bài</h2>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Bài</th>
                <th>Loại</th>
                <th>Ngày</th>
                <th className="right">Điểm</th>
              </tr>
            </thead>
            <tbody>
              {data.attempts.map((a: any) => (
                <tr key={a.id} className="click" onClick={() => a.status !== 'in_progress' && (location.hash = self ? `/ket-qua/${a.id}` : `/bai-lam/${a.id}`)}>
                  <td>{a.title}</td>
                  <td className="small muted">{a.kind === 'practice' ? 'Luyện tập' : a.mode === 'homework' ? 'Bài tập' : 'Kiểm tra'}</td>
                  <td className="small">{fmtDateTime(a.started_at)}</td>
                  <td className="right strong" style={{ color: scoreColor(a.score10) }}>
                    {a.status === 'in_progress' ? 'Đang làm' : fmtScore(a.score10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function StudentProfilePage({ id }: { id: number }) {
  const { data, error, loading, reload } = useAsync(() => get(`/api/students/${id}/profile`), [id]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div className="stack">
      <div>
        {data.student.class && <a className="small" href={`#/lop/${data.student.class.id}`}>Về lớp {data.student.class.name}</a>}
        <h1>{data.student.displayName}</h1>
        <div className="muted small">Lớp {data.student.class?.name}</div>
      </div>
      <ProfileView data={data} />
      <FamilyAccess studentId={id} />
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = { hidden: 'Rời tab/ứng dụng', blur: 'Rời cửa sổ', paste: 'Dán chữ', fullscreen_exit: 'Thoát toàn màn hình', second_device: 'Mở trên máy khác', offline: 'Mất mạng', online: 'Có mạng lại' };

const TEACHER_STAMPS = [
  '🌟 Tiến bộ vượt bậc',
  '👏 Làm bài rất tốt',
  '⚠️ Cẩn thận tính toán',
  '💡 Cần đọc kỹ đề bài',
  '🎯 Cố gắng hơn nhé',
];

export function TeacherAttemptView({ id }: { id: number }) {
  const { toast } = useApp();
  const { data, error, loading, reload } = useAsync(() => get(`/api/teacher/attempts/${id}`), [id]);
  const [stamp, setStamp] = useState<string>('');
  const [feedback, setFeedback] = useState<string>('');
  const [submittingFeedback, setSubmittingFeedback] = useState<boolean>(false);

  const handleSendFeedback = async () => {
    if (!stamp && !feedback.trim()) {
      toast('Vui lòng chọn nhãn tem hoặc viết lời phê cho học sinh.');
      return;
    }
    setSubmittingFeedback(true);
    try {
      await post(`/api/teacher/attempts/${id}/feedback`, {
        stamp: stamp || data?.teacherStamp || '',
        feedback: feedback.trim(),
      });
      toast('Đã lưu và gửi lời phê cho học sinh thành công!');
      setFeedback('');
      reload();
    } catch (e: any) {
      toast(e.message || 'Không thể lưu lời phê.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data.result) return <div className="card stack">{data.classId&&<a className="small" href={`#/lop/${data.classId}/ket-qua${data.assignmentId?`/${data.assignmentId}`:''}`}>Về kết quả lớp</a>}<h1>{data.student}</h1><p>Bài đang làm, chưa có kết quả.</p>{data.kind === 'assignment' && <AttemptActions attemptId={id} status={data.status} onDone={reload} />}</div>;
  return (
    <div className="stack">
      <div className="card">
        {data.classId&&<a className="small" href={`#/lop/${data.classId}/ket-qua${data.assignmentId?`/${data.assignmentId}`:''}`}>Về kết quả lớp</a>}
        <div className="small muted">{data.title}</div>
        <h1>
          {data.student}: <span style={{ color: scoreColor(data.result.score10) }}>{fmtScore(data.result.score10)}</span> điểm
        </h1>
        <div className="small muted">
          Bắt đầu {fmtDateTime(data.startedAt)} · nộp {data.submittedAt ? fmtDateTime(data.submittedAt) : '—'} {data.status === 'auto_submitted' ? '(máy chủ tự nộp khi hết giờ)' : ''}
        </div>
        {data.events?.length > 0 && (
          <div className="mt">
            <h3>Tín hiệu trong lúc làm bài</h3>
            <p className="tiny muted">Đây chỉ là tín hiệu để giáo viên xem xét, không tự kết luận gian lận.</p>
            <div className="row">
              {data.events.map((e: any, i: number) => (
                <span key={i} className="badge">
                  {EVENT_LABEL[e.type] ?? e.type} · {new Date(e.at).toLocaleTimeString('vi-VN')}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* KHỐI LỜI PHÊ & TEM KHÍCH LỆ CỦA GIÁO VIÊN */}
      <div className="card" style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: 12, padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>📝</span>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
              Lời phê & Tem khích lệ của Giáo viên
            </h2>
          </div>
          {data.feedbackAt && (
            <span style={{ fontSize: 11.5, color: '#64748b' }}>
              Đã gửi lúc {fmtDateTime(data.feedbackAt)}
            </span>
          )}
        </div>

        {/* Saved preview if exists */}
        {(data.teacherStamp || data.teacherFeedback) && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {data.teacherStamp && (
                <span style={{ fontWeight: 800, fontSize: 13, color: '#166534', background: '#dcfce7', padding: '2px 8px', borderRadius: 5 }}>
                  {data.teacherStamp}
                </span>
              )}
              <span style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>Lời phê hiện tại học sinh đang thấy:</span>
            </div>
            {data.teacherFeedback && (
              <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#14532d', fontStyle: 'italic', lineHeight: 1.45 }}>
                “{data.teacherFeedback}”
              </p>
            )}
          </div>
        )}

        {/* Stamp Selector */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
            Chọn tem đánh giá nhanh:
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TEACHER_STAMPS.map((s) => {
              const active = (stamp || data.teacherStamp) === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStamp(s)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 99,
                    fontSize: 12,
                    fontWeight: active ? 800 : 600,
                    background: active ? '#1e4d3b' : '#ffffff',
                    color: active ? '#ffffff' : '#334155',
                    border: active ? '1px solid #1e4d3b' : '1px solid #cbd5e1',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        {/* Feedback Input */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
            Nhận xét chi tiết cho bài làm của em {data.student}:
          </div>
          <textarea
            className="input"
            rows={2}
            placeholder="Ví dụ: Em nắm chắc kiến thức cơ bản, cần chú ý tính toán cẩn thận hơn ở các câu phần II..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            style={{ width: '100%', fontSize: 13, marginBottom: 8 }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn primary sm"
            disabled={submittingFeedback}
            onClick={handleSendFeedback}
            style={{ fontWeight: 700, borderRadius: 8 }}
          >
            {submittingFeedback ? 'Đang gửi…' : 'Gửi lời phê cho học sinh'}
          </button>
        </div>
      </div>

      <ResultSummary data={data} />
      {data.kind === 'assignment' && <div className="card"><AttemptActions attemptId={id} status={data.status} onDone={reload} /></div>}
      <AttemptReview data={data} />
    </div>
  );
}
