import { useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { Bot, CircleAlert, CircleCheck, ClipboardPaste, FileArchive, FileText, ImagePlus, Sparkles, Upload, X } from 'lucide-react';
import { api, download, get } from '../api';
import { go, Modal, useApp } from './kit';
import { MathText } from './MathText';

type PreviewQ = {
  key: string;
  type: 'mcq' | 'tf' | 'short';
  stem: string;
  options: string[];
  answer: any;
  explanation: string;
  topic: string;
  topicName: string;
  level: number;
  form: string | null;
  needsReview: boolean;
};
type Summary = {
  source: string;
  questions: number;
  byType: Record<string, number>;
  exams: { title: string; count: number; durationMin: number }[];
  lessons: { topic: string; name: string }[];
  curriculum?: { name: string; sourceDoc: string; outcomes: number; byGrade: Record<string, number> } | null;
  errors: { where: string; message: string }[];
  warnings: string[];
  duplicates?: { key: string; id: number; score: number; exact: boolean }[];
  preview?: PreviewQ[];
  imageData?: Record<string, string>;
  missingImages?: string[];
  original?: { name: string; size: number } | null;
};
type Done = {
  approved: number;
  drafts: number;
  skipped: number;
  exams: { id: number; title: string }[];
  lessons: number;
  images: number;
  curriculum?: { id: number; outcomes: number } | null;
  errors: { where: string; message: string }[];
  warnings: string[];
};

const TYPE_LABEL: Record<string, string> = { mcq: 'trắc nghiệm', tf: 'đúng/sai', short: 'trả lời ngắn' };
const LEVEL_LABEL = ['', 'Biết', 'Hiểu', 'Vận dụng'];
const IMG_EXT = /\.(png|jpe?g)$/i;

/** Văn bản có [[image:tên]]: công thức qua MathText, hình lấy từ bản xem trước. */
function RichPreview({ text, images }: { text: string; images: Record<string, string> }) {
  const parts = String(text ?? '').split(/(\[\[image:[^\]\n]+\]\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\[\[image:([^\]\n]+)\]\]$/);
        if (!m) return p ? <MathText key={i} text={p} /> : null;
        const name = m[1].trim();
        return images[name] ? (
          <img key={i} src={images[name]} alt={name} className="pk-img" />
        ) : (
          <span key={i} className="pk-img-missing">Thiếu hình {name}</span>
        );
      })}
    </>
  );
}

/**
 * Gói nhập chuẩn: đề/tài liệu do AI bên ngoài chuyển đổi. Ba bước: dán phần AI trả về (hoặc chọn file),
 * đính kèm file Word gốc để app tự lấy hình, kiểm tra + xem trước rồi nhập.
 */
export function PackageImport() {
  const { toast } = useApp();
  const fileInput = useRef<HTMLInputElement>(null);
  const attachInput = useRef<HTMLInputElement>(null);
  const missingInput = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState('');
  const [pkgFile, setPkgFile] = useState<File | null>(null);
  const [docx, setDocx] = useState<File | null>(null);
  const [origPdf, setOrigPdf] = useState<File | null>(null); // đề gốc dạng PDF: chỉ để lưu trữ, đối chiếu
  const [images, setImages] = useState<Record<string, Blob>>({}); // tên trong gói → ảnh
  const [summary, setSummary] = useState<Summary | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [approve, setApprove] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [pasteTarget, setPasteTarget] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);

  const hasInput = Boolean(pasted.trim() || pkgFile);

  /** Gom mọi thứ thành một gói gửi lên: JSON trần nếu không có gì kèm, ngược lại nén .zip. */
  const buildPayload = async (): Promise<{ name: string; data: ArrayBuffer }> => {
    const extras = Object.keys(images).length > 0 || docx || origPdf;
    if (pkgFile && /\.json$/i.test(pkgFile.name) && !extras) return { name: pkgFile.name, data: await pkgFile.arrayBuffer() };
    if (!pkgFile && !extras) return { name: 'goi.json', data: new TextEncoder().encode(pasted).buffer as ArrayBuffer };
    const zip = pkgFile && /\.zip$/i.test(pkgFile.name) ? await JSZip.loadAsync(await pkgFile.arrayBuffer()) : new JSZip();
    if (!pkgFile) zip.file('goi.json', pasted);
    else if (/\.json$/i.test(pkgFile.name)) zip.file('goi.json', await pkgFile.arrayBuffer());
    if (docx) zip.file(`_goc/${docx.name}`, await docx.arrayBuffer());
    if (origPdf && !docx) zip.file(`_goc/${origPdf.name}`, await origPdf.arrayBuffer());
    for (const [name, blob] of Object.entries(images)) zip.file(name, await blob.arrayBuffer());
    return { name: 'goi.zip', data: await zip.generateAsync({ type: 'arraybuffer' }) };
  };

  const send = async (dryRun: boolean) => {
    const { name, data } = await buildPayload();
    const q = new URLSearchParams({ filename: name });
    if (dryRun) q.set('dryRun', '1');
    if (!dryRun && approve) q.set('approve', '1');
    return api<any>('POST', `/api/import/package?${q}`, undefined, { raw: data, timeoutMs: 120000 });
  };

  const check = async () => {
    setDone(null);
    setBusy(true);
    try {
      setSummary(await send(true));
    } catch (e: any) {
      toast(e.message || 'Không đọc được gói.');
    } finally {
      setBusy(false);
    }
  };

  // Thêm/đổi hình là kiểm tra lại ngay để bản xem trước cập nhật
  const recheckSoon = useRef(false);
  useEffect(() => {
    if (recheckSoon.current && summary) {
      recheckSoon.current = false;
      check();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, docx]);

  const addImage = (name: string, blob: Blob) => {
    if (!/^image\/(png|jpeg)$/.test(blob.type)) {
      toast('Chỉ nhận ảnh PNG hoặc JPG.');
      return;
    }
    recheckSoon.current = true;
    setImages((prev) => ({ ...prev, [name]: blob }));
  };

  // Dán ảnh chụp màn hình (Ctrl+V) vào hình đang chọn trong danh sách "Hình còn thiếu"
  useEffect(() => {
    if (!pasteTarget) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((it) => it.type.startsWith('image/'));
      if (!item) return;
      // Trang Nhập đề có sẵn "Ctrl+V dán ảnh đề": chặn lại để ảnh vào đúng hình đang chọn
      e.preventDefault();
      e.stopImmediatePropagation();
      const f = item.getAsFile();
      if (f) {
        addImage(pasteTarget, f);
        toast(`Đã gắn ảnh cho ${pasteTarget}`);
        setPasteTarget(null);
      }
    };
    window.addEventListener('paste', onPaste, true);
    return () => window.removeEventListener('paste', onPaste, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasteTarget]);

  const importNow = async () => {
    setBusy(true);
    try {
      const r: Done = await send(false);
      setDone(r);
      setSummary(null);
      toast(r.curriculum ? `Đã nhập chương trình (${r.curriculum.outcomes} YCCĐ) dạng nháp. Vào trang Chương trình để xem và công bố.` : `Đã nhập ${r.approved + r.drafts} câu, ${r.exams.length} đề, ${r.lessons} bài học.`);
    } catch (e: any) {
      toast(e.message || 'Nhập gói thất bại.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setPasted('');
    setPkgFile(null);
    setDocx(null);
    setOrigPdf(null);
    setImages({});
    setSummary(null);
    setDone(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  const copyErrors = async () => {
    if (!summary) return;
    const txt =
      'App báo các lỗi sau. Sửa đúng các mục đó, giữ nguyên phần còn lại, trả lại TOÀN BỘ JSON:\n' +
      summary.errors.map((e) => `- ${e.where}: ${e.message}`).join('\n');
    await navigator.clipboard.writeText(txt);
    toast('Đã chép danh sách lỗi. Dán vào AI để nó sửa.');
  };

  const onAttach = (files: FileList | null) => {
    for (const f of [...(files ?? [])]) {
      if (/\.docx$/i.test(f.name)) {
        recheckSoon.current = true;
        setDocx(f);
      } else if (/\.pdf$/i.test(f.name)) {
        recheckSoon.current = true;
        setOrigPdf(f);
      } else if (IMG_EXT.test(f.name)) addImage(`hinh/${f.name}`, f);
      else toast(`Bỏ qua ${f.name}: chỉ nhận file Word .docx, PDF gốc hoặc ảnh PNG/JPG.`);
    }
    if (attachInput.current) attachInput.current.value = '';
  };

  const nothingValid = summary && summary.questions === 0 && summary.lessons.length === 0 && !summary.curriculum;
  const missing = (summary?.missingImages ?? []).filter((n) => !images[n]);
  const aiSolved = (summary?.preview ?? []).filter((q) => q.needsReview).length;

  return (
    <section className="su-card" aria-label="Gói nhập chuẩn">
      <div className="su-card-head">
        <h2><FileArchive size={16} aria-hidden="true" style={{ verticalAlign: -3, color: 'var(--primary)' }} /> Nhập đề do AI chuyển đổi</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn sm primary" onClick={() => setPromptOpen(true)}>
            <Bot size={14} aria-hidden="true" /> Lời nhắc cho AI
          </button>
          <button type="button" className="su-link" onClick={() => download('/api/import/package-sample.json', 'goi-nhap-mau.json').catch((e) => toast(e.message))}>
            Gói mẫu
          </button>
          <a className="su-link" href="https://github.com/quangvinh05072007-rgb/H-c-t-p/blob/main/docs/huong-dan-ai.md" target="_blank" rel="noreferrer">
            Hướng dẫn
          </a>
        </div>
      </div>

      {!summary && !done && (
        <div className="pk-steps">
          <div className="pk-step">
            <span className="pk-num">1</span>
            <div>
              <b>Gửi đề cho AI</b>
              <p>Bấm <i>Lời nhắc cho AI</i>, dán vào ChatGPT / Claude / Gemini, đính kèm file đề (và đáp án nếu có).</p>
            </div>
          </div>
          <div className="pk-step">
            <span className="pk-num">2</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>Dán phần AI trả về</b>
              {pkgFile ? (
                <div className="pk-file">
                  <FileText size={15} aria-hidden="true" /> {pkgFile.name}
                  <button type="button" className="su-link" onClick={() => { setPkgFile(null); if (fileInput.current) fileInput.current.value = ''; }} aria-label="Bỏ file">
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <textarea
                  className="pk-paste"
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder='Dán nguyên phần trả lời của AI vào đây (bắt đầu bằng { "format": "smartexam-package" …). Có dư chữ hay dấu ``` cũng được.'
                  rows={5}
                  spellCheck={false}
                />
              )}
              <div className="pk-or">
                hoặc{' '}
                <button type="button" className="su-link" onClick={() => fileInput.current?.click()}>
                  chọn file .json / .zip
                </button>{' '}
                AI đã tạo
              </div>
              <input
                ref={fileInput}
                type="file"
                accept=".json,.zip,application/json,application/zip"
                hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPkgFile(f); setPasted(''); } }}
              />
            </div>
          </div>
          <div className="pk-step">
            <span className="pk-num">3</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>Đính kèm đề gốc (Word hoặc PDF)</b>
              <p>App lưu đề gốc cùng đề để đối chiếu về sau. File Word còn được dùng để tự lấy hình gắn vào đúng câu; đề PDF thì dán ảnh chụp hình ở bước xem trước, hoặc dùng AI chạy được code để nó cắt sẵn.</p>
              <div className="pk-attach">
                <button type="button" className="btn sm" onClick={() => attachInput.current?.click()}>
                  <ImagePlus size={14} aria-hidden="true" /> Đính kèm Word gốc / ảnh
                </button>
                {docx && (
                  <span className="su-chip">
                    <FileText size={12} aria-hidden="true" /> {docx.name}
                    <button type="button" className="pk-x" onClick={() => setDocx(null)} aria-label="Bỏ file Word"><X size={12} aria-hidden="true" /></button>
                  </span>
                )}
                {origPdf && (
                  <span className="su-chip">
                    <FileText size={12} aria-hidden="true" /> {origPdf.name}
                    <button type="button" className="pk-x" onClick={() => setOrigPdf(null)} aria-label="Bỏ file PDF gốc"><X size={12} aria-hidden="true" /></button>
                  </span>
                )}
                {Object.keys(images).map((n) => (
                  <span key={n} className="su-chip">
                    {n.replace(/^hinh\//, '')}
                    <button type="button" className="pk-x" onClick={() => setImages(({ [n]: _, ...rest }) => rest)} aria-label={`Bỏ ${n}`}><X size={12} aria-hidden="true" /></button>
                  </span>
                ))}
              </div>
              <input ref={attachInput} type="file" multiple accept=".docx,.pdf,image/png,image/jpeg" hidden onChange={(e) => onAttach(e.target.files)} />
            </div>
          </div>
          <div className="su-actions" style={{ marginTop: 4 }}>
            <button type="button" className="btn primary" disabled={busy || !hasInput} onClick={check}>
              <Upload size={15} aria-hidden="true" /> {busy ? 'Đang kiểm tra…' : 'Kiểm tra & xem trước'}
            </button>
          </div>
        </div>
      )}

      {summary && (
        <div className="su-list">
          <div className="su-row" style={{ padding: '6px 0' }}>
            <div className="su-row-main">
              <div className="su-row-title">{summary.source || pkgFile?.name || 'Gói dán từ AI'}</div>
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
          {summary.lessons.length > 0 && <div className="su-row-meta" style={{ padding: '4px 0' }}>Bài học: {summary.lessons.map((l) => l.name).join(' · ')}</div>}
          {summary.curriculum && (
            <div className="su-row-meta" style={{ padding: '4px 0' }}>
              Chương trình: <b>{summary.curriculum.name}</b> — {summary.curriculum.outcomes} YCCĐ ({Object.entries(summary.curriculum.byGrade).map(([g, n]) => `lớp ${g}: ${n}`).join(', ')}). Lưu thành bản nháp, công bố ở trang Chương trình.
            </div>
          )}

          {summary.original && (
            <div className="su-row-meta" style={{ padding: '4px 0' }}>
              <FileText size={13} aria-hidden="true" /> Sẽ lưu đề gốc: <b>{summary.original.name}</b> ({Math.round(summary.original.size / 1024)} KB)
            </div>
          )}
          {summary.warnings.length > 0 && (
            <div className="pk-notes">
              {summary.warnings.map((w, i) => (
                <div key={i}><Sparkles size={13} aria-hidden="true" /> {w}</div>
              ))}
            </div>
          )}

          {missing.length > 0 && (
            <div className="su-mistake-why" style={{ margin: '8px 0', background: 'var(--warn-soft)' }}>
              <div>
                <ImagePlus size={14} aria-hidden="true" color="var(--warn)" />
                <span><b>Còn thiếu {missing.length} hình.</b> Chụp vùng hình trong đề gốc (Win + Shift + S), bấm <i>Dán ảnh</i> ở dòng tương ứng rồi nhấn Ctrl + V.</span>
              </div>
              <div className="pk-missing">
                {missing.map((n) => (
                  <div key={n} className={`pk-missing-row ${pasteTarget === n ? 'on' : ''}`}>
                    <code>{n}</code>
                    <button type="button" className={`btn sm ${pasteTarget === n ? 'primary' : ''}`} onClick={() => setPasteTarget(pasteTarget === n ? null : n)}>
                      <ClipboardPaste size={13} aria-hidden="true" /> {pasteTarget === n ? 'Nhấn Ctrl + V…' : 'Dán ảnh'}
                    </button>
                    <button type="button" className="btn sm" onClick={() => { setPasteTarget(n); missingInput.current?.click(); }}>Chọn file</button>
                  </div>
                ))}
              </div>
              <input
                ref={missingInput}
                type="file"
                accept="image/png,image/jpeg"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && pasteTarget) addImage(pasteTarget, f);
                  setPasteTarget(null);
                  e.target.value = '';
                }}
              />
            </div>
          )}

          {summary.errors.length > 0 && (
            <div className="su-mistake-why" style={{ margin: '8px 0', background: 'var(--bad-soft)' }}>
              <div>
                <CircleAlert size={14} aria-hidden="true" color="var(--bad)" />
                <span><b>{summary.errors.length} mục lỗi sẽ bị bỏ qua</b> nếu nhập ngay.</span>
                <button type="button" className="btn sm" style={{ marginLeft: 'auto' }} onClick={copyErrors}>Chép lỗi để gửi AI sửa</button>
              </div>
              <ul style={{ margin: '0 0 0 22px', padding: 0, maxHeight: 180, overflow: 'auto' }}>
                {summary.errors.map((e, i) => (
                  <li key={i}><b>{e.where}:</b> {e.message}</li>
                ))}
              </ul>
            </div>
          )}
          {(summary.duplicates?.length ?? 0) > 0 && (
            <div className="su-mistake-why" style={{ margin: '8px 0', background: 'var(--warn-soft)' }}>
              <div>
                <CircleAlert size={14} aria-hidden="true" color="var(--warn)" />
                <span><b>{summary.duplicates!.length} câu giống câu đã có trong ngân hàng.</b> Câu trùng hệt sẽ được bỏ qua; câu gần trùng vẫn được nhập.</span>
              </div>
              <ul style={{ margin: '0 0 0 22px', padding: 0, maxHeight: 140, overflow: 'auto' }}>
                {summary.duplicates!.map((d) => (
                  <li key={d.key}>Câu <b>{d.key}</b> ↔ câu #{d.id} trong ngân hàng ({d.exact ? 'trùng hệt' : `giống ${d.score}%`})</li>
                ))}
              </ul>
            </div>
          )}

          {(summary.preview?.length ?? 0) > 0 && (
            <div className="pk-preview">
              <button type="button" className="su-link" onClick={() => setShowPreview((v) => !v)}>
                {showPreview ? 'Ẩn bản xem trước' : `Xem trước ${summary.preview!.length} câu`}
              </button>
              {showPreview && (
                <div className="pk-qs">
                  {summary.preview!.map((q) => (
                    <article key={q.key} className={`pk-q ${q.needsReview ? 'is-review' : ''}`}>
                      <header>
                        <b>{q.key}</b>
                        <span className="su-chip">{TYPE_LABEL[q.type]}</span>
                        <span className="pk-meta">{q.topicName} · {LEVEL_LABEL[q.level]}{q.form ? ` · ${q.form}` : ''}</span>
                        {q.needsReview && <span className="su-chip is-warn">AI tự giải · cần duyệt</span>}
                      </header>
                      <div className="pk-stem"><RichPreview text={q.stem} images={summary.imageData ?? {}} /></div>
                      {q.type === 'mcq' && (
                        <ol className="pk-opts">
                          {q.options.map((o, i) => (
                            <li key={i} className={q.answer === i ? 'is-ok' : ''}><b>{'ABCD'[i]}.</b> <RichPreview text={o} images={summary.imageData ?? {}} /></li>
                          ))}
                        </ol>
                      )}
                      {q.type === 'tf' && (
                        <ol className="pk-opts">
                          {q.options.map((o, i) => (
                            <li key={i}><b>{'abcd'[i]})</b> <RichPreview text={o} images={summary.imageData ?? {}} /> <span className={q.answer?.[i] ? 'pk-t' : 'pk-f'}>{q.answer?.[i] ? 'Đúng' : 'Sai'}</span></li>
                          ))}
                        </ol>
                      )}
                      {q.type === 'short' && <div className="pk-short">Đáp số: <b>{String(q.answer)}</b></div>}
                      {q.explanation && <div className="pk-expl"><RichPreview text={q.explanation} images={summary.imageData ?? {}} /></div>}
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '10px 0' }}>
            <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} />
            Duyệt luôn các câu có đáp án từ đề gốc.{aiSolved ? ` ${aiSolved} câu AI tự giải vẫn để nháp chờ duyệt.` : ''}
          </label>
          <div className="su-actions" style={{ marginTop: 0 }}>
            <button type="button" className="btn primary" disabled={busy || !!nothingValid} onClick={importNow}>
              {busy ? 'Đang nhập…' : 'Nhập vào ngân hàng'}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={check}>Kiểm tra lại</button>
            <button type="button" className="btn" disabled={busy} onClick={() => setSummary(null)}>Sửa / dán lại</button>
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
                {done.drafts > 0 && <span>· {done.drafts} câu nháp chờ duyệt</span>}
                {done.skipped > 0 && <span>· {done.skipped} câu đã có sẵn (bỏ qua)</span>}
                <span>· {done.exams.length} đề</span>
                <span>· {done.lessons} bài học</span>
                {done.images > 0 && <span>· {done.images} hình</span>}
                {done.curriculum && (
                  <span>
                    · chương trình {done.curriculum.outcomes} YCCĐ (nháp) —{' '}
                    <a href="#/chuong-trinh">xem và công bố</a>
                  </span>
                )}
              </div>
            </div>
          </div>
          {done.warnings.map((w, i) => (
            <div key={i} className="su-row-meta" style={{ color: 'var(--warn)' }}>{w}</div>
          ))}
          <div className="su-actions">
            {done.exams.length > 0 && <button type="button" className="btn primary" onClick={() => go('/thu-vien')}>Xem đề trong Kho đề</button>}
            {done.drafts > 0 && <button type="button" className="btn" onClick={() => go('/can-sua')}>Duyệt câu nháp</button>}
            <button type="button" className="btn" onClick={() => go('/ngan-hang')}>Mở Ngân hàng</button>
            <button type="button" className="btn" onClick={reset}>Nhập đề khác</button>
          </div>
        </div>
      )}

      {promptOpen && <AiPromptModal onClose={() => setPromptOpen(false)} />}
    </section>
  );
}

function AiPromptModal({ onClose }: { onClose: () => void }) {
  const { toast } = useApp();
  const [mode, setMode] = useState<'text' | 'code'>('text');
  const [text, setText] = useState('');
  useEffect(() => {
    let alive = true;
    setText('');
    get<{ text: string }>(`/api/import/ai-prompt?mode=${mode}`)
      .then((r) => alive && setText(r.text))
      .catch((e) => toast(e.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    toast('Đã chép lời nhắc. Dán vào AI rồi đính kèm file đề.');
  };
  return (
    <Modal title="Lời nhắc cho AI" onClose={onClose} width={720}>
      <div className="seg" role="group" aria-label="Loại AI" style={{ marginBottom: 10 }}>
        <button type="button" className={mode === 'text' ? 'on' : ''} onClick={() => setMode('text')}>Mọi AI (trả về JSON)</button>
        <button type="button" className={mode === 'code' ? 'on' : ''} onClick={() => setMode('code')}>AI chạy được code (trả về goi.zip có hình)</button>
      </div>
      <p className="su-row-meta" style={{ marginTop: 0 }}>
        {mode === 'text'
          ? 'Dùng được với mọi AI, kể cả bản miễn phí. Hình lấy từ file Word gốc hoặc dán ảnh chụp ở bước xem trước.'
          : 'Dành cho ChatGPT (có phân tích dữ liệu/chạy Python) hoặc Claude (có tạo file): AI tự cắt hình và trả về goi.zip để tải lên. Hình cắt từ PDF nên xem lại ở bước xem trước.'}
        {' '}Lời nhắc đã kèm sẵn mã chuyên đề và dạng toán trường đang dùng.
      </p>
      <textarea className="pk-paste" readOnly value={text || 'Đang soạn…'} rows={14} />
      <div className="su-actions">
        <button type="button" className="btn primary" disabled={!text} onClick={copy}>Chép lời nhắc</button>
        <button type="button" className="btn" onClick={onClose}>Đóng</button>
      </div>
    </Modal>
  );
}
