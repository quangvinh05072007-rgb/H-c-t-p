import { useEffect, useMemo, useState } from 'react';
import { del, get, post } from '../../api';
import { MathText } from '../../ui/MathText';
import { ErrorBox, fmtDate, go, Loading, Modal, PageHeading, useApp, useAsync } from '../../ui/kit';

type Coded = { code: string; name: string };
type Version = {
  id: number;
  name: string;
  sourceDoc: string;
  status: 'draft' | 'published' | 'archived';
  origin: string | null;
  createdAt: number;
  createdBy: string | null;
  publishedAt: number | null;
  publishedBy: string | null;
  outcomes: number;
};
type Outcome = { code: string; grade: number; topic: string; strand: string | null; content: string; text: string; competencies: string[]; questions: number };
type Detail = {
  curriculum: Version;
  outcomes: Outcome[];
  topics: { code: string; grade: number; name: string }[];
  diff: { against: string; added: string[]; removed: string[]; changed: string[] } | null;
};

const STATUS: Record<Version['status'], { label: string; cls: string }> = {
  published: { label: 'Đang dùng', cls: 'is-good' },
  draft: { label: 'Nháp – chưa công bố', cls: 'is-warn' },
  archived: { label: 'Lưu trữ', cls: '' },
};

/** Kho chương trình chuẩn: chủ web nhập văn bản chương trình (YCCĐ) qua gói, xem, so sánh, công bố. */
export function CurriculumAdmin() {
  const { data, error, loading, reload } = useAsync(() => get<{ versions: Version[]; strands: Coded[]; competencies: Coded[] }>('/api/curricula'), []);
  const [selected, setSelected] = useState<number | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const versions = data?.versions ?? [];
  useEffect(() => {
    if (versions.length && !versions.some((v) => v.id === selected)) setSelected(versions[0].id);
  }, [versions, selected]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  return (
    <div className="stack">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <PageHeading
          title="Chương trình chuẩn"
          icon="book"
          description="Yêu cầu cần đạt (YCCĐ) của chương trình môn Toán theo từng lớp, chuyên đề. Câu hỏi trong ngân hàng gắn với YCCĐ để biết phần nào đã đủ câu, phần nào còn thiếu."
        />
        <div className="row">
          <button className="btn" onClick={() => setPromptOpen(true)}>
            Lời nhắc cho AI
          </button>
          <button className="btn primary" onClick={() => go('/nhap-de')}>
            Nhập chương trình
          </button>
        </div>
      </div>

      {versions.length === 0 ? (
        <div className="card">
          <h2>Chưa có chương trình</h2>
          <ol className="cur-steps">
            <li>Bấm <b>Lời nhắc cho AI</b>, chép lời nhắc.</li>
            <li>Dán vào AI bất kỳ (ChatGPT, Claude, Gemini…), đính kèm văn bản chương trình môn Toán chính thức (phần bảng yêu cầu cần đạt lớp 10–12).</li>
            <li>Vào <b>Nhập đề</b>, dán JSON AI trả về, bấm kiểm tra rồi nhập. Chương trình được lưu thành bản nháp.</li>
            <li>Quay lại đây xem lại từng YCCĐ, đối chiếu văn bản gốc, rồi bấm <b>Công bố</b>.</li>
          </ol>
          <p className="small muted">Mỗi lần nhập là một phiên bản mới; bản đang dùng chỉ đổi khi bạn công bố bản khác.</p>
        </div>
      ) : (
        <>
          <div className="cur-versions" role="tablist" aria-label="Phiên bản chương trình">
            {versions.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={v.id === selected}
                className={`cur-version ${v.id === selected ? 'is-on' : ''}`}
                onClick={() => setSelected(v.id)}
              >
                <span className={`su-chip ${STATUS[v.status].cls}`}>{STATUS[v.status].label}</span>
                <b>{v.name}</b>
                <span className="small muted">
                  {v.outcomes} YCCĐ · nhập {fmtDate(v.createdAt)}
                  {v.createdBy ? ` · ${v.createdBy}` : ''}
                </span>
              </button>
            ))}
          </div>
          {selected !== null && <VersionDetail key={selected} id={selected} onChanged={reload} />}
        </>
      )}
      {promptOpen && <CurriculumPromptModal onClose={() => setPromptOpen(false)} />}
    </div>
  );
}

function VersionDetail({ id, onChanged }: { id: number; onChanged: () => void }) {
  const { toast } = useApp();
  const { data, error, loading, reload } = useAsync(() => get<Detail>(`/api/curricula/${id}`), [id]);
  const [grade, setGrade] = useState(10);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [q, setQ] = useState('');
  const comps = useAsync(() => get<{ competencies: Coded[]; strands: Coded[] }>('/api/curriculum'), []);
  const compName = useMemo(() => Object.fromEntries((comps.data?.competencies ?? []).map((c) => [c.code, c.name])), [comps.data]);
  const strandName = useMemo(() => Object.fromEntries((comps.data?.strands ?? []).map((c) => [c.code, c.name])), [comps.data]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { curriculum: c, outcomes, topics, diff } = data!;
  const covered = outcomes.filter((o) => o.questions > 0).length;
  const term = q.trim().toLowerCase();
  const shown = outcomes.filter((o) => o.grade === grade && (!onlyMissing || o.questions === 0) && (!term || `${o.code} ${o.text} ${o.content}`.toLowerCase().includes(term)));
  const byTopic = topics.filter((t) => t.grade === grade).map((t) => ({ ...t, list: shown.filter((o) => o.topic === t.code) })).filter((t) => t.list.length);
  const gradeStats = (g: number) => {
    const all = outcomes.filter((o) => o.grade === g);
    return `${all.filter((o) => o.questions > 0).length}/${all.length}`;
  };

  const publish = async () => {
    if (!window.confirm(`Công bố "${c.name}"? Giáo viên và học sinh sẽ thấy bản này; bản đang dùng chuyển sang lưu trữ.`)) return;
    try {
      await post(`/api/curricula/${c.id}/publish`);
      toast('Đã công bố chương trình.');
      onChanged();
      reload();
    } catch (e: any) {
      toast(e.message);
    }
  };
  const remove = async () => {
    if (!window.confirm(`Xóa hẳn "${c.name}" (${c.outcomes} YCCĐ)? Không khôi phục được. Câu hỏi đã gắn mã vẫn giữ mã.`)) return;
    try {
      await del(`/api/curricula/${c.id}`);
      toast('Đã xóa phiên bản.');
      onChanged();
    } catch (e: any) {
      toast(e.message);
    }
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="row between" style={{ alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>{c.name}</h2>
            <div className="small muted">
              {c.sourceDoc ? `Văn bản: ${c.sourceDoc}` : 'Chưa ghi văn bản gốc'}
              {c.publishedAt ? ` · công bố ${fmtDate(c.publishedAt)}${c.publishedBy ? ` bởi ${c.publishedBy}` : ''}` : ''}
            </div>
          </div>
          {c.status !== 'published' && (
            <div className="row">
              <button className="btn" onClick={remove}>
                Xóa
              </button>
              <button className="btn primary" onClick={publish}>
                Công bố bản này
              </button>
            </div>
          )}
        </div>
        <div className="cur-stats">
          <div>
            <b>{outcomes.length}</b>
            <span>YCCĐ</span>
          </div>
          <div>
            <b>
              {covered}/{outcomes.length}
            </b>
            <span>YCCĐ đã có câu duyệt</span>
          </div>
          <div>
            <b>{outcomes.length - covered}</b>
            <span>YCCĐ chưa có câu</span>
          </div>
        </div>
        {diff && (
          <div className="alert info small" style={{ marginTop: 12 }}>
            So với bản đang dùng ({diff.against}): <b>{diff.added.length}</b> YCCĐ mới, <b>{diff.removed.length}</b> bị bỏ, <b>{diff.changed.length}</b> đổi nội dung.
            {diff.removed.length > 0 && <div>Bị bỏ: {diff.removed.join(', ')}. Câu hỏi đang gắn các mã này sẽ không còn hiện YCCĐ.</div>}
            {diff.changed.length > 0 && <div>Đổi nội dung: {diff.changed.join(', ')}.</div>}
          </div>
        )}
      </div>

      <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="seg" role="group" aria-label="Lớp">
          {[10, 11, 12].map((g) => (
            <button key={g} type="button" className={grade === g ? 'on' : ''} onClick={() => setGrade(g)}>
              Lớp {g} <span className="muted">({gradeStats(g)})</span>
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 10 }}>
          <input className="input" style={{ width: 220 }} placeholder="Tìm mã hoặc nội dung" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm YCCĐ" />
          <label className="small row" style={{ gap: 6 }}>
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Chỉ YCCĐ chưa có câu
          </label>
        </div>
      </div>

      {byTopic.length === 0 && <div className="card small muted">Không có YCCĐ nào khớp.</div>}
      {byTopic.map((t) => (
        <div className="card" key={t.code}>
          <h2 className="cur-topic">
            {t.name} <span className="small muted">{t.code}</span>
          </h2>
          <ul className="cur-list">
            {t.list.map((o) => (
              <li key={o.code} className={diff?.added.includes(o.code) || diff?.changed.includes(o.code) ? 'is-new' : ''}>
                <code className="cur-code">{o.code}</code>
                <div className="cur-body">
                  <MathText text={o.text} as="div" />
                  <div className="cur-meta">
                    {o.content && <span>{o.content}</span>}
                    {o.strand && <span className="su-chip">{strandName[o.strand] ?? o.strand}</span>}
                    {o.competencies.map((k) => (
                      <span key={k} className="su-chip" title={compName[k] ?? k}>
                        {k}
                      </span>
                    ))}
                    {diff?.added.includes(o.code) && <span className="su-chip is-good">Mới</span>}
                    {diff?.changed.includes(o.code) && <span className="su-chip is-warn">Đổi nội dung</span>}
                  </div>
                </div>
                <span className={`su-chip ${o.questions ? 'is-good' : 'is-warn'}`} title="Số câu đã duyệt trong ngân hàng gắn YCCĐ này">
                  {o.questions ? `${o.questions} câu` : 'Chưa có câu'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function CurriculumPromptModal({ onClose }: { onClose: () => void }) {
  const { toast } = useApp();
  const { data } = useAsync(() => get<{ text: string }>('/api/curricula/ai-prompt'), []);
  const copy = async () => {
    await navigator.clipboard.writeText(data?.text ?? '');
    toast('Đã chép lời nhắc. Dán vào AI rồi đính kèm văn bản chương trình.');
  };
  return (
    <Modal title="Lời nhắc chuyển chương trình cho AI" onClose={onClose} width={720}>
      <p className="small muted" style={{ marginTop: 0 }}>
        Đính kèm văn bản chương trình môn Toán chính thức (bảng yêu cầu cần đạt). AI chỉ chép lại nguyên văn và gắn mã; bạn vẫn cần đối chiếu trước khi công bố.
      </p>
      <textarea className="pk-paste" readOnly value={data?.text ?? 'Đang soạn…'} rows={14} />
      <div className="su-actions">
        <button type="button" className="btn primary" disabled={!data?.text} onClick={copy}>
          Chép lời nhắc
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Đóng
        </button>
      </div>
    </Modal>
  );
}
