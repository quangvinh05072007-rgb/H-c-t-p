// Kho chương trình chuẩn: văn bản chương trình → lớp → chuyên đề → yêu cầu cần đạt (YCCĐ) → năng lực.
// Chủ web chuyển văn bản chương trình chính thức thành gói (bên ngoài app) rồi nhập vào; module này chỉ đọc và kiểm tra.
import { TOPIC_BY_CODE } from './topics.mjs';

/** Mạch kiến thức của môn Toán GDPT 2018. */
export const STRANDS = [
  { code: 'DS', name: 'Số và Đại số' },
  { code: 'HH', name: 'Hình học và Đo lường' },
  { code: 'TK', name: 'Thống kê và Xác suất' },
];
/** Năng lực toán học (thành phần năng lực đặc thù trong chương trình môn Toán GDPT 2018). */
export const COMPETENCIES = [
  { code: 'TD', name: 'Tư duy và lập luận toán học' },
  { code: 'MH', name: 'Mô hình hóa toán học' },
  { code: 'GQ', name: 'Giải quyết vấn đề toán học' },
  { code: 'GT', name: 'Giao tiếp toán học' },
  { code: 'CC', name: 'Sử dụng công cụ, phương tiện học toán' },
];
export const CURRICULUM_LIMITS = { outcomes: 1500, text: 1500, content: 200 };
/** Mã YCCĐ: chữ, số, dấu chấm, gạch; tối đa 40 ký tự (vd "10.DS.1.2"). */
export const OUTCOME_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
const str = (v) => (typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v).trim());

/** Nhận mã ("DS") hoặc tên ("Số và Đại số") → mã mạch, không nhận ra thì null. */
export function strandCode(v) {
  const s = str(v);
  if (!s) return null;
  const hit = STRANDS.find((x) => x.code === s.toUpperCase() || fold(x.name) === fold(s));
  return hit ? hit.code : null;
}
/** Nhận mã ("TD") hoặc tên / một phần tên năng lực → mã năng lực. */
export function competencyCode(v) {
  const s = str(v);
  if (!s) return null;
  const f = fold(s);
  const hit = COMPETENCIES.find((x) => x.code === s.toUpperCase() || fold(x.name) === f || (f.length >= 6 && fold(x.name).includes(f.replace(/^nang luc /, ''))));
  return hit ? hit.code : null;
}

/** Danh sách mã YCCĐ gắn cho một câu hỏi: bỏ trùng, bỏ mã sai dạng, tối đa 10. */
export function cleanOutcomeCodes(v) {
  const list = Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? v.split(/[,;\s]+/) : [];
  return [...new Set(list.map(str).filter((c) => OUTCOME_CODE_RE.test(c)))].slice(0, 10);
}

/**
 * Đọc phần "curriculum" của gói.
 * Trả về { value: { name, sourceDoc, note, outcomes[] } | null, errors: [{where,message}], warnings: [] }.
 * YCCĐ lỗi bị bỏ qua từng dòng; thiếu tên chương trình hoặc không còn YCCĐ hợp lệ thì cả chương trình bị bỏ.
 */
export function parseCurriculum(raw) {
  const errors = [];
  const warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value: null, errors: [{ where: 'Chương trình', message: '"curriculum" phải là một đối tượng.' }], warnings };
  const name = str(raw.name).slice(0, 200);
  const sourceDoc = str(raw.sourceDoc ?? raw.source).slice(0, 300);
  const note = str(raw.note).slice(0, 1000);
  const rawOutcomes = Array.isArray(raw.outcomes) ? raw.outcomes : [];
  if (!name) errors.push({ where: 'Chương trình', message: 'thiếu "name" (tên chương trình, vd "Chương trình môn Toán GDPT 2018").' });
  if (!rawOutcomes.length) errors.push({ where: 'Chương trình', message: 'chưa có yêu cầu cần đạt nào trong "outcomes".' });
  if (rawOutcomes.length > CURRICULUM_LIMITS.outcomes) errors.push({ where: 'Chương trình', message: `tối đa ${CURRICULUM_LIMITS.outcomes} yêu cầu cần đạt.` });
  if (errors.length) return { value: null, errors, warnings };
  if (!sourceDoc) warnings.push('Chương trình chưa ghi "sourceDoc" (văn bản gốc, vd số thông tư ban hành).');

  const outcomes = [];
  const seen = new Set();
  let strandMiss = 0;
  let compMiss = 0;
  rawOutcomes.forEach((o, i) => {
    const code = str(o?.code);
    const where = `YCCĐ ${code || `#${i + 1}`}`;
    const problems = [];
    if (!OUTCOME_CODE_RE.test(code)) problems.push('"code" chỉ gồm chữ, số, dấu chấm, gạch (tối đa 40 ký tự)');
    else if (seen.has(code)) problems.push('trùng mã với YCCĐ khác');
    const topic = str(o?.topic);
    const t = TOPIC_BY_CODE[topic];
    if (!t) problems.push(`"topic" không hợp lệ (${topic || 'trống'})`);
    const grade = Number(o?.grade ?? t?.grade);
    if (![10, 11, 12].includes(grade)) problems.push('"grade" phải là 10, 11 hoặc 12');
    else if (t && t.grade !== grade) problems.push(`chuyên đề ${topic} thuộc lớp ${t.grade}, không phải lớp ${grade}`);
    const text = str(o?.text);
    if (!text) problems.push('thiếu "text" (nguyên văn yêu cầu cần đạt)');
    if (text.length > CURRICULUM_LIMITS.text) problems.push('"text" quá dài');
    const content = str(o?.content).slice(0, CURRICULUM_LIMITS.content);
    let strand = null;
    if (str(o?.strand)) {
      strand = strandCode(o.strand);
      if (!strand) strandMiss++;
    }
    const comps = [];
    for (const c of Array.isArray(o?.competencies) ? o.competencies : []) {
      const k = competencyCode(c);
      if (k) comps.includes(k) || comps.push(k);
      else compMiss++;
    }
    if (code) seen.add(code);
    if (problems.length) return errors.push({ where, message: problems.join('; ') + '.' });
    outcomes.push({ code, grade, topic, strand, content, text, competencies: comps });
  });
  if (strandMiss) warnings.push(`${strandMiss} YCCĐ ghi mạch kiến thức không nhận ra (chỉ nhận ${STRANDS.map((s) => s.code).join(', ')}): đã bỏ trống mạch.`);
  if (compMiss) warnings.push(`${compMiss} năng lực không nhận ra (chỉ nhận ${COMPETENCIES.map((c) => c.code).join(', ')}): đã bỏ qua.`);
  if (!outcomes.length) return { value: null, errors, warnings };
  return { value: { name, sourceDoc, note, outcomes }, errors, warnings };
}

/** So sánh hai bộ YCCĐ theo mã: thêm mới, bỏ đi, đổi nội dung. */
export function diffOutcomes(from, to) {
  const a = new Map(from.map((o) => [o.code, o]));
  const b = new Map(to.map((o) => [o.code, o]));
  const sig = (o) => JSON.stringify([o.grade, o.topic, o.strand ?? null, o.content ?? '', o.text, [...(o.competencies ?? [])].sort()]);
  return {
    added: [...b.keys()].filter((k) => !a.has(k)),
    removed: [...a.keys()].filter((k) => !b.has(k)),
    changed: [...b.keys()].filter((k) => a.has(k) && sig(a.get(k)) !== sig(b.get(k))),
  };
}
