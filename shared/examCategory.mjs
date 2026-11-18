// Loại đề thi: giáo viên chọn khi soạn/nhập đề; đề cũ chưa chọn thì đoán theo tên và thời gian.
export const EXAM_CATEGORIES = [
  { code: 'giua-ky', label: 'Giữa kỳ', short: 'Giữa kỳ' },
  { code: 'cuoi-ky', label: 'Cuối kỳ', short: 'Cuối kỳ' },
  { code: 'thpt', label: 'Thi tốt nghiệp THPT', short: 'THPT' },
  { code: 'khao-sat', label: 'Khảo sát · Thi thử', short: 'Thi thử' },
  { code: 'kiem-tra', label: 'Kiểm tra ngắn', short: 'Kiểm tra' },
  { code: 'on-tap', label: 'Ôn tập chuyên đề', short: 'Ôn tập' },
];
export const EXAM_CATEGORY_CODES = EXAM_CATEGORIES.map((c) => c.code);
export const CATEGORY_LABEL = Object.fromEntries(EXAM_CATEGORIES.map((c) => [c.code, c.label]));

/** Chuẩn hóa giá trị người dùng gửi lên: mã hợp lệ hoặc null (để app tự đoán). */
export function cleanCategory(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return EXAM_CATEGORY_CODES.includes(s) ? s : null;
}

/** Đoán loại đề từ tên và thời gian khi giáo viên chưa chọn. */
export function guessCategory(title, durationMin = 90) {
  const t = String(title ?? '').normalize('NFC').toLowerCase();
  if (/giữa\s*(kì|kỳ|ki|ky|hk)|giua\s*k/.test(t)) return 'giua-ky';
  if (/cuối\s*(kì|kỳ|ki|ky|năm|hk)|cuoi\s*k|học\s*kì\s*(i|ii|1|2)\b|học\s*kỳ\s*(i|ii|1|2)\b/.test(t)) return 'cuoi-ky';
  if (/tốt\s*nghiệp|thpt\s*(qg|quốc\s*gia)|minh\s*họa|tham\s*khảo\s*(của\s*)?bộ|bgd/.test(t)) return 'thpt';
  if (/bài\s*tập|về\s*nhà|chuyên\s*đề|luyện/.test(t)) return 'on-tap';
  // "khảo sát hàm số" là tên chuyên đề, không phải đề khảo sát
  if (/khảo\s*sát(?!\s*(và\s*vẽ\s*)?(đồ\s*thị\s*)?hàm)|thi\s*thử|(?:^|\s)sở(?:\s|$)|trường\s*chuyên|tsa|hsa|đánh\s*giá\s*năng\s*lực/.test(t)) return 'khao-sat';
  if (/ôn\s*tập/.test(t)) return 'on-tap';
  if (Number(durationMin) <= 45 || /15\s*phút|45\s*phút|kiểm\s*tra/.test(t)) return 'kiem-tra';
  return Number(durationMin) >= 90 ? 'khao-sat' : 'kiem-tra';
}

export function examCategory(stored, title, durationMin) {
  return cleanCategory(stored) ?? guessCategory(title, durationMin);
}
