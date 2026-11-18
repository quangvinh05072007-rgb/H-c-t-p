import { useMemo, useState } from 'react';
import { BookMarked, ChevronRight, CircleAlert, Flame, Lightbulb, MessageSquareWarning, Target, TrendingUp, TriangleAlert } from 'lucide-react';
import { get, post } from '../../api';
import { ErrorBox, fmtDate, fmtDateTime, fmtScore, go, Loading, scoreColor, useApp, useAsync } from '../../ui/kit';

type ScorePoint = { id: number; at: number; score10: number; type: string; title: string };
type HistoryRow = { id: number; title: string; type: string; className: string | null; at: number; score10: number | null; hidden: boolean; questions: number };
type Insight = { key: string; tone: 'bad' | 'warn' | 'info' | 'good'; title: string; body: string; action?: { kind: 'topic' | 'notebook' | 'practice'; topic?: string } };
type TopicCell = { code: string; grade: number; name: string; n: number; value: number | null; band: 'weak' | 'ok' | 'strong' | null };
type Profile = {
  summary: { done: number; avg10: number | null; best: number | null; streak: { current: number; longest: number }; reviewDue: number; appealsOpen: number };
  target: number | null;
  forecast: { score: number; low: number; high: number } | null;
  scores: ScorePoint[];
  history: HistoryRow[];
  topics: TopicCell[];
  errors: { type: string; label: string; n: number }[];
  insights: Insight[];
};

const TYPE_LABEL: Record<string, string> = { assignment: 'Bài giao', timed: 'Thi thật', practice: 'Luyện tập', mock: 'Thi thử THPT' };
const TYPE_CLASS: Record<string, string> = { assignment: 'is-sky', timed: 'is-rose', practice: 'is-green', mock: 'is-amber' };
const ICON = { bad: TriangleAlert, warn: CircleAlert, info: Lightbulb, good: TrendingUp } as const;

export function StudentProfile() {
  const { toast } = useApp();
  const { data, error, loading, reload } = useAsync(() => get<Profile>('/api/student/profile'), []);
  const [filter, setFilter] = useState<string>('all');
  const [busy, setBusy] = useState(false);

  const history = useMemo(() => (data?.history ?? []).filter((h) => filter === 'all' || h.type === filter), [data, filter]);
  if (loading) return <Loading text="Đang mở hồ sơ…" />;
  if (error || !data) return <ErrorBox error={error ?? 'Không mở được hồ sơ.'} onRetry={reload} />;

  const practiceTopic = async (topic?: string) => {
    setBusy(true);
    try {
      const a = await post<any>('/api/practice/start', topic ? { mode: 'topic', topics: [topic], count: 8 } : { mode: 'weak', count: 10 });
      go(`/thi/${a.id}`);
    } catch (e: any) {
      toast(e.message);
      setBusy(false);
    }
  };
  const runAction = (a?: Insight['action']) => {
    if (!a) return;
    if (a.kind === 'notebook') go('/so-tay-loi-sai');
    else if (a.kind === 'topic') go(`/tu-hoc?chuyen-de=${encodeURIComponent(a.topic ?? '')}`);
    else practiceTopic();
  };
  const actionLabel = (a?: Insight['action']) => (!a ? null : a.kind === 'notebook' ? 'Mở Sổ tay lỗi sai' : a.kind === 'topic' ? 'Học chuyên đề này' : 'Luyện 10 câu');
  const s = data.summary;
  const typesPresent = Array.from(new Set(data.history.map((h) => h.type)));

  return (
    <div className="su-page">
      <header className="su-head">
        <div>
          <h1>Hồ sơ học tập</h1>
          <p className="su-sub">Theo dõi tiến bộ, nhận ra vấn đề sớm</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={() => go('/tien-bo')}>
            <BookMarked size={15} aria-hidden="true" /> Câu cần ôn{s.reviewDue ? ` (${s.reviewDue})` : ''}
          </button>
          <button type="button" className="btn" onClick={() => go('/khieu-nai')}>
            <MessageSquareWarning size={15} aria-hidden="true" /> Khiếu nại{s.appealsOpen ? ` (${s.appealsOpen})` : ''}
          </button>
        </div>
      </header>

      <div className="pf-stats">
        <div className="pf-stat">
          <span>Điểm TB 10 bài gần nhất</span>
          <b style={{ color: scoreColor(s.avg10) }}>{s.avg10 === null ? '—' : fmtScore(s.avg10)}</b>
        </div>
        <div className="pf-stat">
          <span>Cao nhất</span>
          <b style={{ color: scoreColor(s.best) }}>{s.best === null ? '—' : fmtScore(s.best)}</b>
        </div>
        <div className="pf-stat">
          <span><Target size={13} aria-hidden="true" /> Mục tiêu · dự báo</span>
          <b>
            {data.target ? fmtScore(data.target) : '—'}
            <small> · {data.forecast ? fmtScore(data.forecast.score) : 'chưa đủ bài'}</small>
          </b>
        </div>
        <div className="pf-stat">
          <span><Flame size={13} aria-hidden="true" /> Chuỗi ngày học</span>
          <b>{s.streak.current}<small> ngày · dài nhất {s.streak.longest}</small></b>
        </div>
        <div className="pf-stat">
          <span>Bài đã làm</span>
          <b>{s.done}</b>
        </div>
      </div>

      <div className="pf-top">
        <section className="su-card" aria-label="Xu hướng điểm">
          <div className="su-card-head">
            <h2>Xu hướng điểm</h2>
            <span className="su-row-meta" style={{ margin: 0 }}>{data.scores.length} bài có điểm</span>
          </div>
          <ScoreChart points={data.scores} target={data.target} />
        </section>

        <section className="su-card" aria-label="Vấn đề đang gặp">
          <div className="su-card-head"><h2>Vấn đề đang gặp</h2></div>
          <div className="pf-insights">
            {data.insights.map((it) => {
              const I = ICON[it.tone];
              const label = actionLabel(it.action);
              return (
                <div key={it.key} className={`pf-insight is-${it.tone}`}>
                  <div className="pf-insight-icon"><I size={16} aria-hidden="true" /></div>
                  <div style={{ minWidth: 0 }}>
                    <strong>{it.title}</strong>
                    <p>{it.body}</p>
                    {label && (
                      <button type="button" className="su-link" disabled={busy} onClick={() => runAction(it.action)}>{label} →</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="su-card" aria-label="Bản đồ chuyên đề">
        <div className="su-card-head">
          <h2>Bản đồ chuyên đề</h2>
          <div className="pf-legend" aria-hidden="true">
            <span><i className="is-weak" />Dưới 50%</span>
            <span><i className="is-ok" />50–75%</span>
            <span><i className="is-strong" />Trên 75%</span>
            <span><i className="is-none" />Chưa đủ dữ liệu</span>
          </div>
        </div>
        {[10, 11, 12].map((g) => (
          <div key={g} className="pf-grade">
            <div className="pf-grade-name">Lớp {g}</div>
            <div className="pf-cells">
              {data.topics.filter((t) => t.grade === g).map((t) => (
                <button
                  key={t.code}
                  type="button"
                  className={`pf-cell is-${t.band ?? 'none'}`}
                  onClick={() => go(`/tu-hoc?chuyen-de=${encodeURIComponent(t.code)}`)}
                  title={t.value === null ? `${t.name}: ${t.n ? `mới ${t.n} câu, cần thêm để đánh giá` : 'chưa làm câu nào'}` : `${t.name}: đúng ${Math.round(t.value * 100)}% (${t.n} câu)`}
                >
                  <span className="pf-cell-name">{t.name}</span>
                  <span className="pf-cell-val">{t.value === null ? (t.n ? `${t.n} câu` : '—') : `${Math.round(t.value * 100)}%`}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="pf-bottom">
        <section className="su-card" aria-label="Lịch sử làm bài">
          <div className="su-card-head">
            <h2>Lịch sử làm bài</h2>
            <div className="seg" role="group" aria-label="Lọc loại bài">
              <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>Tất cả</button>
              {typesPresent.map((t) => (
                <button key={t} type="button" className={filter === t ? 'on' : ''} onClick={() => setFilter(t)}>{TYPE_LABEL[t] ?? t}</button>
              ))}
            </div>
          </div>
          {history.length === 0 ? (
            <div className="su-empty">Chưa có bài nào.</div>
          ) : (
            <div className="su-list">
              {history.map((h) => (
                <a key={h.id} className="pf-row" href={`#/ket-qua/${h.id}`}>
                  <span className={`ex-card-cat ${TYPE_CLASS[h.type] ?? ''}`}>{TYPE_LABEL[h.type] ?? h.type}</span>
                  <span className="pf-row-main">
                    <span className="pf-row-title">{h.title}</span>
                    <span className="pf-row-meta">{fmtDateTime(h.at)}{h.className ? ` · Lớp ${h.className}` : ''} · {h.questions} câu</span>
                  </span>
                  <b className="pf-row-score" style={{ color: scoreColor(h.score10) }}>{h.hidden ? 'Chờ điểm' : h.score10 === null ? '—' : fmtScore(h.score10)}</b>
                  <ChevronRight size={16} aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
        </section>

        <section className="su-card" aria-label="Kiểu lỗi 30 ngày">
          <div className="su-card-head"><h2>Kiểu lỗi · 30 ngày</h2></div>
          {data.errors.length === 0 ? (
            <div className="su-row-meta">Chưa ghi nhận lỗi nào.</div>
          ) : (
            <div className="su-list">
              {data.errors.map((e) => (
                <div key={e.type} style={{ padding: '7px 0' }}>
                  <div className="su-topic-foot">
                    <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{e.label}</span>
                    <b style={{ color: 'var(--ink)' }}>{e.n} câu</b>
                  </div>
                  <div className="su-bar" style={{ marginTop: 6 }}>
                    <span style={{ width: `${(e.n / data.errors[0].n) * 100}%`, background: 'var(--violet)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** Đường điểm theo thời gian (một chuỗi), có đường mục tiêu và chú thích khi rê chuột. */
function ScoreChart({ points, target }: { points: ScorePoint[]; target: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) {
    return <div className="su-empty" style={{ padding: '28px 0' }}>Cần ít nhất 2 bài có điểm để vẽ xu hướng.</div>;
  }
  const W = 560;
  const H = 210;
  const pad = { l: 30, r: 14, t: 12, b: 26 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / 10) * ih;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.score10).toFixed(1)}`).join(' ');
  const hp = hover !== null ? points[hover] : null;
  return (
    <div className="pf-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Điểm ${points.length} bài gần nhất, từ ${fmtScore(points[0].score10)} đến ${fmtScore(points[points.length - 1].score10)}`}
        onMouseLeave={() => setHover(null)}>
        {[0, 2.5, 5, 7.5, 10].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="pf-grid" />
            <text x={pad.l - 6} y={y(v) + 4} className="pf-axis" textAnchor="end">{v.toLocaleString('vi-VN')}</text>
          </g>
        ))}
        {target ? (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} className="pf-target" />
            <text x={W - pad.r} y={y(target) - 5} className="pf-axis" textAnchor="end">Mục tiêu {fmtScore(target)}</text>
          </g>
        ) : null}
        <path d={path} className="pf-line" />
        {hp && <line x1={x(hover!)} x2={x(hover!)} y1={pad.t} y2={pad.t + ih} className="pf-cross" />}
        {points.map((p, i) => (
          <circle key={p.id} cx={x(i)} cy={y(p.score10)} r={hover === i ? 6 : 4.5} className="pf-dot" />
        ))}
        <text x={pad.l} y={H - 6} className="pf-axis">{fmtDate(points[0].at)}</text>
        <text x={W - pad.r} y={H - 6} className="pf-axis" textAnchor="end">{fmtDate(points[points.length - 1].at)}</text>
        {/* Vùng bắt chuột rộng hơn chấm điểm */}
        {points.map((p, i) => (
          <rect key={`h${p.id}`} x={x(i) - iw / points.length / 2} y={pad.t} width={Math.max(10, iw / points.length)} height={ih} fill="transparent"
            onMouseEnter={() => setHover(i)} onClick={() => go(`/ket-qua/${p.id}`)} style={{ cursor: 'pointer' }} />
        ))}
      </svg>
      {hp && (
        <div className="pf-tip" style={{ left: `${(x(hover!) / W) * 100}%` }}>
          <b>{fmtScore(hp.score10)}</b> · {TYPE_LABEL[hp.type] ?? hp.type}
          <div>{hp.title}</div>
          <small>{fmtDateTime(hp.at)}</small>
        </div>
      )}
    </div>
  );
}
