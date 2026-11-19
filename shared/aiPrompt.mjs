// Lời nhắc để giáo viên dán vào AI bên ngoài (ChatGPT, Claude, Gemini…) khi chuyển đề/tài liệu thành gói nhập.
// App không gọi AI: chỉ soạn sẵn văn bản này (kèm mã chuyên đề và dạng toán của trường) để giáo viên sao chép.
import { TOPICS } from './topics.mjs';
import { EXAM_CATEGORIES } from './examCategory.mjs';

/**
 * @param {{ mode?: 'text' | 'code', forms?: Record<string, string[]> }} opts
 *   mode "text": AI chỉ trả về JSON (dùng được với mọi AI, kể cả bản miễn phí).
 *   mode "code": AI có công cụ chạy code (ChatGPT phân tích dữ liệu, Claude tạo file…) → trả về goi.zip có sẵn hình.
 *   forms: dạng toán đang có trong ngân hàng, theo mã chuyên đề, để AI dùng đúng tên cũ.
 */
export function buildAiPrompt({ mode = 'text', forms = {} } = {}) {
  const topicLines = [10, 11, 12]
    .map((g) => `Lớp ${g}: ` + TOPICS.filter((t) => t.grade === g).map((t) => `${t.code} ${t.name}`).join(' · '))
    .join('\n');
  const formEntries = Object.entries(forms).filter(([, list]) => list?.length);
  const formBlock = formEntries.length
    ? `DẠNG TOÁN ĐANG DÙNG (ưu tiên chọn ĐÚNG NGUYÊN VĂN một tên trong danh sách của chuyên đề; chỉ đặt tên mới khi không có tên nào phù hợp):\n` +
      formEntries.map(([code, list]) => `${code}: ${list.join(' | ')}`).join('\n')
    : 'DẠNG TOÁN: đặt tên ngắn gọn, thống nhất (vd "Tích phân từng phần", "Khoảng cách từ điểm đến mặt phẳng").';
  const categories = EXAM_CATEGORIES.map((c) => `"${c.code}" ${c.label}`).join(' · ');

  const imageRules =
    mode === 'code'
      ? `HÌNH VẼ (đồ thị, hình học, bảng biến thiên dạng hình) — BẠN TỰ CẮT HÌNH BẰNG CÔNG CỤ CHẠY CODE:
- Đặt "[[image:hinh/<id>.png]]" đúng chỗ hình xuất hiện, <id> là id của câu (vd câu c5 → "[[image:hinh/c5.png]]").
  Phương án là hình: "[[image:hinh/c5-A.png]]" … "[[image:hinh/c5-D.png]]". Hình trong lời giải: "[[image:hinh/c5-giai.png]]".
- Dùng Python để lấy hình từ file tôi gửi:
  · File Word (.docx): lấy nguyên file ảnh gốc trong thư mục word/media theo đúng thứ tự xuất hiện, KHÔNG chụp lại.
  · File PDF: dựng trang ở độ phân giải ≥ 200 dpi (PyMuPDF/pdf2image), cắt sát vùng hình, chừa lề khoảng 8 px,
    không lẹm chữ đề bài, không cắt cụt nhãn (A, B, O, x, y…).
  · Lưu PNG (hoặc JPG), mỗi hình dưới 5 MB, đúng tên đã ghi.
- Ghi goi.json (UTF-8) và các hình vào cùng một file goi.zip (goi.json ở gốc, hình trong thư mục hinh/), rồi đưa tôi LINK TẢI goi.zip.
- Sau khi tạo, tự mở lại goi.zip kiểm tra: mọi "[[image:…]]" trong goi.json đều có file tương ứng.
- Trả lời ngắn: link tải + danh sách hình đã cắt. Không cần in toàn bộ JSON ra màn hình.`
      : `HÌNH VẼ (đồ thị, hình học, bảng biến thiên dạng hình):
- Đặt "[[image:hinh/<id>.png]]" đúng chỗ hình xuất hiện, <id> là id của câu (vd câu c5 → "[[image:hinh/c5.png]]").
  Phương án là hình: "[[image:hinh/c5-A.png]]" … "[[image:hinh/c5-D.png]]".
- Không mô tả hình bằng lời thay cho thẻ trên. Hình thật sẽ được lấy từ file gốc hoặc tôi tự dán vào.`;

  const output =
    mode === 'code'
      ? 'ĐẦU RA: file goi.zip (xem phần HÌNH VẼ). Nội dung goi.json là MỘT đối tượng JSON hợp lệ theo cấu trúc dưới.'
      : 'ĐẦU RA: đúng MỘT đối tượng JSON hợp lệ, không có chữ nào khác trước hay sau, không bọc trong ```.';

  return `Bạn là người chuyển đề/tài liệu Toán THPT (chương trình GDPT 2018) sang dữ liệu để nhập vào phần mềm SmartExam.
CHỈ CHÉP LẠI: không sửa nội dung, không thêm bớt câu, giữ nguyên số liệu, dấu và thứ tự câu như bản gốc.

${output}

CẤU TRÚC (một gói = một đề):
{
  "format": "smartexam-package",
  "version": 2,
  "source": "Đơn vị – Kỳ thi – Lần – Năm (lấy từ đầu đề)",
  "exam": {
    "title": "Tên đề như trên bản gốc",
    "category": "khao-sat",
    "schoolYear": "2025-2026", "grade": 12, "term": "HK2",
    "session": "Lần 1", "source": "Sở GD&ĐT Hà Nội", "date": "2026-03-15",
    "durationMin": 90, "variants": 4, "shareWithSchool": true,
    "sections": [
      { "part": "I", "questions": ["c1", "c2", "..."] },
      { "part": "II", "questions": ["..."] },
      { "part": "III", "questions": ["..."] }
    ]
  },
  "questions": [ ... ]
}

MỖI CÂU HỎI:
{ "id": "c1", "sourceNo": "Phần I – Câu 1", "type": "mcq", "topic": "T12.NGUYENHAM", "level": 2, "form": "Tích phân từng phần",
  "stem": "...", "options": ["...", "...", "...", "..."], "answer": "B", "explanation": "..." }
- "id": c1, c2, c3… đánh số liên tục trong TOÀN đề (đề chia Phần I, II, III đánh lại "Câu 1" thì id vẫn chạy tiếp).
- "sourceNo": vị trí câu trong bản gốc đúng như in trên đề, vd "Phần II – Câu 1" (đề không chia phần thì "Câu 5").
- "type": "mcq" = trắc nghiệm 4 phương án (Phần I); "tf" = đúng/sai 4 ý (Phần II); "short" = trả lời ngắn (Phần III).
- "options": mcq là 4 phương án, BỎ chữ "A." "B."…; tf là 4 mệnh đề, BỎ "a)" "b)"…; short thì để [].
- "answer": mcq là "A"/"B"/"C"/"D"; tf là 4 chữ Đ/S theo thứ tự a→d, vd "ĐĐSĐ"; short là số, dấu thập phân là dấu phẩy, vd "-1,5".
- "level": 1 = Biết (nhắc lại, tính trực tiếp) · 2 = Hiểu (áp dụng 2–3 bước) · 3 = Vận dụng (nhiều bước, thực tế).
- "topic": CHỈ dùng một mã trong bảng MÃ CHUYÊN ĐỀ.
- "form": dạng toán (xem DẠNG TOÁN).
- "explanation": lời giải ngắn gọn nếu bản gốc có. Nếu bản gốc KHÔNG có đáp án, bạn tự giải và mở đầu "explanation" bằng "[AI tự giải]".
- Các câu dùng chung một dữ kiện (câu chùm): thêm "group": "g1" giống nhau cho các câu đó.

CÔNG THỨC:
- Mọi công thức đặt trong $...$ (công thức riêng dòng dùng $$...$$). LaTeX chuẩn: \\dfrac, \\sqrt, \\int, \\lim, ^\\circ, \\overrightarrow…
- RẤT QUAN TRỌNG: trong JSON mỗi dấu gạch chéo ngược viết HAI lần: "$\\\\dfrac{1}{2}$", "$\\\\sqrt{3}$", "$60^\\\\circ$".
- Số thập phân trong công thức viết "0{,}5". Xuống dòng trong đề bài viết \\n.
- Bảng (bảng biến thiên, bảng số liệu) nếu là chữ: mỗi dòng dạng "| x | -∞ | 1 | +∞ |", nối các dòng bằng \\n.

${imageRules}

THÔNG TIN ĐỀ ("exam"): lấy từ phần đầu đề; không có thì BỎ trường đó, không bịa.
- "category": ${categories}.
- "schoolYear": năm học dạng "2025-2026"; "grade": 10, 11 hoặc 12; "term": "HK1", "HK2" hoặc "CN".
- "session": lần thi (vd "Lần 1", "Đợt 2"); "source": đơn vị ra đề (Bộ, Sở, trường); "date": ngày thi dạng "2026-03-15".
- "durationMin": thời gian làm bài ghi trên đề.
- "sections": các phần đúng như đề; mỗi phần liệt kê id các câu theo thứ tự. Đề không chia phần thì một phần duy nhất.
Nếu là TÀI LIỆU LÝ THUYẾT thay vì đề: BỎ "exam", để "questions": [], điền "lessons":
[{ "topic": "...", "summary": "...", "objectives": ["..."], "formulas": ["Tiêu đề: $...$"], "tips": "...",
   "traps": ["..."], "examples": [{ "title": "...", "problem": "...", "solution": "..." }] }] — mỗi chuyên đề một mục.

MÃ CHUYÊN ĐỀ:
${topicLines}

${formBlock}

TRƯỚC KHI TRẢ LỜI, TỰ KIỂM TRA: số câu đúng như bản gốc; mỗi mcq/tf có đủ 4 lựa chọn; mỗi câu có answer;
mọi dấu \\ trong chuỗi JSON đã viết thành \\\\; JSON đọc được.

ĐÁP ÁN CỦA ĐỀ (nếu có, dán vào đây hoặc nằm trong file gửi kèm):
`;
}
