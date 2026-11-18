import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server/app.mjs';
import { seedSample, SAMPLE_PASSWORD } from '../server/seed.mjs';

let app, server, base;
before(async () => {
  app = createApp();
  seedSample(app);
  server = http.createServer(app.handle);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  app.db.close();
});

async function login(username) {
  const res = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: SAMPLE_PASSWORD }) });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  };
  return { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b ?? {}), put: (p, b) => call('PUT', p, b ?? {}) };
}
const classId = (name) => app.db.get('SELECT id FROM classes WHERE name = ?', name).id;

test('Việc cần xử lý: chỉ lớp mình phụ trách, có bài vừa đóng; học sinh bị chặn', async () => {
  const lan = await login('gv.lan');
  const r = await lan.get('/api/teacher/todo');
  assert.equal(r.status, 200);
  assert.ok(r.data.items.some((x) => x.kind === 'review' && /12A1/.test(x.meta)));
  assert.ok(r.data.items.every((x) => !/12A2|11B1/.test(x.meta)), 'không lẫn lớp người khác');
  const hs = await login('hs.an.nm');
  assert.equal((await hs.get('/api/teacher/todo')).status, 403);
});

test('Giao phân hóa 3 mức: mỗi học sinh vào đúng một nhóm, phiếu chỉ giao cho nhóm đó', async () => {
  const lan = await login('gv.lan');
  const cid = classId('12A1');
  const r = await lan.post(`/api/classes/${cid}/differentiated`, { topic: 'T12.XSDK', count: 6 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.created.length >= 1);
  const students = app.db.all("SELECT id FROM users WHERE class_id = ? AND role = 'student' AND active = 1", cid).map((x) => x.id);
  const covered = [];
  for (const c of [...r.data.created]) {
    const a = app.db.get('SELECT target_json FROM assignments WHERE id = ?', c.assignmentId);
    covered.push(...a.target);
  }
  const skippedCount = r.data.skipped.reduce((s, x) => s + x.students, 0);
  assert.equal(new Set(covered).size, covered.length, 'không em nào nhận hai phiếu');
  assert.equal(covered.length + skippedCount, students.length);
  const minh = await login('gv.minh');
  assert.equal((await minh.post(`/api/classes/${cid}/differentiated`, { topic: 'T12.XSDK' })).status, 403);
});

test('Mục tiêu học sinh: giáo viên thấy mục tiêu và khoảng cách; lớp không phụ trách bị chặn', async () => {
  const hs = await login('hs.an.nm');
  assert.equal((await hs.put('/api/student/goal', { target: 9 })).status, 200);
  const lan = await login('gv.lan');
  const r = await lan.get(`/api/classes/${classId('12A1')}/goals`);
  assert.equal(r.status, 200);
  const an = r.data.students.find((s) => s.name === 'Nguyễn Minh An');
  assert.equal(an.target, 9);
  assert.ok(r.data.withTarget >= 1);
  assert.equal((await lan.get(`/api/classes/${classId('12A2')}/goals`)).status, 403);
});

test('Phân tích câu: có thời gian trung vị và số em đánh dấu phân vân', async () => {
  const lan = await login('gv.lan');
  const asg = app.db.get("SELECT a.id FROM assignments a JOIN classes c ON c.id = a.class_id WHERE c.name = '12A1' AND a.title LIKE 'Kiểm tra 15 phút%'");
  // Đánh dấu giả lập: 3 em đánh dấu câu đầu
  const atts = app.db.all("SELECT id, layout_json FROM attempts WHERE assignment_id = ? AND status != 'in_progress' LIMIT 3", asg.id);
  const firstQ = atts[0].layout[0].qid;
  for (const t of atts) app.db.run('UPDATE attempts SET flagged_json = ? WHERE id = ?', JSON.stringify([firstQ]), t.id);
  const r = await lan.get(`/api/assignments/${asg.id}/report`);
  assert.equal(r.status, 200);
  const item = r.data.items.find((x) => x.qid === firstQ);
  assert.equal(item.flaggedBy, 3);
  assert.ok(item.medianSec > 0);
  assert.ok(item.flags.some((f) => /phân vân/.test(f)));
});

test('Độ phủ ngân hàng: bảng đủ 23 chuyên đề × 3 mức × 3 loại, số đề thi thử ghép được khớp số câu', async () => {
  const lan = await login('gv.lan');
  const r = await lan.get('/api/bank/coverage');
  assert.equal(r.status, 200);
  assert.equal(r.data.topics.length, 23);
  const sum = r.data.topics.reduce((s, t) => s + t.total, 0);
  assert.equal(sum, r.data.byType.mcq + r.data.byType.tf + r.data.byType.short);
  assert.equal(r.data.mockExams, Math.min(Math.floor(r.data.byType.mcq / 12), Math.floor(r.data.byType.tf / 4), Math.floor(r.data.byType.short / 6)));
  const hs = await login('hs.an.nm');
  assert.equal((await hs.get('/api/bank/coverage')).status, 403);
});

test('Câu cần sửa: gắn nhãn từ bài làm, phát hiện câu trùng; mở câu theo id', async () => {
  const lan = await login('gv.lan');
  const q = app.db.get("SELECT * FROM questions WHERE status = 'approved' AND type = 'mcq' LIMIT 1");
  // Tạo bản trùng hệt để kiểm tra nhãn trùng
  await lan.post('/api/questions', { type: 'mcq', stem: q.stem, options: q.options, answer: q.answer, topic: q.topic, level: q.level });
  const r = await lan.get('/api/bank/quality');
  assert.equal(r.status, 200);
  assert.ok(r.data.analysedAttempts > 0);
  const dup = r.data.questions.find((x) => x.id === q.id);
  assert.ok(dup && dup.issues.some((i) => i.code === 'duplicate'));
  const one = await lan.get(`/api/questions/${q.id}`);
  assert.equal(one.status, 200);
  assert.equal(one.data.question.id, q.id);
});

test('Ghi điểm phiếu tô vào bảng điểm: đúng mã đề, không ghi đè bài đã có, chặn lớp khác', async () => {
  const lan = await login('gv.lan');
  const asg = app.db.get("SELECT a.* FROM assignments a JOIN classes c ON c.id = a.class_id WHERE c.name = '12A1' AND a.title LIKE 'Đề Khảo Sát%'");
  const exam = app.db.get('SELECT variants_json FROM exams WHERE id = ?', asg.exam_id);
  const code = exam.variants[0].code;
  const st = app.db.get("SELECT u.id FROM users u WHERE u.class_id = ? AND u.role = 'student' AND NOT EXISTS (SELECT 1 FROM attempts t WHERE t.assignment_id = ? AND t.student_id = u.id)", asg.class_id, asg.id);
  const answers = { partI: Array.from({ length: 12 }, () => ({ selected: 0 })), partII: Array.from({ length: 4 }, () => ({ selected: [true, false, true, false] })), partIII: Array.from({ length: 6 }, () => ({ value: '1' })) };
  const bad = await lan.post('/api/omr/record', { assignmentId: asg.id, studentId: st.id, variantCode: 'XYZ', answers });
  assert.equal(bad.status, 400);
  const ok = await lan.post('/api/omr/record', { assignmentId: asg.id, studentId: st.id, variantCode: code, answers });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(typeof ok.data.score10, 'number');
  const att = app.db.get('SELECT status, variant_code FROM attempts WHERE assignment_id = ? AND student_id = ?', asg.id, st.id);
  assert.equal(att.status, 'submitted');
  assert.equal(att.variant_code, code);
  assert.equal((await lan.post('/api/omr/record', { assignmentId: asg.id, studentId: st.id, variantCode: code, answers })).status, 409);
  const minh = await login('gv.minh');
  assert.equal((await minh.post('/api/omr/record', { assignmentId: asg.id, studentId: st.id, variantCode: code, answers })).status, 404);
});

test('Đề cấu trúc Bộ bằng 1 nút: đúng 12/4/6, 90 phút; đề tương đương cùng ma trận khác câu', async () => {
  const lan = await login('gv.lan');
  const off = await lan.post('/api/exams/official', {});
  assert.equal(off.status, 200, JSON.stringify(off.data));
  const e = app.db.get('SELECT items_json, duration_min FROM exams WHERE id = ?', off.data.id);
  const c = { mcq: 0, tf: 0, short: 0 };
  for (const it of e.items) c[it.type]++;
  assert.deepEqual(c, { mcq: 12, tf: 4, short: 6 });
  assert.equal(e.duration_min, 90);

  const eq = await lan.post(`/api/exams/${off.data.id}/equivalent`, {});
  assert.equal(eq.status, 200, JSON.stringify(eq.data));
  const e2 = app.db.get('SELECT items_json, parent_id FROM exams WHERE id = ?', eq.data.id);
  assert.equal(e2.parent_id, off.data.id);
  assert.equal(e2.items.length, 22);
  for (let i = 0; i < 22; i++) assert.equal(e2.items[i].type, e.items[i].type, 'cùng loại câu từng vị trí');
  const same = e2.items.filter((x, i) => x.qid === e.items[i].qid).length;
  assert.equal(same, eq.data.kept, 'chỉ giữ câu khi không có câu thay');
  assert.ok(eq.data.exact + eq.data.relaxed > 0);
});
