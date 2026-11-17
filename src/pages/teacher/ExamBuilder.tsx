import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Database,
  FilePlus2,
  FolderPlus,
  Layers,
  PenLine,
  Printer,
  RefreshCw,
  Save,
  Send,
  Settings2,
  Shuffle,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { api, get, post, put } from '../../api';
import { MathText } from '../../ui/MathText';
import {
  go,
  LevelBadge,
  Loading,
  Modal,
  SourceBadge,
  topicName,
  useApp,
  useAsync,
  useRoute,
} from '../../ui/kit';
import { ExamPrintModal } from '../../ui/ExamPrintModal';
import { CreateExamActionBar } from '../../ui/TeacherNavBars';
import { Draft, QuestionEditor } from '../../ui/QuestionEditor';
import { AssignExamDrawer } from '../../ui/AssignExamDrawer';
import {
  analyzeExamDiagnostics,
  computeExamMatrix,
  consumeBuilderHandoff,
} from '../../utils/examHandoff';

const PRESETS = {
  official: {
    label: 'Đề tốt nghiệp chuẩn',
    counts: { mcq: 12, tf: 4, short: 6 },
    levels: { 1: 40, 2: 30, 3: 30 },
    durationMin: 90,
  },
  test45: {
    label: 'Kiểm tra 45 phút',
    counts: { mcq: 8, tf: 2, short: 3 },
    levels: { 1: 40, 2: 40, 3: 20 },
    durationMin: 45,
  },
  quiz15: {
    label: 'Kiểm tra 15 phút',
    counts: { mcq: 4, tf: 1, short: 2 },
    levels: { 1: 50, 2: 30, 3: 20 },
    durationMin: 15,
  },
};

type Bp = {
  counts: Record<string, number>;
  levels: Record<string, number>;
  durationMin: number;
  topics: string[];
};

export function ExamBuilder() {
  const { query } = useRoute();
  const { meta, user, toast } = useApp();

  const cidParam = query.get('classId');
  const defaultClassId = cidParam && /^\d+$/.test(cidParam) ? Number(cidParam) : null;
  const classSuffix = defaultClassId ? `?classId=${defaultClassId}` : '';

  const [editingExamId, setEditingExamId] = useState<number | null>(() => {
    const eid = query.get('examId');
    return eid && /^\d+$/.test(eid) ? Number(eid) : null;
  });
  const [preset, setPreset] = useState<keyof typeof PRESETS | 'custom'>('official');
  const [bp, setBp] = useState<Bp>(() => {
    const rawTopics = query.get('topics');
    const initialTopics = rawTopics ? rawTopics.split(',').filter(Boolean) : [];
    return { ...PRESETS.official, topics: initialTopics };
  });
  const [title, setTitle] = useState(
    () => query.get('title') || 'Đề khảo sát chất lượng Toán THPT',
  );
  const [variants, setVariants] = useState(4);
  const [gen, setGen] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [inspectorTab, setInspectorTab] = useState<'question' | 'bank' | 'matrix' | 'config'>(() =>
    query.get('handoff') || query.get('examId') ? 'question' : 'config',
  );
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [activeCodeVariant, setActiveCodeVariant] = useState<string>('101');
  const [printModalOpen, setPrintModalOpen] = useState(false);

  // Swap modal state
  const [swap, setSwap] = useState<{ idx: number; options: any[] } | null>(null);
  const [swapSearch, setSwapSearch] = useState('');

  // Inline edit / create question modal state
  const [editingQuestion, setEditingQuestion] = useState<{
    idx: number | null; // null = creating brand new question
    draft: Draft;
    status?: string;
    reason?: string;
  } | null>(null);
  const [savingQuestion, setSavingQuestion] = useState(false);

  // Assign drawer state
  const [assignState, setAssignState] = useState<{
    open: boolean;
    examId: number;
    examTitle: string;
  } | null>(null);

  // Bank picker state (Tab 2)
  const [bankFilter, setBankFilter] = useState({ q: '', type: '', topic: '', level: '' });
  const [bankItems, setBankItems] = useState<any[]>([]);
  const [bankTotal, setBankTotal] = useState(0);
  const [bankLoading, setBankLoading] = useState(false);

  // Blueprint templates
  const templates = useAsync(() => get<{ blueprints: any[] }>('/api/blueprints'), []);
  const [templateName, setTemplateName] = useState('');
  const [templateShared, setTemplateShared] = useState(false);

  const questionRefs = useRef<Record<number, HTMLElement | null>>({});

  const applyItemsChange = (nextItems: any[], nextQuestions?: Record<number, any>) => {
    setGen((cur: any) => {
      const qmap = nextQuestions || cur?.questions || {};
      return {
        ...(cur || {}),
        items: nextItems,
        matrix: computeExamMatrix(nextItems),
        questions: qmap,
      };
    });
  };

  const generate = async (overrideBp?: Bp) => {
    setBusy(true);
    const activeBp = overrideBp || bp;
    try {
      const r = await post<any>('/api/exams/generate', {
        counts: activeBp.counts,
        levels: activeBp.levels,
        topics: activeBp.topics,
      });
      setGen(r);
      setSelectedIdx(0);
      setInspectorTab('question');
      if (r.shortages?.length) {
        toast(`Đã sinh ${r.items.length} câu (thiếu ${r.shortages.map((s: any) => `${s.need - s.got} ${s.type}`).join(', ')}).`);
      } else {
        toast('Đã sinh đề thi theo ma trận!');
      }
    } catch (e: any) {
      toast(e.message || 'Không sinh được đề thi.');
    } finally {
      setBusy(false);
    }
  };

  // Initialization: handoff > existing examId > query topics > auto generate
  useEffect(() => {
    const handoffParam = query.get('handoff');
    const examIdParam = query.get('examId');

    if (handoffParam) {
      const payload = consumeBuilderHandoff();
      if (payload && payload.items.length > 0) {
        if (payload.title) setTitle(payload.title);
        if (payload.durationMin) {
          setBp((prev) => ({ ...prev, durationMin: payload.durationMin! }));
        }
        const normalized = payload.items.map((it) => ({
          qid: it.qid,
          type: it.type,
          topic: it.topic ?? payload.questions?.[it.qid]?.topic ?? null,
          level: it.level ?? payload.questions?.[it.qid]?.level ?? 2,
        }));
        setGen({
          items: normalized,
          questions: payload.questions || {},
          matrix: computeExamMatrix(normalized),
          shortages: [],
          warnings: [],
        });
        setEditingExamId(null);
        setSelectedIdx(0);
        toast(`Đã nạp ${normalized.length} câu vào Xưởng tạo đề A4!`);
        return;
      }
    }

    if (examIdParam && /^\d+$/.test(examIdParam)) {
      const eid = Number(examIdParam);
      setBusy(true);
      get<any>(`/api/exams/${eid}`)
        .then((res) => {
          const ex = res.exam;
          setEditingExamId(ex.id);
          setTitle(ex.title || 'Đề thi');
          setVariants(ex.variants?.length || 4);
          if (ex.blueprint && typeof ex.blueprint === 'object') {
            setBp((prev) => ({
              counts: ex.blueprint.counts || prev.counts,
              levels: ex.blueprint.levels || prev.levels,
              durationMin: ex.durationMin || ex.blueprint.durationMin || 90,
              topics: Array.isArray(ex.blueprint.topics) ? ex.blueprint.topics : [],
            }));
          } else {
            setBp((prev) => ({ ...prev, durationMin: ex.durationMin || 90 }));
          }
          const items = (ex.items || []).map((it: any) => ({
            qid: it.qid,
            type: it.type,
            topic: it.topic ?? res.questions?.[it.qid]?.topic ?? null,
            level: it.level ?? res.questions?.[it.qid]?.level ?? 2,
          }));
          setGen({
            items,
            questions: res.questions || {},
            matrix: computeExamMatrix(items),
            shortages: [],
            warnings: [],
          });
          setSelectedIdx(0);
        })
        .catch((e: any) => {
          toast(e.message || 'Không tải được đề thi để chỉnh sửa.');
        })
        .finally(() => setBusy(false));
      return;
    }
  }, []);

  // Load bank picker items when Bank tab is active or filter changes
  useEffect(() => {
    if (inspectorTab !== 'bank') return;
    let alive = true;
    setBankLoading(true);
    const params = new URLSearchParams();
    params.set('status', 'approved');
    params.set('limit', '40');
    if (bankFilter.q.trim()) params.set('q', bankFilter.q.trim());
    if (bankFilter.type) params.set('type', bankFilter.type);
    if (bankFilter.topic) params.set('topic', bankFilter.topic);
    if (bankFilter.level) params.set('level', bankFilter.level);

    get<any>(`/api/questions?${params.toString()}`)
      .then((res) => {
        if (!alive) return;
        setBankItems(res.questions || []);
        setBankTotal(res.total ?? (res.questions?.length || 0));
      })
      .catch(() => {
        if (!alive) return;
        setBankItems([]);
      })
      .finally(() => {
        if (alive) setBankLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [inspectorTab, bankFilter]);

  const applyPreset = (k: keyof typeof PRESETS) => {
    setPreset(k);
    setBp((prev) => ({ ...PRESETS[k], topics: prev.topics }));
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      toast('Nhập tên mẫu ma trận trước khi lưu.');
      return;
    }
    setBusy(true);
    try {
      await post('/api/blueprints', {
        name: templateName.trim(),
        blueprint: bp,
        shared: templateShared,
      });
      toast('Đã lưu mẫu ma trận.');
      setTemplateName('');
      templates.reload();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const applySavedBlueprint = (savedBp: any) => {
    const next: Bp = {
      counts: savedBp.counts || bp.counts,
      levels: savedBp.levels || bp.levels,
      durationMin: savedBp.durationMin || 90,
      topics: Array.isArray(savedBp.topics) ? savedBp.topics : [],
    };
    setPreset('custom');
    setBp(next);
    generate(next);
  };

  const deleteBlueprint = async (id: number) => {
    if (!confirm('Xóa mẫu ma trận này?')) return;
    try {
      await api('DELETE', `/api/blueprints/${id}`);
      toast('Đã xóa mẫu ma trận.');
      templates.reload();
    } catch (e: any) {
      toast(e.message);
    }
  };

  const openSwap = async (idx: number) => {
    if (!gen || !gen.items[idx]) return;
    const it = gen.items[idx];
    setSwapSearch('');
    const all = await get<any>(`/api/questions?status=approved&type=${it.type}&limit=120`);
    const used = new Set(gen.items.map((x: any) => x.qid));
    const options = (all.questions || [])
      .filter((q: any) => !used.has(q.id))
      .sort(
        (a: any, b: any) =>
          Number(b.topic === it.topic) - Number(a.topic === it.topic) ||
          Number(b.level === it.level) - Number(a.level === it.level),
      );
    setSwap({ idx, options });
  };

  const doSwap = (q: any) => {
    if (!swap || !gen) return;
    const items = gen.items.map((x: any, i: number) =>
      i === swap.idx ? { qid: q.id, type: q.type, topic: q.topic, level: q.level } : x,
    );
    applyItemsChange(items, { ...gen.questions, [q.id]: q });
    setSwap(null);
    toast('Đã thay câu hỏi mới trên tờ đề.');
  };

  const moveQuestionInSection = (idx: number, direction: -1 | 1) => {
    if (!gen?.items?.[idx]) return;
    const targetItem = gen.items[idx];
    const sameTypeIndices = gen.items
      .map((it: any, i: number) => (it.type === targetItem.type ? i : -1))
      .filter((i: number) => i !== -1);
    const posInSection = sameTypeIndices.indexOf(idx);
    const swapPos = posInSection + direction;
    if (swapPos < 0 || swapPos >= sameTypeIndices.length) return;
    const otherIdx = sameTypeIndices[swapPos];

    const nextItems = [...gen.items];
    const tmp = nextItems[idx];
    nextItems[idx] = nextItems[otherIdx];
    nextItems[otherIdx] = tmp;

    applyItemsChange(nextItems);
    setSelectedIdx(otherIdx);
  };

  const removeQuestionAt = (idx: number) => {
    if (!gen?.items?.[idx]) return;
    const nextItems = gen.items.filter((_: any, i: number) => i !== idx);
    applyItemsChange(nextItems);
    if (selectedIdx >= nextItems.length) {
      setSelectedIdx(Math.max(0, nextItems.length - 1));
    }
    toast('Đã bỏ câu hỏi khỏi đề.');
  };

  const addQuestionFromBank = (q: any) => {
    const curItems = gen?.items ?? [];
    const curQuestions = gen?.questions ?? {};
    if (curItems.some((it: any) => it.qid === q.id)) {
      toast('Câu hỏi này đã có trên tờ đề.');
      return;
    }
    const newItem = { qid: q.id, type: q.type, topic: q.topic, level: q.level };
    // Insert right after the last item of the same type so sections stay contiguous
    const lastOfType = curItems.reduce(
      (last: number, it: any, idx: number) => (it.type === q.type ? idx : last),
      -1,
    );
    const nextItems = [...curItems];
    const insertAt = lastOfType >= 0 ? lastOfType + 1 : nextItems.length;
    nextItems.splice(insertAt, 0, newItem);

    applyItemsChange(nextItems, { ...curQuestions, [q.id]: q });
    setSelectedIdx(insertAt);
    toast(`Đã chèn câu #${q.id} vào đề.`);
  };

  const openInlineNewQuestion = () => {
    setEditingQuestion({
      idx: null,
      draft: {
        type: 'mcq',
        stem: '',
        options: ['', '', '', ''],
        answer: 0,
        explanation: '',
        topic: bp.topics[0] || meta.topics[0]?.code || null,
        level: 2,
      },
    });
  };

  const openInlineEditQuestion = (idx: number) => {
    const it = gen?.items?.[idx];
    const q = it ? gen?.questions?.[it.qid] : null;
    if (!q) return;
    setEditingQuestion({
      idx,
      draft: {
        id: q.id,
        type: q.type,
        stem: q.stem || '',
        options: Array.isArray(q.options) ? [...q.options] : ['', '', '', ''],
        answer: q.answer ?? null,
        explanation: q.explanation || '',
        topic: q.topic || null,
        level: q.level || 2,
        distractors: q.distractors || {},
        group_id: q.group_id || null,
        ocrText: q.ocrText || '',
        sourceStem: q.sourceStem || '',
      },
      status: q.status,
      reason: '',
    });
  };

  const handleSaveInlineQuestion = async () => {
    if (!editingQuestion) return;
    setSavingQuestion(true);
    try {
      if (editingQuestion.idx === null) {
        const res = await post<{ id: number; question: any }>('/api/questions', {
          ...editingQuestion.draft,
          autoApprove: true,
        });
        const created = res.question;
        if (created.status === 'approved') {
          addQuestionFromBank(created);
          toast(`Đã soạn & chèn câu mới #${created.id} vào đề!`);
        } else {
          toast(`Đã lưu câu nháp #${created.id}. Trường bật duyệt 2 người nên cần đồng nghiệp duyệt trước khi chèn vào đề.`);
        }
        setEditingQuestion(null);
      } else {
        const qid = editingQuestion.draft.id!;
        const res = await put<{ question: any }>(`/api/questions/${qid}`, {
          ...editingQuestion.draft,
          reason: editingQuestion.reason || 'Chỉnh sửa trực tiếp từ Xưởng tạo đề',
          versionNote: editingQuestion.reason || 'Chỉnh sửa trong Xưởng tạo đề',
        });
        const updated = res.question;
        if (gen) {
          const nextItems = gen.items.map((it: any, i: number) =>
            i === editingQuestion.idx
              ? { ...it, type: updated.type, topic: updated.topic, level: updated.level }
              : it,
          );
          applyItemsChange(nextItems, { ...gen.questions, [qid]: updated });
        }
        toast('Đã cập nhật nội dung câu hỏi.');
        setEditingQuestion(null);
      }
    } catch (e: any) {
      toast(e.message || 'Không lưu được câu hỏi.');
    } finally {
      setSavingQuestion(false);
    }
  };

  const generateAiSimilarAt = async (idx: number) => {
    const it = gen?.items?.[idx];
    if (!it || !meta.aiEnabled) return;
    setBusy(true);
    try {
      const r = await post<{ id: number }>('/api/ai/similar', { id: it.qid });
      // Auto approve if single review
      await post('/api/questions/approve', { ids: [r.id] }).catch(() => {});
      const fetchRes = await get<any>(`/api/questions?status=all&limit=100`);
      const newQ = (fetchRes.questions || []).find((q: any) => q.id === r.id);
      if (newQ && newQ.status === 'approved') {
        const items = gen.items.map((x: any, i: number) =>
          i === idx ? { qid: newQ.id, type: newQ.type, topic: newQ.topic, level: newQ.level } : x,
        );
        applyItemsChange(items, { ...gen.questions, [newQ.id]: newQ });
        toast(`AI đã tạo & thay thế bằng câu tương tự #${newQ.id}!`);
      } else {
        toast(`AI đã tạo câu nháp #${r.id} trong Ngân hàng để bạn kiểm tra.`);
      }
    } catch (e: any) {
      toast(e.message || 'Không gọi được AI.');
    } finally {
      setBusy(false);
    }
  };

  const persistExam = async (): Promise<number | null> => {
    if (!gen?.items?.length || !title.trim()) {
      toast('Đề thi cần có tên và ít nhất 1 câu hỏi.');
      return null;
    }
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        items: gen.items,
        durationMin: bp.durationMin,
        variants,
        blueprint: bp,
      };
      if (editingExamId) {
        const r = await put<{ id: number }>(`/api/exams/${editingExamId}`, payload);
        toast('Đã cập nhật đề thi trong Kho đề.');
        return r.id;
      } else {
        const r = await post<{ id: number }>('/api/exams', payload);
        setEditingExamId(r.id);
        toast('Đã lưu đề thi mới vào Kho đề!');
        return r.id;
      }
    } catch (e: any) {
      toast(e.message || 'Không lưu được đề thi.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAndAssign = async () => {
    const id = await persistExam();
    if (id) {
      setAssignState({ open: true, examId: id, examTitle: title.trim() });
    }
  };

  const handleSaveAndShuffle = async () => {
    const id = await persistExam();
    if (id) {
      go(`/dao-de?examId=${id}`);
    }
  };

  const scrollToQuestion = (idx: number) => {
    setSelectedIdx(idx);
    setInspectorTab('question');
    const el = questionRefs.current[idx];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const diagnostics = useMemo(
    () => analyzeExamDiagnostics(gen?.items || [], gen?.questions || {}, bp, meta),
    [gen?.items, gen?.questions, bp, meta],
  );

  const selectedItem = gen?.items?.[selectedIdx];
  const selectedQuestion = selectedItem ? gen?.questions?.[selectedItem.qid] : null;
  const usedQids = useMemo(() => new Set((gen?.items || []).map((x: any) => x.qid)), [gen?.items]);
  const totalConfigured = Object.values(bp.counts).reduce((a, b) => a + Number(b || 0), 0);

  const renderSection = (partType: 'mcq' | 'tf' | 'short', heading: string, intro: (len: number) => string) => {
    const list = (gen?.items || [])
      .map((it: any, idx: number) => ({ it, idx }))
      .filter(({ it }: any) => it.type === partType);
    if (!list.length) return null;

    return (
      <section className="a4-part-section" aria-label={heading}>
        <div className="a4-part-heading">
          <strong>{heading}</strong>
        </div>
        <div className="a4-part-intro">{intro(list.length)}</div>

        <div className="a4-questions-list">
          {list.map(({ it, idx }: any, n: number) => {
            const q = gen.questions[it.qid];
            const isSelected = selectedIdx === idx;
            const isFirstInPart = n === 0;
            const isLastInPart = n === list.length - 1;

            return (
              <div
                key={`${it.qid}-${idx}`}
                ref={(el) => (questionRefs.current[idx] = el)}
                className={`a4-question-card ${isSelected ? 'is-selected' : ''}`}
                onClick={() => setSelectedIdx(idx)}
              >
                <div className="a4-q-head">
                  <span className="a4-q-num">Câu {n + 1}.</span>
                  <div className="a4-q-stem">
                    <MathText text={q?.stem ?? ''} />
                  </div>

                  <div className="a4-q-inline-tools no-print" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="a4-tool-btn"
                      disabled={isFirstInPart}
                      onClick={() => moveQuestionInSection(idx, -1)}
                      title="Đẩy câu lên trên"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      className="a4-tool-btn"
                      disabled={isLastInPart}
                      onClick={() => moveQuestionInSection(idx, 1)}
                      title="Đẩy câu xuống dưới"
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      type="button"
                      className="a4-tool-btn"
                      onClick={() => openInlineEditQuestion(idx)}
                      title="Chỉnh sửa nội dung câu này"
                    >
                      <PenLine size={12} /> Sửa
                    </button>
                    <button
                      type="button"
                      className="a4-tool-btn"
                      onClick={() => openSwap(idx)}
                      title="Đổi câu thay thế từ Ngân hàng"
                    >
                      <RefreshCw size={12} /> Đổi
                    </button>
                    {meta.aiEnabled && (
                      <button
                        type="button"
                        className="a4-tool-btn"
                        disabled={busy}
                        onClick={() => generateAiSimilarAt(idx)}
                        title="AI sinh câu tương tự thay thế"
                      >
                        <Sparkles size={12} /> AI
                      </button>
                    )}
                    <button
                      type="button"
                      className="a4-tool-btn is-danger"
                      onClick={() => removeQuestionAt(idx)}
                      title="Bỏ câu này khỏi đề"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {partType === 'mcq' && (
                  <div className="a4-options-grid">
                    {q?.options?.map((opt: string, optIdx: number) => (
                      <div key={optIdx} className="a4-option-item">
                        <strong className="a4-opt-letter">{String.fromCharCode(65 + optIdx)}.</strong>
                        <span className="a4-opt-text">
                          <MathText text={opt} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {partType === 'tf' && (
                  <div className="a4-tf-statements">
                    {q?.options?.map((stmt: string, sIdx: number) => (
                      <div key={sIdx} className="a4-tf-statement-row">
                        <strong className="a4-tf-letter">{String.fromCharCode(97 + sIdx)})</strong>
                        <span className="a4-tf-text">
                          <MathText text={stmt} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {partType === 'short' && (
                  <div className="a4-short-box">
                    <span className="short-box-label">Đáp số:</span>
                    <span className="short-box-dots">
                      ....................................................................................
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="exam-builder-studio stack" style={{ gap: 14 }}>
      <div className="no-print">
        <CreateExamActionBar active="build" classSuffix={classSuffix} />
      </div>

      {defaultClassId && (
        <div
          className="no-print"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '8px 14px',
            borderRadius: 10,
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            color: '#1e40af',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span>Đang soạn đề để giao trực tiếp cho lớp học đã chọn (ID #{defaultClassId})</span>
          <a href={`#/lop/${defaultClassId}/bai-giao`} style={{ color: '#2563eb', fontSize: 12.5 }}>
            Quay lại lớp học →
          </a>
        </div>
      )}

      {/* 1. Studio Top Action Bar */}
      <header className="builder-studio-topbar card shadow no-print">
        <div className="topbar-left-zone">
          <button
            type="button"
            className="btn ghost sm topbar-back-btn"
            onClick={() => go(`/thu-vien${classSuffix}`)}
            title="Quay lại Kho đề"
          >
            ← Kho đề
          </button>
          <div className="topbar-doc-meta">
            <span className="doc-type-badge">
              {editingExamId ? `Sửa đề #${editingExamId}` : 'Xưởng đề A4'}
            </span>
            <input
              className="doc-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nhập tên đề thi..."
              title="Bấm để sửa tên đề thi"
            />
          </div>
        </div>

        <div className="topbar-right-zone">
          <div className="zoom-controls">
            <button
              type="button"
              className="btn ghost sm zoom-btn"
              onClick={() => setZoomLevel((z) => Math.max(75, z - 10))}
              title="Thu nhỏ"
            >
              -
            </button>
            <span className="zoom-value tabular-nums">{zoomLevel}%</span>
            <button
              type="button"
              className="btn ghost sm zoom-btn"
              onClick={() => setZoomLevel((z) => Math.min(130, z + 10))}
              title="Phóng to"
            >
              +
            </button>
          </div>

          <button
            type="button"
            className="btn sm ghost"
            onClick={() => setPrintModalOpen(true)}
            disabled={!gen?.items?.length}
            title="Xem trước bản in A4 & Xuất PDF"
          >
            <Printer size={15} /> In / PDF
          </button>

          <button
            type="button"
            className="btn sm ghost"
            disabled={busy || !gen?.items?.length || !title.trim()}
            onClick={handleSaveAndShuffle}
            title="Lưu đề và chuyển sang trộn nhiều mã đề"
          >
            <Shuffle size={15} /> Đảo mã
          </button>

          <button
            type="button"
            className="btn sm"
            disabled={busy || !gen?.items?.length || !title.trim()}
            onClick={persistExam}
          >
            <Save size={15} /> {editingExamId ? 'Cập nhật' : 'Lưu đề'}
          </button>

          <button
            type="button"
            className="btn sm primary builder-save-btn"
            disabled={busy || !gen?.items?.length || !title.trim()}
            onClick={handleSaveAndAssign}
          >
            <Send size={14} /> {busy ? 'Đang lưu…' : 'Lưu & Giao lớp'}
          </button>
        </div>
      </header>

      {/* 2. Main Split Workspace: A4 Paper Sheet on Left, 4-Tab Inspector on Right */}
      <div className="builder-studio-workspace">
        <main className="builder-a4-desk">
          <div
            className="a4-paper-container"
            style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
          >
            <div className="a4-physical-sheet">
              <header className="a4-sheet-header">
                <div className="a4-header-col-left">
                  <div className="a4-agency-name">SỞ GIÁO DỤC VÀ ĐÀO TẠO</div>
                  <div className="a4-school-name">
                    {user.school?.name ?? 'TRƯỜNG THPT CHUYÊN TOÁN'}
                  </div>
                  <div className="a4-exam-title">{title.toUpperCase()}</div>
                  <div className="a4-exam-meta-line">
                    Môn thi: <strong>TOÁN HỌC - GDPT 2018</strong>
                  </div>
                  <div className="a4-exam-duration">
                    Thời gian làm bài: <strong>{bp.durationMin} phút</strong>{' '}
                    <i>(không kể thời gian phát đề)</i>
                  </div>
                </div>

                <div className="a4-header-col-right">
                  <div className="a4-code-stamp">
                    <span className="code-label">MÃ ĐỀ THI</span>
                    <strong className="code-val">{activeCodeVariant}</strong>
                  </div>
                  <div className="a4-student-fill-box">
                    <div className="fill-row">
                      Họ và tên thí sinh: ..............................................................
                    </div>
                    <div className="fill-row">
                      Số báo danh: ................................... Lớp: .........................
                    </div>
                  </div>
                </div>
              </header>

              <div className="a4-header-separator" />

              <div className="a4-exam-notice tabular-nums">
                <i>
                  {gen?.items?.length ? (
                    <>
                      (Đề thi gồm có {gen.items.length} câu hỏi · Thời lượng {bp.durationMin} phút · Ước tính giải ~
                      {diagnostics.estMinutes} phút)
                    </>
                  ) : (
                    <>(Khung đề dự kiến {totalConfigured} câu · Thời lượng {bp.durationMin} phút — chưa sinh câu hỏi)</>
                  )}
                </i>
              </div>

              {busy && !gen ? (
                <div className="a4-loading-overlay">
                  <span className="spinner" />
                  <p>Hệ thống đang sắp xếp ma trận và dàn trang đề thi A4...</p>
                </div>
              ) : gen?.items?.length ? (
                <div className="a4-sheet-body">
                  {renderSection(
                    'mcq',
                    'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.',
                    (len) =>
                      `Thí sinh trả lời từ câu 1 đến câu ${len}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.`,
                  )}
                  {renderSection(
                    'tf',
                    'PHẦN II. Câu trắc nghiệm đúng sai.',
                    (len) =>
                      `Thí sinh trả lời từ câu 1 đến câu ${len}. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.`,
                  )}
                  {renderSection(
                    'short',
                    'PHẦN III. Câu trắc nghiệm trả lời ngắn.',
                    (len) =>
                      `Thí sinh trả lời từ câu 1 đến câu ${len}. Thí sinh viết kết quả vào ô tương ứng.`,
                  )}

                  <footer className="a4-sheet-footer">
                    <div className="a4-footer-line">---------- HẾT ----------</div>
                    <div className="a4-footer-sub">
                      Thí sinh không được sử dụng tài liệu. Cán bộ coi thi không giải thích gì thêm.
                    </div>
                  </footer>
                </div>
              ) : (
                <div
                  className="no-print"
                  style={{
                    margin: '18px 0',
                    padding: '28px 24px',
                    borderRadius: 12,
                    border: '1.5px dashed #cbd5e1',
                    background: '#f8fafc',
                    fontFamily: "var(--font-sans, 'Be Vietnam Pro', system-ui, sans-serif)",
                  }}
                >
                  <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                      Tờ đề A4 đang sẵn sàng thiết lập
                    </h3>
                    <p style={{ margin: 0, fontSize: 13.5, color: '#64748b', lineHeight: 1.5 }}>
                      Chỉnh cấu trúc ma trận, chuyên đề ở bảng bên phải rồi bấm sinh đề — hoặc tự nhặt và soạn từng câu theo ý muốn.
                    </p>
                  </div>

                  {bp.topics.length > 0 && (
                    <div
                      style={{
                        marginBottom: 16,
                        padding: '10px 14px',
                        borderRadius: 9,
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        fontSize: 13,
                        color: '#1e40af',
                      }}
                    >
                      <strong>Chuyên đề đang chọn ({bp.topics.length}):</strong>{' '}
                      {bp.topics.map((c) => topicName(meta, c)).join(', ')}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        1. Sinh nhanh theo khung ma trận
                      </div>
                      <div className="row wrap" style={{ gap: 8 }}>
                        <button
                          type="button"
                          className="btn primary sm"
                          disabled={busy}
                          onClick={() => generate()}
                        >
                          <Sparkles size={14} /> Sinh đề theo cấu trúc bên phải ({totalConfigured} câu · {bp.durationMin}p)
                        </button>
                        {(Object.entries(PRESETS) as [keyof typeof PRESETS, (typeof PRESETS)['official']][]).map(
                          ([k, p]) => {
                            const total = p.counts.mcq + p.counts.tf + p.counts.short;
                            return (
                              <button
                                key={k}
                                type="button"
                                className="btn sm"
                                disabled={busy}
                                onClick={() => {
                                  const next: Bp = { ...p, topics: bp.topics };
                                  setPreset(k);
                                  setBp(next);
                                  generate(next);
                                }}
                              >
                                {p.label} ({total} câu)
                              </button>
                            );
                          },
                        )}
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        2. Tự chọn hoặc soạn câu hỏi thủ công
                      </div>
                      <div className="row wrap" style={{ gap: 8 }}>
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => setInspectorTab('bank')}
                        >
                          <Database size={14} /> Nhặt câu từ Ngân hàng
                        </button>
                        <button
                          type="button"
                          className="btn sm"
                          onClick={openInlineNewQuestion}
                        >
                          <FilePlus2 size={14} /> Soạn câu hỏi mới đầu tiên
                        </button>
                        <a className="btn sm ghost" href={`#/nhap-de${classSuffix}`}>
                          Nhập từ file Word / PDF →
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* RIGHT INSPECTOR: 4 TABS */}
        <aside className="builder-inspector-col card shadow no-print" aria-label="Bảng điều khiển đề thi">
          <nav className="inspector-tabs-nav" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={inspectorTab === 'question'}
              className={`inspector-tab-btn ${inspectorTab === 'question' ? 'active' : ''}`}
              onClick={() => setInspectorTab('question')}
            >
              <BookOpen size={15} />
              <span>Câu {gen?.items?.length ? `#${selectedIdx + 1}` : ''}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inspectorTab === 'bank'}
              className={`inspector-tab-btn ${inspectorTab === 'bank' ? 'active' : ''}`}
              onClick={() => setInspectorTab('bank')}
            >
              <Database size={15} />
              <span>Ngân hàng</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inspectorTab === 'matrix'}
              className={`inspector-tab-btn ${inspectorTab === 'matrix' ? 'active' : ''}`}
              onClick={() => setInspectorTab('matrix')}
            >
              <Layers size={15} />
              <span>Ma trận</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inspectorTab === 'config'}
              className={`inspector-tab-btn ${inspectorTab === 'config' ? 'active' : ''}`}
              onClick={() => setInspectorTab('config')}
            >
              <Settings2 size={15} />
              <span>Cấu trúc</span>
            </button>
          </nav>

          {/* TAB 1: SELECTED QUESTION */}
          {inspectorTab === 'question' && (
            <div className="inspector-body stack" style={{ gap: 14 }}>
              {selectedQuestion ? (
                <>
                  <div className="selected-q-header">
                    <div className="selected-q-title">
                      <h3>Câu {selectedIdx + 1} trên đề</h3>
                      <span className="selected-q-type">
                        {selectedItem.type === 'mcq'
                          ? 'Trắc nghiệm 4 phương án'
                          : selectedItem.type === 'tf'
                          ? 'Đúng / Sai (4 ý)'
                          : 'Trả lời ngắn'}
                      </span>
                    </div>

                    <div className="row" style={{ gap: 6 }}>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => openInlineEditQuestion(selectedIdx)}
                      >
                        <PenLine size={13} /> Sửa
                      </button>
                      <button
                        type="button"
                        className="btn primary sm"
                        onClick={() => openSwap(selectedIdx)}
                      >
                        Đổi ↻
                      </button>
                    </div>
                  </div>

                  <div className="selected-q-meta">
                    <div className="meta-row">
                      <span className="meta-lbl">Mức độ:</span>
                      <LevelBadge level={selectedQuestion.level} />
                    </div>
                    <div className="meta-row">
                      <span className="meta-lbl">Chuyên đề:</span>
                      <span className="meta-val strong">
                        {topicName(meta, selectedQuestion.topic)}
                      </span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-lbl">Nguồn:</span>
                      <SourceBadge source={selectedQuestion.source} />
                    </div>
                  </div>

                  <div className="inspector-stem-box">
                    <span className="stem-box-title">Đề bài:</span>
                    <MathText as="div" className="stem-text" text={selectedQuestion.stem} />
                  </div>

                  <div className="row" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="btn sm ghost"
                      style={{ flex: 1 }}
                      onClick={() => moveQuestionInSection(selectedIdx, -1)}
                    >
                      <ArrowUp size={13} /> Đẩy lên
                    </button>
                    <button
                      type="button"
                      className="btn sm ghost"
                      style={{ flex: 1 }}
                      onClick={() => moveQuestionInSection(selectedIdx, 1)}
                    >
                      <ArrowDown size={13} /> Đẩy xuống
                    </button>
                    <button
                      type="button"
                      className="btn sm danger"
                      onClick={() => removeQuestionAt(selectedIdx)}
                      title="Xóa câu này khỏi đề"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div className="inspector-q-nav-buttons">
                    <button
                      type="button"
                      className="btn sm"
                      disabled={selectedIdx <= 0}
                      onClick={() => scrollToQuestion(selectedIdx - 1)}
                    >
                      ← Trước
                    </button>
                    <span className="q-nav-current tabular-nums">
                      {selectedIdx + 1} / {gen?.items?.length ?? 0}
                    </span>
                    <button
                      type="button"
                      className="btn sm"
                      disabled={!gen?.items || selectedIdx >= gen.items.length - 1}
                      onClick={() => scrollToQuestion(selectedIdx + 1)}
                    >
                      Tiếp →
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty small muted">
                  Bấm vào bất kỳ câu nào trên tờ đề A4 bên trái để xem chi tiết, đổi câu hoặc sắp xếp thứ tự.
                </div>
              )}

              {gen?.items?.length > 0 && (
                <div className="fast-jump-section">
                  <span className="fast-jump-title">Bảng điều hướng nhanh ({gen.items.length} câu):</span>
                  <div className="fast-jump-grid">
                    {gen.items.map((it: any, i: number) => (
                      <button
                        key={`${it.qid}-${i}`}
                        type="button"
                        className={`jump-num-btn tabular-nums ${i === selectedIdx ? 'active' : ''}`}
                        onClick={() => scrollToQuestion(i)}
                        title={`Câu ${i + 1} (${it.type})`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LIVE BANK PICKER & INLINE QUESTION AUTHORING */}
          {inspectorTab === 'bank' && (
            <div className="inspector-body stack" style={{ gap: 12 }}>
              <button
                type="button"
                className="btn primary block sm"
                onClick={openInlineNewQuestion}
              >
                <FilePlus2 size={15} /> + Soạn câu mới chèn ngay vào đề
              </button>

              <div className="stack" style={{ gap: 6 }}>
                <input
                  className="input sm"
                  type="search"
                  placeholder="Tìm đề bài câu hỏi trong kho…"
                  value={bankFilter.q}
                  onChange={(e) => setBankFilter((f) => ({ ...f, q: e.target.value }))}
                />
                <div className="grid-2" style={{ gap: 6 }}>
                  <select
                    className="input sm"
                    value={bankFilter.type}
                    onChange={(e) => setBankFilter((f) => ({ ...f, type: e.target.value }))}
                  >
                    <option value="">Mọi loại câu</option>
                    <option value="mcq">Trắc nghiệm A–D</option>
                    <option value="tf">Đúng / Sai</option>
                    <option value="short">Trả lời ngắn</option>
                  </select>
                  <select
                    className="input sm"
                    value={bankFilter.level}
                    onChange={(e) => setBankFilter((f) => ({ ...f, level: e.target.value }))}
                  >
                    <option value="">Mọi mức độ</option>
                    <option value="1">Nhận biết</option>
                    <option value="2">Thông hiểu</option>
                    <option value="3">Vận dụng</option>
                  </select>
                </div>
                <select
                  className="input sm"
                  value={bankFilter.topic}
                  onChange={(e) => setBankFilter((f) => ({ ...f, topic: e.target.value }))}
                >
                  <option value="">Mọi chuyên đề</option>
                  {meta.topics.map((t) => (
                    <option key={t.code} value={t.code}>
                      Lớp {t.grade}: {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="tiny muted tabular-nums">
                Tìm thấy {bankTotal} câu đã duyệt (hiển thị {bankItems.length})
              </div>

              {bankLoading ? (
                <Loading text="Đang tìm câu hỏi…" />
              ) : bankItems.length === 0 ? (
                <div className="empty small muted">
                  Không có câu hỏi đã duyệt khớp bộ lọc. Hãy thử từ khóa khác hoặc bấm "+ Soạn câu mới".
                </div>
              ) : (
                <div className="builder-bank-picker-list">
                  {bankItems.map((q) => {
                    const added = usedQids.has(q.id);
                    return (
                      <div key={q.id} className={`builder-bank-item ${added ? 'is-added' : ''}`}>
                        <div className="row between" style={{ alignItems: 'center', gap: 6 }}>
                          <span className="tiny muted tabular-nums">
                            #{q.id} · {meta.types[q.type]} · {meta.levels[q.level]}
                          </span>
                          <button
                            type="button"
                            className={`btn sm ${added ? 'ghost' : 'primary'}`}
                            style={{ minHeight: 26, padding: '2px 10px', fontSize: 11.5 }}
                            disabled={added}
                            onClick={() => addQuestionFromBank(q)}
                          >
                            {added ? 'Đã có' : '+ Chèn'}
                          </button>
                        </div>
                        <div className="small" style={{ lineHeight: 1.45 }}>
                          <MathText
                            text={q.stem.length > 140 ? q.stem.slice(0, 140) + '…' : q.stem}
                          />
                        </div>
                        <div className="tiny muted">{topicName(meta, q.topic)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LIVE MATRIX & DIAGNOSTICS */}
          {inspectorTab === 'matrix' && (
            <div className="inspector-body stack" style={{ gap: 14 }}>
              <div className="stack" style={{ gap: 6 }}>
                <div className="row between" style={{ alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>
                    Chẩn đoán chất lượng đề
                  </h3>
                  <span className="tiny muted tabular-nums">
                    ~{diagnostics.estMinutes}p giải
                  </span>
                </div>

                {diagnostics.alerts.map((al, i) => (
                  <div key={i} className={`diag-alert-row is-${al.severity}`}>
                    {al.severity === 'ok' ? (
                      <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    ) : (
                      <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    )}
                    <span>{al.text}</span>
                  </div>
                ))}

                {diagnostics.duplicatePairs.length > 0 && (
                  <div className="row wrap" style={{ gap: 6 }}>
                    {diagnostics.duplicatePairs.map((pair, k) => (
                      <button
                        key={k}
                        type="button"
                        className="btn sm ghost"
                        style={{ fontSize: 11.5 }}
                        onClick={() => scrollToQuestion(pair.idxB)}
                      >
                        Xem Câu {pair.idxA + 1} ↔ {pair.idxB + 1} ({Math.round(pair.score * 100)}%)
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Level distribution visual bar */}
              <div className="stack" style={{ gap: 5 }}>
                <div className="row between tiny">
                  <strong>Tỷ lệ thực tế (NB · TH · VD)</strong>
                  <span className="tabular-nums">
                    {diagnostics.levelPct[1]}% · {diagnostics.levelPct[2]}% · {diagnostics.levelPct[3]}%
                  </span>
                </div>
                <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', background: '#e2e8f0' }}>
                  <div style={{ width: `${diagnostics.levelPct[1]}%`, background: '#16a34a' }} title="Nhận biết" />
                  <div style={{ width: `${diagnostics.levelPct[2]}%`, background: '#2563eb' }} title="Thông hiểu" />
                  <div style={{ width: `${diagnostics.levelPct[3]}%`, background: '#d97706' }} title="Vận dụng" />
                </div>
              </div>

              <div className="matrix-summary-head">
                <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>
                  Bảng phân bổ theo chuyên đề
                </h3>
              </div>

              {gen?.matrix && Object.keys(gen.matrix).length > 0 ? (
                <div className="table-wrap">
                  <table className="t small tabular-nums" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th>Chuyên đề</th>
                        <th className="center">NB</th>
                        <th className="center">TH</th>
                        <th className="center">VD</th>
                        <th className="center">Tổng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(gen.matrix).map(([t, m]: any) => (
                        <tr key={t}>
                          <td>{topicName(meta, t)}</td>
                          <td className="center">{m[1] || '—'}</td>
                          <td className="center">{m[2] || '—'}</td>
                          <td className="center">{m[3] || '—'}</td>
                          <td className="center strong">{m.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="tiny muted">Chưa có dữ liệu ma trận.</p>
              )}

              <button
                type="button"
                className="btn primary block"
                disabled={busy}
                onClick={() => generate()}
              >
                Sinh lại toàn bộ đề theo ma trận ↻
              </button>
            </div>
          )}

          {/* TAB 4: CONFIGURATION, TOPICS, LEVEL WEIGHTS & SAVED BLUEPRINTS */}
          {inspectorTab === 'config' && (
            <div className="inspector-body stack" style={{ gap: 14 }}>
              <div>
                <h3 style={{ margin: '0 0 8px', fontSize: 13.5, fontWeight: 700 }}>
                  Mẫu cấu trúc nhanh
                </h3>
                <div className="config-presets-column">
                  {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
                    <button
                      type="button"
                      key={k}
                      className={`config-preset-btn ${preset === k ? 'active' : ''}`}
                      onClick={() => {
                        applyPreset(k);
                        generate({ ...PRESETS[k], topics: bp.topics });
                      }}
                    >
                      <strong>{PRESETS[k].label}</strong>
                      <small className="tabular-nums">
                        {PRESETS[k].durationMin}p ·{' '}
                        {Object.values(PRESETS[k].counts).reduce((a, b) => a + b, 0)} câu
                      </small>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom question counts per section */}
              <div className="stack" style={{ gap: 6 }}>
                <label className="small strong">Số câu mỗi phần</label>
                <div className="grid-3" style={{ gap: 6 }}>
                  <div>
                    <span className="tiny muted">Phần I (TN)</span>
                    <input
                      className="input sm tabular-nums"
                      type="number"
                      min={0}
                      max={60}
                      value={bp.counts.mcq ?? 0}
                      onChange={(e) => {
                        setPreset('custom');
                        setBp({ ...bp, counts: { ...bp.counts, mcq: Number(e.target.value) } });
                      }}
                    />
                  </div>
                  <div>
                    <span className="tiny muted">Phần II (Đ/S)</span>
                    <input
                      className="input sm tabular-nums"
                      type="number"
                      min={0}
                      max={20}
                      value={bp.counts.tf ?? 0}
                      onChange={(e) => {
                        setPreset('custom');
                        setBp({ ...bp, counts: { ...bp.counts, tf: Number(e.target.value) } });
                      }}
                    />
                  </div>
                  <div>
                    <span className="tiny muted">Phần III (Ngắn)</span>
                    <input
                      className="input sm tabular-nums"
                      type="number"
                      min={0}
                      max={20}
                      value={bp.counts.short ?? 0}
                      onChange={(e) => {
                        setPreset('custom');
                        setBp({ ...bp, counts: { ...bp.counts, short: Number(e.target.value) } });
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Level ratios */}
              <div className="stack" style={{ gap: 6 }}>
                <label className="small strong">Tỷ lệ mức độ (%) — NB / TH / VD</label>
                <div className="grid-3" style={{ gap: 6 }}>
                  {[1, 2, 3].map((lv) => (
                    <div key={lv}>
                      <span className="tiny muted">{lv === 1 ? 'Biết' : lv === 2 ? 'Hiểu' : 'Vận dụng'}</span>
                      <input
                        className="input sm tabular-nums"
                        type="number"
                        min={0}
                        max={100}
                        value={bp.levels[lv] ?? 0}
                        onChange={(e) => {
                          setPreset('custom');
                          setBp({
                            ...bp,
                            levels: { ...bp.levels, [lv]: Number(e.target.value) },
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Topic multi-select */}
              <div className="stack" style={{ gap: 6 }}>
                <div className="row between" style={{ alignItems: 'center' }}>
                  <label className="small strong">
                    Chuyên đề ({bp.topics.length === 0 ? 'Tất cả' : `${bp.topics.length} đã chọn`})
                  </label>
                  {bp.topics.length > 0 && (
                    <button
                      type="button"
                      className="btn ghost sm"
                      style={{ fontSize: 11.5 }}
                      onClick={() => setBp({ ...bp, topics: [] })}
                    >
                      Chọn tất cả
                    </button>
                  )}
                </div>
                <div className="topic-chip-scroll">
                  {meta.topics.map((t) => {
                    const checked = bp.topics.includes(t.code);
                    return (
                      <label key={t.code} className="topic-check-row">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setBp({
                              ...bp,
                              topics: checked
                                ? bp.topics.filter((x) => x !== t.code)
                                : [...bp.topics, t.code],
                            })
                          }
                        />
                        <span>
                          <b>L{t.grade}</b> · {t.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid-2" style={{ gap: 8 }}>
                <div className="field">
                  <label>Thời gian (phút)</label>
                  <input
                    className="input sm tabular-nums"
                    type="number"
                    min={5}
                    value={bp.durationMin}
                    onChange={(e) => setBp({ ...bp, durationMin: Number(e.target.value) })}
                  />
                </div>
                <div className="field">
                  <label>Số mã đề trộn</label>
                  <input
                    className="input sm tabular-nums"
                    type="number"
                    min={1}
                    max={12}
                    value={variants}
                    onChange={(e) => setVariants(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="field">
                <label>Mã đề xem trước trên giấy A4:</label>
                <div className="row" style={{ gap: 6 }}>
                  {['101', '102', '103', '104'].map((code) => (
                    <button
                      key={code}
                      type="button"
                      className={`btn sm ${activeCodeVariant === code ? 'primary' : 'ghost'}`}
                      onClick={() => setActiveCodeVariant(code)}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="btn primary block"
                disabled={busy}
                onClick={() => generate()}
              >
                {busy ? 'Đang tạo ma trận…' : 'Áp dụng & Sinh đề mới'}
              </button>

              {/* Saved Blueprint Templates */}
              <div className="stack" style={{ gap: 8, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                <h4 style={{ margin: 0, fontSize: 12.5, fontWeight: 700 }}>
                  Thư viện mẫu ma trận ({templates.data?.blueprints?.length ?? 0})
                </h4>
                <div className="row" style={{ gap: 6 }}>
                  <input
                    className="input sm"
                    style={{ flex: 1 }}
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Tên mẫu ma trận mới…"
                  />
                  <button
                    type="button"
                    className="btn sm"
                    disabled={busy || !templateName.trim()}
                    onClick={saveTemplate}
                    title="Lưu cấu hình hiện tại thành mẫu"
                  >
                    <FolderPlus size={13} /> Lưu
                  </button>
                </div>
                <label className="tiny row" style={{ gap: 6, color: 'var(--ink-3)' }}>
                  <input
                    type="checkbox"
                    checked={templateShared}
                    onChange={(e) => setTemplateShared(e.target.checked)}
                  />
                  Chia sẻ mẫu này cho toàn trường
                </label>

                {(templates.data?.blueprints?.length ?? 0) > 0 && (
                  <div className="stack" style={{ gap: 6 }}>
                    {(templates.data?.blueprints ?? []).map((b: any) => (
                      <div
                        key={b.id}
                        className="row between"
                        style={{
                          padding: '7px 10px',
                          borderRadius: 8,
                          border: '1px solid var(--line)',
                          background: 'var(--surface-subtle)',
                          gap: 6,
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="tiny strong" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {b.name}
                          </div>
                          <div className="tiny muted">
                            {b.blueprint?.durationMin ?? 90}p ·{' '}
                            {Object.values(b.blueprint?.counts || {}).reduce((s: number, n: any) => s + Number(n || 0), 0)} câu
                            {b.shared ? ' · Chung trường' : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn sm ghost"
                          onClick={() => applySavedBlueprint(b.blueprint)}
                        >
                          Dùng
                        </button>
                        {b.mine && (
                          <button
                            type="button"
                            className="btn sm ghost"
                            onClick={() => deleteBlueprint(b.id)}
                            aria-label="Xóa mẫu"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Modal Đổi câu hỏi */}
      {swap && (
        <Modal title="Chọn câu hỏi thay thế" onClose={() => setSwap(null)} width={760}>
          <div className="stack" style={{ gap: 10 }}>
            <input
              className="input sm"
              type="search"
              placeholder="Tìm nhanh trong danh sách câu thay thế…"
              value={swapSearch}
              onChange={(e) => setSwapSearch(e.target.value)}
            />
            {swap.options.length === 0 ? (
              <div className="empty">
                Không còn câu hỏi thay thế cùng loại. Thầy/Cô có thể bấm "+ Soạn câu mới" ở tab Ngân hàng.
              </div>
            ) : (
              <div className="stack" style={{ gap: 8, maxHeight: 420, overflowY: 'auto' }}>
                {swap.options
                  .filter(
                    (q) =>
                      !swapSearch.trim() ||
                      q.stem.toLowerCase().includes(swapSearch.trim().toLowerCase()),
                  )
                  .slice(0, 30)
                  .map((q) => (
                    <div key={q.id} className="list-item" style={{ alignItems: 'flex-start', padding: '12px 14px' }}>
                      <div className="grow">
                        <MathText as="div" className="small" text={q.stem} />
                        <div className="row tiny" style={{ gap: 8, marginTop: 6 }}>
                          <LevelBadge level={q.level} />
                          <span className="muted">{topicName(meta, q.topic)}</span>
                        </div>
                      </div>
                      <button type="button" className="btn sm primary" onClick={() => doSwap(q)}>
                        Chọn câu này
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Modal Soạn câu mới / Sửa câu tại chỗ */}
      {editingQuestion && (
        <Modal
          title={
            editingQuestion.idx === null
              ? 'Soạn câu hỏi mới & chèn ngay vào đề'
              : `Chỉnh sửa Câu ${editingQuestion.idx + 1} (#${editingQuestion.draft.id})`
          }
          onClose={() => setEditingQuestion(null)}
          width={860}
        >
          <div className="stack" style={{ gap: 12 }}>
            <QuestionEditor
              q={editingQuestion.draft}
              onChange={(nq) =>
                setEditingQuestion((prev) => (prev ? { ...prev, draft: { ...prev.draft, ...nq } } : null))
              }
            />
            {editingQuestion.idx !== null && (
              <label className="field">
                Ghi chú chỉnh sửa
                <input
                  className="input"
                  value={editingQuestion.reason || ''}
                  onChange={(e) =>
                    setEditingQuestion((prev) => (prev ? { ...prev, reason: e.target.value } : null))
                  }
                  placeholder="Ví dụ: Chuẩn hóa công thức hoặc sửa đáp án"
                />
              </label>
            )}
            <div className="row between">
              <button type="button" className="btn" onClick={() => setEditingQuestion(null)}>
                Hủy
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={savingQuestion}
                onClick={handleSaveInlineQuestion}
              >
                {savingQuestion
                  ? 'Đang lưu…'
                  : editingQuestion.idx === null
                  ? 'Lưu & Chèn vào đề'
                  : 'Cập nhật trên tờ đề'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal In & PDF */}
      {gen && (
        <ExamPrintModal
          isOpen={printModalOpen}
          onClose={() => setPrintModalOpen(false)}
          examTitle={title}
          items={gen.items || []}
          questions={gen.questions || {}}
          durationMin={bp.durationMin || 90}
        />
      )}

      {/* Ngăn kéo Giao bài trực tiếp */}
      {assignState && (
        <AssignExamDrawer
          isOpen={assignState.open}
          onClose={() => setAssignState(null)}
          examId={assignState.examId}
          examTitle={assignState.examTitle}
          durationMin={bp.durationMin}
          defaultClassId={defaultClassId}
        />
      )}
    </div>
  );
}
