import { useState } from 'react';
import { FileDown, ScanLine } from 'lucide-react';
import { get, printHtmlFromApi } from '../../api';
import { ErrorBox, fmtDateTime, Loading, useApp, useAsync } from '../../ui/kit';
import { OmrModal } from '../../ui/OmrModal';
import { ExamSectionTabs } from '../../ui/TeacherNavBars';

/**
 * Chấm phiếu tô: chọn bài đã giao (bài làm trên giấy) → chụp/tải phiếu → xem lại → lưu điểm vào bảng điểm lớp.
 */
export function OmrPage() {
  const { toast } = useApp();
  const { data, error, loading, reload } = useAsync(() => get<{ assignments: any[] }>('/api/assignments'), []);
  const [opening, setOpening] = useState<number | null>(null);
  const [session, setSession] = useState<{ exam: any; assignmentId: number; students: { id: number; name: string }[] } | null>(null);

  const open = async (a: any) => {
    setOpening(a.id);
    try {
      const [exam, report] = await Promise.all([get<any>(`/api/exams/${a.exam_id}`), get<any>(`/api/assignments/${a.id}/report`)]);
      const students = (report.rows ?? [])
        .filter((r: any) => !r.attemptId && r.status !== 'submitted')
        .map((r: any) => ({ id: r.studentId ?? r.id, name: r.name ?? r.displayName }));
      setSession({ exam: exam.exam ?? exam, assignmentId: a.id, students });
    } catch (e: any) {
      toast(e.message || 'Không mở được bài giao.');
    } finally {
      setOpening(null);
    }
  };

  const list = (data?.assignments ?? []).slice().sort((x: any, y: any) => y.open_at - x.open_at);

  return (
    <div className="su-page">
      <ExamSectionTabs active="omr" />
      <header className="su-head">
        <div>
          <h1>Chấm phiếu tô</h1>
          <p className="su-sub">Chọn bài đã giao, chụp hoặc tải ảnh phiếu, xem lại ô nhận sai rồi lưu điểm vào bảng điểm của lớp.</p>
        </div>
        <button type="button" className="btn" onClick={() => printHtmlFromApi('/api/omr/template').catch((e: any) => toast(e.message))}>
          <FileDown size={15} aria-hidden="true" /> In mẫu phiếu trả lời
        </button>
      </header>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : list.length === 0 ? (
        <div className="su-card su-empty">Chưa có bài nào đã giao. Giao đề từ Kho đề cho lớp (bài thi trên giấy) rồi quay lại đây để chấm.</div>
      ) : (
        <section className="su-card" style={{ padding: '4px 16px' }} aria-label="Bài đã giao">
          <div className="su-list">
            {list.map((a: any) => (
              <div key={a.id} className="su-row">
                <div className="su-row-icon"><ScanLine size={17} aria-hidden="true" /></div>
                <div className="su-row-main">
                  <div className="su-row-title" style={{ fontSize: 13.5 }}>{a.title}</div>
                  <div className="su-row-meta">
                    <span>Lớp {a.class_name}</span>
                    <span>· {a.submitted ?? 0}/{a.students ?? 0} đã có điểm</span>
                    <span>· mở {fmtDateTime(a.open_at)}</span>
                  </div>
                </div>
                <button type="button" className="btn sm primary" disabled={opening === a.id} onClick={() => open(a)}>
                  {opening === a.id ? 'Đang mở…' : 'Chấm phiếu'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {session && (
        <OmrModal
          exam={session.exam}
          record={{ assignmentId: session.assignmentId, students: session.students }}
          onClose={() => {
            setSession(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

export default OmrPage;
