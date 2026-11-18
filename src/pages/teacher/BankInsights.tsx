import { useMemo, useState } from 'react';
import { get, post } from '../../api';
import { ErrorBox, go, Loading, topicName, useApp, useAsync } from '../../ui/kit';
import { MathText } from '../../ui/MathText';
import { BankSectionTabs } from '../../ui/TeacherNavBars';

const TYPE_SHORT: Record<string, string> = { mcq: 'TN', tf: 'Đ/S', short: 'TLN' };
const TYPE_LABEL: Record<string, string> = { mcq: 'trắc nghiệm', tf: 'đúng/sai', short: 'trả lời ngắn' };
const LEVEL_LABEL: Record<number, string> = { 1: 'Biết', 2: 'Hiểu', 3: 'Vận dụng' };

/** Mức tô theo số câu trong ô: 0 đỏ, 1–2 vàng, ≥3 xanh. */
function tone(n: number) {
  return n === 0 ? 'is-zero' : n < 3 ? 'is-low' : 'is-ok';
}

/** Độ phủ: bảng chuyên đề × mức độ × loại câu, và số đề thi thử ghép được. */
export function BankCoverage() {
  const { data, error, loading, reload } = useAsync(() => get<any>('/api/bank/coverage'), []);
  const [grade, setGrade] = useState<number | 'all'>(12);
  const topics = useMemo(() => (data?.topics ?? []).filter((t: any) => grade === 'all' || t.grade === grade), [data, grade]);

  return (
    <div className="su-page">
      <BankSectionTabs active="coverage" />
      <header className="su-head">
        <div>
          <h1>Độ phủ ngân hàng</h1>
          <p className="su-sub">Số câu đã duyệt theo chuyên đề, mức độ và loại câu. Ô đỏ là chỗ cần bổ sung khi soạn gói nhập tiếp theo.</p>
        </div>
        <select className="su-select" value={grade} onChange={(e) => setGrade(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label="Khối lớp">
          <option value={12}>Lớp 12</option>
          <option value={11}>Lớp 11</option>
          <option value={10}>Lớp 10</option>
          <option value="all">Cả 3 khối</option>
        </select>
      </header>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : (
        <>
          <div className="su-stats">
            <span className={`su-stat ${data.mockExams > 0 ? 'is-good' : 'is-warn'}`} title="Đề 12 trắc nghiệm + 4 đúng/sai + 6 trả lời ngắn, không lặp câu giữa các đề">
              Ghép được <b>{data.mockExams}</b> đề thi thử không trùng câu
            </span>
            {(['mcq', 'tf', 'short'] as const).map((ty) => (
              <span key={ty} className="su-stat">
                {TYPE_LABEL[ty]} <b>{data.byType[ty]}</b>
              </span>
            ))}
            {data.thin.length > 0 && <span className="su-stat is-warn">Chuyên đề dưới 6 câu <b>{data.thin.length}</b></span>}
          </div>

          <section className="su-card" style={{ overflowX: 'auto' }} aria-label="Bảng độ phủ">
            <table className="su-cov">
              <thead>
                <tr>
                  <th rowSpan={2} style={{ textAlign: 'left' }}>Chuyên đề</th>
                  {[1, 2, 3].map((lv) => (
                    <th key={lv} colSpan={3}>{LEVEL_LABEL[lv]}</th>
                  ))}
                  <th rowSpan={2}>Tổng</th>
                </tr>
                <tr>
                  {[1, 2, 3].flatMap((lv) => (['mcq', 'tf', 'short'] as const).map((ty) => <th key={`${lv}${ty}`} className="su-cov-sub">{TYPE_SHORT[ty]}</th>))}
                </tr>
              </thead>
              <tbody>
                {topics.map((t: any) => (
                  <tr key={t.code}>
                    <th style={{ textAlign: 'left', fontWeight: 600 }}>
                      <button type="button" className="su-link" style={{ fontWeight: 600, color: 'var(--ink)' }} onClick={() => go(`/ngan-hang?topic=${t.code}`)}>
                        {t.name}
                      </button>
                    </th>
                    {[1, 2, 3].flatMap((lv) =>
                      (['mcq', 'tf', 'short'] as const).map((ty) => (
                        <td key={`${lv}${ty}`} className={`su-cov-cell ${tone(t.levels[lv][ty])}`}>{t.levels[lv][ty]}</td>
                      )),
                    )}
                    <td className="su-cov-total">{t.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <p className="su-row-meta">TN: trắc nghiệm · Đ/S: đúng/sai · TLN: trả lời ngắn. Chỉ tính câu đã duyệt.</p>
        </>
      )}
    </div>
  );
}

const ISSUE_TONE: Record<string, string> = {
  'wrong-key': 'is-bad',
  hard: 'is-bad',
  'distractor-wins': 'is-bad',
  incomplete: 'is-warn',
  duplicate: 'is-warn',
  unsure: 'is-warn',
  dead: '',
  easy: '',
};
const ISSUE_FILTERS: [string, string][] = [
  ['all', 'Tất cả'],
  ['wrong-key', 'Nghi sai đáp án'],
  ['hard', 'Quá khó'],
  ['distractor-wins', 'Nhiễu thắng đáp án'],
  ['duplicate', 'Trùng câu'],
  ['unsure', 'Nhiều em phân vân'],
  ['dead', 'Nhiễu không ai chọn'],
  ['easy', 'Quá dễ'],
  ['incomplete', 'Thiếu thông tin'],
];

/** Câu cần sửa: nhãn tự động gom từ mọi lần câu được dùng trong bài làm của học sinh. */
export function BankQuality() {
  const { meta, toast } = useApp();
  const { data, error, loading, reload } = useAsync(() => get<any>('/api/bank/quality'), []);
  const [filter, setFilter] = useState('all');
  const list = (data?.questions ?? []).filter((q: any) => filter === 'all' || q.issues.some((i: any) => i.code === filter));

  const archive = async (id: number) => {
    if (!confirm(`Ẩn câu #${id} khỏi ngân hàng? Đề đã dùng câu này vẫn giữ nguyên.`)) return;
    try {
      await post('/api/questions/archive', { ids: [id] });
      toast(`Đã ẩn câu #${id}.`);
      reload();
    } catch (e: any) {
      toast(e.message);
    }
  };

  return (
    <div className="su-page">
      <BankSectionTabs active="quality" />
      <header className="su-head">
        <div>
          <h1>Câu cần sửa</h1>
          <p className="su-sub">
            App gom kết quả {data ? `từ ${data.analysedAttempts} bài làm đã nộp` : 'từ mọi bài làm'} và gắn nhãn tự động. Sửa hoặc ẩn từng câu.
          </p>
        </div>
      </header>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : (
        <>
          <div className="su-filterbar">
            <div className="su-pills" role="group" aria-label="Lọc theo vấn đề">
              {ISSUE_FILTERS.filter(([k]) => k === 'all' || data.counts[k]).map(([k, label]) => (
                <button key={k} type="button" className={`su-pill ${filter === k ? 'on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {label} {k === 'all' ? data.questions.length : data.counts[k]}
                </button>
              ))}
            </div>
          </div>
          {list.length === 0 ? (
            <div className="su-card su-empty">
              {data.questions.length === 0 ? 'Chưa phát hiện câu nào cần sửa. Nhãn sẽ xuất hiện khi câu được dùng trong các bài kiểm tra.' : 'Không có câu nào trong mục này.'}
            </div>
          ) : (
            <section className="su-card su-bank-list" aria-label="Danh sách câu cần sửa">
              {list.map((q: any) => (
                <div key={q.id} className="su-bank-row" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                  <div className="su-row-main">
                    <div className="su-bank-stem"><MathText text={String(q.stem).replace(/\[\[img:\d+\]\]/g, '[hình]').replace(/\s+/g, ' ')} /></div>
                    <div className="su-row-meta">
                      <span className="tabular-nums">#{q.id}</span>
                      <span>{topicName(meta, q.topic)}</span>
                      <span>· {LEVEL_LABEL[q.level] ?? q.level}</span>
                      {q.uses > 0 && <span>· {q.uses} lượt làm, tỉ lệ điểm {Math.round((q.p ?? 0) * 100)}%</span>}
                    </div>
                    <div className="su-row-meta" style={{ marginTop: 6 }}>
                      {q.issues.map((i: any) => (
                        <span key={i.code} className={`su-chip ${ISSUE_TONE[i.code] ?? ''}`}>{i.label}</span>
                      ))}
                    </div>
                  </div>
                  <div className="su-bank-actions" style={{ display: 'flex' }}>
                    <button type="button" className="btn sm" onClick={() => go(`/ngan-hang?edit=${q.id}`)}>Sửa</button>
                    <button type="button" className="btn ghost sm" onClick={() => archive(q.id)}>Ẩn</button>
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
