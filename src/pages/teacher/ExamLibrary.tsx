import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderPlus, Lock, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { del, download, get, post, put } from '../../api';
import { EXAM_CATEGORIES } from '../../../shared/examCategory.mjs';
import { TERM_LABEL } from '../../../shared/examMeta.mjs';
import { ErrorBox, fmtScore, go, Loading, scoreColor, useApp, useAsync, useRoute } from '../../ui/kit';
import { LibrarySubNavBar } from '../../ui/TeacherNavBars';
import { AssignExamDrawer } from '../../ui/AssignExamDrawer';

type ExamRow = {
  id: number;
  title: string;
  durationMin: number;
  createdAt: number;
  author: string;
  mine: boolean;
  visibility: string;
  category: string;
  official: boolean;
  version: number;
  locked: boolean;
  status: 'ready' | 'printed' | 'used';
  schoolYear: string;
  grade: number | null;
  term: string;
  session: string | null;
  source: string | null;
  examDate: string | null;
  tags: string[];
  folderIds: number[];
  classes: string[];
  avgScore: number | null;
  submissions: number;
  questionCount: number;
  variantCount: number;
  uses: number;
};
type FolderRow = { id: number; name: string; n: number };
type Sel = { scope: 'all' | 'mine' | 'official' | 'shared'; year?: string; grade?: number; category?: string; folder?: number };

const CAT_TONE: Record<string, string> = { 'giua-ky': 'sky', 'cuoi-ky': 'violet', thpt: 'rose', 'khao-sat': 'amber', 'kiem-tra': 'teal', 'on-tap': 'green' };
const CAT_LABEL = Object.fromEntries(EXAM_CATEGORIES.map((c) => [c.code, c.label]));
const STATUS_LABEL = { ready: 'Sẵn sàng', printed: 'Đã in · khóa', used: 'Đang dùng · khóa' };

/** Kho đề: cây Năm học → Khối → Loại đề, thư mục riêng, thẻ đề có thông tin và thống kê. */
export function ExamLibrary() {
  const { toast, user } = useApp();
  const { query } = useRoute();
  const requestedClass = query.get('classId');
  const defaultClassId = requestedClass && /^\d+$/.test(requestedClass) ? Number(requestedClass) : null;
  const suffix = defaultClassId ? `?classId=${defaultClassId}` : '';
  const editSuffix = defaultClassId ? `&classId=${defaultClassId}` : '';
  const { data, error, loading, reload } = useAsync(() => get<{ exams: ExamRow[] }>('/api/exams'), []);
  const folders = useAsync(() => get<{ folders: FolderRow[] }>('/api/exam-folders'), []);
  const [sel, setSel] = useState<Sel>({ scope: 'all' });
  const [openYears, setOpenYears] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'ready' | 'locked'>('all');
  const [sort, setSort] = useState<'new' | 'date' | 'used'>('new');
  const [assignTarget, setAssignTarget] = useState<ExamRow | null>(null);
  const [folderMenu, setFolderMenu] = useState<number | null>(null);
  const [officialBusy, setOfficialBusy] = useState(false);

  const all = data?.exams ?? [];
  const inScope = useMemo(
    () => all.filter((e) => (sel.scope === 'mine' ? e.mine : sel.scope === 'official' ? e.official : sel.scope === 'shared' ? e.visibility === 'school' && !e.official : true)),
    [all, sel.scope],
  );

  // Cây: năm học → khối → loại đề (đếm trong phạm vi đang chọn)
  const tree = useMemo(() => {
    const years: Record<string, { n: number; grades: Record<string, { n: number; cats: Record<string, number> }> }> = {};
    for (const e of inScope) {
      const y = (years[e.schoolYear] ??= { n: 0, grades: {} });
      y.n++;
      const gk = e.grade ? String(e.grade) : '?';
      const g = (y.grades[gk] ??= { n: 0, cats: {} });
      g.n++;
      g.cats[e.category] = (g.cats[e.category] ?? 0) + 1;
    }
    return Object.entries(years).sort((a, b) => b[0].localeCompare(a[0]));
  }, [inScope]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = inScope.filter((e) => {
      if (sel.folder && !e.folderIds.includes(sel.folder)) return false;
      if (sel.year && e.schoolYear !== sel.year) return false;
      if (sel.grade !== undefined && (e.grade ?? 0) !== sel.grade) return false;
      if (sel.category && e.category !== sel.category) return false;
      if (status === 'ready' && e.locked) return false;
      if (status === 'locked' && !e.locked) return false;
      if (q && !`${e.title} ${e.author} ${e.source ?? ''} ${e.session ?? ''} ${e.tags.join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    });
    list = [...list].sort((a, b) =>
      sort === 'used' ? b.submissions - a.submissions || b.uses - a.uses : sort === 'date' ? String(b.examDate ?? '').localeCompare(String(a.examDate ?? '')) || b.createdAt - a.createdAt : b.createdAt - a.createdAt,
    );
    return list;
  }, [inScope, sel, status, sort, search]);

  const pick = (s: Partial<Sel>) => setSel((prev) => ({ scope: prev.scope, ...s }));
  const crumbs = [
    sel.folder ? `Thư mục: ${folders.data?.folders.find((f) => f.id === sel.folder)?.name ?? ''}` : null,
    sel.year ? `Năm học ${sel.year}` : null,
    sel.grade !== undefined ? (sel.grade ? `Lớp ${sel.grade}` : 'Chưa rõ khối') : null,
    sel.category ? CAT_LABEL[sel.category] : null,
  ].filter(Boolean);

  const newFolder = async () => {
    const name = window.prompt('Tên thư mục mới (vd "Ôn thi HK2 – 12A1"):', '');
    if (!name?.trim()) return;
    try {
      const r = await post<{ id: number }>('/api/exam-folders', { name });
      await folders.reload();
      pick({ folder: r.id });
    } catch (e: any) {
      toast(e.message);
    }
  };
  const renameFolder = async (f: FolderRow) => {
    const name = window.prompt('Đổi tên thư mục:', f.name);
    if (!name?.trim() || name === f.name) return;
    await put(`/api/exam-folders/${f.id}`, { name }).catch((e) => toast(e.message));
    folders.reload();
  };
  const removeFolder = async (f: FolderRow) => {
    if (!window.confirm(`Xóa thư mục "${f.name}"? Đề trong thư mục không bị xóa.`)) return;
    await del(`/api/exam-folders/${f.id}`).catch((e) => toast(e.message));
    if (sel.folder === f.id) pick({});
    folders.reload();
  };
  const toggleInFolder = async (exam: ExamRow, folderId: number) => {
    const add = !exam.folderIds.includes(folderId);
    try {
      await post(`/api/exam-folders/${folderId}/items`, { examId: exam.id, add });
      await Promise.all([reload(), folders.reload()]);
    } catch (e: any) {
      toast(e.message);
    }
  };

  const counts = {
    all: all.length,
    mine: all.filter((e) => e.mine).length,
    official: all.filter((e) => e.official).length,
    shared: all.filter((e) => e.visibility === 'school' && !e.official).length,
  };

  return (
    <div className="kl-page">
      <header className="kl-head">
        <div>
          <h1>Kho đề</h1>
          <p>{counts.all} đề · {counts.official} đề chính thức · {counts.mine} đề của bạn</p>
        </div>
        <div className="kl-head-actions">
          <button
            type="button"
            className="btn sm"
            disabled={officialBusy}
            title="Tự ghép đề 12 trắc nghiệm, 4 đúng/sai, 6 trả lời ngắn, 90 phút từ câu đã duyệt"
            onClick={async () => {
              setOfficialBusy(true);
              try {
                const r = await post<{ id: number; title: string }>('/api/exams/official', {});
                toast(`Đã tạo "${r.title}".`);
                go(`/de-thi/${r.id}${suffix}`);
              } catch (e: any) {
                toast(e.message);
              } finally {
                setOfficialBusy(false);
              }
            }}
          >
            {officialBusy ? 'Đang ghép đề…' : 'Đề cấu trúc Bộ (1 nút)'}
          </button>
          <a className="btn sm primary" href={`#/ra-de${suffix}`}>
            <Plus size={14} aria-hidden="true" /> Soạn đề mới
          </a>
        </div>
      </header>

      <LibrarySubNavBar active="exams" />

      {loading ? (
        <Loading text="Đang mở Kho đề…" />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : (
        <div className="kl-body">
          <aside className="kl-tree" aria-label="Sắp xếp đề">
            <div className="kl-tree-sec">
              {(
                [
                  ['all', 'Tất cả đề', counts.all],
                  ['official', 'Đề chính thức', counts.official],
                  ['mine', 'Đề của tôi', counts.mine],
                  ['shared', 'Giáo viên chia sẻ', counts.shared],
                ] as const
              ).map(([k, label, n]) => (
                <button key={k} type="button" className={`kl-node ${sel.scope === k && !sel.year && !sel.folder && sel.grade === undefined && !sel.category ? 'on' : ''}`} onClick={() => setSel({ scope: k })}>
                  <span>{label}</span>
                  <em>{n}</em>
                </button>
              ))}
            </div>

            <div className="kl-tree-sec">
              <div className="kl-tree-title">Theo năm học</div>
              {tree.length === 0 && <div className="kl-empty-note">Chưa có đề.</div>}
              {tree.map(([year, y]) => {
                const open = openYears[year] ?? year === tree[0][0];
                return (
                  <div key={year}>
                    <button type="button" className={`kl-node ${sel.year === year && sel.grade === undefined ? 'on' : ''}`} onClick={() => { setOpenYears((o) => ({ ...o, [year]: !open || sel.year !== year })); pick({ year }); }}>
                      <span>{open ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />} {year}</span>
                      <em>{y.n}</em>
                    </button>
                    {open &&
                      Object.entries(y.grades)
                        .sort((a, b) => b[0].localeCompare(a[0]))
                        .map(([gk, g]) => {
                          const grade = gk === '?' ? 0 : Number(gk);
                          return (
                            <div key={gk} className="kl-sub">
                              <button type="button" className={`kl-node ${sel.year === year && sel.grade === grade && !sel.category ? 'on' : ''}`} onClick={() => pick({ year, grade })}>
                                <span>{grade ? `Lớp ${grade}` : 'Chưa rõ khối'}</span>
                                <em>{g.n}</em>
                              </button>
                              {sel.year === year && sel.grade === grade &&
                                Object.entries(g.cats).map(([c, n]) => (
                                  <button key={c} type="button" className={`kl-node kl-leaf is-${CAT_TONE[c] ?? 'teal'} ${sel.category === c ? 'on' : ''}`} onClick={() => pick({ year, grade, category: c })}>
                                    <span><i aria-hidden="true" /> {CAT_LABEL[c] ?? c}</span>
                                    <em>{n}</em>
                                  </button>
                                ))}
                            </div>
                          );
                        })}
                  </div>
                );
              })}
            </div>

            <div className="kl-tree-sec">
              <div className="kl-tree-title">
                Thư mục của tôi
                <button type="button" className="kl-icon-btn" onClick={newFolder} aria-label="Tạo thư mục mới" title="Tạo thư mục mới">
                  <FolderPlus size={14} aria-hidden="true" />
                </button>
              </div>
              {(folders.data?.folders ?? []).length === 0 && <div className="kl-empty-note">Tạo thư mục để gom đề theo lớp, đợt ôn…</div>}
              {(folders.data?.folders ?? []).map((f) => (
                <div key={f.id} className="kl-folder-row">
                  <button type="button" className={`kl-node ${sel.folder === f.id ? 'on' : ''}`} onClick={() => setSel({ scope: 'all', folder: f.id })}>
                    <span><Folder size={13} aria-hidden="true" /> {f.name}</span>
                    <em>{f.n}</em>
                  </button>
                  <button type="button" className="kl-icon-btn" onClick={() => renameFolder(f)} aria-label={`Đổi tên ${f.name}`}><Pencil size={12} aria-hidden="true" /></button>
                  <button type="button" className="kl-icon-btn" onClick={() => removeFolder(f)} aria-label={`Xóa thư mục ${f.name}`}><Trash2 size={12} aria-hidden="true" /></button>
                </div>
              ))}
            </div>
          </aside>

          <section className="kl-main" aria-label="Danh sách đề">
            <div className="kl-filters">
              <label className="kl-search">
                <Search size={14} aria-hidden="true" />
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm tên đề, nguồn, kỳ thi, người tạo…" aria-label="Tìm đề" />
              </label>
              <select value={status} onChange={(e) => setStatus(e.target.value as any)} aria-label="Trạng thái">
                <option value="all">Mọi trạng thái</option>
                <option value="ready">Sẵn sàng (sửa được)</option>
                <option value="locked">Đã dùng / đã in (khóa)</option>
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as any)} aria-label="Sắp xếp">
                <option value="new">Mới tạo</option>
                <option value="date">Ngày thi</option>
                <option value="used">Nhiều bài làm</option>
              </select>
            </div>

            {crumbs.length > 0 && (
              <div className="kl-crumbs">
                {crumbs.join(' › ')}
                <button type="button" className="su-link" onClick={() => setSel({ scope: sel.scope })}><X size={13} aria-hidden="true" /> Bỏ lọc</button>
              </div>
            )}

            {shown.length === 0 ? (
              <div className="su-card su-empty">Không có đề nào ở đây.</div>
            ) : (
              <div className="kl-grid">
                {shown.map((e) => (
                  <article key={e.id} className={`kl-card is-${CAT_TONE[e.category] ?? 'teal'}`}>
                    <div className="kl-chips">
                      <span className="ex-card-cat">{CAT_LABEL[e.category] ?? 'Đề'}</span>
                      {e.official && <span className="su-chip is-good" title="Hiện ở mục Đề thi của học sinh">Chính thức</span>}
                      <span className={`su-chip ${e.status === 'used' ? 'is-warn' : ''}`} title={e.locked ? 'Đề đã dùng: sửa sẽ tạo phiên bản mới' : 'Chưa dùng: sửa thẳng được'}>
                        {e.locked && <Lock size={11} aria-hidden="true" />} {STATUS_LABEL[e.status]}
                      </span>
                      {e.version > 1 && <span className="su-chip">v{e.version}</span>}
                    </div>
                    <a className="kl-title" href={`#/de-thi/${e.id}${suffix}`}>{e.title}</a>
                    <div className="kl-meta">
                      {[e.grade ? `Lớp ${e.grade}` : null, e.schoolYear, TERM_LABEL[e.term] ?? e.term, e.session, e.source].filter(Boolean).join(' · ')}
                    </div>
                    <div className="kl-meta kl-meta-2">
                      {e.questionCount} câu · {e.durationMin} phút · {e.variantCount} mã đề{e.examDate ? ` · thi ${e.examDate.split('-').reverse().join('/')}` : ''}
                    </div>
                    <div className="kl-usage">
                      {e.classes.length ? (
                        <>
                          <span>Đã giao: <b>{e.classes.slice(0, 3).join(', ')}{e.classes.length > 3 ? ` +${e.classes.length - 3}` : ''}</b></span>
                          {e.avgScore !== null && (
                            <span>ĐTB <b style={{ color: scoreColor(e.avgScore) }}>{fmtScore(e.avgScore)}</b> ({e.submissions} bài)</span>
                          )}
                        </>
                      ) : e.submissions ? (
                        <span>{e.submissions} lượt tự luyện · ĐTB <b style={{ color: scoreColor(e.avgScore) }}>{e.avgScore === null ? '—' : fmtScore(e.avgScore)}</b></span>
                      ) : (
                        <span className="kl-muted">Chưa giao lớp nào</span>
                      )}
                    </div>
                    {e.tags.length > 0 && <div className="kl-tags">{e.tags.map((t) => <span key={t}>#{t}</span>)}</div>}
                    <div className="kl-actions">
                      <button type="button" className="btn sm primary" onClick={() => setAssignTarget(e)}>Giao bài</button>
                      {(e.mine || user.role === 'admin') && <a className="btn sm" href={`#/ra-de?examId=${e.id}${editSuffix}`}>Sửa</a>}
                      <a className="btn sm ghost" href={`#/dao-de?examId=${e.id}${editSuffix}`}>Đảo</a>
                      <a className="btn sm ghost" href={`#/de-thi/${e.id}${suffix}`}>Chi tiết</a>
                      <div className="kl-folder-pick">
                        <button type="button" className={`kl-icon-btn ${e.folderIds.length ? 'is-on' : ''}`} onClick={() => setFolderMenu(folderMenu === e.id ? null : e.id)} aria-label="Xếp vào thư mục" title="Xếp vào thư mục">
                          <Folder size={15} aria-hidden="true" />
                        </button>
                        {folderMenu === e.id && (
                          <div className="kl-menu" role="menu">
                            {(folders.data?.folders ?? []).length === 0 && <div className="kl-empty-note">Chưa có thư mục.</div>}
                            {(folders.data?.folders ?? []).map((f) => (
                              <label key={f.id} className="kl-menu-item">
                                <input type="checkbox" checked={e.folderIds.includes(f.id)} onChange={() => toggleInFolder(e, f.id)} /> {f.name}
                              </label>
                            ))}
                            <button type="button" className="su-link" onClick={() => { setFolderMenu(null); newFolder(); }}>+ Thư mục mới</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <AssignExamDrawer
        isOpen={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        examId={assignTarget?.id ?? 0}
        examTitle={assignTarget?.title ?? ''}
        durationMin={assignTarget?.durationMin ?? 90}
        defaultClassId={defaultClassId}
        onAssigned={() => reload()}
      />
    </div>
  );
}

/** Thông tin đề trong trang chi tiết: xem nhanh + sửa (được cả khi đề đã khóa, vì không đổi nội dung đề). */
export function ExamMetaPanel({ id, exam, onSaved }: { id: number; exam: any; onSaved: () => void }) {
  const { toast } = useApp();
  const m = exam.meta ?? {};
  const st = exam.stats ?? { classes: [], avgScore: null, submissions: 0 };
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState(() => ({
    title: exam.title ?? '',
    category: exam.categorySet ? exam.category : '',
    schoolYear: m.guessed?.schoolYear ? '' : m.schoolYear ?? '',
    grade: m.guessed?.grade ? '' : String(m.grade ?? ''),
    term: m.guessed?.term ? '' : m.term ?? '',
    session: m.session ?? '',
    source: m.source ?? '',
    examDate: m.examDate ?? '',
    tags: (m.tags ?? []).join(', '),
  }));
  const set = (k: keyof typeof f) => (e: any) => setF((p) => ({ ...p, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    try {
      await put(`/api/exams/${id}/meta`, { ...f, grade: f.grade === '' ? null : Number(f.grade) });
      toast('Đã lưu thông tin đề.');
      setEditing(false);
      onSaved();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };
  const guess = (k: string) => (m.guessed?.[k] ? ' (tự đoán)' : '');
  return (
    <div className="kl-meta-panel">
      <div className="kl-meta-line">
        <span><b>{CAT_LABEL[exam.category] ?? 'Đề'}</b></span>
        <span>{m.grade ? `Lớp ${m.grade}` : 'Chưa rõ khối'}{guess('grade')}</span>
        <span>Năm học {m.schoolYear}{guess('schoolYear')}</span>
        <span>{TERM_LABEL[m.term] ?? m.term}{guess('term')}</span>
        {m.session && <span>{m.session}</span>}
        {m.source && <span>{m.source}</span>}
        {m.examDate && <span>Thi {m.examDate.split('-').reverse().join('/')}</span>}
        {(m.tags ?? []).map((t: string) => <span key={t}>#{t}</span>)}
        {exam.canEditMeta && !editing && <button type="button" className="su-link" onClick={() => setEditing(true)}>Sửa thông tin</button>}
      </div>
      {exam.document && (
        <div className="kl-meta-line">
          <span>Đề gốc: <b>{exam.document.name}</b> ({Math.max(1, Math.round(exam.document.size / 1024))} KB)</span>
          <button type="button" className="su-link" onClick={() => download(`/api/documents/${exam.document.id}`, exam.document.name).catch((e: any) => toast(e.message))}>Tải về</button>
        </div>
      )}
      <div className="kl-meta-line kl-muted">
        {st.classes.length ? `Đã giao: ${st.classes.join(', ')}` : 'Chưa giao lớp nào'}
        {st.submissions ? ` · ${st.submissions} bài đã chấm · ĐTB ${st.avgScore === null ? '—' : fmtScore(st.avgScore)}` : ''}
      </div>
      {editing && (
        <div className="kl-meta-form">
          <label className="field" style={{ gridColumn: '1 / -1' }}>Tên đề<input className="input" value={f.title} onChange={set('title')} maxLength={200} /></label>
          <label className="field">Loại đề
            <select className="input" value={f.category} onChange={set('category')}>
              <option value="">Tự đoán theo tên</option>
              {EXAM_CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </label>
          <label className="field">Khối
            <select className="input" value={f.grade} onChange={set('grade')}>
              <option value="">Tự đoán theo câu hỏi</option>
              {[12, 11, 10].map((g) => <option key={g} value={g}>Lớp {g}</option>)}
            </select>
          </label>
          <label className="field">Năm học<input className="input" value={f.schoolYear} onChange={set('schoolYear')} placeholder="2025-2026" /></label>
          <label className="field">Học kỳ
            <select className="input" value={f.term} onChange={set('term')}>
              <option value="">Tự đoán theo ngày</option>
              {Object.entries(TERM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="field">Kỳ thi / lần<input className="input" value={f.session} onChange={set('session')} placeholder="Lần 1" maxLength={60} /></label>
          <label className="field">Nguồn<input className="input" value={f.source} onChange={set('source')} placeholder="Sở GD&ĐT Hà Nội" maxLength={120} /></label>
          <label className="field">Ngày thi<input className="input" type="date" value={f.examDate} onChange={set('examDate')} /></label>
          <label className="field">Thẻ (cách nhau dấu phẩy)<input className="input" value={f.tags} onChange={set('tags')} placeholder="ôn thi, 12A1" /></label>
          <div className="row" style={{ gap: 8, gridColumn: '1 / -1' }}>
            <button type="button" className="btn primary sm" disabled={busy} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu thông tin'}</button>
            <button type="button" className="btn sm" onClick={() => setEditing(false)}>Hủy</button>
          </div>
        </div>
      )}
    </div>
  );
}
