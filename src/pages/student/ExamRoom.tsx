// Phòng thi / luyện tập. Đáng tin cậy: lưu ngay vào máy (localStorage) mỗi lần chọn, đồng bộ lên máy chủ khi có mạng,
// đồng hồ theo giờ máy chủ, nộp bài thử lại tới khi thành công; hết giờ máy chủ tự chốt bằng bản lưu cuối.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, get, post } from '../../api';
import { ErrorBox, go, Loading, Modal, useApp, Mascot, Icon } from '../../ui/kit';
import { isAnswered, Item, QuestionView, Review } from '../../ui/Question';
import { ExamScratchpad } from '../../ui/ExamScratchpad';
import { ImageZoomModal } from '../../ui/ImageZoomModal';
import { ExamShortcutsModal } from '../../ui/ExamShortcutsModal';

type Attempt = {
  id: number;
  kind: 'assignment' | 'practice';
  title: string;
  status: string;
  deadlineAt: number | null;
  serverNow: number;
  version: number;
  responses: Record<string, any>;
  times: Record<string, number>;
  checked: Record<string, any>;
  items: Item[];
};

function clientId() {
  try {
    let id = localStorage.getItem('se-client');
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('se-client', id);
    }
    return id;
  } catch {
    return 'no-storage';
  }
}
const LS = (id: number) => `se-attempt-${id}`;
function readLocal(id: number) {
  try {
    return JSON.parse(localStorage.getItem(LS(id)) ?? 'null');
  } catch {
    return null;
  }
}
function writeLocal(id: number, v: unknown) {
  try {
    localStorage.setItem(LS(id), JSON.stringify(v));
  } catch {
    /* bộ nhớ đầy: vẫn còn bản trên máy chủ */
  }
}

function fmtClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return (h ? `${h}:` : '') + `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function ExamRoom({ attemptId }: { attemptId: number }) {
  const { toast } = useApp();
  const [att, setAtt] = useState<Attempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cur, setCur] = useState(0);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'offline'>('saved');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checks, setChecks] = useState<Record<string, Review & { points?: number }>>({});
  const [checking, setChecking] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [scratchpadOpen, setScratchpadOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [eliminations, setEliminations] = useState<Record<number, number[]>>({});
  const [tabSwitchCount, setTabSwitchCount] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const offset = useRef(0); // giờ máy chủ - giờ máy
  const version = useRef(0);
  const serverVersion = useRef(0);
  const times = useRef<Record<string, number>>({});
  const events = useRef<{ type: string; at: number }[]>([]);
  const enterAt = useRef(Date.now());
  const saveTimer = useRef<number | null>(null);
  const finished = useRef(false);
  const respRef = useRef<Record<string, any>>({});
  const cid = useMemo(clientId, []);

  // ---- tải bài ----
  useEffect(() => {
    get<Attempt>(`/api/attempts/${attemptId}`)
      .then((a) => {
        if (a.status !== 'in_progress') {
          finished.current = true;
          go(`/ket-qua/${a.id}`);
          return;
        }
        offset.current = a.serverNow - Date.now();
        const local = readLocal(a.id);
        let resp = a.responses ?? {};
        version.current = a.version;
        serverVersion.current = a.version;
        times.current = { ...(a.times ?? {}) };
        if (local && local.version > a.version) {
          resp = local.responses;
          version.current = local.version;
          times.current = local.times ?? times.current;
          setSaveState('offline');
        }
        setResponses(resp);
        respRef.current = resp;
        setFlags(local?.flags ?? {});
        setEliminations(local?.eliminations ?? {});
        const ch: Record<string, Review> = {};
        for (const [qid, c] of Object.entries(a.checked ?? {})) ch[qid] = { ...(c as any) };
        setChecks(ch);
        setAtt(a);
      })
      .catch((e) => setError(e.message));
  }, [attemptId]);

  // ---- đồng bộ ----
  const flush = useCallback(async () => {
    if (!att || finished.current) return;
    if (version.current <= serverVersion.current && !events.current.length) return;
    setSaveState('saving');
    const sending = events.current.splice(0);
    const v = version.current;
    try {
      const r = await api('PUT', `/api/attempts/${att.id}/save`, { responses: respRef.current, times: times.current, version: v, events: sending, clientId: cid }, { timeoutMs: 15000 });
      offset.current = r.serverNow - Date.now();
      if (r.closed) {
        finished.current = true;
        toast(r.late ? 'Đã hết giờ. Bài được chốt bằng bản lưu đúng hạn; phần làm khi mất mạng được gửi để giáo viên xem xét.' : 'Đã hết giờ. Bài được chốt bằng bản lưu cuối.');
        go(`/ket-qua/${att.id}`);
        return;
      }
      serverVersion.current = Math.max(serverVersion.current, r.version);
      setSaveState(version.current > serverVersion.current ? 'saving' : 'saved');
      setSavedAt(Date.now());
    } catch {
      events.current.unshift(...sending);
      setSaveState('offline');
    }
  }, [att, cid, responses, toast]);

  const scheduleSave = useCallback(
    (delay = 1200) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(flush, delay);
    },
    [flush],
  );

  // thử lại khi mất mạng; gửi ngay khi có mạng
  useEffect(() => {
    if (!att) return;
    const retry = window.setInterval(() => {
      if (version.current > serverVersion.current || events.current.length) flush();
    }, 8000);
    const online = () => {
      events.current.push({ type: 'online', at: Date.now() + offset.current });
      flush();
    };
    const offline = () => {
      events.current.push({ type: 'offline', at: Date.now() + offset.current });
      setSaveState('offline');
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      clearInterval(retry);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [att, flush]);

  // tín hiệu chống gian lận & giám sát phòng thi thực chiến: rời tab, dán chữ, toàn màn hình
  useEffect(() => {
    if (!att) return;
    const vis = () => {
      if (document.visibilityState === 'hidden') {
        setTabSwitchCount((c) => c + 1);
        events.current.push({ type: 'hidden', at: Date.now() + offset.current });
        toast('Cảnh báo giám sát phòng thi: Hệ thống vừa ghi nhận thao tác rời khỏi màn hình làm bài.');
        if (att.kind === 'assignment') flush();
      }
    };
    const paste = () => events.current.push({ type: 'paste', at: Date.now() + offset.current });
    const fsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('visibilitychange', vis);
    document.addEventListener('paste', paste);
    document.addEventListener('fullscreenchange', fsChange);
    const before = (e: BeforeUnloadEvent) => {
      if (version.current > serverVersion.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', before);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      document.removeEventListener('paste', paste);
      document.removeEventListener('fullscreenchange', fsChange);
      window.removeEventListener('beforeunload', before);
    };
  }, [att, flush, toast]);

  const toggleFullscreen = () => {
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    } catch {
      /* ignore iframe restriction */
    }
  };

  // đồng hồ
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // thời gian làm từng câu
  const trackTime = useCallback(() => {
    if (!att) return;
    const it = att.items[cur];
    if (!it) return;
    const sec = (Date.now() - enterAt.current) / 1000;
    if (sec > 0 && sec < 3600) times.current[it.qid] = Math.round((times.current[it.qid] ?? 0) + sec);
    enterAt.current = Date.now();
  }, [att, cur]);

  const goTo = (i: number) => {
    trackTime();
    setCur(i);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setAnswer = (qid: number, v: any) => {
    if (!att) return;
    trackTime();
    const next = { ...respRef.current, [qid]: v };
    respRef.current = next;
    setResponses(next);
    version.current += 1;
    writeLocal(att.id, { responses: next, times: times.current, version: version.current, flags });
    setSaveState('saving');
    scheduleSave();
  };

  const toggleFlag = (qid: number) => {
    const f = { ...flags, [qid]: !flags[qid] };
    setFlags(f);
    if (att) writeLocal(att.id, { ...(readLocal(att.id) ?? { responses, version: version.current }), flags: f });
  };

  const toggleEliminate = (qid: number, optIdx: number) => {
    setEliminations((prev) => {
      const list = prev[qid] ?? [];
      const nextList = list.includes(optIdx) ? list.filter((x) => x !== optIdx) : [...list, optIdx];
      const next = { ...prev, [qid]: nextList };
      if (att) writeLocal(att.id, { ...(readLocal(att.id) ?? { responses, version: version.current, flags }), eliminations: next });
      return next;
    });
  };

  const submit = useCallback(
    async (auto = false) => {
      if (!att || finished.current) return;
      trackTime();
      setSubmitting(true);
      const body = { responses: respRef.current, times: times.current, version: Math.max(version.current, serverVersion.current + 1), events: events.current.splice(0), clientId: cid };
      const url = att.kind === 'practice' ? `/api/practice/${att.id}/finish` : `/api/attempts/${att.id}/submit`;
      for (let i = 0; i < 6; i++) {
        try {
          await post(url, body);
          finished.current = true;
          try {
            localStorage.removeItem(LS(att.id));
          } catch {
            /* bỏ qua */
          }
          go(`/ket-qua/${att.id}`);
          return;
        } catch (e: any) {
          if (e.status && e.status !== 0 && e.status < 500) {
            setError(e.message);
            break;
          }
          setSaveState('offline');
          toast(auto ? 'Hết giờ — đang nộp bài, chờ có mạng…' : 'Mất mạng — đang thử nộp lại. Bài làm vẫn lưu trên máy.');
          await new Promise((r) => setTimeout(r, 3000 + i * 2000));
        }
      }
      setSubmitting(false);
    },
    [att, cid, responses, toast, trackTime],
  );

  const remaining = att?.deadlineAt ? att.deadlineAt - (now + offset.current) : null;
  useEffect(() => {
    if (remaining !== null && remaining <= 0 && att?.kind === 'assignment' && !finished.current && !submitting) submit(true);
  }, [remaining, att, submit, submitting]);

  const check = async () => {
    if (!att) return;
    const it = att.items[cur];
    trackTime();
    setChecking(true);
    try {
      const r = await post(`/api/practice/${att.id}/check`, { qid: it.qid, response: responses[it.qid], seconds: times.current[it.qid] });
      setChecks((c) => ({ ...c, [it.qid]: { correctAnswer: r.correctAnswer, explanation: r.explanation, source: r.source, grade: { points: r.points, max: r.max, correct: r.correct, parts: r.parts }, diagnosis: r.diagnosis } }));
    } catch (e: any) {
      toast(e.message);
    } finally {
      setChecking(false);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!att) return;
    const currentItem = att.items[cur];
    if (!currentItem) return;
    const isPracticeMode = att.kind === 'practice';
    const hasReview = Boolean(checks[currentItem.qid]);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'ArrowLeft') {
        if (cur > 0) goTo(cur - 1);
      } else if (e.key === 'ArrowRight') {
        if (cur < att.items.length - 1) goTo(cur + 1);
      } else if (e.key.toLowerCase() === 'f' && !isPracticeMode) {
        toggleFlag(currentItem.qid);
      } else if (e.key.toLowerCase() === 'n') {
        setScratchpadOpen((prev) => !prev);
      } else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        setShortcutsOpen((prev) => !prev);
      } else if (e.key.toLowerCase() === 'z') {
        const imgMatches = [...(currentItem.stem?.matchAll(/\[\[img:(\d+)\]\]/g) ?? [])];
        if (imgMatches.length > 0) {
          setZoomImageUrl(`/api/images/${imgMatches[0][1]}`);
        }
      } else if (e.key.toLowerCase() === 'x' && currentItem.type === 'mcq' && !hasReview) {
        const currentAns = responses[currentItem.qid];
        if (typeof currentAns === 'number') {
          toggleEliminate(currentItem.qid, currentAns);
        }
      } else if (currentItem.type === 'mcq' && !hasReview) {
        const keyMap: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3, 'a': 0, 'b': 1, 'c': 2, 'd': 3 };
        const idx = keyMap[e.key.toLowerCase()];
        if (idx !== undefined && idx < (currentItem.options?.length ?? 4)) {
          setAnswer(currentItem.qid, idx);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cur, att, checks, responses]);

  if (error) return <ErrorBox error={error} />;
  if (!att) return <Loading text="Đang mở bài…" />;
  const it = att.items[cur];
  const answered = att.items.filter((x) => isAnswered(x.type, responses[x.qid])).length;
  const isPractice = att.kind === 'practice';
  const checkInfo = checks[it.qid];
  const review: Review | null = checkInfo ? { ...checkInfo } : null;
  const unanswered = att.items.length - answered;

  return (
    <div className={`exam-session exam-zen-mode ${paletteOpen ? 'palette-open' : 'palette-closed'}`}>
      {/* 1. IELTS Computer-Delivered Sticky Header */}
      <header className="exam-top-bar" aria-label="Thanh trạng thái phòng thi" style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) auto minmax(240px, 1fr)', alignItems: 'center', gap: 12, padding: '10px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
        {/* Left: Test Identity */}
        <div className="exam-top-left" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button
            className="exam-exit-btn"
            onClick={() => setConfirm(true)}
            aria-label="Rời phòng thi"
            title="Bài làm được lưu tự động trên hệ thống"
            style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, minHeight: 32 }}
          >
            <Icon name="arrow-left" />
            <span>Rời phòng</span>
          </button>

          <div className="exam-info-block" style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: 'var(--primary-soft)', color: 'var(--primary)', textTransform: 'uppercase', flexShrink: 0 }}>
                {isPractice ? 'Luyện tập' : 'Chính thức'}
              </span>
              <h1 className="exam-main-title" title={att.title} style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                {att.title}
              </h1>
            </div>
            <div className="exam-sub-meta" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
              <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>Câu {it.no} / {att.items.length}</span>
              <span className="academic-sep" aria-hidden="true">·</span>
              <span className="tabular-nums">Đã làm: <strong>{answered}</strong>/{att.items.length}</span>
            </div>
          </div>
        </div>

        {/* Center: Prominent Digital Timer (IELTS Focus) */}
        <div className="exam-top-center" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {remaining !== null && !isPractice ? (
            <div
              className={`exam-countdown-timer ${remaining < 5 * 60000 ? 'is-urgent' : ''}`}
              title="Thời gian làm bài còn lại"
              style={{
                fontSize: 16,
                fontWeight: 800,
                padding: '5px 14px',
                borderRadius: 8,
                letterSpacing: '0.04em',
                background: remaining < 5 * 60000 ? '#fef2f2' : 'var(--surface-subtle)',
                color: remaining < 5 * 60000 ? '#b91c1c' : 'var(--ink)',
                border: remaining < 5 * 60000 ? '1px solid #fca5a5' : '1px solid var(--line)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="clock" />
              <span className="timer-digits tabular-nums">{fmtClock(remaining)}</span>
            </div>
          ) : (
            <div
              className="exam-countdown-timer"
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: '5px 12px',
                borderRadius: 8,
                color: 'var(--ink-2)',
                background: 'var(--surface-subtle)',
                border: '1px solid var(--line)',
              }}
            >
              <span>⏱ Luyện tập tự do</span>
            </div>
          )}
        </div>

        {/* Right: Actions & Tools */}
        <div className="exam-top-right" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          {/* Cloud Auto-save Status Chip */}
          <span className={`exam-save-status ${saveState === 'offline' ? 'is-offline' : saveState === 'saving' ? 'is-saving' : 'is-saved'}`} role="status" style={{ fontSize: 11, padding: '3px 7px' }}>
            <span className="save-dot" aria-hidden="true" />
            <span>{saveState === 'offline' ? 'Mất mạng' : saveState === 'saving' ? 'Đang lưu…' : 'Đã lưu'}</span>
          </span>

          {/* Anti-Cheat Proctoring Status if active */}
          {tabSwitchCount > 0 && (
            <span
              className="tabular-nums"
              style={{
                padding: '3px 8px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 700,
                background: '#fef2f2',
                color: '#b91c1c',
                border: '1px solid #fecaca',
              }}
              title="Cảnh báo: Bạn đã rời khỏi cửa sổ thi"
            >
              🛡 {tabSwitchCount} rời tab
            </span>
          )}

          {/* Interactive Scratchpad Tool Button */}
          <button
            type="button"
            className={`exam-tool-chip-btn ${scratchpadOpen ? 'is-active' : ''}`}
            onClick={() => setScratchpadOpen(!scratchpadOpen)}
            title="Mở bảng nháp điện tử (Phím N)"
            style={{ fontSize: 12, padding: '4px 10px', minHeight: 32 }}
          >
            <span aria-hidden="true">✏️</span>
            <span className="chip-label">Nháp</span>
          </button>

          {/* Shortcuts Guide Button */}
          <button
            type="button"
            className="exam-tool-chip-btn"
            onClick={() => setShortcutsOpen(true)}
            title="Phím tắt làm bài (?)"
            style={{ fontSize: 12, padding: '4px 8px', minHeight: 32 }}
          >
            <span>?</span>
          </button>

          {/* Palette toggle button */}
          <button
            type="button"
            className={`exam-palette-toggle-btn ${paletteOpen ? 'active' : ''}`}
            onClick={() => setPaletteOpen(!paletteOpen)}
            title="Bật/Tắt bảng câu hỏi"
            style={{ fontSize: 12, padding: '4px 10px', minHeight: 32 }}
          >
            <span aria-hidden="true">📋</span>
            <span className="toggle-label tabular-nums">{answered}/{att.items.length}</span>
          </button>

          {/* Submit Action Button */}
          <button
            type="button"
            className="exam-submit-primary-btn"
            onClick={() => setConfirm(true)}
            style={{ fontWeight: 700, padding: '6px 16px', minHeight: 32, fontSize: 12.5 }}
          >
            {isPractice ? 'Kết thúc' : 'Nộp bài'}
          </button>
        </div>
      </header>

      {/* 2. Main Focus Exam Workspace */}
      <div className="exam-focus-workspace">
        {/* Left / Center Viewport: Question Card */}
        <main className="exam-question-viewport">
          <div className="card exam-question-card">
            {/* Question Header Bar */}
            <div className="exam-card-nav-row">
              <div className="question-identity">
                <span className="question-order-badge">Câu {it.no}</span>
                <span className="academic-sep" aria-hidden="true">·</span>
                <span className="question-type-label">
                  {it.type === 'mcq' ? 'Trắc nghiệm 4 lựa chọn' : it.type === 'tf' ? 'Đúng / Sai' : 'Trả lời ngắn'}
                </span>
                {it.topic && (
                  <>
                    <span className="academic-sep" aria-hidden="true">·</span>
                    <span className="question-topic-label">{it.topic}</span>
                  </>
                )}
              </div>

              {!isPractice && (
                <button
                  type="button"
                  className={`exam-flag-btn ${flags[it.qid] ? 'is-flagged' : ''}`}
                  onClick={() => toggleFlag(it.qid)}
                >
                  <span>{flags[it.qid] ? '★ Đã gắn cờ' : '☆ Đánh dấu xem lại'}</span>
                </button>
              )}
            </div>

            {/* Question Body Rendering */}
            <div className="exam-question-content">
              <QuestionView
                item={it}
                response={responses[it.qid]}
                onChange={review ? undefined : (v) => setAnswer(it.qid, v)}
                review={review}
                eliminatedOptions={eliminations[it.qid]}
                onToggleEliminate={(idx) => toggleEliminate(it.qid, idx)}
                onZoomImage={(url) => setZoomImageUrl(url)}
              />
            </div>

            {/* Navigation & Action Bottom Row */}
            <div className="exam-card-action-bar">
              <button
                type="button"
                className="btn secondary-btn"
                disabled={cur === 0}
                onClick={() => goTo(cur - 1)}
              >
                ← Câu trước
              </button>

              <div className="action-bar-center-tip">
                <span className="kbd-shortcut-hint">
                  Mẹo: <strong>1-4</strong> chọn đáp án · <strong>← →</strong> chuyển câu · <strong>X</strong> gạch loại trừ · <strong>N</strong> nháp · <strong>Z</strong> phóng to hình
                </span>
              </div>

              {isPractice && !review ? (
                <button
                  type="button"
                  className="btn primary"
                  disabled={!isAnswered(it.type, responses[it.qid]) || checking}
                  onClick={check}
                >
                  {checking ? 'Đang chấm…' : 'Kiểm tra ngay'}
                </button>
              ) : cur < att.items.length - 1 ? (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => goTo(cur + 1)}
                >
                  Câu tiếp →
                </button>
              ) : (
                <button
                  type="button"
                  className="btn good"
                  onClick={() => setConfirm(true)}
                >
                  {isPractice ? 'Hoàn thành' : 'Nộp bài'}
                </button>
              )}
            </div>
          </div>
        </main>

        {/* Right Floating / Docked Question Palette */}
        {paletteOpen && (
          <aside className="exam-floating-palette" aria-label="Bảng câu hỏi">
            <div className="palette-header">
              <div className="palette-title-group">
                <h3>Bảng câu hỏi</h3>
                <span className="palette-count-pill tabular-nums">{answered}/{att.items.length} câu</span>
              </div>
              <button
                type="button"
                className="palette-close-btn"
                onClick={() => setPaletteOpen(false)}
                title="Thu gọn bảng câu hỏi"
              >
                ✕
              </button>
            </div>

            {/* Progress Bar */}
            <div className="palette-progress-wrap">
              <div className="palette-progress-bar" aria-hidden="true">
                <span style={{ width: `${(answered / att.items.length) * 100}%` }} />
              </div>
              <span className="palette-progress-text tabular-nums">
                {Math.round((answered / att.items.length) * 100)}% hoàn thành
              </span>
            </div>

            {/* Questions Grouped by Standard Ministry Format */}
            <div className="palette-parts-container">
              {(['mcq', 'tf', 'short'] as const).map((type) => {
                const list = att.items.map((x, i) => ({ x, i })).filter(({ x }) => x.type === type);
                if (!list.length) return null;
                const partLabel = {
                  mcq: 'Phần I: Trắc nghiệm 4 lựa chọn',
                  tf: 'Phần II: Đúng / Sai',
                  short: 'Phần III: Trả lời ngắn',
                }[type];

                return (
                  <div key={type} className="palette-part-section">
                    <div className="palette-part-title">{partLabel}</div>
                    <div className="palette-grid">
                      {list.map(({ x, i }) => {
                        const c = checks[x.qid];
                        const st = c
                          ? (c.grade?.correct ? 'right' : (c.grade?.points ?? 0) > 0 ? 'half' : 'wrong')
                          : isAnswered(x.type, responses[x.qid])
                          ? 'done'
                          : '';
                        return (
                          <button
                            key={x.qid}
                            type="button"
                            className={`palette-num-btn ${st} ${i === cur ? 'cur' : ''} ${flags[x.qid] ? 'flag' : ''}`}
                            onClick={() => goTo(i)}
                            aria-current={i === cur ? 'step' : undefined}
                            aria-label={`Câu ${x.no}${isAnswered(x.type, responses[x.qid]) ? ', đã làm' : ', chưa làm'}${flags[x.qid] ? ', đã đánh dấu' : ''}`}
                          >
                            <span className="num-text tabular-nums">{x.no}</span>
                            {flags[x.qid] && <span className="flag-star" aria-hidden="true">★</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Palette Legend */}
            <div className="palette-legend">
              <div className="legend-item">
                <span className="legend-box done" />
                <span>Đã làm ({answered})</span>
              </div>
              <div className="legend-item">
                <span className="legend-box unattempted" />
                <span>Chưa làm ({unanswered})</span>
              </div>
              {!isPractice && (
                <div className="legend-item">
                  <span className="legend-box flag" />
                  <span>Xem lại ({Object.values(flags).filter(Boolean).length})</span>
                </div>
              )}
            </div>

            {/* Submit CTA */}
            <button
              type="button"
              className="btn primary palette-submit-btn"
              onClick={() => setConfirm(true)}
              disabled={submitting}
            >
              {isPractice ? 'Kết thúc bài luyện tập' : 'Nộp bài thi'}
            </button>
          </aside>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirm && (
        <Modal title={isPractice ? 'Kết thúc luyện tập?' : 'Xác nhận nộp bài thi?'} onClose={() => setConfirm(false)}>
          <div className="exam-modal-body">
            <Mascot size={64} mood="think" />
            <div className="exam-modal-text">
              {unanswered > 0 ? (
                <p>
                  Bạn vẫn còn <strong className="text-warn">{unanswered} câu</strong> chưa làm.
                  {isPractice ? ' Câu chưa làm sẽ không tính điểm.' : ' Câu bỏ trống sẽ tính 0 điểm.'}
                </p>
              ) : (
                <p>Bạn đã hoàn thành toàn bộ <strong>{att.items.length}/{att.items.length} câu</strong>.</p>
              )}
              {Object.values(flags).some(Boolean) && (
                <p className="modal-flag-note">
                  Có <strong>{Object.values(flags).filter(Boolean).length} câu</strong> bạn đang đánh dấu xem lại.
                </p>
              )}
            </div>
          </div>
          <div className="row end" style={{ gap: 10, marginTop: 16 }}>
            <button type="button" className="btn secondary-btn" onClick={() => setConfirm(false)}>
              Làm tiếp
            </button>
            <button type="button" className="btn primary" disabled={submitting} onClick={() => submit(false)}>
              {submitting ? 'Đang nộp bài…' : isPractice ? 'Xác nhận kết thúc' : 'Xác nhận nộp bài'}
            </button>
          </div>
        </Modal>
      )}

      {/* Electronic Scratchpad */}
      <ExamScratchpad
        currentQid={it.qid}
        isOpen={scratchpadOpen}
        onClose={() => setScratchpadOpen(false)}
      />

      {/* Image Zoom Modal */}
      <ImageZoomModal
        isOpen={Boolean(zoomImageUrl)}
        onClose={() => setZoomImageUrl(null)}
        imageUrl={zoomImageUrl ?? ''}
        title={`Đồ thị / Hình vẽ minh họa - Câu ${it.no}`}
      />

      {/* Shortcuts Cheat Sheet */}
      <ExamShortcutsModal
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        isPractice={isPractice}
      />
    </div>
  );
}
