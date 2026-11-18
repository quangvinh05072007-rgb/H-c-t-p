import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ClipboardPaste,
  CopyCheck,
  FilePlus2,
  KeyRound,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { api, download, get, post } from '../../api';
import { MathText } from '../../ui/MathText';
import { PageHeading, go, LevelBadge, topicName, TypeBadge, Icon, useApp, useRoute, Modal } from '../../ui/kit';
import { QuestionEditor } from '../../ui/QuestionEditor';
import ImportJobsPanel from '../../ui/ImportJobsPanel';
import { CreateExamActionBar } from '../../ui/TeacherNavBars';
import { AssignExamDrawer } from '../../ui/AssignExamDrawer';
import { saveBuilderHandoff } from '../../utils/examHandoff';

const SAMPLE = `PHẦN I
Câu 1. Đạo hàm của hàm số $y = x^4$ là
A. $4x^3$   B. $x^3$   C. $4x$   D. $x^4$
Đáp án: A
Câu 2. Trong không gian Oxyz, mặt cầu $(x-2)^2+y^2+(z+1)^2=4$ có bán kính bằng
A. 4
*B. 2
C. 16
D. $\\sqrt2$
PHẦN III
Câu 1. Tính $\\int_0^3 2x\\,dx$.
Đáp án: 9`;

function problems(q: any) {
  const p: string[] = [];
  if (!q.stem?.trim()) p.push('thiếu đề bài');
  if (!q.topic) p.push('chưa chọn chuyên đề');
  if (q.type === 'mcq' && !Number.isInteger(q.answer)) p.push('chưa chọn đáp án');
  if (q.type === 'mcq' && q.options?.some((o: string) => !o?.trim())) p.push('thiếu phương án');
  if (q.type === 'tf' && (!Array.isArray(q.answer) || q.answer.some((x: any) => typeof x !== 'boolean'))) {
    p.push('chưa đủ Đúng/Sai 4 ý');
  }
  if (q.type === 'short' && !String(q.answer ?? '').trim()) p.push('chưa có đáp án');
  return p;
}

export function ImportPage() {
  const { meta, toast } = useApp();
  const { query } = useRoute();
  const classId = query.get('classId');
  const defaultClassId = classId && /^\d+$/.test(classId) ? Number(classId) : null;
  const classSuffix = defaultClassId ? `?classId=${defaultClassId}` : '';

  const [mode, setMode] = useState<'file' | 'text'>('file');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    questions: any[];
    warnings: string[];
    info: any;
    origin: string;
  } | null>(null);

  const [open, setOpen] = useState<number | null>(null);
  const [saved, setSaved] = useState<number[] | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobsRefresh, setJobsRefresh] = useState(0);
  const [draftStatus, setDraftStatus] = useState<'saved' | 'saving' | 'dirty' | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [originalQuestions, setOriginalQuestions] = useState<any[] | null>(null);

  const saveTimerRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);

  const [riskFirst, setRiskFirst] = useState(true);
  const [filterMode, setFilterMode] = useState<'all' | 'issues' | 'duplicates' | 'ready'>('all');
  const [rawOpen, setRawOpen] = useState<Set<number>>(new Set());
  const [keyMsg, setKeyMsg] = useState<string | null>(null);

  // Batch cleanup states
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [batchTopic, setBatchTopic] = useState('');
  const [batchLevel, setBatchLevel] = useState('');
  const [quickKeyOpen, setQuickKeyOpen] = useState(false);
  const [quickKeyText, setQuickKeyText] = useState('');

  // Duplicate check state
  const [dupMatches, setDupMatches] = useState<Record<string, { bank: any[]; batch: any[] }>>({});
  const [checkingDups, setCheckingDups] = useState(false);
  const [dupCompareIdx, setDupCompareIdx] = useState<number | null>(null);

  // Create exam & assign flow
  const [createExamModalOpen, setCreateExamModalOpen] = useState(false);
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamDuration, setNewExamDuration] = useState(90);
  const [creatingExam, setCreatingExam] = useState(false);
  const [assignAfterCreate, setAssignAfterCreate] = useState(true);
  const [assignDrawer, setAssignDrawer] = useState<{
    open: boolean;
    examId: number;
    examTitle: string;
    durationMin: number;
  } | null>(null);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (draftStatus === 'dirty' || draftStatus === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [draftStatus]);

  const triggerDraftSave = (newQuestions: any[]) => {
    if (!jobId || saved) return;
    setDraftStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await api('PUT', `/api/import/jobs/${jobId}/draft`, { questions: newQuestions });
        setDraftStatus('saved');
        setHasDraft(true);
      } catch {
        setDraftStatus('dirty');
      }
    }, 1200);
  };

  const revertToOriginal = async () => {
    if (!originalQuestions || !jobId) return;
    if (!confirm('Khôi phục lại danh sách câu hỏi gốc nhận diện ban đầu và xóa các chỉnh sửa nháp?')) return;
    try {
      await api('DELETE', `/api/import/jobs/${jobId}/draft`);
      setResult((cur: any) => cur && { ...cur, questions: originalQuestions });
      setHasDraft(false);
      setDraftStatus(null);
      toast('Đã khôi phục kết quả nhận diện gốc.');
    } catch (e: any) {
      toast(e.message);
    }
  };

  // Handle Ctrl+V pasting image directly on Import screen when picking files
  useEffect(() => {
    if (result || mode !== 'file') return;
    const onPaste = async (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imgItem = items.find((it) => it.type.startsWith('image/'));
      if (!imgItem) return;
      const blob = imgItem.getAsFile();
      if (!blob) return;
      e.preventDefault();

      {
        // Upload image directly into an editable draft question card with [[img:ID]]
        setBusy(true);
        try {
          const uploaded = await api<{ id: number }>('POST', '/api/images', undefined, {
            raw: await blob.arrayBuffer(),
          });
          const qItem = {
            num: 1,
            part: 'I',
            type: 'mcq',
            stem: `[[img:${uploaded.id}]]\n(Gõ lại nội dung đề, giữ ảnh gốc để đối chiếu)`,
            sourceStem: `[[img:${uploaded.id}]]`,
            options: ['', '', '', ''],
            answer: null,
            explanation: '',
            topic: meta.topics[0]?.code ?? null,
            level: 2,
            warnings: ['Ảnh đã dán từ clipboard. Kiểm tra nội dung và chọn đáp án.'],
          };
          setResult({
            questions: [qItem],
            warnings: ['Ảnh chụp màn hình đã được tải lên. Thầy/Cô có thể bấm "Sửa" để gõ nội dung hoặc thêm câu khác.'],
            info: { kind: 'clipboard-image' },
            origin: 'Ảnh dán màn hình',
          });
          setOpen(0);
          toast('Đã dán ảnh từ clipboard thành công!');
        } catch (err: any) {
          toast(err.message || 'Không tải được ảnh dán.');
        } finally {
          setBusy(false);
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [result, mode]);

  const loadKeyFile = async (file: File) => {
    if (!result) return;
    setBusy(true);
    setKeyMsg(null);
    try {
      const k = await api<any>(
        'POST',
        `/api/import/answers?filename=${encodeURIComponent(file.name)}`,
        undefined,
        { raw: await file.arrayBuffer(), timeoutMs: 120000 },
      );
      const r = await post<any>('/api/import/apply-key', {
        questions: result.questions,
        entries: k.entries,
        kind: result.info?.kind,
      });
      setResult((cur) => cur && { ...cur, questions: r.questions });
      triggerDraftSave(r.questions);
      setKeyMsg(
        `Đã đối chiếu ${r.applied}/${k.count} đáp án từ ${file.name}.${r.conflicts ? ` ${r.conflicts} câu mâu thuẫn — kiểm tra lại.` : ''}${r.unmatched.length ? ` ${r.unmatched.length} đáp án không khớp.` : ''}`,
      );
    } catch (e: any) {
      setKeyMsg(e.message);
    } finally {
      setBusy(false);
      if (keyRef.current) keyRef.current.value = '';
    }
  };

  const applyQuickKeyText = async () => {
    if (!result || !quickKeyText.trim()) return;
    setBusy(true);
    setKeyMsg(null);
    try {
      const k = await post<any>('/api/import/answers', { text: quickKeyText });
      const r = await post<any>('/api/import/apply-key', {
        questions: result.questions,
        entries: k.entries,
        kind: result.info?.kind,
      });
      setResult((cur) => cur && { ...cur, questions: r.questions });
      triggerDraftSave(r.questions);
      setKeyMsg(
        `Đã nạp ${r.applied}/${k.count} đáp án từ chuỗi dán.${r.conflicts ? ` ${r.conflicts} câu mâu thuẫn.` : ''}`,
      );
      setQuickKeyOpen(false);
      setQuickKeyText('');
    } catch (e: any) {
      toast(e.message || 'Không đọc được chuỗi đáp án.');
    } finally {
      setBusy(false);
    }
  };

  const parseFiles = async (files: File[]) => {
    if (busy) return;
    if (files.length > 10) {
      setError('Mỗi lần chọn tối đa 10 file.');
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(null);
    setDupMatches({});
    setSelectedIndices(new Set());
    try {
      let queued = 0;
      for (const file of files) {
        await api('POST', `/api/import/jobs?filename=${encodeURIComponent(file.name)}`, undefined, {
          raw: await file.arrayBuffer(),
        });
        queued++;
        setJobsRefresh((v) => v + 1);
      }
      toast(`Đã đưa ${queued} file vào hàng đợi xử lý nền.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const parseText = async () => {
    setJobId(null);
    setBusy(true);
    setError(null);
    setSaved(null);
    setDupMatches({});
    setSelectedIndices(new Set());
    try {
      const r = await post<any>('/api/import', { text });
      setResult({ ...r, origin: 'Văn bản dán' });
      runDuplicateScanFor(r.questions ?? [], true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const update = (i: number, q: any) => {
    setResult((r) => {
      if (!r) return r;
      const nextQuestions = r.questions.map((x, k) => (k === i ? { ...x, ...q, tagConfidence: 1 } : x));
      triggerDraftSave(nextQuestions);
      return { ...r, questions: nextQuestions };
    });
  };

  const remove = (i: number) => {
    setResult((r) => {
      if (!r) return r;
      const nextQuestions = r.questions.filter((_, k) => k !== i);
      triggerDraftSave(nextQuestions);
      return { ...r, questions: nextQuestions };
    });
    setDupMatches((prev) => {
      const next: Record<string, { bank: any[]; batch: any[] }> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const idx = Number(k);
        if (idx < i) next[String(idx)] = v;
        else if (idx > i) next[String(idx - 1)] = v;
      });
      return next;
    });
    setSelectedIndices((prev) => {
      const next = new Set<number>();
      prev.forEach((idx) => {
        if (idx < i) next.add(idx);
        else if (idx > i) next.add(idx - 1);
      });
      return next;
    });
  };

  const runDuplicateScanFor = async (questionsList: any[], silent = false) => {
    if (!questionsList?.length) return;
    setCheckingDups(true);
    try {
      const items = questionsList.map((q, index) => ({
        index,
        stem: q.stem,
        type: q.type,
        topic: q.topic,
      }));
      const res = await post<{ matches: Record<string, { bank: any[]; batch: any[] }> }>(
        '/api/questions/check-duplicates-batch',
        { items, threshold: 0.68 },
      );
      setDupMatches(res.matches || {});
      const hitCount = Object.keys(res.matches || {}).length;
      if (!silent) {
        if (hitCount > 0) {
          toast(`Phát hiện ${hitCount} câu có dấu hiệu trùng với Ngân hàng hoặc trùng nhau trong file.`);
        } else {
          toast('Tuyệt vời! Không phát hiện câu trùng lặp nào.');
        }
      }
    } catch (e: any) {
      if (!silent) toast(e.message || 'Không quét được trùng lặp.');
    } finally {
      setCheckingDups(false);
    }
  };

  const runDuplicateScan = () => runDuplicateScanFor(result?.questions ?? [], false);

  const applyBatchTagging = () => {
    if (!result || selectedIndices.size === 0) return;
    if (!batchTopic && !batchLevel) {
      toast('Chọn chuyên đề hoặc mức độ muốn gắn hàng loạt.');
      return;
    }
    const nextQuestions = result.questions.map((q, idx) => {
      if (!selectedIndices.has(idx)) return q;
      return {
        ...q,
        ...(batchTopic ? { topic: batchTopic, tagConfidence: 1 } : {}),
        ...(batchLevel ? { level: Number(batchLevel) } : {}),
      };
    });
    setResult({ ...result, questions: nextQuestions });
    triggerDraftSave(nextQuestions);
    toast(`Đã cập nhật ${selectedIndices.size} câu đã chọn.`);
  };

  const save = async () => {
    if (!result) return;
    setBusy(true);
    try {
      const r = await post<{ ids: number[] }>('/api/import/save', {
        questions: result.questions,
        origin: result.origin,
        jobId,
      });
      setSaved(r.ids);
      toast(`Đã lưu ${r.ids.length} câu vào ngân hàng ở trạng thái nháp.`);
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const approveValid = async () => {
    if (!saved) return;
    setBusy(true);
    try {
      const ids = saved.filter((_, i) => problems(result?.questions[i] ?? {}).length === 0);
      const r = await post<any>('/api/questions/approve', { ids });
      toast(
        `Đã duyệt ${r.approved.length} câu.${r.pending?.length ? ` ${r.pending.length} câu chờ người thứ hai.` : ''}${r.rejected.length ? ` ${r.rejected.length} câu cần sửa thêm.` : ''}`,
      );
      go(`/ngan-hang${classSuffix}`);
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenInBuilder = async () => {
    if (!result || !result.questions.length) return;
    setBusy(true);
    try {
      let ids = saved;
      if (!ids) {
        const saveRes = await post<{ ids: number[] }>('/api/import/save', {
          questions: result.questions,
          origin: result.origin,
          jobId,
        });
        ids = saveRes.ids || [];
        setSaved(ids);
      }
      const approveRes = await post<{ approved: number[] }>('/api/questions/approve', { ids });
      const usableIds = approveRes.approved?.length ? approveRes.approved : ids;
      const bankRes = await get<{ questions: any[] }>('/api/questions?status=approved&limit=500');
      const byId: Record<number, any> = {};
      for (const q of bankRes.questions || []) byId[q.id] = q;

      const items = usableIds
        .map((qid) => byId[qid])
        .filter(Boolean)
        .map((q) => ({ qid: q.id, type: q.type, topic: q.topic, level: q.level }));

      if (!items.length) {
        toast('Cần ít nhất 1 câu hợp lệ đã duyệt (đủ đề, đáp án, chuyên đề) để đưa sang Xưởng A4.');
        return;
      }

      saveBuilderHandoff({
        title: result.origin
          ? `Đề thi: ${result.origin.replace(/\.[^.]+$/, '')}`
          : 'Đề thi từ trình nhập',
        durationMin: 90,
        items,
        questions: byId,
        classId: defaultClassId,
        source: 'import',
      });
      go(`/ra-de?handoff=1${defaultClassId ? `&classId=${defaultClassId}` : ''}`);
    } catch (e: any) {
      toast(e.message || 'Không chuyển được sang Xưởng A4.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateExamFromImport = async () => {
    if (!result || !result.questions.length || !newExamTitle.trim()) return;
    setCreatingExam(true);
    try {
      let ids = saved;
      if (!ids) {
        const saveRes = await post<{ ids: number[] }>('/api/import/save', {
          questions: result.questions,
          origin: result.origin,
          jobId,
        });
        ids = saveRes.ids || [];
        setSaved(ids);
      }
      await post('/api/questions/approve', { ids }).catch(() => {});
      const examRes = await post<{ id: number }>('/api/exams', {
        title: newExamTitle.trim(),
        items: ids.map((qid) => ({ qid })),
        durationMin: Number(newExamDuration) || 90,
        variants: 4,
      });
      setCreateExamModalOpen(false);
      if (assignAfterCreate) {
        toast(`Đã tạo đề "${newExamTitle}" (${ids.length} câu). Chọn lớp để giao ngay!`);
        setAssignDrawer({
          open: true,
          examId: examRes.id,
          examTitle: newExamTitle.trim(),
          durationMin: Number(newExamDuration) || 90,
        });
      } else {
        toast(`Đã tạo đề "${newExamTitle}" vào Kho đề!`);
        go(`/de-thi/${examRes.id}${classSuffix}`);
      }
    } catch (e: any) {
      toast(e.message || 'Lỗi khi tạo đề thi từ file.');
    } finally {
      setCreatingExam(false);
    }
  };

  const qs = result?.questions ?? [];
  const dupCount = Object.keys(dupMatches).length;
  const readyCount = qs.filter((q) => problems(q).length === 0).length;
  const issueCount = qs.length - readyCount;

  const visibleOrder = useMemo(() => {
    let idx = qs.map((_, i) => i);
    if (filterMode === 'issues') idx = idx.filter((i) => problems(qs[i]).length > 0);
    else if (filterMode === 'duplicates') idx = idx.filter((i) => Boolean(dupMatches[String(i)]));
    else if (filterMode === 'ready') idx = idx.filter((i) => problems(qs[i]).length === 0);

    if (riskFirst) {
      idx.sort((a, b) => (qs[b].suspicion?.score ?? 0) - (qs[a].suspicion?.score ?? 0) || a - b);
    }
    return idx;
  }, [qs, filterMode, riskFirst, dupMatches]);

  return (
    <div className="stack import-page" style={{ gap: 14 }}>
      <CreateExamActionBar active="import" classSuffix={classSuffix} />

      <PageHeading
        title="Trình Nhập Đề Thông Minh"
        icon="import"
        description="Bóc tách từ Word, PDF, Excel, ảnh chụp — đối chiếu, khử trùng và chuyển thẳng thành đề thi."
      />

      <ol className="import-steps" aria-label="Quy trình nhập đề">
        {['Chọn nguồn đề', 'Đối chiếu & Làm sạch', 'Xuất Ngân hàng / Tạo đề'].map((label, i) => {
          const current = saved ? 2 : result ? 1 : 0;
          return (
            <li
              key={label}
              className={i < current ? 'complete' : i === current ? 'current' : ''}
              aria-current={i === current ? 'step' : undefined}
            >
              <span aria-hidden="true">{i < current ? <Icon name="check" /> : i + 1}</span>
              {label}
            </li>
          );
        })}
      </ol>

      <ImportJobsPanel
        refresh={jobsRefresh}
        onOpen={(job) => {
          const isDraft = Boolean(job.draftQuestions?.length);
          const questions = isDraft ? job.draftQuestions : job.result?.questions ?? [];
          setOriginalQuestions(job.result?.questions ?? []);
          setHasDraft(isDraft);
          setResult({
            ...job.result,
            questions,
            origin: job.name,
          });
          setSaved(job.savedIds);
          setJobId(job.id);
          setOpen(null);
          setError(null);
          setDupMatches({});
          setSelectedIndices(new Set());
          setDraftStatus(isDraft ? 'saved' : null);
          runDuplicateScanFor(questions, true);
        }}
      />

      {!result && (
        <div className="card">
          <div className="row between wrap mb" style={{ gap: 10 }}>
            <div className="seg">
              <button type="button" className={mode === 'file' ? 'on' : ''} onClick={() => setMode('file')}>
                Chọn file hoặc Dán ảnh
              </button>
              <button type="button" className={mode === 'text' ? 'on' : ''} onClick={() => setMode('text')}>
                Dán văn bản đề
              </button>
            </div>
            <span className="import-paste-image-hint">
              <ClipboardPaste size={14} /> Mẹo: Bấm Ctrl+V để dán trực tiếp ảnh chụp đề thi
            </span>
          </div>

          {mode === 'file' ? (
            <div className="stack" style={{ gap: 12 }}>
              <label
                className="import-dropzone"
                style={{ borderStyle: 'dashed', cursor: 'pointer' }}
                role="button"
                tabIndex={0}
                aria-label="Chọn file đề thi"
                aria-disabled={busy}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    if (!busy) fileRef.current?.click();
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files.length) parseFiles(Array.from(e.dataTransfer.files));
                }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  hidden
                  disabled={busy}
                  accept=".docx,.pdf,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => e.target.files?.length && parseFiles(Array.from(e.target.files))}
                />
                <span className="page-intro-icon">
                  <Icon name="upload" />
                </span>
                <div className="strong" role="status">
                  {busy ? 'Đang đưa file vào hàng đợi…' : 'Kéo thả tới 10 file vào đây hoặc bấm để chọn'}
                </div>
                <div className="small muted">
                  Hỗ trợ gói nhập chuẩn (.json/.zip), Word (.docx giữ công thức), PDF có chữ, Excel/CSV và văn bản. Ảnh hoặc PDF scan: xử lý bên ngoài thành gói nhập rồi đưa vào.
                </div>
              </label>

              <div className="row between wrap small" style={{ gap: 10 }}>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() =>
                    download('/api/import/template.csv', 'mau-nhap-cau-hoi.csv').catch((e) => toast(e.message))
                  }
                >
                  Tải file Excel/CSV mẫu
                </button>
              </div>
            </div>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              <textarea
                className="input"
                aria-label="Nội dung đề thi"
                style={{ minHeight: 200, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13 }}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  'Dán đề vào đây. Mỗi câu bắt đầu bằng "Câu 1.", phương án "A. B. C. D.", ý đúng/sai "a) b) c) d)". Đánh dấu đáp án bằng * hoặc dòng "Đáp án: B".'
                }
              />
              <div className="row between">
                <button type="button" className="btn ghost sm" onClick={() => setText(SAMPLE)}>
                  Điền đoạn đề mẫu chuẩn 2025
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || !text.trim()}
                  onClick={parseText}
                >
                  {busy ? 'Đang tách câu…' : 'Tách câu hỏi'}
                </button>
              </div>
            </div>
          )}

          {error && <div className="alert error mt">{error}</div>}
        </div>
      )}

      {result && (
        <>
          {/* Summary & 3 Output Actions */}
          <div className="card import-result-summary">
            <div className="row between wrap" style={{ gap: 12 }}>
              <div>
                <div className="strong" style={{ fontSize: 15 }}>
                  {result.origin}: tách được <span className="tabular-nums">{qs.length}</span> câu
                </div>
                <div className="meta-inline-line tabular-nums" style={{ marginTop: 4 }}>
                  <span style={{ color: '#16a34a', fontWeight: 700 }}>{readyCount} đủ chuẩn</span>
                  <span>·</span>
                  <span style={{ color: issueCount > 0 ? '#d97706' : 'inherit', fontWeight: issueCount > 0 ? 700 : 400 }}>
                    {issueCount} cần bổ sung
                  </span>
                  {dupCount > 0 && (
                    <>
                      <span>·</span>
                      <span style={{ color: '#dc2626', fontWeight: 700 }}>{dupCount} nghi trùng</span>
                    </>
                  )}
                  {result.info?.equations ? (
                    <>
                      <span>·</span>
                      <span>{result.info.equations} công thức</span>
                    </>
                  ) : null}
                  {result.info?.engine ? (
                    <>
                      <span>·</span>
                      <span>Bộ xử lý: {result.info.engine}</span>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => {
                    setResult(null);
                    setSaved(null);
                    setJobId(null);
                    setDupMatches({});
                    setSelectedIndices(new Set());
                  }}
                >
                  Nhập đề khác
                </button>

                {!saved ? (
                  <button type="button" className="btn sm" disabled={busy || !qs.length} onClick={save}>
                    <Icon name="bank" /> Lưu Ngân hàng ({qs.length})
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn sm good"
                    disabled={busy || readyCount === 0}
                    onClick={approveValid}
                  >
                    <Check size={14} /> Duyệt {readyCount} câu đủ chuẩn
                  </button>
                )}

                <button
                  type="button"
                  className="btn sm"
                  disabled={busy || readyCount === 0}
                  onClick={handleOpenInBuilder}
                  title="Chuyển các câu đủ chuẩn sang Xưởng tạo đề A4 để sắp xếp & bổ sung thêm"
                >
                  <FilePlus2 size={14} /> Mở trong Xưởng A4
                </button>

                <button
                  type="button"
                  className="btn sm primary"
                  disabled={busy || !qs.length}
                  onClick={() => {
                    setNewExamTitle(
                      result.origin
                        ? `Đề thi: ${result.origin.replace(/\.[^.]+$/, '')}`
                        : `Đề thi nhập mới ${new Date().toLocaleDateString('vi-VN')}`,
                    );
                    setNewExamDuration(90);
                    setAssignAfterCreate(true);
                    setCreateExamModalOpen(true);
                  }}
                >
                  <Send size={14} /> Tạo đề &amp; Giao lớp
                </button>
              </div>
            </div>

            {/* Batch Processing & Cleanup Toolbar */}
            <div className="import-batch-toolbar mt" style={{ marginTop: 12 }}>
              <label className="row tiny" style={{ gap: 6, cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={qs.length > 0 && selectedIndices.size === qs.length}
                  onChange={(e) =>
                    setSelectedIndices(
                      e.target.checked ? new Set(qs.map((_, i) => i)) : new Set(),
                    )
                  }
                />
                Chọn tất cả ({selectedIndices.size}/{qs.length})
              </label>

              <button
                type="button"
                className="btn ghost sm"
                style={{ fontSize: 12 }}
                onClick={() =>
                  setSelectedIndices(
                    new Set(qs.map((q, i) => (!q.topic ? i : -1)).filter((i) => i !== -1)),
                  )
                }
              >
                Chọn câu thiếu chuyên đề
              </button>

              {selectedIndices.size > 0 && !saved && (
                <>
                  <select
                    className="input sm"
                    style={{ width: 'auto', maxWidth: 190 }}
                    value={batchTopic}
                    onChange={(e) => setBatchTopic(e.target.value)}
                    aria-label="Chuyên đề gắn hàng loạt"
                  >
                    <option value="">— Chuyên đề —</option>
                    {meta.topics.map((t) => (
                      <option key={t.code} value={t.code}>
                        L{t.grade}: {t.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="input sm"
                    style={{ width: 'auto' }}
                    value={batchLevel}
                    onChange={(e) => setBatchLevel(e.target.value)}
                    aria-label="Mức độ gắn hàng loạt"
                  >
                    <option value="">— Mức độ —</option>
                    <option value="1">Nhận biết</option>
                    <option value="2">Thông hiểu</option>
                    <option value="3">Vận dụng</option>
                  </select>
                  <button
                    type="button"
                    className="btn sm primary"
                    onClick={applyBatchTagging}
                  >
                    Gắn ({selectedIndices.size})
                  </button>
                </>
              )}

              <span style={{ flex: 1 }} />

              <button
                type="button"
                className="btn sm"
                disabled={checkingDups || !qs.length}
                onClick={runDuplicateScan}
              >
                <CopyCheck size={14} /> {checkingDups ? 'Đang quét…' : 'Quét trùng lặp'}
              </button>

              {!saved && (
                <>
                  <input
                    ref={keyRef}
                    type="file"
                    hidden
                    accept=".docx,.pdf,.xlsx,.csv,.txt"
                    onChange={(e) => e.target.files?.[0] && loadKeyFile(e.target.files[0])}
                  />
                  <button
                    type="button"
                    className="btn sm"
                    disabled={busy}
                    onClick={() => keyRef.current?.click()}
                  >
                    Nạp file đáp án
                  </button>
                  <button
                    type="button"
                    className={`btn sm ${quickKeyOpen ? 'primary' : ''}`}
                    disabled={busy}
                    onClick={() => setQuickKeyOpen((v) => !v)}
                  >
                    <KeyRound size={14} /> Dán đáp án nhanh
                  </button>
                </>
              )}
            </div>

            {/* Inline Quick Paste Answer Key Box */}
            {quickKeyOpen && !saved && (
              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 10,
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--line)',
                }}
              >
                <div className="small strong mb" style={{ marginBottom: 6 }}>
                  Dán bảng/chuỗi đáp án nhanh (VD: 1A 2B 3C 4D hoặc Câu 1: ĐSĐS)
                </div>
                <textarea
                  className="input"
                  style={{ minHeight: 74, fontFamily: 'monospace', fontSize: 12.5 }}
                  value={quickKeyText}
                  onChange={(e) => setQuickKeyText(e.target.value)}
                  placeholder="Ví dụ: 1.A 2.C 3.B 4.D | Câu 13: ĐSĐS | Câu 17: 1,5"
                />
                <div className="row between mt" style={{ marginTop: 8 }}>
                  <button type="button" className="btn ghost sm" onClick={() => setQuickKeyOpen(false)}>
                    Đóng
                  </button>
                  <button
                    type="button"
                    className="btn primary sm"
                    disabled={busy || !quickKeyText.trim()}
                    onClick={applyQuickKeyText}
                  >
                    Khớp đáp án vào đề
                  </button>
                </div>
              </div>
            )}

            {/* Filter Strip & Draft Auto-Save Indicator */}
            <div className="row between wrap mt small" style={{ gap: 8, marginTop: 10 }}>
              <div className="seg">
                <button
                  type="button"
                  className={filterMode === 'all' ? 'on' : ''}
                  onClick={() => setFilterMode('all')}
                >
                  Tất cả ({qs.length})
                </button>
                <button
                  type="button"
                  className={filterMode === 'issues' ? 'on' : ''}
                  onClick={() => setFilterMode('issues')}
                >
                  Cần bổ sung ({issueCount})
                </button>
                <button
                  type="button"
                  className={filterMode === 'duplicates' ? 'on' : ''}
                  onClick={() => setFilterMode('duplicates')}
                >
                  Nghi trùng ({dupCount})
                </button>
                <button
                  type="button"
                  className={filterMode === 'ready' ? 'on' : ''}
                  onClick={() => setFilterMode('ready')}
                >
                  Đủ chuẩn ({readyCount})
                </button>
              </div>

              <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                <label className="row tiny" style={{ gap: 4, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={riskFirst}
                    onChange={(e) => setRiskFirst(e.target.checked)}
                  />
                  Câu cần xem lên trước
                </label>

                {jobId && !saved && (
                  <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                    {draftStatus === 'saving' && <span className="tiny muted">Đang lưu nháp…</span>}
                    {draftStatus === 'saved' && (
                      <span className="tiny" style={{ color: '#16a34a', fontWeight: 600 }}>
                        ✓ Đã lưu nháp tự động
                      </span>
                    )}
                    {draftStatus === 'dirty' && (
                      <span className="tiny" style={{ color: '#d97706' }}>
                        Chưa lưu được nháp
                      </span>
                    )}
                    {hasDraft && (
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={revertToOriginal}
                        style={{ fontSize: 11.5 }}
                      >
                        ↺ Khôi phục bản gốc
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {keyMsg && <div className="alert warn small mt">{keyMsg}</div>}
            {result.warnings.length > 0 && (
              <details className="import-notes">
                <summary>Thông tin nhận dạng ({result.warnings.length})</summary>
                {result.warnings.map((w, i) => (
                  <div key={i} className="alert warn small mt">
                    {w}
                  </div>
                ))}
              </details>
            )}
            {saved && (
              <div className="alert ok small mt">
                Đã lưu {saved.length} câu nháp. Thầy/Cô có thể bấm <b>Mở trong Xưởng A4</b> để tinh chỉnh đề ngay hoặc mở{' '}
                <a href={`#/ngan-hang${classSuffix}`}>Ngân hàng câu hỏi</a>.
              </div>
            )}
          </div>

          {/* Parsed Questions Stream */}
          <div className="stack" style={{ gap: 10 }}>
            {visibleOrder.length === 0 ? (
              <div className="card empty small muted">
                Không có câu hỏi nào trong bộ lọc này.
              </div>
            ) : (
              visibleOrder.map((i) => {
                const q = qs[i];
                const p = problems(q);
                const low = (q.tagConfidence ?? 1) < 0.5;
                const dup = dupMatches[String(i)];
                const isChecked = selectedIndices.has(i);

                return (
                  <div
                    key={i}
                    className="card flat"
                    style={{
                      borderColor: dup ? '#f59e0b' : isChecked ? 'var(--primary)' : 'var(--line)',
                      background: isChecked ? '#f8fbff' : '#ffffff',
                    }}
                  >
                    <div className="row mb wrap" style={{ gap: 8, alignItems: 'center' }}>
                      {!saved && (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() =>
                            setSelectedIndices((prev) => {
                              const next = new Set(prev);
                              next.has(i) ? next.delete(i) : next.add(i);
                              return next;
                            })
                          }
                          aria-label={`Chọn câu ${q.num}`}
                        />
                      )}
                      <span className="badge blue tabular-nums">
                        {q.part ? `Phần ${q.part} · ` : ''}Câu {q.num}
                      </span>
                      <TypeBadge type={q.type} />
                      <LevelBadge level={q.level} />
                      <span
                        className={`badge ${low ? 'amber' : ''}`}
                        title="Máy đoán chuyên đề; kiểm tra lại nếu độ tin cậy thấp"
                      >
                        {topicName(meta, q.topic)}
                        {low ? ' · cần xem' : ''}
                      </span>
                      {p.length > 0 && <span className="badge red">{p.join(', ')}</span>}
                      {dup && (
                        <span className="badge amber">
                          Trùng{' '}
                          {dup.bank?.[0]
                            ? `${Math.round(dup.bank[0].score * 100)}% kho`
                            : `${Math.round(dup.batch[0].score * 100)}% trong file`}
                        </span>
                      )}

                      <span style={{ flex: 1 }} />

                      {q.raw && (
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() =>
                            setRawOpen((cur) => {
                              const n = new Set(cur);
                              n.has(i) ? n.delete(i) : n.add(i);
                              return n;
                            })
                          }
                        >
                          {rawOpen.has(i) ? 'Ẩn bản gốc' : 'So bản gốc'}
                        </button>
                      )}
                      {!saved && (
                        <>
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => setOpen(open === i ? null : i)}
                          >
                            {open === i ? 'Xong' : 'Sửa'}
                          </button>
                          <button
                            type="button"
                            className="btn ghost sm"
                            onClick={() => remove(i)}
                            aria-label="Bỏ câu này"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>

                    {dup && (
                      <div className="import-dup-callout mb">
                        <div className="row between wrap" style={{ gap: 8, marginBottom: 6 }}>
                          <span className="row" style={{ gap: 6, fontWeight: 700 }}>
                            <AlertTriangle size={14} />
                            {dup.bank?.length
                              ? `Giống câu #${dup.bank[0].id} đã có trong Ngân hàng (${Math.round(dup.bank[0].score * 100)}%)`
                              : `Trùng với Câu ${dup.batch[0].batchIndex + 1} trong cùng file`}
                          </span>
                          <div className="row" style={{ gap: 6 }}>
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => setDupCompareIdx(i)}
                            >
                              Đối chiếu cạnh nhau
                            </button>
                            {!saved && (
                              <button
                                type="button"
                                className="btn sm ghost"
                                onClick={() => remove(i)}
                              >
                                Bỏ câu trùng này
                              </button>
                            )}
                          </div>
                        </div>
                        {dup.bank?.[0] && (
                          <div className="tiny" style={{ color: '#475569' }}>
                            <b>Câu có sẵn: </b>
                            <MathText
                              text={
                                dup.bank[0].stem.length > 160
                                  ? dup.bank[0].stem.slice(0, 160) + '…'
                                  : dup.bank[0].stem
                              }
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {q.suspicion && q.suspicion.level !== 'low' && (
                      <details className="import-question-notes" open={p.length > 0}>
                        <summary>Lưu ý cần kiểm tra ({q.suspicion.reasons.length})</summary>
                        <ul className="tiny mb" style={{ margin: '0 0 6px', paddingLeft: 18, color: 'var(--warn)' }}>
                          {q.suspicion.reasons.map((r: string, k: number) => (
                            <li key={k}>{r}</li>
                          ))}
                        </ul>
                      </details>
                    )}

                    {rawOpen.has(i) && (
                      <div className="grid-2 mb" style={{ gap: 8 }}>
                        <div>
                          <div className="tiny muted">Bản gốc trong file</div>
                          <pre
                            className="small"
                            style={{
                              whiteSpace: 'pre-wrap',
                              margin: 0,
                              padding: 8,
                              border: '1px solid var(--line)',
                              borderRadius: 6,
                            }}
                          >
                            {q.raw}
                          </pre>
                        </div>
                        <div>
                          <div className="tiny muted">Máy đã tách thành</div>
                          <div
                            className="small"
                            style={{ padding: 8, border: '1px solid var(--line)', borderRadius: 6 }}
                          >
                            <MathText as="div" text={q.stem} />
                            {q.options?.filter(Boolean).map((o: string, k: number) => (
                              <div key={k}>
                                <b>{q.type === 'tf' ? 'abcd'[k] + ')' : 'ABCD'[k] + '.'}</b> <MathText text={o} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {open === i ? (
                      <QuestionEditor q={q} onChange={(nq) => update(i, nq)} />
                    ) : (
                      <>
                        {(q.sourceStem || q.stem.includes('[[img:')) && q.ocrText ? (
                          <div
                            className="side-by-side-ocr mb"
                            style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}
                          >
                            <div
                              className="row"
                              style={{
                                background: 'var(--surface-subtle, #f8fafc)',
                                padding: '6px 12px',
                                borderBottom: '1px solid var(--line)',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                            >
                              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                                <span className="tiny strong">Đối chiếu scan:</span>
                                <span className={`badge sm ${q.stem.includes('[[img:') ? 'blue' : 'green'}`}>
                                  {q.stem.includes('[[img:') ? 'Ảnh scan gốc' : 'Text OCR'}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="btn sm"
                                onClick={() => {
                                  if (q.stem.includes('[[img:')) {
                                    update(i, { ...q, sourceStem: q.sourceStem || q.stem, stem: q.ocrText });
                                  } else {
                                    update(i, { ...q, stem: q.sourceStem || q.stem });
                                  }
                                }}
                              >
                                {q.stem.includes('[[img:') ? 'Chuyển sang text OCR' : 'Khôi phục ảnh scan gốc'}
                              </button>
                            </div>
                            <div className="grid-2" style={{ gap: 0 }}>
                              <div style={{ padding: 10, borderRight: '1px solid var(--line)', background: '#fff' }}>
                                <div className="tiny muted mb">Ảnh quét gốc:</div>
                                <MathText as="div" className="q-stem" text={q.sourceStem || q.stem} />
                              </div>
                              <div style={{ padding: 10, background: '#fafbfc' }}>
                                <div className="tiny muted mb">Nội dung text OCR:</div>
                                <MathText
                                  as="div"
                                  className="q-stem"
                                  text={q.stem.includes('[[img:') ? q.ocrText : q.stem}
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <MathText as="div" className="q-stem" text={q.stem} />
                        )}

                        {q.type !== 'short' && (
                          <div className="grid-2 mt" style={{ gap: 4 }}>
                            {q.options?.map((o: string, k: number) => (
                              <div
                                key={k}
                                className="small"
                                style={
                                  q.type === 'mcq' && q.answer === k
                                    ? { color: 'var(--good)', fontWeight: 700 }
                                    : undefined
                                }
                              >
                                <b>{q.type === 'mcq' ? 'ABCD'[k] + '.' : 'abcd'[k] + ')'}</b>{' '}
                                <MathText text={o} />
                                {q.type === 'tf' &&
                                  Array.isArray(q.answer) &&
                                  typeof q.answer[k] === 'boolean' && (
                                    <span
                                      className={`badge ${q.answer[k] ? 'green' : 'red'}`}
                                      style={{ marginLeft: 6 }}
                                    >
                                      {q.answer[k] ? 'Đ' : 'S'}
                                    </span>
                                  )}
                              </div>
                            ))}
                          </div>
                        )}

                        {q.type === 'short' && (
                          <div className="small mt">
                            Đáp án: <b>{q.answer ?? '—'}</b>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {createExamModalOpen && (
        <Modal
          title={`Tạo đề thi mới từ ${qs.length} câu đã bóc tách`}
          onClose={() => setCreateExamModalOpen(false)}
        >
          <div className="stack" style={{ gap: 14 }}>
            <label>
              <span className="small strong">Tên đề thi</span>
              <input
                className="input"
                value={newExamTitle}
                onChange={(e) => setNewExamTitle(e.target.value)}
                placeholder="Nhập tên đề thi..."
                autoFocus
              />
            </label>
            <div className="grid-2" style={{ gap: 12 }}>
              <label>
                <span className="small strong">Thời gian làm bài</span>
                <select
                  className="input"
                  value={newExamDuration}
                  onChange={(e) => setNewExamDuration(Number(e.target.value))}
                >
                  <option value={15}>15 phút (kiểm tra nhanh)</option>
                  <option value={45}>45 phút (1 tiết)</option>
                  <option value={60}>60 phút</option>
                  <option value={90}>90 phút (chuẩn tốt nghiệp)</option>
                  <option value={120}>120 phút</option>
                </select>
              </label>
              <div>
                <span className="small strong">Số câu trong đề</span>
                <div
                  className="input tabular-nums"
                  style={{ background: 'var(--surface-subtle)', display: 'flex', alignItems: 'center' }}
                >
                  <strong>
                    {qs.length} câu ({readyCount} đủ chuẩn)
                  </strong>
                </div>
              </div>
            </div>

            <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={assignAfterCreate}
                onChange={(e) => setAssignAfterCreate(e.target.checked)}
              />
              Mở ngay ngăn kéo Giao đề cho lớp sau khi tạo
            </label>

            <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setCreateExamModalOpen(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={creatingExam || !newExamTitle.trim()}
                onClick={handleCreateExamFromImport}
              >
                <Sparkles size={14} />{' '}
                {creatingExam
                  ? 'Đang tạo đề…'
                  : assignAfterCreate
                  ? 'Tạo đề & Chọn lớp giao →'
                  : 'Tạo đề & Xem chi tiết →'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {dupCompareIdx !== null && qs[dupCompareIdx] && dupMatches[String(dupCompareIdx)] && (
        <Modal
          title={`Đối chiếu câu nghi trùng · Câu ${qs[dupCompareIdx].num || dupCompareIdx + 1}`}
          onClose={() => setDupCompareIdx(null)}
          width={860}
        >
          {(() => {
            const cur = qs[dupCompareIdx];
            const matchInfo = dupMatches[String(dupCompareIdx)];
            const bankDup = matchInfo.bank?.[0];
            const batchDup = matchInfo.batch?.[0];
            const peerQ = batchDup ? qs[batchDup.batchIndex] : null;
            return (
              <div className="stack" style={{ gap: 14 }}>
                <div className="grid-2" style={{ gap: 12, alignItems: 'stretch' }}>
                  <div style={{ padding: 12, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)' }}>
                    <div className="tiny strong muted mb" style={{ marginBottom: 6 }}>
                      CÂU ĐANG NHẬP MỚI
                    </div>
                    <MathText as="div" className="q-stem" text={cur.stem} />
                    {cur.type !== 'short' && cur.options?.length > 0 && (
                      <div className="stack mt" style={{ gap: 4, marginTop: 8 }}>
                        {cur.options.map((o: string, k: number) => (
                          <div key={k} className="small">
                            <b>{cur.type === 'tf' ? 'abcd'[k] + ')' : 'ABCD'[k] + '.'}</b> <MathText text={o} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ padding: 12, borderRadius: 10, border: '1px solid #f59e0b', background: 'var(--surface-subtle)' }}>
                    <div className="row between tiny strong mb" style={{ marginBottom: 6, color: '#b45309' }}>
                      <span>
                        {bankDup
                          ? `CÂU #${bankDup.id} ĐÃ CÓ TRONG NGÂN HÀNG`
                          : `CÂU ${batchDup.batchIndex + 1} TRONG CÙNG FILE`}
                      </span>
                      <span className="tabular-nums">
                        Tương đồng {Math.round((bankDup?.score ?? batchDup?.score ?? 0) * 100)}%
                      </span>
                    </div>
                    <MathText as="div" className="q-stem" text={bankDup?.stem ?? peerQ?.stem ?? ''} />
                    {peerQ && peerQ.type !== 'short' && peerQ.options?.length > 0 && (
                      <div className="stack mt" style={{ gap: 4, marginTop: 8 }}>
                        {peerQ.options.map((o: string, k: number) => (
                          <div key={k} className="small">
                            <b>{peerQ.type === 'tf' ? 'abcd'[k] + ')' : 'ABCD'[k] + '.'}</b> <MathText text={o} />
                          </div>
                        ))}
                      </div>
                    )}
                    {bankDup?.reason && (
                      <div className="tiny muted mt" style={{ marginTop: 8 }}>
                        Nhận định hệ thống: {bankDup.reason}
                      </div>
                    )}
                  </div>
                </div>

                <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                  <button type="button" className="btn ghost" onClick={() => setDupCompareIdx(null)}>
                    Giữ lại để xem sau
                  </button>
                  {!saved && (
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => {
                        remove(dupCompareIdx);
                        setDupCompareIdx(null);
                        toast('Đã loại bỏ câu trùng khỏi đợt nhập.');
                      }}
                    >
                      Bỏ câu đang nhập này
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {assignDrawer && (
        <AssignExamDrawer
          isOpen={assignDrawer.open}
          onClose={() => setAssignDrawer(null)}
          examId={assignDrawer.examId}
          examTitle={assignDrawer.examTitle}
          durationMin={assignDrawer.durationMin}
          defaultClassId={defaultClassId}
        />
      )}
    </div>
  );
}
