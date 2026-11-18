// Phát hiện "vấn đề đang gặp" của học sinh bằng quy tắc (không dùng AI), cho trang Hồ sơ.
import { TOPIC_BY_CODE, ERROR_TYPES } from './topics.mjs';

const DAY = 86400000;
const pct = (x) => `${Math.round(x * 100)}%`;
const fmt = (x) => (Math.round(x * 100) / 100).toLocaleString('vi-VN');
const TONE_ORDER = { bad: 0, warn: 1, info: 2, good: 3 };
const PART_NAME = { mcq: 'Phần I (trắc nghiệm)', tf: 'Phần II (đúng/sai)', short: 'Phần III (trả lời ngắn)' };

/**
 * @param {object} p
 * @param {{ at: number, score10: number }[]} p.scores bài đã có điểm, theo thời gian tăng dần
 * @param {{ topic: string, score: number, correct: number, error_type: string|null, at: number }[]} p.evidence
 * @param {{ day: string, questions: number }[]} p.activity
 * @param {{ items: { type: string, blank: boolean }[] }[]} p.recentResults kết quả các bài gần nhất (mới trước)
 * @param {number|null} p.target điểm mục tiêu
 * @param {number|null} p.forecast điểm dự báo
 * @param {number} p.reviewDue số câu đến hạn ôn
 * @param {number} p.nowMs
 */
export function buildInsights({ scores = [], evidence = [], activity = [], recentResults = [], target = null, forecast = null, reviewDue = 0, nowMs = Date.now() }) {
  const out = [];

  // 1. Xu hướng điểm: 3 bài gần nhất so với 3 bài trước đó
  if (scores.length >= 4) {
    const last = scores.slice(-3);
    const prev = scores.slice(-6, -3);
    const avg = (a) => a.reduce((s, x) => s + x.score10, 0) / a.length;
    const d = avg(last) - avg(prev);
    if (d <= -0.75) out.push({ key: 'trend-down', tone: 'bad', title: `Điểm đang đi xuống (−${fmt(-d)})`, body: `Trung bình 3 bài gần nhất ${fmt(avg(last))}, thấp hơn 3 bài trước đó (${fmt(avg(prev))}). Xem lại các câu sai mới trong Sổ tay.`, action: { kind: 'notebook' } });
    else if (d >= 0.75) out.push({ key: 'trend-up', tone: 'good', title: `Điểm đang tăng (+${fmt(d)})`, body: `Trung bình 3 bài gần nhất ${fmt(avg(last))}, cao hơn 3 bài trước đó (${fmt(avg(prev))}). Giữ nhịp này.` });
  }

  // 2. Chuyên đề tụt: 14 ngày gần đây so với 15–90 ngày trước (mỗi bên ≥ 4 câu)
  const recentCut = nowMs - 14 * DAY;
  const byTopic = {};
  for (const e of evidence) {
    if (!e.topic || e.at > nowMs || e.at < nowMs - 90 * DAY) continue;
    const t = (byTopic[e.topic] ??= { rs: 0, rn: 0, os: 0, on: 0 });
    if (e.at >= recentCut) { t.rs += e.score; t.rn++; } else { t.os += e.score; t.on++; }
  }
  const drops = Object.entries(byTopic)
    .filter(([, t]) => t.rn >= 4 && t.on >= 4)
    .map(([topic, t]) => ({ topic, now: t.rs / t.rn, before: t.os / t.on }))
    .filter((x) => x.before - x.now >= 0.2)
    .sort((a, b) => b.before - b.now - (a.before - a.now));
  for (const d of drops.slice(0, 2)) {
    out.push({ key: `drop-${d.topic}`, tone: 'bad', title: `${TOPIC_BY_CODE[d.topic]?.name ?? d.topic}: tụt từ ${pct(d.before)} xuống ${pct(d.now)}`, body: 'Trong 2 tuần gần đây em làm chuyên đề này kém hẳn trước. Ôn lại lý thuyết rồi luyện vài câu.', action: { kind: 'topic', topic: d.topic } });
  }

  // 3. Chuyên đề yếu nhất (đủ dữ liệu, đúng dưới 50%) mà chưa nằm trong danh sách tụt
  const overall = Object.entries(byTopic)
    .map(([topic, t]) => ({ topic, n: t.rn + t.on, ratio: (t.rs + t.os) / Math.max(1, t.rn + t.on) }))
    .filter((x) => x.n >= 5 && x.ratio < 0.5 && !drops.some((d) => d.topic === x.topic))
    .sort((a, b) => a.ratio - b.ratio);
  if (overall[0]) {
    const w = overall[0];
    out.push({ key: `weak-${w.topic}`, tone: 'warn', title: `${TOPIC_BY_CODE[w.topic]?.name ?? w.topic}: mới đúng ${pct(w.ratio)}`, body: `Chuyên đề yếu nhất của em (${w.n} câu đã làm). Học lại phần lý thuyết trước khi luyện.`, action: { kind: 'topic', topic: w.topic } });
  }

  // 4. Kiểu lỗi lặp lại trong 30 ngày
  const errs = {};
  for (const e of evidence) if (e.error_type && !e.correct && e.at >= nowMs - 30 * DAY) errs[e.error_type] = (errs[e.error_type] ?? 0) + 1;
  const topErr = Object.entries(errs).sort((a, b) => b[1] - a[1])[0];
  if (topErr && topErr[1] >= 3) {
    const meta = ERROR_TYPES[topErr[0]];
    out.push({ key: `err-${topErr[0]}`, tone: 'warn', title: `Lỗi "${meta?.label ?? topErr[0]}" lặp lại ${topErr[1]} lần`, body: meta?.action ? `${meta.action}.` : meta?.hint ?? '' });
  }

  // 5. Hay bỏ trống
  const blanks = { mcq: 0, tf: 0, short: 0 };
  let blankTotal = 0;
  for (const r of recentResults.slice(0, 5)) for (const it of r.items ?? []) if (it.blank) { blanks[it.type] = (blanks[it.type] ?? 0) + 1; blankTotal++; }
  if (blankTotal >= 3) {
    const part = Object.entries(blanks).sort((a, b) => b[1] - a[1])[0][0];
    out.push({ key: 'blank', tone: 'warn', title: `Bỏ trống ${blankTotal} câu trong ${Math.min(5, recentResults.length)} bài gần nhất`, body: `Nhiều nhất ở ${PART_NAME[part] ?? part}. Đề không trừ điểm câu sai, đừng để trống.` });
  }

  // 6. Khoảng cách tới mục tiêu
  if (target && forecast !== null && forecast !== undefined) {
    const gap = target - forecast;
    if (gap >= 0.5) out.push({ key: 'target', tone: 'info', title: `Dự báo ${fmt(forecast)}, còn thiếu ${fmt(gap)} điểm so với mục tiêu ${fmt(target)}`, body: 'Tập trung vào các chuyên đề yếu ở trên là cách nhanh nhất để lấp khoảng này.' });
    else if (gap <= 0) out.push({ key: 'target', tone: 'good', title: `Đang đạt mục tiêu ${fmt(target)}`, body: `Dự báo hiện tại ${fmt(forecast)}. Có thể nâng mục tiêu lên.` });
  }

  // 7. Lâu chưa học
  const lastDay = activity.filter((a) => a.questions > 0).map((a) => a.day).sort().pop();
  if (lastDay) {
    const days = Math.floor((nowMs - Date.parse(`${lastDay}T00:00:00+07:00`)) / DAY);
    if (days >= 3) out.push({ key: 'idle', tone: 'info', title: `Đã ${days} ngày chưa luyện bài nào`, body: 'Mỗi ngày 10–15 câu giữ kiến thức tốt hơn học dồn.', action: { kind: 'practice' } });
  }

  // 8. Câu đến hạn ôn
  if (reviewDue >= 5) out.push({ key: 'review', tone: 'info', title: `${reviewDue} câu sai đến hạn ôn lại`, body: 'Ôn đúng hạn giúp nhớ lâu và không sai lại.', action: { kind: 'notebook' } });

  if (!out.length) {
    out.push({ key: 'ok', tone: 'good', title: scores.length ? 'Chưa thấy vấn đề đáng lo' : 'Chưa đủ dữ liệu', body: scores.length ? 'Kết quả ổn định. Thử đề khó hơn hoặc thi thật có tính giờ.' : 'Làm vài đề hoặc luyện chuyên đề để app nhận ra điểm mạnh, điểm yếu của em.' });
  }
  return out.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]).slice(0, 5);
}
