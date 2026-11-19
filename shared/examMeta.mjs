// Thông tin tổ chức đề: năm học, khối, học kỳ, kỳ thi, nguồn, ngày thi, thẻ.
// Đề cũ chưa điền thì suy ra (năm học/học kỳ từ ngày tạo, khối từ chuyên đề của các câu).

export const TERMS = [
  { code: 'HK1', label: 'Học kỳ I' },
  { code: 'HK2', label: 'Học kỳ II' },
  { code: 'CN', label: 'Cả năm' },
];
export const TERM_LABEL = Object.fromEntries(TERMS.map((t) => [t.code, t.label]));

/** Năm học Việt Nam bắt đầu tháng 8 (giờ VN): 15/03/2026 → "2025-2026". */
export function schoolYearOf(ms) {
  const d = new Date(Number(ms) + 7 * 3600000);
  const y = d.getUTCFullYear();
  return d.getUTCMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

/** Học kỳ theo tháng: 8–12 → HK1, 1–5 → HK2, 6–7 (hè/ôn thi) → HK2. */
export function termOf(ms) {
  const m = new Date(Number(ms) + 7 * 3600000).getUTCMonth() + 1;
  return m >= 8 ? 'HK1' : 'HK2';
}

/** Khối của đề: khối có nhiều câu nhất (theo mã chuyên đề T10/T11/T12). */
export function gradeFromItems(items) {
  const n = {};
  for (const it of items ?? []) {
    const g = Number(String(it?.topic ?? '').slice(1, 3));
    if ([10, 11, 12].includes(g)) n[g] = (n[g] ?? 0) + 1;
  }
  const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return best ? Number(best[0]) : null;
}

const YEAR_RE = /^(20\d{2})\s*[-–/]\s*(20\d{2})$/;

/**
 * Chuẩn hóa thông tin người dùng gửi lên. Trả { value, errors }: chỉ chứa trường có trong input
 * (để sửa từng phần); chuỗi rỗng / null nghĩa là xóa về "tự suy ra".
 */
export function cleanExamMeta(input = {}) {
  const value = {};
  const errors = [];
  const has = (k) => Object.prototype.hasOwnProperty.call(input, k);
  const str = (v, max) => {
    const s = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
    return s || null;
  };
  if (has('schoolYear')) {
    const s = str(input.schoolYear, 20);
    const m = s?.match(YEAR_RE);
    if (s && (!m || Number(m[2]) !== Number(m[1]) + 1)) errors.push('Năm học viết dạng 2025-2026.');
    else value.schoolYear = m ? `${m[1]}-${m[2]}` : null;
  }
  if (has('grade')) {
    const g = input.grade === '' || input.grade == null ? null : Number(input.grade);
    if (g !== null && ![10, 11, 12].includes(g)) errors.push('Khối phải là 10, 11 hoặc 12.');
    else value.grade = g;
  }
  if (has('term')) {
    const t = str(input.term, 10);
    const code = t ? (TERMS.find((x) => x.code === t.toUpperCase() || x.label.toLowerCase() === t.toLowerCase())?.code ?? null) : null;
    if (t && !code) errors.push('Học kỳ phải là HK1, HK2 hoặc CN.');
    else value.term = code;
  }
  if (has('session')) value.session = str(input.session, 60);
  if (has('source')) value.source = str(input.source, 120);
  if (has('examDate') || has('date')) {
    const d = str(input.examDate ?? input.date, 10);
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) errors.push('Ngày thi viết dạng 2026-03-15.');
    else value.examDate = d;
  }
  if (has('tags')) {
    const list = (Array.isArray(input.tags) ? input.tags : String(input.tags ?? '').split(','))
      .map((t) => String(t).replace(/\s+/g, ' ').trim().slice(0, 30))
      .filter(Boolean);
    value.tags = [...new Set(list)].slice(0, 10);
  }
  return { value, errors };
}

/** Thông tin hiển thị của một đề (đã điền hoặc suy ra), kèm cờ cho biết trường nào do app suy ra. */
export function examMetaView(row) {
  const items = row.items ?? (row.items_json ? JSON.parse(row.items_json) : []);
  const guessedGrade = gradeFromItems(items);
  return {
    schoolYear: row.school_year ?? schoolYearOf(row.exam_date ? Date.parse(row.exam_date) : row.created_at),
    grade: row.grade ?? guessedGrade,
    term: row.term ?? termOf(row.exam_date ? Date.parse(row.exam_date) : row.created_at),
    session: row.session ?? null,
    source: row.source ?? null,
    examDate: row.exam_date ?? null,
    tags: row.tags ?? (row.tags_json ? JSON.parse(row.tags_json) : []),
    guessed: { schoolYear: !row.school_year, grade: row.grade == null, term: !row.term },
  };
}
