// Lấy hình từ file Word gốc gắn vào gói nhập do AI viết: AI chỉ ghi chỗ đặt hình [[image:…]],
// còn hình thật nằm sẵn trong .docx. Ghép theo thứ tự: câu thứ k trong gói ↔ khối "Câu …" thứ k trong Word,
// trong mỗi câu thì hình thứ i ↔ dấu [[image:…]] thứ i (đề bài → phương án → lời giải). Không dùng AI.

const QUESTION_START = /^\s*(?:\*\*)?(?:Câu|Bài|Question)\s*\d+\s*[.:)]/iu;
const IMG_TOKEN = /\[\[img:([^\]]+)\]\]/g;
const PLACEHOLDER = /\[\[image:([^\]\n]+)\]\]/g;

/** Chia văn bản Word (đã có dấu [[img:k]]) thành các khối câu, mỗi khối là danh sách khóa hình theo thứ tự. */
export function docxQuestionBlocks(text) {
  const blocks = [];
  let cur = null;
  for (const line of String(text ?? '').split('\n')) {
    if (QUESTION_START.test(line)) {
      cur = [];
      blocks.push(cur);
    }
    if (!cur) continue; // phần đầu đề (tiêu đề, logo trường) trước câu 1: bỏ qua
    for (const m of line.matchAll(IMG_TOKEN)) cur.push(m[1]);
  }
  return blocks;
}

/**
 * @param {any[]} rawQuestions câu hỏi trong gói (chưa kiểm tra), đúng thứ tự trong đề
 * @param {string} docxText văn bản đọc từ Word
 * @param {Set<string>} have tên hình đã có sẵn trong gói (không ghi đè)
 * @returns {{ assign: Record<string,string>, used: number, warnings: string[] }} assign: tên trong gói → khóa hình Word
 */
export function mapDocxImages(rawQuestions, docxText, have = new Set()) {
  const blocks = docxQuestionBlocks(docxText);
  const assign = {};
  const warnings = [];
  let used = 0;
  (Array.isArray(rawQuestions) ? rawQuestions : []).forEach((q, i) => {
    const fields = [q?.stem, ...(Array.isArray(q?.options) ? q.options : []), q?.explanation].map((x) => String(x ?? ''));
    const names = [];
    for (const f of fields) for (const m of f.matchAll(PLACEHOLDER)) names.push(m[1].trim());
    if (!names.length) return;
    const block = blocks[i] ?? [];
    const label = String(q?.id ?? `#${i + 1}`);
    let k = 0;
    for (const name of names) {
      if (have.has(name) || assign[name]) continue;
      const key = block[k++];
      if (!key) break;
      assign[name] = key;
      used++;
    }
    const need = names.filter((n) => !have.has(n)).length;
    // Thừa hình (thường là hình trong lời giải ở file Word) thì không sao; thiếu mới báo
    if (need && block.length < need) {
      warnings.push(`Câu ${label}: gói cần ${need} hình nhưng file Word có ${block.length} hình ở câu thứ ${i + 1}. Xem lại hình trong bản xem trước.`);
    }
  });
  if (blocks.length && rawQuestions?.length && blocks.length < rawQuestions.length) {
    warnings.push(`File Word có ${blocks.length} câu, gói có ${rawQuestions.length} câu: hình của các câu cuối có thể bị thiếu.`);
  }
  return { assign, used, warnings };
}
