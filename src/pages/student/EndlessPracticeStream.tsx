import { useEffect, useRef, useState } from 'react';
import { post } from '../../api';
import { MathText } from '../../ui/MathText';
import { ErrorBox, LevelBadge, Loading, TypeBadge, useApp } from '../../ui/kit';

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


export function EndlessPracticeStream({ initialTopic }: { initialTopic?: string }) {
  const { user, toast } = useApp();
  const [mode, setMode] = useState<'adaptive' | 'weak' | 'topic'>('adaptive');
  const [selectedGrade, setSelectedGrade] = useState<number | 'all'>('all');
  const [selectedTopic, setSelectedTopic] = useState<string>(initialTopic || 'all');

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
            toast(`Đúng ${next} câu trong phiên này. Giỏi lắm!`);
          } else {
            toast('Chính xác!');
          }
          return next;
        });
      } else {
        toast('Chưa đúng. Xem lời giải bên dưới.');
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


  return (
    <div className="su-page" style={{ maxWidth: 860 }}>
      <header className="su-head">
        <div>
          <h1>Luyện liên tục</h1>
          <p className="su-sub">Làm từng câu, chấm ngay. Câu tiếp theo dựa trên kết quả và chuyên đề em còn yếu.</p>
        </div>
        <div className="su-stats">
          <span className="su-stat">Đã làm <b>{sessionTotal}</b> câu</span>
          <span className="su-stat is-good">Đúng <b>{sessionCorrect}</b></span>
          {sessionTotal > 0 && <span className="su-stat">Chính xác <b>{Math.round((sessionCorrect / sessionTotal) * 100)}%</b></span>}
          <span className={`su-stat ${userStreak > 0 ? 'is-warn' : ''}`}>Chuỗi <b>{userStreak}</b> ngày</span>
        </div>
      </header>

      <div className="su-filterbar">
        <div className="su-pills" role="group" aria-label="Cách chọn câu">
          <button type="button" className={`su-pill ${mode === 'adaptive' ? 'on' : ''}`} aria-pressed={mode === 'adaptive'} onClick={() => setMode('adaptive')}>
            Theo năng lực
          </button>
          <button type="button" className={`su-pill ${mode === 'weak' ? 'on' : ''}`} aria-pressed={mode === 'weak'} onClick={() => setMode('weak')}>
            Chữa điểm yếu
          </button>
        </div>
        <span className="su-grow" />
        <div className="su-filter-tools">
          <select
            className="su-select"
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            aria-label="Chọn khối lớp"
          >
            <option value="all">Mọi khối</option>
            <option value="12">Lớp 12</option>
            <option value="11">Lớp 11</option>
            <option value="10">Lớp 10</option>
          </select>
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
                {item.result.correct ? 'Đúng' : 'Chưa đúng'}
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
              <div className="feedback-box" style={{ marginTop: 8, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
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
          <Loading text="Đang chọn câu tiếp theo…" />
        </div>
      ) : currentQuestion ? (
        <div ref={activeCardRef} className="stream-card active card shadow">
          <div className="row between mb">
            <div className="row" style={{ gap: 8 }}>
              <span className="badge strong">Câu {history.length + 1}</span>
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
                      background: partCorrect === true ? 'var(--good-soft)' : partCorrect === false ? 'var(--bad-soft)' : 'var(--surface-2)',
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
                    {currentResult.correct ? 'Đúng' : 'Chưa đúng'}
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
                  {checking ? 'Đang chấm…' : 'Kiểm tra'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn primary big"
                  onClick={() => fetchNextQuestion()}
                >
                  Câu tiếp theo →
                </button>
              )}
            </div>
          </div>

          {/* Detailed Explanation Drawer */}
          {currentResult?.explanation && (
            <div className="feedback-box mt" style={{ marginTop: 18, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
              <div className="strong" style={{ color: 'var(--primary)', marginBottom: 8 }}>
                Lời giải
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
