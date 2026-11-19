// Tạo trường MẪU để chạy thử. Mọi thứ ở đây là dữ liệu mẫu, gắn nhãn rõ:
// tên trường có "(dữ liệu mẫu)", câu hỏi sample = 1, bài thi cũ có "(mô phỏng)" — điểm sinh bằng mô hình năng lực giả định.
// Chạy riêng: npm run seed -- --reset   (xóa data/smartexam.db rồi tạo lại)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './security.mjs';
import { SAMPLE_QUESTIONS } from './seedQuestions.mjs';
import { generateExam, makeVariant } from '../shared/generate.mjs';
import { makeRng } from '../shared/rng.mjs';

export const SAMPLE_PASSWORD = 'demo1234';
const DAY = 86400000;

const CLASSES = [
  { name: '12A1', grade: 12, teacher: 'gv.lan', students: ['Nguyễn Minh An', 'Trần Bảo Châu', 'Lê Gia Huy', 'Phạm Khánh Linh', 'Hoàng Đức Minh', 'Vũ Thảo Ngân', 'Đỗ Quang Phúc', 'Bùi Thanh Tâm'] },
  { name: '12A2', grade: 12, teacher: 'gv.minh', students: ['Ngô Hải Đăng', 'Đặng Mai Anh', 'Dương Tuấn Kiệt', 'Lý Ngọc Hân', 'Trịnh Văn Long', 'Cao Thu Trang'] },
  { name: '11B1', grade: 11, teacher: 'gv.minh', students: ['Phan Nhật Nam', 'Hồ Bích Ngọc', 'Tạ Quốc Bảo', 'Lương Diệu Linh'] },
];

function slug(name) {
  const parts = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().split(' ');
  return parts[parts.length - 1] + '.' + parts.slice(0, -1).map((p) => p[0]).join('');
}

/** Mô phỏng câu trả lời của một học sinh có năng lực ability (theo chuyên đề). */
function simulateResponse(q, layoutItem, ability, rng) {
  const p = 1 / (1 + Math.exp(-(ability - (q.level - 2) * 0.9)));
  if (q.type === 'mcq') {
    if (rng() < 0.03) return undefined;
    let orig = q.answer;
    if (rng() > p) {
      const wrong = [0, 1, 2, 3].filter((i) => i !== q.answer);
      const tagged = wrong.filter((i) => q.distractors?.[i]);
      const pool = tagged.length && rng() < 0.7 ? tagged : wrong;
      orig = pool[Math.floor(rng() * pool.length)];
    }
    return layoutItem.perm.indexOf(orig);
  }
  if (q.type === 'tf') return q.answer.map((a) => (rng() < Math.min(0.97, p + 0.15) ? a : !a));
  if (rng() < 0.08) return '';
  if (rng() < p) return q.answer;
  const wrong = q.distractors?.wrong ?? [];
  if (wrong.length && rng() < 0.6) return wrong[Math.floor(rng() * wrong.length)].value;
  const n = Number(String(q.answer).replace(',', '.'));
  return rng() < 0.4 ? String(-n).replace('.', ',') : String(Math.round(n * 2 + 1));
}

export function seedSample(app) {
  const { db, internals } = app;
  const t0 = app.now();
  const ids = db.tx(() => {
    const school = Number(db.run('INSERT INTO schools (name, sample) VALUES (?, 1)', 'Trường THPT Mẫu SmartExam (dữ liệu mẫu)').lastInsertRowid);
    const pw = hashPassword(SAMPLE_PASSWORD);
    const addUser = (role, username, name, classId = null) =>
      Number(db.run('INSERT INTO users (school_id, role, username, display_name, pass_hash, class_id, created_at) VALUES (?,?,?,?,?,?,?)', school, role, username, name, pw, classId, t0 - 60 * DAY).lastInsertRowid);
    const admin = addUser('admin', 'quanly', 'Cô Hiệu phó (mẫu)');
    const teachers = { 'gv.lan': addUser('teacher', 'gv.lan', 'Cô Nguyễn Thị Lan'), 'gv.minh': addUser('teacher', 'gv.minh', 'Thầy Trần Văn Minh') };
    const classes = {};
    for (const c of CLASSES) {
      const code = `${c.name}-2026`;
      const cid = Number(db.run('INSERT INTO classes (school_id, name, grade, teacher_id, code) VALUES (?,?,?,?,?)', school, c.name, c.grade, teachers[c.teacher], code).lastInsertRowid);
      classes[c.name] = { id: cid, code, students: c.students.map((n) => ({ id: addUser('student', `hs.${slug(n)}`, n, cid), name: n })) };
    }
    const qids = SAMPLE_QUESTIONS.map((q) =>
      Number(
        db.run(
          `INSERT INTO questions (school_id, type, stem, options_json, answer_json, explanation, topic, level, source, status, distractors_json, origin, created_by, approved_by, created_at, updated_at, sample, tag_confidence)
           VALUES (?,?,?,?,?,?,?,?, 'teacher', 'approved', ?, 'Ngân hàng mẫu SmartExam', ?, ?, ?, ?, 1, 1)`,
          school,
          q.type,
          q.stem,
          JSON.stringify(q.options),
          JSON.stringify(q.answer),
          q.explanation,
          q.topic,
          q.level,
          JSON.stringify(q.distractors ?? {}),
          teachers['gv.lan'],
          teachers['gv.lan'],
          t0 - 45 * DAY,
          t0 - 45 * DAY,
        ).lastInsertRowid,
      ),
    );
    // Trường thứ hai (trống) để kiểm tra tách dữ liệu giữa các trường.
    const other = Number(db.run('INSERT INTO schools (name, sample) VALUES (?, 1)', 'Trường THPT Khác (dữ liệu mẫu)').lastInsertRowid);
    db.run('INSERT INTO users (school_id, role, username, display_name, pass_hash, created_at) VALUES (?,?,?,?,?,?)', other, 'teacher', 'gv.khac', 'Thầy Trường Khác', pw, t0);
    return { school, admin, teachers, classes, qids };
  });

  // ---- lịch sử mô phỏng ----
  const pool = db.all('SELECT id, type, topic, level, status FROM questions WHERE school_id = ?', ids.school);
  const qmap = Object.fromEntries(db.all('SELECT * FROM questions WHERE school_id = ?', ids.school).map((r) => [r.id, { id: r.id, type: r.type, stem: r.stem, options: r.options, answer: r.answer, explanation: r.explanation, topic: r.topic, level: r.level, source: r.source, status: r.status, distractors: r.distractors }]));
  const makeExam = (title, blueprint, by, at, dept = 'Toán') => {
    const g = generateExam(pool, { ...blueprint, seed: title });
    const items = g.items.map(({ qid, type, topic, level }) => ({ qid, type, topic, level }));
    const snap = Object.fromEntries(items.map((x) => [x.qid, qmap[x.qid]]));
    const variants = [0, 1, 2, 3].map((i) => ({ code: String(101 + i), seed: `${title}-${i}` }));
    return Number(
      db.run('INSERT INTO exams (school_id, title, blueprint_json, items_json, duration_min, variants_json, snapshot_json, created_by, created_at, dept, official) VALUES (?,?,?,?,?,?,?,?,?,?,1)', ids.school, title, JSON.stringify(blueprint), JSON.stringify(items), blueprint.durationMin ?? 90, JSON.stringify(variants), JSON.stringify(snap), by, at, dept).lastInsertRowid,
    );
  };
  const assign = (examId, classId, title, mode, openAt, closeAt, duration, by, moduleId = null) =>
    Number(db.run('INSERT INTO assignments (school_id, exam_id, class_id, mode, title, open_at, close_at, duration_min, show_result, created_by, created_at, module_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', ids.school, examId, classId, mode, title, openAt, closeAt, duration, 'after_submit', by, openAt, moduleId).lastInsertRowid);

  const rng = makeRng('seed-history');
  const simulate = (assignmentId, examId, students, startAt, profile) => {
    const exam = db.get('SELECT * FROM exams WHERE id = ?', examId);
    students.forEach((s, si) => {
      if (rng() < 0.08) return; // vắng
      const layout = makeVariant(exam.items, `${assignmentId}-${s.id}-${examId}`);
      const started = startAt + Math.floor(rng() * 3600000);
      const att = Number(
        db.run('INSERT INTO attempts (school_id, assignment_id, student_id, kind, title, layout_json, started_at, deadline_at) VALUES (?,?,?,?,?,?,?,?)', ids.school, assignmentId, s.id, 'assignment', exam.title, JSON.stringify(layout), started, started + exam.duration_min * 60000).lastInsertRowid,
      );
      const responses = {};
      const times = {};
      for (const it of layout) {
        const q = exam.snapshot[it.qid];
        const ability = profile(si, q.topic);
        const r = simulateResponse(q, it, ability, rng);
        if (r !== undefined) responses[it.qid] = r;
        times[it.qid] = Math.round(20 + rng() * 200);
      }
      const events = rng() < 0.15 ? [{ type: 'hidden', at: started + 600000 }, { type: 'hidden', at: started + 1200000 }] : [];
      db.run('UPDATE attempts SET responses_json = ?, times_json = ?, version = 1, events_json = ? WHERE id = ?', JSON.stringify(responses), JSON.stringify(times), JSON.stringify(events), att);
      internals.withClock(() => started + 70 * 60000, () => db.tx(() => internals.finalize(internals.getAttempt(att), responses, times, 'submitted')));
    });
  };
  // Năng lực giả định: mỗi em một mức chung + điểm yếu riêng ở 1–2 chuyên đề; cả lớp 12A1 yếu xác suất có điều kiện.
  const weakSpots = ['T12.XSDK', 'T12.NGUYENHAM', 'T12.OXYZ', 'T11.MULOG', 'T12.KHAOSAT'];
  const profile12A1 = (si, topic) => 1.3 - si * 0.3 + (topic === 'T12.XSDK' ? -1.2 : 0) + (topic === weakSpots[si % weakSpots.length] ? -1 : 0);
  const profile12A2 = (si, topic) => 1.0 - si * 0.25 + (topic === weakSpots[(si + 2) % weakSpots.length] ? -1.1 : 0);

  const lan = ids.teachers['gv.lan'];
  const minh = ids.teachers['gv.minh'];

  // Tạo học phần theo tuần thật trong CSDL cho các lớp mẫu
  const addMod = (classId, weekNo, title, description, sortOrder, locked, by, at) =>
    Number(db.run('INSERT INTO class_modules (school_id, class_id, week_no, title, description, sort_order, locked, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)', ids.school, classId, weekNo, title, description, sortOrder, locked ? 1 : 0, by, at).lastInsertRowid);
  const addMat = (classId, moduleId, kind, title, summary, content, topicCode, sortOrder, by, at) =>
    Number(db.run('INSERT INTO class_materials (school_id, class_id, module_id, kind, title, summary, content, topic_code, sort_order, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', ids.school, classId, moduleId, kind, title, summary, content, topicCode, sortOrder, by, at).lastInsertRowid);
  const addAnn = (classId, title, body, pinned, by, at) =>
    Number(db.run('INSERT INTO class_announcements (school_id, class_id, title, body, pinned, created_by, created_at) VALUES (?,?,?,?,?,?,?)', ids.school, classId, title, body, pinned ? 1 : 0, by, at).lastInsertRowid);

  const m12a1_1 = addMod(ids.classes['12A1'].id, 1, 'Ứng dụng đạo hàm để khảo sát hàm số', 'Tính đơn điệu, cực trị, giá trị lớn nhất - nhỏ nhất và tiệm cận.', 1, false, lan, t0 - 25 * DAY);
  const m12a1_2 = addMod(ids.classes['12A1'].id, 2, 'Nguyên hàm, Tích phân & Tọa độ không gian Oxyz', 'Tích phân xác định, ứng dụng diện tích và mặt phẳng trong Oxyz.', 2, false, lan, t0 - 10 * DAY);
  const m12a1_3 = addMod(ids.classes['12A1'].id, 3, 'Xác suất có điều kiện & Thống kê phân tán', 'Công thức Bayes, xác suất toàn phần và phương sai ghép nhóm.', 3, true, lan, t0 - 2 * DAY);

  addMat(
    ids.classes['12A1'].id,
    m12a1_1,
    'doc',
    'Đề cương & Công thức trọng tâm Khảo sát hàm số',
    'Tính đơn điệu, cực trị, tiệm cận đứng/ngang/xiên và bảng biến thiên.',
    '### 1. Tính đơn điệu và cực trị\n- Hàm số đồng biến trên khoảng $K$ khi $f\'(x) \\ge 0$ với mọi $x \\in K$ (bằng $0$ tại hữu hạn điểm).\n- Điểm $x_0$ là điểm cực trị nếu $f\'(x)$ đổi dấu khi qua $x_0$.\n\n### 2. Đường tiệm cận\n- Tiệm cận ngang: $\\lim_{x \\to \\pm\\infty} f(x) = y_0 \\implies y = y_0$.\n- Tiệm cận đứng: $\\lim_{x \\to x_0^\\pm} f(x) = \\pm\\infty \\implies x = x_0$.\n\n| Dạng đồ thị | $a > 0$ | $a < 0$ |\n| Hàm bậc 3 ($\\Delta > 0$) | Nhánh cuối đi lên | Nhánh cuối đi xuống |\n| Phân thức $\\frac{ax+b}{cx+d}$ | $ad - bc > 0$ đồng biến | $ad - bc < 0$ nghịch biến |',
    'T12.KHAOSAT',
    1,
    lan,
    t0 - 24 * DAY,
  );
  addMat(
    ids.classes['12A1'].id,
    m12a1_2,
    'doc',
    'Tóm tắt công thức Nguyên hàm & Phương trình mặt phẳng Oxyz',
    'Bảng nguyên hàm cơ bản, tích phân từng phần và khoảng cách từ điểm đến mặt phẳng.',
    '### 1. Nguyên hàm & Tích phân\n- $\\int x^\\alpha\\,dx = \\frac{x^{\\alpha+1}}{\\alpha+1} + C$ với $\\alpha \\neq -1$.\n- Công thức từng phần: $\\int_a^b u\\,dv = [uv]_a^b - \\int_a^b v\\,du$.\n\n### 2. Mặt phẳng trong $Oxyz$\nKhoảng cách từ điểm $M(x_0; y_0; z_0)$ đến mặt phẳng $(P): Ax + By + Cz + D = 0$:\n$$d(M, (P)) = \\frac{|Ax_0 + By_0 + Cz_0 + D|}{\\sqrt{A^2 + B^2 + C^2}}$$',
    'T12.OXYZ',
    1,
    lan,
    t0 - 9 * DAY,
  );
  addMat(
    ids.classes['12A1'].id,
    m12a1_3,
    'doc',
    'Chuyên đề Xác suất có điều kiện & Công thức Bayes',
    'Xác suất toàn phần, sơ đồ cây và các bước giải bài toán Bayes.',
    'Công thức xác suất có điều kiện: $P(A|B) = \\frac{P(A \\cap B)}{P(B)}$ với $P(B) > 0$.',
    'T12.XSDK',
    1,
    lan,
    t0 - 2 * DAY,
  );

  const m12a2_1 = addMod(ids.classes['12A2'].id, 1, 'Ôn tập Tổng hợp Khảo sát hàm số & Oxyz', 'Hệ thống hóa kiến thức trọng tâm thi THPT 2026.', 1, false, minh, t0 - 22 * DAY);
  addMat(
    ids.classes['12A2'].id,
    m12a2_1,
    'doc',
    'Sổ tay công thức nhanh Toán 12',
    'Tổng hợp công thức đạo hàm, tích phân và tọa độ Oxyz.',
    'Đạo hàm hàm hợp: $[f(u(x))]\' = f\'(u) \\cdot u\'(x)$.\nPhương trình mặt cầu tâm $I(a;b;c)$ bán kính $R$: $(x-a)^2 + (y-b)^2 + (z-c)^2 = R^2$.',
    'T12.OXYZ',
    1,
    minh,
    t0 - 21 * DAY,
  );

  const m11b1_1 = addMod(ids.classes['11B1'].id, 1, 'Hàm số mũ, Lôgarit & Đạo hàm', 'Lũy thừa, phương trình mũ - lôgarit và quy tắc tính đạo hàm.', 1, false, minh, t0 - 5 * DAY);
  addMat(
    ids.classes['11B1'].id,
    m11b1_1,
    'doc',
    'Công thức Lôgarit & Đạo hàm cơ bản',
    'Điều kiện xác định và các phép biến đổi lôgarit cần nhớ.',
    'Với $a > 0, a \\neq 1$ và $x, y > 0$:\n$$\\log_a(xy) = \\log_a x + \\log_a y, \\quad \\log_a\\left(\\frac{x}{y}\\right) = \\log_a x - \\log_a y$$\nTiếp tuyến tại $x_0$: $y = f\'(x_0)(x - x_0) + f(x_0)$.',
    'T11.MULOG',
    1,
    minh,
    t0 - 4 * DAY,
  );

  addAnn(
    ids.classes['12A1'].id,
    'Lịch thi Khảo sát năng lực Toán 12 (Cấu trúc 2026)',
    'Cô đã mở Đề Khảo Sát Năng Lực Toán 12 (thời gian làm 90 phút, cấu trúc 3 phần: Trắc nghiệm, Đúng/Sai, Trả lời ngắn). Các em xem lại đề cương Tuần 1–2 trước khi vào phòng thi và hoàn thành đúng hạn.',
    true,
    lan,
    t0 - DAY,
  );
  addAnn(
    ids.classes['12A1'].id,
    'Lưu ý ôn tập chuyên đề Xác suất có điều kiện',
    'Qua kết quả kiểm tra 15 phút vừa rồi, cả lớp cần ôn kỹ công thức xác suất toàn phần và sơ đồ cây trước khi mở Tuần 3.',
    false,
    lan,
    t0 - 5 * DAY,
  );
  addAnn(
    ids.classes['11B1'].id,
    'Nhắc lịch nộp Bài tập về nhà Tuần 3',
    'Các em nhớ hoàn thành bài tập Mũ - Lôgarit và Đạo hàm đúng hạn để thầy tổng hợp điểm rèn luyện tuần.',
    true,
    minh,
    t0 - DAY,
  );

  const ex1 = makeExam('Kiểm tra giữa kì I (mô phỏng)', { counts: { mcq: 12, tf: 4, short: 6 }, levels: { 1: 40, 2: 30, 3: 30 }, topics: [], durationMin: 90 }, lan, t0 - 22 * DAY);
  const a1 = assign(ex1, ids.classes['12A1'].id, 'Kiểm tra giữa kì I (mô phỏng)', 'exam', t0 - 20 * DAY, t0 - 19 * DAY, 90, lan, m12a1_1);
  const a2 = assign(ex1, ids.classes['12A2'].id, 'Kiểm tra giữa kì I (mô phỏng)', 'exam', t0 - 20 * DAY, t0 - 19 * DAY, 90, minh, m12a2_1);
  simulate(a1, ex1, ids.classes['12A1'].students, t0 - 20 * DAY, profile12A1);
  simulate(a2, ex1, ids.classes['12A2'].students, t0 - 20 * DAY, profile12A2);
  const ex2 = makeExam('Kiểm tra 15 phút: Xác suất, Nguyên hàm (mô phỏng)', { counts: { mcq: 4, tf: 1, short: 2 }, levels: { 1: 40, 2: 40, 3: 20 }, topics: ['T12.XSDK', 'T12.NGUYENHAM'], durationMin: 15 }, lan, t0 - 8 * DAY);
  const a3 = assign(ex2, ids.classes['12A1'].id, 'Kiểm tra 15 phút (mô phỏng)', 'exam', t0 - 7 * DAY, t0 - 6 * DAY, 15, lan, m12a1_2);
  simulate(a3, ex2, ids.classes['12A1'].students, t0 - 7 * DAY, profile12A1);

  // Bài đang mở (thật, chưa ai làm) để chạy thử luồng thi.
  const ex3 = makeExam('Đề Khảo Sát Năng Lực Toán 12 – Cấu Trúc Đề Mới 2026', { counts: { mcq: 12, tf: 4, short: 6 }, levels: { 1: 40, 2: 30, 3: 30 }, topics: [], durationMin: 90 }, lan, t0 - DAY, 'Toán');
  assign(ex3, ids.classes['12A1'].id, 'Đề Khảo Sát Năng Lực Toán 12 – Cấu Trúc Đề Mới 2026', 'exam', t0 - 3600000, t0 + 14 * DAY, 90, lan, m12a1_2);
  assign(ex3, ids.classes['12A2'].id, 'Đề Khảo Sát Năng Lực Toán 12 – Cấu Trúc Đề Mới 2026', 'exam', t0 - 3600000, t0 + 14 * DAY, 90, minh, m12a2_1);
  const ex4 = makeExam('Bài Tập Về Nhà Tuần 3: Ôn Tập Khảo Sát Hàm Số & Oxyz', { counts: { mcq: 5, tf: 1, short: 2 }, levels: { 1: 50, 2: 30, 3: 20 }, topics: ['T11.MULOG', 'T11.DAOHAM'], durationMin: 30 }, minh, t0 - DAY, 'Toán');
  assign(ex4, ids.classes['11B1'].id, 'Bài Tập Về Nhà Tuần 3: Ôn Tập Khảo Sát Hàm Số & Oxyz', 'homework', t0 - 3600000, t0 + 7 * DAY, 30, minh, m11b1_1);

  // Đề tự luyện Toán cho học sinh (dữ liệu mẫu)
  makeExam('Đề luyện tổng hợp Toán – Đề 1 (mô phỏng)', { counts: { mcq: 6, tf: 2, short: 2 }, levels: { 1: 40, 2: 40, 3: 20 }, topics: [], durationMin: 30 }, minh, t0 - 2 * DAY);
  makeExam('Đề luyện tổng hợp Toán – Đề 2 (mô phỏng)', { counts: { mcq: 6, tf: 2, short: 2 }, levels: { 1: 30, 2: 40, 3: 30 }, topics: [], durationMin: 30 }, lan, t0 - 3 * DAY);
  // Lịch sử mô phỏng không tính vào chuỗi ngày học của hôm nay.
  db.run("UPDATE users SET streak = 0, last_active_day = NULL WHERE role = 'student'");
  db.run('INSERT INTO audit_log (school_id, user_id, action, detail, at) VALUES (?,?,?,?,?)', ids.school, null, 'seed', 'Tạo trường mẫu và lịch sử mô phỏng', t0);
  return ids;
}

async function runCli() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dbFile = path.join(root, 'data', 'smartexam.db');
  if (process.argv.includes('--reset')) {
    for (const f of [dbFile, dbFile + '-wal', dbFile + '-shm']) if (fs.existsSync(f)) fs.rmSync(f);
  }
  const { createApp } = await import('./app.mjs');
  const app = createApp({ dbFile });
  if (app.db.get('SELECT id FROM schools LIMIT 1')) {
    console.log('CSDL đã có dữ liệu. Dùng "npm run seed -- --reset" để xóa và tạo lại trường mẫu.');
  } else {
    seedSample(app);
    console.log(`Đã tạo trường mẫu. Mật khẩu mọi tài khoản mẫu: ${SAMPLE_PASSWORD}`);
  }
  app.db.close();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
