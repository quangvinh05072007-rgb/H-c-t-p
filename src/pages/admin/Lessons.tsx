import { useState } from 'react';
import { del, get, post } from '../../api';
import { ErrorBox, fmtDateTime, go, Loading, Modal, PageHeading, useApp, useAsync } from '../../ui/kit';

type TopicRow = {
  code: string;
  grade: number;
  name: string;
  imported: { source: string | null; updatedAt: number; updatedBy: string | null } | null;
  versions: number;
};
type Version = { id: number; source: string | null; title: string | null; updatedAt: number; updatedBy: string | null; replacedAt: number };

/** Chủ web quản lý bài tự học: bài đang dùng của từng chuyên đề, lịch sử các bản, khôi phục, về bài mặc định. */
export function LessonAdmin() {
  const { toast } = useApp();
  const { data, error, loading, reload } = useAsync(() => get<{ topics: TopicRow[] }>('/api/admin/lessons'), []);
  const [open, setOpen] = useState<TopicRow | null>(null);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const topics = data!.topics;
  const importedCount = topics.filter((t) => t.imported).length;

  const reset = async (t: TopicRow) => {
    if (!window.confirm(`Đưa "${t.name}" về bài mặc định của app? Bài đang dùng được cất vào lịch sử, khôi phục lại được.`)) return;
    try {
      await del(`/api/admin/lessons/${t.code}`);
      toast('Đã về bài mặc định.');
      reload();
    } catch (e: any) {
      toast(e.message);
    }
  };

  return (
    <div className="stack">
      <div className="row between">
        <PageHeading
          title="Bài tự học"
          icon="book"
          description={`Lý thuyết học sinh xem ở mục Tự học. ${importedCount}/${topics.length} chuyên đề đang dùng bài bạn nhập, còn lại dùng bài mặc định của app.`}
        />
        <button className="btn primary" onClick={() => go('/nhap-de')}>
          Nhập bài học
        </button>
      </div>
      <div className="alert info small">
        Chỉ chủ web nhập được bài tự học (trong gói nhập, mục <code>lessons</code>). Gói của giáo viên có bài học thì phần bài học bị bỏ qua. Mỗi lần nhập lại, bài cũ được cất vào lịch sử.
      </div>
      {[10, 11, 12].map((g) => (
        <div className="card table-wrap" key={g}>
          <h2>Lớp {g}</h2>
          <table className="t">
            <thead>
              <tr>
                <th>Chuyên đề</th>
                <th>Bài đang dùng</th>
                <th>Lịch sử</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {topics
                .filter((t) => t.grade === g)
                .map((t) => (
                  <tr key={t.code}>
                    <td className="strong">{t.name}</td>
                    <td>
                      {t.imported ? (
                        <>
                          <span className="badge">Đã nhập</span>{' '}
                          <span className="small muted">
                            {fmtDateTime(t.imported.updatedAt)}
                            {t.imported.updatedBy ? ` · ${t.imported.updatedBy}` : ''}
                            {t.imported.source ? ` · ${t.imported.source.replace(/^Gói nhập: /, '')}` : ''}
                          </span>
                        </>
                      ) : (
                        <span className="small muted">Bài mặc định</span>
                      )}
                    </td>
                    <td>
                      {t.versions > 0 ? (
                        <button className="btn sm" onClick={() => setOpen(t)}>
                          {t.versions} bản cũ
                        </button>
                      ) : (
                        <span className="small muted">—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {t.imported && (
                        <button className="btn sm" onClick={() => reset(t)}>
                          Về mặc định
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
      {open && (
        <LessonHistory
          topic={open}
          onClose={() => setOpen(null)}
          onRestored={() => {
            setOpen(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function LessonHistory({ topic, onClose, onRestored }: { topic: TopicRow; onClose: () => void; onRestored: () => void }) {
  const { toast } = useApp();
  const { data, error, loading, reload } = useAsync(() => get<{ versions: Version[] }>(`/api/admin/lessons/${topic.code}/versions`), [topic.code]);
  const restore = async (v: Version) => {
    if (!window.confirm('Dùng lại bản này? Bài đang dùng được cất vào lịch sử.')) return;
    try {
      await post(`/api/admin/lessons/${topic.code}/restore`, { versionId: v.id });
      toast('Đã khôi phục bài học.');
      onRestored();
    } catch (e: any) {
      toast(e.message);
    }
  };
  return (
    <Modal title={`Lịch sử bài học: ${topic.name}`} onClose={onClose} width={640}>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : (
        <table className="t">
          <thead>
            <tr>
              <th>Bản</th>
              <th>Dùng đến</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data!.versions.map((v) => (
              <tr key={v.id}>
                <td>
                  <div className="small">
                    {fmtDateTime(v.updatedAt)}
                    {v.updatedBy ? ` · ${v.updatedBy}` : ''}
                  </div>
                  <div className="small muted">{v.source ? v.source.replace(/^Gói nhập: /, '') : 'Không rõ nguồn'}</div>
                  {v.title && <div className="small muted">{v.title}</div>}
                </td>
                <td className="small">{fmtDateTime(v.replacedAt)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn sm" onClick={() => restore(v)}>
                    Dùng lại
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
