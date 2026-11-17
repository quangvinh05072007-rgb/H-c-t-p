import { useEffect, useRef, useState } from 'react';
import { post } from '../../api';
import { MathText } from '../../ui/MathText';
import { ErrorBox, go, Icon, LevelBadge, Loading, TypeBadge, useApp } from '../../ui/kit';

interface StreamQuestion {
  id: number;
  type: 'mcq' | 'tf' | 'short';
  stem: string;
  options: string[];
  topic: string;
  topicName: string;
  level: number;
  grade: number;
}

interface StreamResult {
  correct: boolean;
  points: number;
  max: number;
  parts?: boolean[];
  correctAnswer: any;
  explanation: string;
  diagnosis?: { error?: string; hint?: string };
  stats: {
    xp: number;
    streak: number;
    todayQuestions: number;
    todayCorrect: number;
  };
}

interface StreamHistoryItem {
  question: StreamQuestion;
  response: any;
  result: StreamResult;
  timeSpentSec: number;
}

const SKILL_TIERS = [
  { level: 1, name: 'Khởi động', subtitle: 'Nhận biết', icon: '🥉', badgeClass: 'tier-bronze' },
  { level: 2, name: 'Nền tảng', subtitle: 'Thông hiểu', icon: '🥈', badgeClass: 'tier-silver' },
  { level: 3, name: 'Thành thạo', subtitle: 'Vận dụng', icon: '🥇', badgeClass: 'tier-gold' },
  { level: 4, name: 'Bứt phá 9+', subtitle: 'Vận dụng cao', icon: '💎', badgeClass: 'tier-master' },
];

export function EndlessPracticeStream({ initialTopic }: { initialTopic?: string }) {
  const { user, toast } = useApp();
  const [mode, setMode] = useState<'adaptive' | 'weak' | 'topic'>('adaptive');
  const [selectedGrade, setSelectedGrade] = useState<number | 'all'>('all');
  const [selectedTopic, setSelectedTopic] = useState<string>(initialTopic || 'all');
  const [targetSkillTier, setTargetSkillTier] = useState<number>(2);

  const [currentQuestion, setCurrentQuestion] = useState<StreamQuestion | null>(null);
  const [history, setHistory] = useState<StreamHistoryItem[]>([]);
  const [answeredIds, setAnsweredIds] = useState<number[]>([]);

  const [response, setResponse] = useState<any>(null);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [loadingNext, setLoadingNext] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  const [currentResult, setCurrentResult] = useState<StreamResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Session stats
  const [sessionCorrect, setSessionCorrect] = useState<number>(0);
  const [sessionTotal, setSessionTotal] = useState<number>(0);
  const [userStreak, setUserStreak] = useState<number>(user.streak || 0);

  const activeCardRef = useRef<HTMLDivElement>(null);

  // Fetch next question
  const fetchNextQuestion = async (overrideExcludeIds?: number[]) => {
    setLoadingNext(true);
    setError(null);
    setResponse(null);
    setCurrentResult(null);
    setStartTime(Date.now());

    try {
      const exclude = overrideExcludeIds ?? answeredIds;
      const res = await post<{ question: StreamQuestion }>('/api/student/infinite-stream/next', {
        mode,
        grade: selectedGrade === 'all' ? null : selectedGrade,
        topic: selectedTopic === 'all' ? null : selectedTopic,
        excludeIds: exclude,
      });
      setCurrentQuestion(res.question);
      // Auto initialize response format
      if (res.question.type === 'tf') {
        setResponse([null, null, null, null]);
      } else if (res.question.type === 'short') {
        setResponse('');
      } else {
        setResponse(null);
      }
      setTimeout(() => {
        activeCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } catch (err: any) {
      setError(err.message || 'Không thể tải câu hỏi tiếp theo.');
    } finally {
      setLoadingNext(false);
    }
  };

  useEffect(() => {
    fetchNextQuestion([]);
  }, [mode, selectedGrade, selectedTopic]);

  // Submit and check answer immediately
  const handleCheck = async () => {
    if (!currentQuestion) return;

    if (currentQuestion.type === 'mcq' && (response === null || response === undefined)) {
      toast('Vui lòng chọn 1 phương án trước khi kiểm tra!');
      return;
    }
    if (currentQuestion.type === 'tf' && (Array.isArray(response) && response.some((x) => x === null))) {
      toast('Vui lòng chọn Đúng hoặc Sai cho cả 4 ý!');
      return;
    }
    if (currentQuestion.type === 'short' && !String(response ?? '').trim()) {
      toast('Vui lòng nhập kết quả của bạn!');
      return;
    }

    setChecking(true);
    const timeSpentSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));

    try {
      const res = await post<StreamResult>('/api/student/infinite-stream/check', {
        qid: currentQuestion.id,
        response,
        seconds: timeSpentSec,
      });

      setCurrentResult(res);
      setUserStreak(res.stats.streak);
      setSessionTotal((prev) => prev + 1);

      if (res.correct) {
        setSessionCorrect((prev) => {
          const next = prev + 1;
          if (next % 5 === 0) {
            toast('🌟 Xuất sắc! Bạn đã hoàn thành chuỗi 5 câu đúng liên tiếp!');
            setTargetSkillTier((t) => Math.min(4, t + 1));
          } else {
            toast('✓ Chính xác! Tiếp tục giữ vững phong độ nhé.');
          }
          return next;
        });
      } else {
        toast('Xem chẩn đoán phương pháp giải bên dưới để khắc phục lỗ hổng!');
      }

      setAnsweredIds((prev) => [...prev, currentQuestion.id]);
      setHistory((prev) => [
        ...prev,
        {
          question: currentQuestion,
          response,
          result: res,
          timeSpentSec,
        },
      ]);
    } catch (err: any) {
      toast(err.message || 'Lỗi khi kiểm tra kết quả.');
    } finally {
      setChecking(false);
    }
  };

  const currentTier = SKILL_TIERS.find((t) => t.level === targetSkillTier) || SKILL_TIERS[1];
  const questProgressInTier = sessionCorrect % 5;

  return (
    <div className="adaptive-quest-view stack" style={{ gap: 20 }}>
      {/* 1. Header: Adaptive Quest Level & Milestones */}
      <div className="quest-hero-banner card shadow">
        <div className="quest-hero-top">
          <div className="quest-hero-identity">
            <div className="quest-hero-kicker">
              <span className="quest-live-dot" aria-hidden="true" />
              <span>Lộ trình Thích ứng Thông minh</span>
              <span className="academic-sep" aria-hidden="true">·</span>
              <span>Toán THPT</span>
            </div>
            <h1 className="quest-hero-title">Nhiệm Vụ Thích Ứng (Adaptive Quest)</h1>
            <p className="quest-hero-desc">
              Hệ thống tự động phân loại mức độ tư duy, chẩn đoán lỗ hổng kiến thức và điều chỉnh độ khó theo thời gian thực.
            </p>
          </div>

          <div className="quest-stats-cluster">
            <div className="quest-stat-pill">
              <span className="quest-pill-icon" aria-hidden="true">🔥</span>
              <div className="quest-pill-data">
                <span className="quest-pill-label">Chuỗi ngày</span>
                <span className="quest-pill-val tabular-nums">{userStreak} ngày</span>
              </div>
            </div>
            <div className="quest-stat-pill">
              <span className="quest-pill-icon" aria-hidden="true">📝</span>
              <div className="quest-pill-data">
                <span className="quest-pill-label">Đã giải</span>
                <span className="quest-pill-val text-primary tabular-nums">{sessionCorrect}/{sessionTotal} câu</span>
              </div>
            </div>
            <div className="quest-stat-pill">
              <span className="quest-pill-icon" aria-hidden="true">🎯</span>
              <div className="quest-pill-data">
                <span className="quest-pill-label">Độ chính xác</span>
                <span className="quest-pill-val text-good tabular-nums">
                  {sessionTotal > 0 ? `${Math.round((sessionCorrect / sessionTotal) * 100)}%` : '100%'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Skill Tiers Selector */}
        <div className="quest-tiers-selector" role="tablist" aria-label="Mức độ kỹ năng">
          {SKILL_TIERS.map((tier) => {
            const isSelected = targetSkillTier === tier.level;
            return (
              <button
                key={tier.level}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`quest-tier-card ${tier.badgeClass} ${isSelected ? 'is-active' : ''}`}
                onClick={() => setTargetSkillTier(tier.level)}
              >
                <div className="tier-card-header">
                  <span className="tier-card-icon" aria-hidden="true">{tier.icon}</span>
                </div>
                <div className="tier-card-title">{tier.name}</div>
                <div className="tier-card-sub">{tier.subtitle}</div>
              </button>
            );
          })}
        </div>

        {/* Quest Milestone Progress Bar */}
        <div className="quest-milestone-strip">
          <div className="quest-milestone-text">
            <span>Tiến độ mức độ: <strong>{questProgressInTier}/5 câu đúng</strong> ở mức {currentTier.name} ({currentTier.subtitle})</span>
            <span className="quest-total-done tabular-nums">Đã giải {sessionTotal} câu trong phiên</span>
          </div>
          <div className="quest-milestone-track" aria-hidden="true">
            <span style={{ width: `${(questProgressInTier / 5) * 100}%` }} />
          </div>
        </div>

        {/* Quest Filter Bar */}
        <div className="quest-filter-bar">
          <div className="quest-filter-modes">
            <button
              type="button"
              className={`quest-filter-btn ${mode === 'adaptive' ? 'active' : ''}`}
              onClick={() => setMode('adaptive')}
            >
              🎯 Thích ứng AI
            </button>
            <button
              type="button"
              className={`quest-filter-btn ${mode === 'weak' ? 'active' : ''}`}
              onClick={() => setMode('weak')}
            >
              🩸 Chữa điểm yếu
            </button>
          </div>

          <div className="quest-filter-selects">
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="quest-select"
              aria-label="Chọn khối lớp"
            >
              <option value="all">Tất cả khối lớp</option>
              <option value="12">Lớp 12 (Trọng tâm tốt nghiệp)</option>
              <option value="11">Lớp 11</option>
              <option value="10">Lớp 10</option>
            </select>

            <button
              type="button"
              className="btn ghost sm"
              onClick={() => go('/tu-hoc')}
            >
              <Icon name="map" />
              <span>Xem Cây kỹ năng →</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stream History Items (Previously answered in this session) */}
      {history.map((item, idx) => (
        <div
          key={`hist-${item.question.id}-${idx}`}
          className={`stream-card ${item.result.correct ? 'answered-correct' : 'answered-incorrect'}`}
        >
          <div className="row between mb" style={{ opacity: 0.85 }}>
            <div className="row" style={{ gap: 6 }}>
              <span className="badge">Câu #{idx + 1}</span>
              <TypeBadge type={item.question.type} />
              <LevelBadge level={item.question.level} />
              <span className="tiny muted">{item.question.topicName}</span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <span className={`badge ${item.result.correct ? 'green' : 'red'}`}>
                {item.result.correct ? '✓ Chính xác' : '✕ Chưa chính xác'}
              </span>
              <span className="tiny muted">{item.timeSpentSec}s</span>
            </div>
          </div>

          <MathText as="div" className="q-stem" text={item.question.stem} />

          {item.result.explanation && (
            <details className="mt" style={{ fontSize: 14 }}>
              <summary className="strong" style={{ cursor: 'pointer', color: 'var(--primary)' }}>
                Xem lại lời giải chi tiết
              </summary>
              <div className="feedback-box" style={{ marginTop: 8, background: '#f8fafc', border: '1px solid var(--line)' }}>
                <MathText as="div" text={item.result.explanation} />
              </div>
            </details>
          )}
        </div>
      ))}

      {/* Current Active Question Card */}
      {error && <ErrorBox error={error} onRetry={() => fetchNextQuestion()} />}

      {loadingNext ? (
        <div className="card center" style={{ padding: 40 }}>
          <Loading text="Hệ thống thích ứng đang chọn câu hỏi tối ưu năng lực tiếp theo…" />
        </div>
      ) : currentQuestion ? (
        <div ref={activeCardRef} className="stream-card active card shadow">
          <div className="row between mb">
            <div className="row" style={{ gap: 8 }}>
              <span className="badge blue strong">⚡ Nhiệm vụ #{history.length + 1}</span>
              <TypeBadge type={currentQuestion.type} />
              <LevelBadge level={currentQuestion.level} />
              <span className="tiny muted strong">Lớp {currentQuestion.grade}</span>
            </div>
            <span className="tiny muted strong" style={{ background: 'var(--primary-soft)', color: 'var(--primary)', padding: '3px 10px', borderRadius: 6 }}>
              {currentQuestion.topicName}
            </span>
          </div>

          <div style={{ fontSize: 16, lineHeight: 1.7, marginBottom: 20 }}>
            <MathText as="div" className="q-stem" text={currentQuestion.stem} />
          </div>

          {/* Interactive Answer Input */}
          {currentQuestion.type === 'mcq' && (
            <div className="grid-2" style={{ gap: 12 }}>
              {currentQuestion.options.map((opt, optIdx) => {
                const isSelected = response === optIdx;
                const isChecked = !!currentResult;
                const isCorrect = isChecked && currentResult.correctAnswer === optIdx;
                const isWrong = isChecked && isSelected && !currentResult.correct;

                let cls = 'option-box';
                if (isSelected) cls += ' selected';
                if (isCorrect) cls += ' correct';
                if (isWrong) cls += ' incorrect';

                return (
                  <button
                    key={optIdx}
                    type="button"
                    className={cls}
                    disabled={checking || isChecked}
                    onClick={() => setResponse(optIdx)}
                  >
                    <span className="opt-letter">{String.fromCharCode(65 + optIdx)}</span>
                    <div className="opt-content">
                      <MathText text={opt} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {currentQuestion.type === 'tf' && (
            <div className="stack" style={{ gap: 10 }}>
              {currentQuestion.options.map((opt, optIdx) => {
                const curVal = Array.isArray(response) ? response[optIdx] : null;
                const isChecked = !!currentResult;
                const partCorrect = isChecked && currentResult.parts ? currentResult.parts[optIdx] : null;

                return (
                  <div
                    key={optIdx}
                    className="row between"
                    style={{
                      padding: '10px 14px',
                      background: partCorrect === true ? '#f0fdf4' : partCorrect === false ? '#fef2f2' : 'var(--surface-subtle)',
                      border: '1px solid var(--line)',
                      borderRadius: 8,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ flex: 1, marginRight: 12 }}>
                      <span className="strong" style={{ marginRight: 6 }}>
                        {String.fromCharCode(97 + optIdx)})
                      </span>
                      <MathText text={opt} />
                    </div>

                    <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        className={`btn sm ${curVal === true ? 'primary' : 'ghost'}`}
                        disabled={checking || isChecked}
                        onClick={() => {
                          const next = Array.isArray(response) ? [...response] : [null, null, null, null];
                          next[optIdx] = true;
                          setResponse(next);
                        }}
                      >
                        Đúng
                      </button>
                      <button
                        type="button"
                        className={`btn sm ${curVal === false ? 'danger' : 'ghost'}`}
                        disabled={checking || isChecked}
                        onClick={() => {
                          const next = Array.isArray(response) ? [...response] : [null, null, null, null];
                          next[optIdx] = false;
                          setResponse(next);
                        }}
                      >
                        Sai
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {currentQuestion.type === 'short' && (
            <div style={{ maxWidth: 360 }}>
              <label className="field">
                <span>Nhập câu trả lời của bạn:</span>
                <input
                  type="text"
                  className="input"
                  placeholder="Ví dụ: -2.5 hoặc 4/3 hoặc 12"
                  value={response ?? ''}
                  disabled={checking || !!currentResult}
                  onChange={(e) => setResponse(e.target.value)}
                  style={{ fontSize: 16, fontWeight: 700 }}
                />
              </label>
            </div>
          )}

          {/* Action / Check / Next Button */}
          <div className="row between mt" style={{ marginTop: 22, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <div>
              {currentResult && (
                <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                  <span className={`badge big ${currentResult.correct ? 'green' : 'red'}`}>
                    {currentResult.correct ? '✓ Trả lời chính xác' : '✕ Chưa chính xác'}
                  </span>
                  {currentResult.diagnosis?.error && (
                    <span className="tiny muted">Lỗi: {currentResult.diagnosis.error}</span>
                  )}
                </div>
              )}
            </div>

            <div className="row" style={{ gap: 10 }}>
              {!currentResult ? (
                <button
                  type="button"
                  className="btn primary big"
                  disabled={checking}
                  onClick={handleCheck}
                >
                  {checking ? 'Đang chấm điểm…' : 'Kiểm tra kết quả →'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn primary big"
                  onClick={() => fetchNextQuestion()}
                >
                  Chinh phục câu tiếp theo ⚡
                </button>
              )}
            </div>
          </div>

          {/* Detailed Explanation Drawer */}
          {currentResult?.explanation && (
            <div className="feedback-box mt" style={{ marginTop: 18, background: '#f8fafc', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
              <div className="strong" style={{ color: 'var(--primary)', marginBottom: 8 }}>
                💡 Hướng dẫn giải chi tiết & Phương pháp tư duy:
              </div>
              <MathText as="div" text={currentResult.explanation} />
              {currentResult.diagnosis?.hint && (
                <div className="card warn small mt" style={{ marginTop: 12 }}>
                  <strong>Lời khuyên cải thiện:</strong> {currentResult.diagnosis.hint}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
