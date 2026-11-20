import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Dumbbell,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Layers,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  Target,
  Zap,
} from 'lucide-react';
import { get, post } from '../../api';
import { TOPIC_CURRICULUM, TopicCurriculumEntry } from '../../data/topicCurriculum';
import { fmtDateTime, go, Loading, useApp, useAsync } from '../../ui/kit';
import { MathText } from '../../ui/MathText';
import { useCurriculum } from '../../ui/OutcomePicker';
import { isAnswered, Item, QuestionView, Review } from '../../ui/Question';
import {
  getStudyStatusMeta,
  splitFormulaParts,
  StudyStatusIcon,
} from '../../ui/selfstudy/TopicStudyHelpers';

export type StudyTopic = {
  code: string;
  grade: number;
  name: string;
};

type KnowledgeNode = {
  code: string;
  name: string;
  grade: number;
  questionCount: number;
  mastery: number | null;
  status: string;
  lastAt: number | null;
};

type KnowledgeEdge = {
  from: string;
  to: string;
};

type CurriculumWithExamples = TopicCurriculumEntry & {
  examples?: { title: string; problem: string; solution: string }[];
  objectives?: string[];
};

interface TopicStudyWorkspaceProps {
  topic: StudyTopic;
  subjectId: string;
  subjectName: string;
  domainLabel: string;
  topicIndex: number;
  totalTopics: number;
  masteryEntry?: { value: number; lastAt?: number | null; n?: number; last?: number };
  isPicked: boolean;
  pickedCount?: number;
  busy: boolean;
  onBack: () => void;
  onPrevTopic?: () => void;
  onNextTopic?: () => void;
  onSelectTopicCode: (code: string) => void;
  onTogglePick: (code: string) => void;
  onStartPractice: (codes: string[], count: number) => void;
  onStartPickedPractice?: (count: number) => void;
  onEvidenceUpdated?: () => void;
}

type StageTab = 'theory' | 'examples' | 'quick_practice' | 'tips';

export function TopicStudyWorkspace({
  topic,
  subjectId,
  subjectName,
  domainLabel,
  topicIndex,
  totalTopics,
  masteryEntry,
  isPicked,
  pickedCount = 0,
  busy,
  onBack,
  onPrevTopic,
  onNextTopic,
  onSelectTopicCode,
  onTogglePick,
  onStartPractice,
  onStartPickedPractice,
  onEvidenceUpdated,
}: TopicStudyWorkspaceProps) {
  const { toast } = useApp();
  const [stageTab, setStageTab] = useState<StageTab>('theory');
  // Vào chuyên đề: chọn Lý thuyết hay Luyện tập trước, bên trong vẫn chuyển qua lại được
  const [view, setView] = useState<'choose' | 'theory' | 'practice'>('choose');
  const [customCount, setCustomCount] = useState<number>(10);

  // Tự nhẩm công thức (Active Recall)
  const [recallMode, setRecallMode] = useState(false);
  const [revealedFormulas, setRevealedFormulas] = useState<Record<number, boolean>>({});

  // Bản đồ tri thức & số câu hỏi ngân hàng
  const [kMap, setKMap] = useState<{ nodes: KnowledgeNode[]; edges: KnowledgeEdge[] } | null>(null);

  // Thử nhanh 1 câu
  const [quickItem, setQuickItem] = useState<Item | null>(null);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickResp, setQuickResp] = useState<any>(null);
  const [quickReview, setQuickReview] = useState<Review | null>(null);
  const [checkingQuick, setCheckingQuick] = useState(false);
  const [seenQids, setSeenQids] = useState<number[]>([]);
  const [sessionStats, setSessionStats] = useState({ tried: 0, correct: 0 });

  const isBankTopic = subjectId === 'math';
  // Bài học đã nhập qua gói (theo trường) ưu tiên hơn nội dung mặc định trong app
  const { data: lessonData } = useAsync(() => get<{ lessons: Record<string, CurriculumWithExamples> }>('/api/lessons').catch(() => ({ lessons: {} as Record<string, CurriculumWithExamples> })), []);
  const curriculum = (lessonData?.lessons?.[topic.code] ?? TOPIC_CURRICULUM[topic.code]) as CurriculumWithExamples | undefined;
  const hasExamples = Boolean(curriculum?.examples && curriculum.examples.length > 0);
  // Yêu cầu cần đạt của chương trình chuẩn đã công bố (chủ web nhập)
  const { data: standard } = useCurriculum(isBankTopic ? topic.code : null);
  const standardOutcomes = standard?.curriculum ? standard.outcomes : [];

  useEffect(() => {
    setStageTab('theory');
    setView('choose');
    setRevealedFormulas({});
    setRecallMode(false);
    setQuickItem(null);
    setQuickResp(null);
    setQuickReview(null);
    setQuickError(null);
    setSeenQids([]);
    setSessionStats({ tried: 0, correct: 0 });
  }, [topic.code]);

  useEffect(() => {
    if (!isBankTopic) {
      setKMap(null);
      return;
    }
    let alive = true;
    get<{ nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }>('/api/student/knowledge-map')
      .then((res) => {
        if (alive) setKMap(res);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isBankTopic]);

  const loadQuickQuestion = useCallback(
    async (nextExclude: number[]) => {
      if (!isBankTopic) return;
      setQuickLoading(true);
      setQuickError(null);
      setQuickResp(null);
      setQuickReview(null);
      try {
        const res = await post<{ question: any }>('/api/student/infinite-stream/next', {
          mode: 'topic',
          topic: topic.code,
          grade: topic.grade,
          excludeIds: nextExclude,
        });
        const q = res.question;
        setQuickItem({
          qid: q.id,
          type: q.type,
          stem: q.stem,
          options: q.options ?? [],
          no: nextExclude.length + 1,
          topic: q.topicName || topic.name,
          level: q.level,
        });
        setSeenQids((prev) => (prev.includes(q.id) ? prev : [...prev, q.id]));
      } catch (e: any) {
        setQuickError(e?.message || 'Chưa có câu hỏi luyện nhanh cho chuyên đề này.');
      } finally {
        setQuickLoading(false);
      }
    },
    [isBankTopic, topic.code, topic.grade, topic.name],
  );

  const handleTabChange = (next: StageTab) => {
    setStageTab(next);
    if (next === 'quick_practice' && isBankTopic && !quickItem && !quickLoading) {
      loadQuickQuestion(seenQids);
    }
  };

  const handleCheckQuick = async () => {
    if (!quickItem) return;
    setCheckingQuick(true);
    try {
      const res = await post<any>('/api/student/infinite-stream/check', {
        qid: quickItem.qid,
        response: quickResp,
        seconds: 20,
      });
      setQuickReview({
        correctAnswer: res.correctAnswer,
        explanation: res.explanation,
        grade: {
          points: res.points,
          max: res.max,
          correct: res.correct,
          parts: res.parts ?? undefined,
        },
        diagnosis: res.diagnosis,
      });
      setSessionStats((prev) => ({
        tried: prev.tried + 1,
        correct: prev.correct + (res.correct ? 1 : 0),
      }));
      onEvidenceUpdated?.();
    } catch (e: any) {
      toast(e?.message || 'Không thể chấm câu này.');
    } finally {
      setCheckingQuick(false);
    }
  };

  const currentNode = kMap?.nodes.find((n) => n.code === topic.code);
  const pctVal = masteryEntry
    ? Math.round(masteryEntry.value * 100)
    : currentNode?.mastery ?? null;
  const lastAt = masteryEntry?.lastAt ?? masteryEntry?.last ?? currentNode?.lastAt ?? null;
  const questionCount = currentNode?.questionCount ?? 0;
  const statusMeta = getStudyStatusMeta(pctVal);

  const prerequisites =
    kMap?.edges
      .filter((e) => e.to === topic.code)
      .map((e) => kMap.nodes.find((n) => n.code === e.from))
      .filter((n): n is KnowledgeNode => Boolean(n)) ?? [];

  const nextTopics =
    kMap?.edges
      .filter((e) => e.from === topic.code)
      .map((e) => kMap.nodes.find((n) => n.code === e.to))
      .filter((n): n is KnowledgeNode => Boolean(n)) ?? [];

  return (
    <div className="selfstudy-shell">
      {/* 1. Breadcrumb & Top Navigation */}
      <div className="ss-lesson-topbar">
        <nav className="ss-breadcrumb" aria-label="Đường dẫn bài học">
          <button type="button" className="ss-breadcrumb-btn" onClick={onBack}>
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Không gian tự học</span>
          </button>
          <span aria-hidden="true">/</span>
          <span>{subjectName}</span>
          <span aria-hidden="true">/</span>
          <span>Lớp {topic.grade}</span>
          <span aria-hidden="true">/</span>
          <span>{domainLabel}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            Bài {topicIndex + 1}/{totalTopics}
          </span>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="ss-btn ss-btn-sm"
            disabled={!onPrevTopic}
            onClick={onPrevTopic}
            aria-label="Chủ đề trước"
          >
            <ChevronLeft size={15} aria-hidden="true" />
            <span>Bài trước</span>
          </button>
          <button
            type="button"
            className="ss-btn ss-btn-sm"
            disabled={!onNextTopic}
            onClick={onNextTopic}
            aria-label="Chủ đề tiếp theo"
          >
            <span>Bài tiếp theo</span>
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 2. Header Bài Học */}
      <section className="ss-lesson-header-card" aria-label="Thông tin bài học">
        <div>
          <h1 className="ss-lesson-title">{topic.name}</h1>
          <p className="ss-lesson-summary">
            <MathText
              text={
                curriculum?.summary ??
                'Hệ thống kiến thức trọng tâm, công thức cần nhớ và luyện tập theo chuyên đề chương trình GDPT 2018.'
              }
            />
          </p>

          <div className="ss-lesson-goal">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Target size={17} color="var(--ss-primary)" style={{ marginTop: 2, flexShrink: 0 }} aria-hidden="true" />
              <div>
                <strong>{standardOutcomes.length ? 'Yêu cầu cần đạt:' : 'Mục tiêu học tập:'}</strong>{' '}
                {standardOutcomes.length ? (
                  <ul className="ss-outcomes">
                    {standardOutcomes.map((o) => (
                      <li key={o.code}>
                        <MathText text={o.text} />
                      </li>
                    ))}
                  </ul>
                ) : curriculum?.objectives?.length ? (
                  <span>{curriculum.objectives.join(' · ')}</span>
                ) : (
                  <span>
                    Nắm vững {curriculum?.formulas?.length ?? 0} nhóm kiến thức cốt lõi
                    {curriculum?.commonTraps?.length
                      ? `, nhận diện ${curriculum.commonTraps.length} bẫy sai thường gặp`
                      : ''}
                    {isBankTopic && questionCount > 0 ? ` và thực hành trên ${questionCount} câu hỏi chuyên đề.` : '.'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="ss-lesson-meta-line">
            <span className={`ss-status-tag ${statusMeta.className}`}>
              <StudyStatusIcon status={statusMeta.key} size={14} />
              <span>{statusMeta.label}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {pctVal !== null
                ? `Mức độ thành thạo: ${pctVal}%${masteryEntry?.n ? ` (${masteryEntry.n} lượt)` : ''}`
                : 'Chưa có lượt đánh giá'}
            </span>
            {isBankTopic && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{questionCount} câu hỏi có sẵn</span>
              </>
            )}
            {lastAt && (
              <>
                <span aria-hidden="true">·</span>
                <span>Ôn gần nhất {fmtDateTime(lastAt)}</span>
              </>
            )}
          </div>
        </div>

        <div className="ss-lesson-cta-box">
          <div>
            <div className="ss-progress-summary-head">
              <span>Tiến độ chuyên đề</span>
              <strong className="tabular-nums">{pctVal !== null ? `${pctVal}%` : 'Chưa làm'}</strong>
            </div>
            <div className="ss-progress-track" style={{ marginTop: 8 }}>
              <div
                className={`ss-progress-fill ${
                  statusMeta.key === 'weak'
                    ? 'is-warn'
                    : statusMeta.key === 'learning'
                    ? 'is-accent'
                    : ''
                }`}
                style={{ width: `${pctVal ?? 0}%` }}
              />
            </div>
          </div>

        </div>
      </section>

      {/* 3. Khung nội dung học tập 2 cột (66% Chính / 34% Điều khiển) */}
      {/* 3. Chọn hướng học: Lý thuyết hay Luyện tập */}
      <div className="tw-switch" role="tablist" aria-label="Chọn cách học">
        <button type="button" role="tab" aria-selected={view === 'theory'} className={`tw-choice is-theory ${view === 'theory' ? 'on' : ''}`} onClick={() => setView('theory')}>
          <span className="tw-choice-icon"><BookOpen size={22} aria-hidden="true" /></span>
          <span className="tw-choice-text">
            <strong>Lý thuyết</strong>
            <small>
              {curriculum?.formulas?.length ?? 0} mục kiến thức · {curriculum?.examples?.length ?? 0} ví dụ · {curriculum?.commonTraps?.length ?? 0} bẫy sai
            </small>
          </span>
          {view === 'choose' && <span className="tw-choice-go">Đọc bài →</span>}
        </button>
        <button type="button" role="tab" aria-selected={view === 'practice'} className={`tw-choice is-practice ${view === 'practice' ? 'on' : ''}`} onClick={() => setView('practice')}>
          <span className="tw-choice-icon"><Dumbbell size={22} aria-hidden="true" /></span>
          <span className="tw-choice-text">
            <strong>Luyện tập</strong>
            <small>
              {isBankTopic ? `${questionCount} câu có sẵn` : 'Câu hỏi theo chuyên đề'}
              {pctVal !== null ? ` · đang đúng ${pctVal}%` : ' · chưa làm câu nào'}
            </small>
          </span>
          {view === 'choose' && <span className="tw-choice-go">Bắt đầu →</span>}
        </button>
      </div>
      {view === 'choose' && (
        <p className="tw-hint">
          {pctVal === null
            ? 'Gợi ý: chuyên đề mới, nên đọc lý thuyết trước rồi mới luyện.'
            : pctVal < 50
            ? 'Gợi ý: em đang đúng dưới 50%, nên xem lại lý thuyết và bẫy sai trước khi luyện tiếp.'
            : 'Gợi ý: em đã nắm khá, vào luyện tập để giữ và tăng độ thành thạo.'}
        </p>
      )}


      {view !== 'choose' && (<div className="su-topic-body">
        {/* CỘT CHÍNH: Nội dung học tập */}
        <section className="ss-content-stage" aria-label="Nội dung bài học">
          <div className="ss-stage-body">
            {view === 'theory' && (<>
            <div className="su-section-head">
              <h2>Kiến thức &amp; công thức</h2>
              {curriculum?.formulas?.length ? (
                <button
                  type="button"
                  className={`btn sm ${recallMode ? 'primary' : ''}`}
                  onClick={() => {
                    setRecallMode((v) => !v);
                    setRevealedFormulas({});
                  }}
                  aria-pressed={recallMode}
                >
                  {recallMode ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
                  {recallMode ? 'Hiện công thức' : 'Tự nhẩm'}
                </button>
              ) : null}
            </div>
            {true && (
              <div>
                {curriculum?.formulas?.length ? (
                  <div className="ss-formula-list">
                    {recallMode && (
                      <div className="ss-recall-notice">
                        Chế độ tự nhẩm đang bật: hãy tự nhớ biểu thức, định nghĩa hoặc điều kiện áp dụng rồi nhấn vào từng mục để kiểm tra.
                      </div>
                    )}

                    {curriculum.formulas.map((formula, idx) => {
                      const split = splitFormulaParts(formula);
                      const isHidden = recallMode && !revealedFormulas[idx];
                      return (
                        <div
                          key={idx}
                          className={`ss-formula-card ${recallMode ? 'is-interactive' : ''}`}
                          onClick={
                            recallMode
                              ? () => setRevealedFormulas((prev) => ({ ...prev, [idx]: !prev[idx] }))
                              : undefined
                          }
                          role={recallMode ? 'button' : undefined}
                          tabIndex={recallMode ? 0 : undefined}
                          onKeyDown={
                            recallMode
                              ? (e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setRevealedFormulas((prev) => ({ ...prev, [idx]: !prev[idx] }));
                                  }
                                }
                              : undefined
                          }
                        >
                          <span className="ss-formula-index tabular-nums">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <div className="ss-formula-body">
                            {split ? (
                              <>
                                <span className="ss-formula-lead">{split.lead}</span>
                                {isHidden ? (
                                  <div className="ss-recall-masked">
                                    <span>Đang ẩn công thức để tự nhẩm nhớ</span>
                                    <strong style={{ color: 'var(--ss-accent)' }}>Nhấn để kiểm tra</strong>
                                  </div>
                                ) : (
                                  <div className="ss-formula-expression">
                                    <MathText text={split.body} />
                                  </div>
                                )}
                              </>
                            ) : isHidden ? (
                              <div className="ss-recall-masked">
                                <span>Kiến thức mục #{idx + 1} đang được che</span>
                                <strong style={{ color: 'var(--ss-accent)' }}>Nhấn để kiểm tra</strong>
                              </div>
                            ) : (
                              <div className="ss-formula-expression">
                                <MathText text={formula} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="ss-callout-box">
                    Nội dung tóm tắt kiến thức &amp; công thức cho chuyên đề này đang được hoàn thiện.
                  </div>
                )}

                {(prerequisites.length > 0 || nextTopics.length > 0) && (
                  <div className="ss-relations-section">
                    {prerequisites.length > 0 && (
                      <div>
                        <div className="ss-relation-heading">Kiến thức nền tảng liên quan</div>
                        <div className="ss-relation-list">
                          {prerequisites.map((node) => (
                            <button
                              key={node.code}
                              type="button"
                              className="ss-btn ss-btn-sm"
                              onClick={() => onSelectTopicCode(node.code)}
                            >
                              <ArrowLeft size={14} aria-hidden="true" />
                              <span>{node.name}</span>
                              {node.mastery !== null && (
                                <span className="tabular-nums" style={{ color: 'var(--ss-muted)' }}>
                                  ({node.mastery}%)
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {nextTopics.length > 0 && (
                      <div>
                        <div className="ss-relation-heading">Chuyên đề mở rộng tiếp theo</div>
                        <div className="ss-relation-list">
                          {nextTopics.map((node) => (
                            <button
                              key={node.code}
                              type="button"
                              className="ss-btn ss-btn-sm"
                              onClick={() => onSelectTopicCode(node.code)}
                            >
                              <span>{node.name}</span>
                              {node.mastery !== null && (
                                <span className="tabular-nums" style={{ color: 'var(--ss-muted)' }}>
                                  ({node.mastery}%)
                                </span>
                              )}
                              <ArrowRight size={14} aria-hidden="true" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {hasExamples && <div className="su-section-head"><h2>Ví dụ minh họa</h2></div>}
            {hasExamples && (
              <div className="ss-formula-list">
                {curriculum!.examples!.map((ex, i) => (
                  <div key={i} className="ss-formula-card">
                    <span className="ss-formula-index tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                    <div className="ss-formula-body">
                      <span className="ss-formula-lead">{ex.title}</span>
                      <div className="ss-formula-expression" style={{ marginBottom: 10 }}>
                        <MathText text={ex.problem} />
                      </div>
                      <div className="ss-callout-box" style={{ padding: '12px 14px' }}>
                        <strong>Hướng dẫn giải:</strong>{' '}
                        <MathText text={ex.solution} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="su-section-head"><h2>Mẹo &amp; bẫy sai thường gặp</h2></div>
            {true && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {curriculum?.keyExamTips && (
                  <div className="ss-callout-box">
                    <div className="ss-callout-title">
                      <BookOpen size={16} color="var(--ss-accent)" aria-hidden="true" />
                      <span>Kinh nghiệm giải nhanh &amp; điều kiện cần chú ý</span>
                    </div>
                    <div className="ss-formula-expression" style={{ fontSize: 15 }}>
                      <MathText text={curriculum.keyExamTips} />
                    </div>
                  </div>
                )}

                {curriculum?.commonTraps && curriculum.commonTraps.length > 0 && (
                  <div className="ss-formula-list">
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ss-ink)' }}>
                      Bẫy sai thường gặp cần tránh
                    </div>
                    {curriculum.commonTraps.map((trap, idx) => (
                      <div key={idx} className="ss-callout-box is-warn" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <AlertTriangle size={18} color="var(--ss-warn)" style={{ marginTop: 3, flexShrink: 0 }} aria-hidden="true" />
                        <div className="ss-formula-expression" style={{ fontSize: 15 }}>
                          <MathText text={trap} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  className="ss-callout-box"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>Ôn lại các câu bạn từng làm sai</div>
                    <div style={{ fontSize: 13.5, color: 'var(--ss-muted)', marginTop: 2 }}>
                      Hệ thống tự lưu các câu sai vào Sổ tay lỗi sai để nhắc ôn đúng thời điểm.
                    </div>
                  </div>
                  <button type="button" className="ss-btn ss-btn-sm" onClick={() => go('/so-tay-loi-sai')}>
                    <span>Mở Sổ tay lỗi sai</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
            </>)}
            {view === 'practice' && (<>
            <div className="su-section-head"><h2>Luyện theo chuyên đề</h2></div>
            <div className="tw-practice-box">
            <div className="su-pills" role="group" aria-label="Số câu luyện" style={{ flexWrap: 'nowrap' }}>
              {[5, 10, 15, 20].map((n) => (
                <button key={n} type="button" className={`su-pill ${customCount === n ? 'on' : ''}`} onClick={() => setCustomCount(n)} style={{ flex: 1 }}>
                  {n} câu
                </button>
              ))}
            </div>
            <button type="button" className="btn primary" disabled={busy} onClick={() => onStartPractice([topic.code], customCount)} style={{ width: '100%', justifyContent: 'center' }}>
              <Play size={15} aria-hidden="true" />
              {busy ? 'Đang tạo đề…' : `Luyện ${customCount} câu chuyên đề này`}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="su-link" onClick={() => onTogglePick(topic.code)}>
                {isPicked ? 'Đã thêm vào luyện kết hợp' : '+ Luyện kết hợp nhiều chủ đề'}
              </button>
              {pickedCount > 0 && onStartPickedPractice && (
                <button type="button" className="su-link" disabled={busy} onClick={() => onStartPickedPractice(customCount)}>
                  Luyện {pickedCount} chủ đề đã chọn
                </button>
              )}
            </div>
              <button type="button" className="btn" onClick={() => go('/so-tay-loi-sai')} style={{ width: '100%', justifyContent: 'center' }}>
                Ôn lại các câu đã sai
              </button>
            </div>
            <div className="su-section-head"><h2>Thử nhanh từng câu</h2>{sessionStats.tried > 0 && <span className="su-row-meta" style={{ margin: 0 }}>Đúng {sessionStats.correct}/{sessionStats.tried} câu</span>}</div>
            {true && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {!isBankTopic ? (
                  <div className="ss-callout-box">
                    <div className="ss-callout-title">
                      <Zap size={17} color="var(--ss-accent)" aria-hidden="true" />
                      <span>Thử nhanh từng câu đang áp dụng cho ngân hàng Toán THPT</span>
                    </div>
                    <p style={{ margin: '0 0 14px', fontSize: 14.5, color: 'var(--ss-muted)' }}>
                      Với môn {subjectName}, em hãy ôn kỹ bảng công thức trọng tâm hoặc mở Kho Đề Thi để làm các đề khảo sát có chấm điểm.
                    </p>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button type="button" className="ss-btn ss-btn-sm" onClick={() => setStageTab('theory')}>
                        Xem lại công thức
                      </button>
                      <button type="button" className="ss-btn ss-btn-primary ss-btn-sm" onClick={() => go('/luyen-tap')}>
                        <span>Mở Kho Đề Thi</span>
                        <ArrowRight size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ) : quickLoading ? (
                  <Loading text="Đang tải câu hỏi phù hợp trong ngân hàng…" />
                ) : quickError ? (
                  <div className="ss-callout-box">
                    <p style={{ margin: '0 0 12px', color: 'var(--ss-muted)' }}>{quickError}</p>
                    <button type="button" className="ss-btn ss-btn-sm" onClick={() => loadQuickQuestion(seenQids)}>
                      <RefreshCw size={14} aria-hidden="true" />
                      <span>Thử tải lại</span>
                    </button>
                  </div>
                ) : quickItem ? (
                  <>
                    <QuestionView
                      item={quickItem}
                      response={quickResp}
                      onChange={quickReview ? undefined : setQuickResp}
                      review={quickReview}
                    />
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                        paddingTop: 14,
                        borderTop: '1px solid var(--ss-border)',
                      }}
                    >
                      <button
                        type="button"
                        className="ss-btn ss-btn-sm"
                        onClick={() => loadQuickQuestion(seenQids)}
                        disabled={quickLoading || checkingQuick}
                      >
                        <RefreshCw size={14} aria-hidden="true" />
                        <span>Đổi câu khác</span>
                      </button>

                      {!quickReview ? (
                        <button
                          type="button"
                          className="ss-btn ss-btn-primary"
                          disabled={!isAnswered(quickItem.type, quickResp) || checkingQuick}
                          onClick={handleCheckQuick}
                        >
                          {checkingQuick ? 'Đang chấm…' : 'Kiểm tra đáp án'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ss-btn ss-btn-primary"
                          onClick={() => loadQuickQuestion(seenQids)}
                        >
                          <span>Câu tiếp theo</span>
                          <ArrowRight size={15} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="su-row" style={{ padding: 0 }}>
                    <div className="su-row-main su-row-meta" style={{ margin: 0 }}>Làm thử một câu của chuyên đề này, chấm ngay, không tính vào bài kiểm tra.</div>
                    <button type="button" className="btn sm primary" onClick={() => loadQuickQuestion(seenQids)}>
                      <Zap size={14} aria-hidden="true" /> Lấy một câu
                    </button>
                  </div>
                )}
              </div>
            )}

            </>)}
          </div>
        </section>

      </div>)}

      {/* 4. Thanh điều hướng bài học cuối trang */}
      <nav className="ss-lesson-footer-nav" aria-label="Điều hướng giữa các bài học">
        <button
          type="button"
          className="ss-footer-nav-link"
          disabled={!onPrevTopic}
          onClick={onPrevTopic}
        >
          <ChevronLeft size={18} aria-hidden="true" />
          <div style={{ minWidth: 0 }}>
            <div className="ss-footer-nav-label">Bài trước</div>
            <div className="ss-footer-nav-title">
              {onPrevTopic ? 'Chuyển về chủ đề trước' : 'Đang ở bài đầu tiên'}
            </div>
          </div>
        </button>

        <button type="button" className="ss-btn ss-btn-sm" onClick={onBack}>
          <span>Quay về danh sách</span>
        </button>

        <button
          type="button"
          className="ss-footer-nav-link is-next"
          disabled={!onNextTopic}
          onClick={onNextTopic}
        >
          <div style={{ minWidth: 0 }}>
            <div className="ss-footer-nav-label">Bài tiếp theo</div>
            <div className="ss-footer-nav-title">
              {onNextTopic ? 'Chuyển sang chủ đề kế tiếp' : 'Đã hết danh sách lọc'}
            </div>
          </div>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
}
