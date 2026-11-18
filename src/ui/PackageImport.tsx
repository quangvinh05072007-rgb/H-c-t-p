import { useRef, useState } from 'react';
import { CircleAlert, CircleCheck, FileArchive, Upload } from 'lucide-react';
import { api, download } from '../api';
import { go, useApp } from './kit';

type Summary = {
  source: string;
  questions: number;
  byType: Record<string, number>;
  exams: { title: string; count: number; durationMin: number }[];
  lessons: { topic: string; name: string }[];
  errors: { where: string; message: string }[];
  warnings: string[];
};
type Done = {
  approved: number;
  drafts: number;
  skipped: number;
  exams: { id: number; title: string }[];
  lessons: number;
  images: number;
  errors: { where: string; message: string }[];
  warnings: string[];
};

const TYPE_LABEL: Record<string, string> = { mcq: 'trắc nghiệm', tf: 'đúng/sai', short: 'trả lời ngắn' };

/**
 * Gói nhập chuẩn (.json/.zip): đề và tài liệu xử lý bên ngoài rồi đưa vào. Hai bước: kiểm tra (không ghi gì) → nhập.
 */
export function PackageImport() {
  const { toast } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [approve, setApprove] = useState(true);
  const [busy, setBusy] = useState(false);

  const send = async (f: File, dryRun: boolean) => {
    const q = new URLSearchParams({ filename: f.name });
    if (dryRun) q.set('dryRun', '1');
    if (!dryRun && approve) q.set('approve', '1');
    return api<any>('POST', `/api/import/package?${q}`, undefined, { raw: await f.arrayBuffer(), timeoutMs: 120000 });
  };

  const check = async (f: File) => {
    setFile(f);
    setSummary(null);
    setDone(null);
    setBusy(true);
    try {
      setSummary(await send(f, true));
    } catch (e: any) {
      toast(e.message || 'Không đọc được gói.');
      setFile(null);
    } finally {
      setBusy(false);
    }
  };

  const importNow = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const r: Done = await send(file, false);
      setDone(r);
      setSummary(null);
      toast(`Đã nhập ${r.approved + r.drafts} câu, ${r.exams.length} đề, ${r.lessons} bài học.`);
    } catch (e: any) {
      toast(e.message || 'Nhập gói thất bại.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setSummary(null);
    setDone(null);
    if (input.current) input.current.value = '';
  };

  const nothingValid = summary && summary.questions === 0 && summary.lessons.length === 0;

  return (
    <section className="su-card" aria-label="Gói nhập chuẩn">
      <div className="su-card-head">
        <h2><FileArchive size={16} aria-hidden="true" style={{ verticalAlign: -3, color: 'var(--primary)' }} /> Gói nhập chuẩn</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="su-link" onClick={() => download('/api/import/package-sample.json', 'goi-nhap-mau.json').catch((e) => toast(e.message))}>
            Tải gói mẫu
          </button>
          <a className="su-link" href="https://github.com/quangvinh05072007-rgb/H-c-t-p/blob/main/docs/goi-nhap.md" target="_blank" rel="noreferrer">
            Đặc tả gói
          </a>
        </div>
      </div>
      <p className="su-row-meta" style={{ marginTop: -4, marginBottom: 12 }}>
        Câu hỏi, đề thi và bài học Tự học trong một file <b>.json</b> (hoặc <b>.zip</b> kèm thư mục hình). App kiểm tra trước, báo lỗi từng mục rồi mới nhập.
      </p>

      {!summary && !done && (
        <div className="su-actions" style={{ marginTop: 0 }}>
          <button type="button" className="btn primary" disabled={busy} onClick={() => input.current?.click()}>
            <Upload size={15} aria-hidden="true" /> {busy ? 'Đang kiểm tra…' : 'Chọn gói .json / .zip'}
          </button>
          <input
            ref={input}
            type="file"
            accept=".json,.zip,application/json,application/zip"
            hidden
            onChange={(e) => e.target.files?.[0] && check(e.target.files[0])}
          />
        </div>
      )}

      {summary && (
        <div className="su-list">
          <div className="su-row" style={{ padding: '6px 0' }}>
            <div className="su-row-main">
              <div className="su-row-title">{summary.source || file?.name}</div>
              <div className="su-row-meta">
                <span>{summary.questions} câu hợp lệ{summary.questions ? ` (${Object.entries(summary.byType).map(([k, n]) => `${n} ${TYPE_LABEL[k] ?? k}`).join(', ')})` : ''}</span>
                <span>· {summary.exams.length} đề</span>
                <span>· {summary.lessons.length} bài học</span>
              </div>
            </div>
          </div>
          {summary.exams.length > 0 && (
            <div className="su-row-meta" style={{ padding: '4px 0' }}>Đề: {summary.exams.map((e) => `${e.title} (${e.count} câu, ${e.durationMin} phút)`).join(' · ')}</div>
          )}
          {summary.lessons.length > 0 && (
            <div className="su-row-meta" style={{ padding: '4px 0' }}>Bài học: {summary.lessons.map((l) => l.name).join(' · ')}</div>
          )}
          {summary.errors.length > 0 && (
            <div className="su-mistake-why" style={{ margin: '8px 0', background: 'var(--bad-soft)' }}>
              <div>
                <CircleAlert size={14} aria-hidden="true" color="var(--bad)" />
                <span><b>{summary.errors.length} mục lỗi sẽ bị bỏ qua</b> (sửa trong gói rồi nhập lại):</span>
              </div>
              <ul style={{ margin: '0 0 0 22px', padding: 0, maxHeight: 180, overflow: 'auto' }}>
                {summary.errors.map((e, i) => (
                  <li key={i}><b>{e.where}:</b> {e.message}</li>
                ))}
              </ul>
            </div>
          )}
          {summary.warnings.map((w, i) => (
            <div key={i} className="su-row-meta" style={{ color: 'var(--warn)' }}>{w}</div>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '10px 0' }}>
            <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} />
            Duyệt luôn các câu hợp lệ (đã kiểm tra kỹ bên ngoài). Bỏ chọn để lưu ở dạng nháp chờ duyệt.
          </label>
          <div className="su-actions" style={{ marginTop: 0 }}>
            <button type="button" className="btn primary" disabled={busy || !!nothingValid} onClick={importNow}>
              {busy ? 'Đang nhập…' : 'Nhập vào ngân hàng'}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={reset}>Chọn gói khác</button>
          </div>
        </div>
      )}

      {done && (
        <div className="su-list">
          <div className="su-row" style={{ padding: '6px 0' }}>
            <div className="su-row-icon is-good"><CircleCheck size={17} aria-hidden="true" /></div>
            <div className="su-row-main">
              <div className="su-row-title">Đã nhập xong</div>
              <div className="su-row-meta">
                <span>{done.approved} câu đã duyệt</span>
                {done.drafts > 0 && <span>· {done.drafts} câu nháp</span>}
                {done.skipped > 0 && <span>· {done.skipped} câu đã có sẵn (bỏ qua)</span>}
                <span>· {done.exams.length} đề</span>
                <span>· {done.lessons} bài học</span>
                {done.images > 0 && <span>· {done.images} hình</span>}
              </div>
            </div>
          </div>
          {done.warnings.map((w, i) => (
            <div key={i} className="su-row-meta" style={{ color: 'var(--warn)' }}>{w}</div>
          ))}
          <div className="su-actions">
            {done.exams.length > 0 && <button type="button" className="btn primary" onClick={() => go('/thu-vien')}>Xem đề trong Kho đề</button>}
            <button type="button" className="btn" onClick={() => go('/ngan-hang')}>Mở Ngân hàng</button>
            <button type="button" className="btn" onClick={reset}>Nhập gói khác</button>
          </div>
        </div>
      )}
    </section>
  );
}
