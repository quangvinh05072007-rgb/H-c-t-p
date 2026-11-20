// Gói nhập chuẩn SmartExam: đề và tài liệu được xử lý bên ngoài (không AI trong app) rồi đưa vào bằng một file JSON
// (hoặc ZIP chứa JSON + hình). Module này chỉ đọc, chuẩn hóa và kiểm tra — không chạm CSDL.
// Đặc tả cho người soạn gói: docs/goi-nhap.md.

import { cleanCategory, EXAM_CATEGORY_CODES } from './examCategory.mjs';
import { cleanExamMeta } from './examMeta.mjs';
import { TOPIC_BY_CODE } from './topics.mjs';
import { repairPackageText, restoreControlChars } from './packageRepair.mjs';
import { cleanOutcomeCodes, parseCurriculum } from './curriculum.mjs';

export const PACKAGE_FORMAT = 'smartexam-package';
export const PACKAGE_VERSION = 1;
/** Bản 2: một gói = một đề, có thông tin đề (năm học, khối, học kỳ…) và chia Phần I/II/III. Bản 1 vẫn nhận. */
export const PACKAGE_VERSIONS = [1, 2];
export const PACKAGE_LIMITS = { questions: 2000, exams: 100, lessons: 200, textLength: 20000 };

const TYPES = new Set(['mcq', 'tf', 'short']);
/** Dấu AI ghi khi tự giải (đề không có đáp án): câu đó luôn vào dạng nháp chờ giáo viên duyệt. */
export const AI_SOLVED_RE = /\[\s*AI\s+tự\s+giải[^\]]*\]\s*/iu;
/** Nhãn phương án AI hay chép theo: "A." "B)" ở trắc nghiệm, "a)" "b." ở đúng/sai. */
const MCQ_LABEL_RE = /^\s*\(?[A-D]\s*[.):]\s*/;
const TF_LABEL_RE = /^\s*\(?[a-d]\s*[.):]\s*/;
const IMAGE_RE = /\[\[image:([^\]\n]+)\]\]/g;

/** Đáp án trắc nghiệm: "A".."D" hoặc 0..3 → 0..3. */
function mcqAnswer(v) {
  if (Number.isInteger(v) && v >= 0 && v <= 3) return v;
  const s = String(v ?? '').trim().toUpperCase();
  return /^[ABCD]$/.test(s) ? 'ABCD'.indexOf(s) : null;
}

/** Đáp án đúng/sai: [true,false,…], "ĐĐSS", "DDSS", "TTFF", "Đ,Đ,S,S" → 4 boolean. */
function tfAnswer(v) {
  if (Array.isArray(v) && v.length === 4 && v.every((x) => typeof x === 'boolean')) return v;
  const s = String(v ?? '').toUpperCase().replace(/[\s,;|/-]/g, '');
  if (s.length !== 4) return null;
  const out = [...s].map((c) => (c === 'Đ' || c === 'D' || c === 'T' ? true : c === 'S' || c === 'F' ? false : null));
  return out.every((x) => x !== null) ? out : null;
}

let controlFixes = 0;
function text(v) {
  const s = typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v).trim();
  const r = restoreControlChars(s);
  controlFixes += r.fixes;
  return r.text;
}

/** Tên hình được nhắc trong văn bản qua [[image:ten.png]]. */
export function imageRefs(s) {
  return [...String(s ?? '').matchAll(IMAGE_RE)].map((m) => m[1].trim());
}

/**
 * Đọc và kiểm tra gói. imageNames: tập tên file hình có trong ZIP (rỗng nếu chỉ có JSON).
 * Trả về { source, questions, exams, lessons, curriculum, errors, warnings } — errors là lỗi chặn từng mục, mục lỗi bị bỏ qua.
 * curriculum: chương trình chuẩn (YCCĐ) nếu gói có mục "curriculum", không thì null.
 */
export function parsePackage(raw, imageNames = new Set(), rejectedImages = {}) {
  const errors = [];
  const warnings = [];
  let pkg = raw;
  if (typeof raw === 'string' || (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw))) {
    // Tự sửa lỗi cú pháp AI hay mắc (``` bao quanh, \frac một dấu \) rồi mới đọc
    const fixed = repairPackageText(String(raw));
    try {
      pkg = JSON.parse(fixed.text);
      warnings.push(...fixed.notes);
    } catch (e) {
      return { source: '', questions: [], exams: [], lessons: [], errors: [{ where: 'Gói', message: `Không đọc được JSON: ${e.message}. Kiểm tra AI đã trả về đủ khối { … } chưa (có bị cắt giữa chừng không).` }], warnings };
    }
  }
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    return { source: '', questions: [], exams: [], lessons: [], errors: [{ where: 'Gói', message: 'Gói phải là một đối tượng JSON.' }], warnings };
  }
  controlFixes = 0;
  if (pkg.format !== PACKAGE_FORMAT) errors.push({ where: 'Gói', message: `Thiếu "format": "${PACKAGE_FORMAT}".` });
  if (!PACKAGE_VERSIONS.includes(Number(pkg.version))) errors.push({ where: 'Gói', message: 'Phiên bản gói phải là 1 hoặc 2.' });
  if (errors.length) return { source: '', questions: [], exams: [], lessons: [], errors, warnings };

  const source = text(pkg.source).slice(0, 200);
  const rawQs = Array.isArray(pkg.questions) ? pkg.questions : [];
  // Bản 2: "exam" là một đối tượng; thứ tự câu lấy từ "sections" (Phần I, II, III) nếu có
  const v2Exam = pkg.exam && typeof pkg.exam === 'object' && !Array.isArray(pkg.exam)
    ? { ...pkg.exam, questions: Array.isArray(pkg.exam.sections) ? pkg.exam.sections.flatMap((sec) => (Array.isArray(sec?.questions) ? sec.questions : [])) : pkg.exam.questions }
    : null;
  const rawExams = [...(Array.isArray(pkg.exams) ? pkg.exams : []), ...(v2Exam ? [v2Exam] : [])];
  const rawLessons = Array.isArray(pkg.lessons) ? pkg.lessons : [];
  const hasCurriculum = pkg.curriculum !== undefined && pkg.curriculum !== null;
  if (!rawQs.length && !rawLessons.length && !hasCurriculum) errors.push({ where: 'Gói', message: 'Gói không có câu hỏi, bài học hay chương trình nào.' });
  if (rawQs.length > PACKAGE_LIMITS.questions) errors.push({ where: 'Gói', message: `Tối đa ${PACKAGE_LIMITS.questions} câu mỗi gói.` });
  if (rawExams.length > PACKAGE_LIMITS.exams) errors.push({ where: 'Gói', message: `Tối đa ${PACKAGE_LIMITS.exams} đề mỗi gói.` });
  if (rawLessons.length > PACKAGE_LIMITS.lessons) errors.push({ where: 'Gói', message: `Tối đa ${PACKAGE_LIMITS.lessons} bài học mỗi gói.` });
  if (errors.length) return { source, questions: [], exams: [], lessons: [], errors, warnings };

  const checkImages = (where, ...fields) => {
    const missing = [...new Set(fields.flatMap(imageRefs).filter((n) => !imageNames.has(n)))];
    return missing.map((n) => (rejectedImages[n] ? `hình ${n} ${rejectedImages[n]}` : `thiếu hình ${n} trong gói`));
  };
  const tooLong = (...fields) => fields.some((f) => String(f ?? '').length > PACKAGE_LIMITS.textLength);

  // ---- Câu hỏi ----
  const questions = [];
  const seenIds = new Set();
  let labelFixes = 0;
  rawQs.forEach((q, i) => {
    const key = text(q?.id) || `#${i + 1}`;
    const where = `Câu ${key}`;
    const problems = [];
    if (!q || typeof q !== 'object') return errors.push({ where, message: 'Không phải đối tượng câu hỏi.' });
    if (seenIds.has(key)) problems.push('trùng "id" với câu khác trong gói');
    const type = text(q.type);
    if (!TYPES.has(type)) problems.push('"type" phải là mcq, tf hoặc short');
    const stem = text(q.stem);
    if (!stem) problems.push('thiếu "stem" (đề bài)');
    const topic = text(q.topic);
    if (!TOPIC_BY_CODE[topic]) problems.push(`"topic" không hợp lệ (${topic || 'trống'})`);
    const level = Number(q.level);
    if (![1, 2, 3].includes(level)) problems.push('"level" phải là 1, 2 hoặc 3');
    let options = [];
    let answer = null;
    if (type === 'mcq' || type === 'tf') {
      options = Array.isArray(q.options) ? q.options.map(text) : [];
      const labelRe = type === 'mcq' ? MCQ_LABEL_RE : TF_LABEL_RE;
      if (options.length === 4 && options.every((o) => labelRe.test(o))) {
        options = options.map((o) => o.replace(labelRe, ''));
        labelFixes++;
      }
      if (options.length !== 4 || options.some((o) => !o)) problems.push(type === 'mcq' ? 'cần đủ 4 phương án A–D' : 'cần đủ 4 ý a)–d)');
      answer = type === 'mcq' ? mcqAnswer(q.answer) : tfAnswer(q.answer);
      if (answer === null) problems.push(type === 'mcq' ? '"answer" phải là A, B, C hoặc D' : '"answer" phải gồm 4 giá trị Đúng/Sai, ví dụ "ĐĐSS"');
    } else if (type === 'short') {
      answer = text(q.answer);
      if (!answer) problems.push('thiếu "answer"');
    }
    let explanation = text(q.explanation);
    const needsReview = q.review === true || AI_SOLVED_RE.test(explanation) || AI_SOLVED_RE.test(stem);
    explanation = explanation.replace(AI_SOLVED_RE, '').trim();
    if (tooLong(stem, explanation, ...options)) problems.push('nội dung quá dài');
    problems.push(...checkImages(where, stem, explanation, ...options));
    seenIds.add(key);
    if (problems.length) return errors.push({ where, message: problems.join('; ') + '.' });
    questions.push({
      key,
      type,
      stem,
      options,
      answer,
      explanation,
      topic,
      level,
      group_id: text(q.group) ? text(q.group).slice(0, 40) : null,
      form: text(q.form).slice(0, 60) || null,
      sourceNo: text(q.sourceNo).slice(0, 60) || null,
      outcomes: cleanOutcomeCodes(q.outcomes),
      needsReview,
    });
  });

  // ---- Đề thi: ghép từ câu trong gói ----
  const validKeys = new Set(questions.map((q) => q.key));
  const exams = [];
  rawExams.forEach((e, i) => {
    const title = text(e?.title).slice(0, 200);
    const where = `Đề ${title || `#${i + 1}`}`;
    const problems = [];
    if (!title) problems.push('thiếu "title"');
    const keys = Array.isArray(e?.questions) ? e.questions.map(text) : [];
    if (!keys.length) problems.push('"questions" phải liệt kê id các câu trong gói');
    const unknown = keys.filter((k) => !seenIds.has(k));
    if (unknown.length) problems.push(`không có câu ${unknown.slice(0, 5).join(', ')} trong gói`);
    const broken = keys.filter((k) => seenIds.has(k) && !validKeys.has(k));
    if (broken.length) problems.push(`câu ${broken.slice(0, 5).join(', ')} đang lỗi`);
    if (new Set(keys).size !== keys.length) problems.push('một câu xuất hiện hai lần');
    const durationMin = Math.round(Number(e?.durationMin ?? 90));
    if (!(durationMin >= 5 && durationMin <= 240)) problems.push('"durationMin" phải từ 5 đến 240');
    const variants = Math.round(Number(e?.variants ?? 4));
    if (!(variants >= 1 && variants <= 24)) problems.push('"variants" phải từ 1 đến 24');
    const category = e?.category == null || e.category === '' ? null : cleanCategory(e.category);
    if (e?.category && !category) problems.push(`"category" phải là một trong: ${EXAM_CATEGORY_CODES.join(', ')}`);
    const metaIn = {};
    for (const k of ['schoolYear', 'grade', 'term', 'session', 'source', 'date', 'examDate', 'tags']) if (e?.[k] !== undefined) metaIn[k] = e[k];
    const meta = cleanExamMeta(metaIn);
    problems.push(...meta.errors.map((m) => m.replace(/\.$/, '')));
    if (problems.length) return errors.push({ where, message: problems.join('; ') + '.' });
    exams.push({ title, keys, durationMin, variants, category, meta: meta.value, shareWithSchool: e?.shareWithSchool !== false });
  });

  // ---- Bài học Tự học ----
  const lessons = [];
  const lessonTopics = new Set();
  rawLessons.forEach((l, i) => {
    const topic = text(l?.topic);
    const where = `Bài học ${topic || `#${i + 1}`}`;
    const problems = [];
    if (!TOPIC_BY_CODE[topic]) problems.push(`"topic" không hợp lệ (${topic || 'trống'})`);
    if (lessonTopics.has(topic)) problems.push('trùng chuyên đề với bài học khác trong gói');
    const list = (v) => (Array.isArray(v) ? v.map(text).filter(Boolean) : []);
    const entry = {
      summary: text(l?.summary),
      objectives: list(l?.objectives),
      formulas: list(l?.formulas),
      keyExamTips: text(l?.tips),
      commonTraps: list(l?.traps),
      examples: (Array.isArray(l?.examples) ? l.examples : [])
        .map((x) => ({ title: text(x?.title), problem: text(x?.problem), solution: text(x?.solution) }))
        .filter((x) => x.problem),
    };
    if (!entry.summary && !entry.formulas.length && !entry.examples.length) problems.push('cần ít nhất "summary", "formulas" hoặc "examples"');
    const all = [entry.summary, entry.keyExamTips, ...entry.objectives, ...entry.formulas, ...entry.commonTraps, ...entry.examples.flatMap((x) => [x.title, x.problem, x.solution])];
    if (tooLong(...all)) problems.push('nội dung quá dài');
    problems.push(...checkImages(where, ...all));
    lessonTopics.add(topic);
    if (problems.length) return errors.push({ where, message: problems.join('; ') + '.' });
    lessons.push({ topic, entry });
  });

  // ---- Chương trình chuẩn (YCCĐ) ----
  let curriculum = null;
  if (hasCurriculum) {
    const c = parseCurriculum(pkg.curriculum);
    errors.push(...c.errors);
    warnings.push(...c.warnings);
    curriculum = c.value;
  }

  if (labelFixes) warnings.push(`Đã bỏ nhãn "A." / "a)" thừa ở phương án của ${labelFixes} câu.`);
  if (controlFixes) warnings.push(`Đã khôi phục ${controlFixes} lệnh công thức bị hỏng do thiếu dấu \\.`);
  const aiSolved = questions.filter((q) => q.needsReview).length;
  if (aiSolved) warnings.push(`${aiSolved} câu do AI tự giải: sẽ lưu ở dạng nháp để giáo viên kiểm tra đáp án rồi duyệt.`);
  if (!imageNames.size && [...questions, ...lessons].length && rawQs.concat(rawLessons).some((x) => JSON.stringify(x ?? '').includes('[[image:'))) {
    warnings.push('Gói có chỗ đặt hình nhưng chưa kèm hình: đính kèm file Word gốc để app tự lấy hình, hoặc dán ảnh chụp vào từng hình còn thiếu.');
  }
  return { source, questions, exams, lessons, curriculum, errors, warnings };
}

/** Thay [[image:ten]] bằng [[img:id]] sau khi đã lưu hình. */
export function bindImages(s, idByName) {
  return String(s ?? '').replace(IMAGE_RE, (m, name) => (idByName[name.trim()] !== undefined ? `[[img:${idByName[name.trim()]}]]` : m));
}

/** Gói mẫu để tải về: đủ ba phần, có đủ ba loại câu. */
export function samplePackage() {
  return {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    source: 'Gói mẫu SmartExam',
    questions: [
      {
        id: 'c1',
        type: 'mcq',
        topic: 'T12.NGUYENHAM',
        level: 1,
        form: 'Nguyên hàm cơ bản',
        stem: 'Họ nguyên hàm của hàm số $f(x) = \\cos x$ là',
        options: ['$\\sin x + C$', '$-\\sin x + C$', '$\\cos x + C$', '$-\\cos x + C$'],
        answer: 'A',
        explanation: '$\\int \\cos x\\,dx = \\sin x + C$ vì $(\\sin x)\' = \\cos x$.',
      },
      {
        id: 'c2',
        type: 'tf',
        topic: 'T12.XSDK',
        level: 2,
        stem: 'Cho $P(A) = 0{,}4$, $P(B) = 0{,}5$, $P(A \\cap B) = 0{,}2$.',
        options: ['$P(A \\mid B) = 0{,}4$', '$P(B \\mid A) = 0{,}5$', 'A và B độc lập', '$P(A \\cup B) = 0{,}9$'],
        answer: 'ĐĐĐS',
        explanation: '$P(A\\mid B)=0{,}2/0{,}5=0{,}4$; $P(B\\mid A)=0{,}2/0{,}4=0{,}5$; $P(A)P(B)=0{,}2$ nên độc lập; $P(A\\cup B)=0{,}7$.',
      },
      {
        id: 'c3',
        type: 'short',
        topic: 'T12.NGUYENHAM',
        level: 2,
        stem: 'Tính $\\int_0^1 2x\\,dx$.',
        answer: '1',
        explanation: '$\\int_0^1 2x\\,dx = x^2\\big|_0^1 = 1$.',
      },
    ],
    exams: [{ title: 'Đề mẫu từ gói nhập', category: 'kiem-tra', durationMin: 15, variants: 2, questions: ['c1', 'c2', 'c3'], shareWithSchool: true }],
    lessons: [
      {
        topic: 'T12.NGUYENHAM',
        summary: 'Nguyên hàm, tích phân và ứng dụng tính diện tích, thể tích.',
        objectives: ['Tìm nguyên hàm cơ bản', 'Tính tích phân bằng đổi biến, từng phần'],
        formulas: ['Lũy thừa: $\\int x^\\alpha dx = \\dfrac{x^{\\alpha+1}}{\\alpha+1} + C$'],
        tips: 'Tính diện tích: chia đoạn tại hoành độ giao điểm.',
        traps: ['Quên trị tuyệt đối khi tính diện tích.'],
        examples: [{ title: 'Tích phân cơ bản', problem: 'Tính $\\int_0^1 x\\,dx$.', solution: '$\\tfrac12$' }],
      },
    ],
  };
}
