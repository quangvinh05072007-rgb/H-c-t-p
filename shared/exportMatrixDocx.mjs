// Ma trận đề kiểm tra và Bản đặc tả (Word) theo cấu trúc đề Toán từ 2025:
// Phần I trắc nghiệm, Phần II đúng/sai, Phần III trả lời ngắn × 3 mức độ (Biết, Hiểu, Vận dụng).
import { buildDocx, paragraph, table, pageBreak } from './docx.mjs';
import { TOPIC_BY_CODE } from './topics.mjs';

const PART_OF = { mcq: 'I', tf: 'II', short: 'III' };
const POINTS = { mcq: 0.25, tf: 1, short: 0.5 };
const LEVEL = { 1: 'Biết', 2: 'Hiểu', 3: 'Vận dụng' };

function fmt(n) {
  return (Math.round(n * 100) / 100).toString().replace('.', ',');
}

/**
 * Số thứ tự câu trên đề gốc (đánh số riêng từng phần như đề Bộ: Câu 1… của Phần I, Câu 1… của Phần II, …).
 * items: [{ qid, type, topic, level }] theo thứ tự đề gốc.
 */
export function numberItems(items) {
  const counter = { I: 0, II: 0, III: 0 };
  return items.map((it) => {
    const part = PART_OF[it.type];
    counter[part]++;
    return { ...it, part, no: counter[part] };
  });
}

/**
 * Dữ liệu ma trận: mỗi chủ đề × phần × mức độ → danh sách số câu; kèm tổng và tỉ lệ điểm.
 * objectives: { [topic]: string[] } (yêu cầu cần đạt nếu trường đã nhập bài học; có thể rỗng).
 */
export function matrixData(items, objectives = {}) {
  const numbered = numberItems(items);
  const topics = [];
  const byTopic = {};
  for (const it of numbered) {
    if (!byTopic[it.topic]) {
      byTopic[it.topic] = { topic: it.topic, name: TOPIC_BY_CODE[it.topic]?.name ?? it.topic, grade: TOPIC_BY_CODE[it.topic]?.grade ?? null, cells: {}, points: 0, count: 0 };
      topics.push(byTopic[it.topic]);
    }
    const t = byTopic[it.topic];
    const key = `${it.part}|${it.level}`;
    (t.cells[key] ??= []).push(it.no);
    t.points += POINTS[it.type] ?? 0;
    t.count++;
  }
  const total = topics.reduce((s, t) => s + t.points, 0) || 1;
  for (const t of topics) {
    t.pct = (t.points / total) * 100;
    t.objectives = objectives[t.topic] ?? [];
  }
  const colTotals = {};
  for (const p of ['I', 'II', 'III']) for (const l of [1, 2, 3]) colTotals[`${p}|${l}`] = topics.reduce((s, t) => s + (t.cells[`${p}|${l}`]?.length ?? 0), 0);
  const levelPoints = { 1: 0, 2: 0, 3: 0 };
  for (const it of numbered) levelPoints[it.level] += POINTS[it.type] ?? 0;
  return { topics, colTotals, levelPoints, totalPoints: total, count: numbered.length };
}

export async function exportMatrixDocx(exam, items, objectives = {}) {
  const m = matrixData(items, objectives);
  const cell = (nos) => (nos?.length ? `${nos.length} (C${nos.join(', C')})` : '');
  const header = ['TT', 'Chủ đề', 'I · Biết', 'I · Hiểu', 'I · VD', 'II · Biết', 'II · Hiểu', 'II · VD', 'III · Biết', 'III · Hiểu', 'III · VD', 'Số câu', 'Điểm', 'Tỉ lệ'];
  const rows = [header];
  m.topics.forEach((t, i) => {
    rows.push([
      String(i + 1),
      t.name,
      ...['I', 'II', 'III'].flatMap((p) => [1, 2, 3].map((l) => cell(t.cells[`${p}|${l}`]))),
      String(t.count),
      fmt(t.points),
      `${fmt(t.pct)}%`,
    ]);
  });
  rows.push(['', 'Tổng số câu', ...['I', 'II', 'III'].flatMap((p) => [1, 2, 3].map((l) => String(m.colTotals[`${p}|${l}`] || ''))), String(m.count), fmt(m.totalPoints), '100%']);

  const spec = [['TT', 'Chủ đề', 'Mức độ', 'Yêu cầu cần đạt', 'Câu hỏi']];
  let k = 0;
  for (const t of m.topics) {
    for (const l of [1, 2, 3]) {
      const nos = ['I', 'II', 'III'].flatMap((p) => (t.cells[`${p}|${l}`] ?? []).map((n) => `Phần ${p} – C${n}`));
      if (!nos.length) continue;
      k++;
      spec.push([String(k), t.name, LEVEL[l], t.objectives.length ? t.objectives.join('; ') : '', nos.join('; ')]);
    }
  }

  const blocks = [
    paragraph(exam.school ?? '', { bold: true, align: 'center', spaceAfter: 0 }),
    paragraph('MA TRẬN ĐỀ KIỂM TRA', { bold: true, size: 15, align: 'center', spaceAfter: 40 }),
    paragraph(`${exam.title} · Thời gian ${exam.durationMin} phút · ${m.count} câu`, { align: 'center', italic: true, spaceAfter: 160 }),
    table(rows),
    paragraph(
      `Phân bố điểm theo mức độ: Biết ${fmt(m.levelPoints[1])} điểm (${fmt((m.levelPoints[1] / m.totalPoints) * 100)}%) · Hiểu ${fmt(m.levelPoints[2])} điểm (${fmt((m.levelPoints[2] / m.totalPoints) * 100)}%) · Vận dụng ${fmt(m.levelPoints[3])} điểm (${fmt((m.levelPoints[3] / m.totalPoints) * 100)}%).`,
      { spaceAfter: 60 },
    ),
    paragraph('Điểm mỗi câu: Phần I 0,25 điểm; Phần II tối đa 1 điểm (1 ý đúng 0,1; 2 ý 0,25; 3 ý 0,5; 4 ý 1); Phần III 0,5 điểm. C1, C2… là số thứ tự câu trong từng phần của đề gốc.', { italic: true, size: 10 }),
    pageBreak(),
    paragraph('BẢN ĐẶC TẢ ĐỀ KIỂM TRA', { bold: true, size: 15, align: 'center', spaceAfter: 160 }),
    table(spec),
    paragraph('Cột "Yêu cầu cần đạt" lấy từ mục tiêu bài học đã nhập cho chuyên đề; ô trống để giáo viên bổ sung theo chương trình.', { italic: true, size: 10 }),
  ];
  return buildDocx(blocks);
}
