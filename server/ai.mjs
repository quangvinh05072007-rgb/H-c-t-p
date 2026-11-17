// AI (Gemini @google/genai) — bóc tách đề đa phương thức, tạo câu tương tự và giải chi tiết từng bước.
// Chạy hoàn toàn phía máy chủ với GEMINI_API_KEY; nội dung AI tạo luôn ở trạng thái nháp chờ giáo viên duyệt.
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const SYSTEM = `Bạn là chuyên gia Toán THPT Việt Nam (chương trình GDPT 2018).
- Viết công thức toán học bằng LaTeX chuẩn đặt trong $...$ (tránh dùng \\dfrac khi \\frac đủ rõ, dùng dấu thập phân hoặc phân số chuẩn).
- Tuân thủ đúng 3 phần đề thi tốt nghiệp THPT 2025+: Phần I (mcq: 4 phương án A, B, C, D), Phần II (tf: 4 mệnh đề a, b, c, d kèm đáp án boolean), Phần III (short: trả lời ngắn dạng số hoặc biểu thức rút gọn).
- Trả lời chính xác, ngắn gọn, đúng thuật ngữ sách giáo khoa Việt Nam.`;

const DEFAULT_MODEL = 'gemini-4-hydrogen';

async function withRetry(fn, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message ?? '');
      const status = err?.status ?? err?.statusCode ?? 0;
      const transient = status === 429 || status === 503 || /429|503|RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(msg);
      if (!transient || attempt === retries) break;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw lastErr;
}

function normalizeGeminiError(err) {
  const msg = String(err?.message ?? err ?? 'Lỗi gọi dịch vụ Gemini AI.');
  if (/API_KEY_INVALID|PERMISSION_DENIED|403|400/.test(msg)) {
    return Object.assign(new Error('Khóa GEMINI_API_KEY không hợp lệ hoặc chưa được cấp quyền. Kiểm tra lại Settings > Secrets.'), { status: 502 });
  }
  if (/RESOURCE_EXHAUSTED|429/.test(msg)) {
    return Object.assign(new Error('Hết hạn mức gọi AI tạm thời (429). Vui lòng thử lại sau ít phút.'), { status: 429 });
  }
  return Object.assign(new Error(`Lỗi xử lý AI: ${msg.slice(0, 240)}`), { status: err?.status || 502 });
}

export function makeAi(config = {}) {
  const key = config.ai?.apiKey || process.env.GEMINI_API_KEY || '';
  const model = config.ai?.model || DEFAULT_MODEL;
  const enabled = Boolean(key);

  const client = enabled
    ? new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      })
    : null;

  function ensureClient() {
    if (!client) {
      throw Object.assign(
        new Error('Chưa cấu hình GEMINI_API_KEY. Thêm khóa vào biến môi trường máy chủ (Settings > Secrets) để bật AI Multimodal.'),
        { status: 503 },
      );
    }
    return client;
  }

  return {
    enabled,
    model,
    provider: 'gemini',

    async similarQuestion(q) {
      const ai = ensureClient();
      try {
        const res = await withRetry(() =>
          ai.models.generateContent({
            model,
            contents: `Tạo MỘT câu hỏi mới cùng dạng, cùng chuyên đề, cùng mức độ với câu sau nhưng thay đổi số liệu hoặc bối cảnh. Tự tính kiểm tra lại đáp án chính xác.
Câu gốc: ${JSON.stringify({ type: q.type, stem: q.stem, options: q.options, answer: q.answer, explanation: q.explanation })}
Quy ước:
- mcq: options gồm đúng 4 chuỗi, answerIndex là số nguyên 0..3.
- tf: options gồm đúng 4 mệnh đề a)-d), tfAnswer là mảng đúng 4 boolean.
- short: options là [], shortAnswer là số hoặc biểu thức rút gọn (dùng dấu phẩy cho số thập phân).`,
            config: {
              systemInstruction: SYSTEM,
              thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, description: 'mcq, tf hoặc short' },
                  stem: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  answerIndex: { type: Type.INTEGER, description: 'Chỉ số 0..3 nếu là mcq' },
                  tfAnswer: { type: Type.ARRAY, items: { type: Type.BOOLEAN }, description: 'Mảng 4 boolean nếu là tf' },
                  shortAnswer: { type: Type.STRING, description: 'Đáp án ngắn nếu là short' },
                  explanation: { type: Type.STRING },
                },
                required: ['type', 'stem', 'options', 'explanation'],
              },
            },
          }),
        );
        const parsed = JSON.parse((res.text ?? '{}').trim());
        const t = ['mcq', 'tf', 'short'].includes(parsed.type) ? parsed.type : q.type;
        let answer = null;
        if (t === 'mcq') answer = Number.isInteger(parsed.answerIndex) ? parsed.answerIndex : 0;
        else if (t === 'tf') answer = Array.isArray(parsed.tfAnswer) && parsed.tfAnswer.length === 4 ? parsed.tfAnswer : [true, false, true, false];
        else answer = String(parsed.shortAnswer ?? '');
        return {
          type: t,
          stem: String(parsed.stem ?? ''),
          options: t === 'short' ? [] : (parsed.options ?? []).slice(0, 4),
          answer,
          explanation: String(parsed.explanation ?? ''),
          distractors: {},
        };
      } catch (err) {
        throw normalizeGeminiError(err);
      }
    },

    async explain(q) {
      const ai = ensureClient();
      try {
        const res = await withRetry(() =>
          ai.models.generateContent({
            model,
            contents: `Viết lời giải từng bước (đánh số Bước 1, Bước 2, …) cho câu hỏi sau.
Nếu là trắc nghiệm nhiều lựa chọn, giải thích ngắn vì sao các phương án nhiễu còn lại sai.
KẾT THÚC bằng đúng một dòng "Đáp án: X" (X là A/B/C/D; với đúng/sai viết dạng ĐSĐS; với trả lời ngắn viết kết quả). Tự giải độc lập hoàn toàn.
${JSON.stringify({ type: q.type, stem: q.stem, options: q.options })}`,
            config: {
              systemInstruction: SYSTEM,
              thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            },
          }),
        );
        return (res.text ?? '').trim();
      } catch (err) {
        throw normalizeGeminiError(err);
      }
    },

    async imageToText(buf, mediaType) {
      const ai = ensureClient();
      try {
        const res = await withRetry(() =>
          ai.models.generateContent({
            model,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: mediaType || 'image/png',
                    data: Buffer.from(buf).toString('base64'),
                  },
                },
                {
                  text: `Chép lại toàn bộ đề thi trong ảnh thành văn bản chuẩn GDPT 2018.
- Mọi công thức toán, ký hiệu, phân số, căn thức, tích phân, giới hạn viết bằng LaTeX đặt trong $...$.
- Giữ rõ tiêu đề "PHẦN I", "PHẦN II", "PHẦN III" (nếu có), đánh số "Câu 1.", "Câu 2.".
- Phương án trắc nghiệm "A. ... B. ... C. ... D. ...", mỗi phương án trên một dòng riêng.
- Mệnh đề đúng/sai "a) ... b) ... c) ... d) ...", mỗi ý trên một dòng riêng.
- Nếu ảnh có đáp án được gạch chân, tô đậm, khoanh tròn hoặc ghi sẵn dưới câu, hãy ghi dòng "Đáp án: ...".
- Chỉ trả về văn bản đề thi sạch sẽ, không thêm lời bình luận.`,
                },
              ],
            },
            config: {
              systemInstruction: SYSTEM,
              thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            },
          }),
        );
        return (res.text ?? '').trim();
      } catch (err) {
        throw normalizeGeminiError(err);
      }
    },

    /**
     * Bóc tách đa phương thức một hoặc nhiều trang ảnh/PDF thành danh sách câu hỏi JSON có cấu trúc chuẩn GDPT 2018.
     * pages: [{ data: Buffer, mimeType: string, page?: number }]
     */
    async extractExamFromImages(pages, { signal } = {}) {
      const ai = ensureClient();
      if (!pages?.length) return [];
      signal?.throwIfAborted?.();

      const parts = [];
      for (const p of pages) {
        parts.push({
          inlineData: {
            mimeType: p.mimeType || 'image/png',
            data: Buffer.from(p.data).toString('base64'),
          },
        });
      }
      const pageList = pages.map((p, idx) => p.page ?? idx + 1).join(', ');
      parts.push({
        text: `Hãy bóc tách toàn bộ các CÂU HỎI ĐỀ THI có trong ${pages.length} trang ảnh (trang: ${pageList}).
Bỏ qua tiêu đề trường/sở và bỏ qua phần lời giải chi tiết ở cuối (nếu chỉ có bảng đáp án hoặc đáp án khoanh tròn/gạch chân ở câu thì ghi nhận đáp án đó).
Quy tắc trích xuất:
1. Phân loại đúng "type":
   - "mcq": trắc nghiệm 4 phương án A, B, C, D. "options" có đúng 4 chuỗi (KHÔNG ghi tiền tố "A.", "B." vào nội dung phương án). "mcqAnswerIndex" là 0..3 nếu nhận diện được đáp án, ngược lại là -1.
   - "tf": trắc nghiệm đúng/sai 4 ý a), b), c), d). "options" có đúng 4 chuỗi (KHÔNG ghi tiền tố "a)" vào nội dung). "tfAnswers" là mảng 4 phần tử ("T" | "F" | "U") nếu có sẵn đáp án, mặc định ["U","U","U","U"].
   - "short": câu trả lời ngắn (Phần III hoặc câu điền số). "options" là [], "shortAnswer" là đáp án số/biểu thức nếu thấy (rỗng nếu không có).
2. Mọi công thức toán viết bằng LaTeX sạch trong $...$ (ví dụ $\\frac{1}{2}$, $\\sqrt{x^2+1}$, $\\int_0^1 x\\,dx$).
3. Nếu câu hỏi có hình vẽ, đồ thị, hoặc bảng biến thiên phức tạp không thể diễn đạt hết bằng chữ/LaTeX, đặt "hasFigure": true và mô tả ngắn vị trí trong đề.
4. Gán "page" đúng số trang chứa câu đó (${pageList}) và "num" theo số câu gốc trong đề.`,
      });

      try {
        const res = await withRetry(() =>
          ai.models.generateContent({
            model,
            contents: { parts },
            config: {
              systemInstruction: SYSTEM,
              thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  questions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        page: { type: Type.INTEGER },
                        part: { type: Type.INTEGER, description: '1, 2 hoặc 3' },
                        num: { type: Type.INTEGER },
                        type: { type: Type.STRING, description: 'mcq | tf | short' },
                        stem: { type: Type.STRING },
                        options: { type: Type.ARRAY, items: { type: Type.STRING } },
                        mcqAnswerIndex: { type: Type.INTEGER, description: '0..3 hoặc -1 nếu chưa có' },
                        tfAnswers: { type: Type.ARRAY, items: { type: Type.STRING }, description: '4 giá trị T/F/U' },
                        shortAnswer: { type: Type.STRING },
                        explanation: { type: Type.STRING },
                        hasFigure: { type: Type.BOOLEAN },
                        level: { type: Type.INTEGER, description: '1, 2 hoặc 3' },
                      },
                      required: ['type', 'stem', 'options'],
                    },
                  },
                },
                required: ['questions'],
              },
            },
          }),
        );
        signal?.throwIfAborted?.();
        const data = JSON.parse((res.text ?? '{"questions":[]}').trim());
        const list = Array.isArray(data?.questions) ? data.questions : [];
        return list.map((raw, idx) => {
          const t = ['mcq', 'tf', 'short'].includes(raw.type) ? raw.type : 'mcq';
          let answer = null;
          if (t === 'mcq') {
            answer = Number.isInteger(raw.mcqAnswerIndex) && raw.mcqAnswerIndex >= 0 && raw.mcqAnswerIndex <= 3 ? raw.mcqAnswerIndex : null;
          } else if (t === 'tf') {
            const arr = Array.isArray(raw.tfAnswers) ? raw.tfAnswers : [];
            if (arr.length === 4 && arr.every((x) => x === 'T' || x === 'F')) {
              answer = arr.map((x) => x === 'T');
            }
          } else if (t === 'short') {
            const sa = String(raw.shortAnswer ?? '').trim();
            answer = sa || null;
          }
          const cleanOpts =
            t === 'short'
              ? []
              : [0, 1, 2, 3].map((k) => {
                  const val = String(raw.options?.[k] ?? '').trim();
                  return val.replace(/^(?:[A-Da-d][.)]|Ý\s*[a-d][.)])\s*/i, '').trim();
                });
          return {
            part: Number.isInteger(raw.part) ? raw.part : t === 'mcq' ? 1 : t === 'tf' ? 2 : 3,
            num: Number.isInteger(raw.num) ? raw.num : idx + 1,
            page: Number.isInteger(raw.page) ? raw.page : pages[0]?.page ?? 1,
            type: t,
            stem: String(raw.stem ?? '').trim(),
            options: cleanOpts,
            answer,
            explanation: String(raw.explanation ?? '').trim(),
            hasFigure: Boolean(raw.hasFigure),
            level: [1, 2, 3].includes(raw.level) ? raw.level : undefined,
            fromAi: true,
          };
        });
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        throw normalizeGeminiError(err);
      }
    },
  };
}
