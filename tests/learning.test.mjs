// Giai đoạn 3: lời giải do AI viết chỉ là nháp (giáo viên duyệt, đối chiếu đáp án), và từ kết quả giao phiếu luyện cho nhóm yếu.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { answerFromSolution, parseAnswerLine } from '../shared/parse.mjs';
import { readXlsx } from '../shared/sheet.mjs';
import { createApp } from '../server/app.mjs';
import { seedSample, SAMPLE_PASSWORD } from '../server/seed.mjs';

const clock = Date.parse('2026-10-19T08:00:00+07:00');
let server;
let url;
let app;
let lan;
let minh;
let khac;
before(async () => {
  app = createApp({ dbFile: ':memory:', clock: () => clock, aiImpl: { enabled: false } });
  seedSample(app);
  server = http.createServer(app.handle);
  await new Promise((r) => server.listen(0, r));
  url = `http://127.0.0.1:${server.address().port}`;
  lan = client();
  minh = client();
  khac = client();
  await lan.login('gv.lan');
  await minh.login('gv.minh');
  await khac.login('gv.khac');
});
after(() => server.close());

function client() {
  let cookie = '';
  const call = async (method, p, body) => {
    const headers = cookie ? { cookie } : {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(url + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const data = (res.headers.get('content-type') ?? '').includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data };
  };
  return {
    get: (p) => call('GET', p),
    post: (p, b = {}) => call('POST', p, b),
    async login(u) {
      const r = await call('POST', '/api/login', { username: u, password: SAMPLE_PASSWORD });
      assert.equal(r.status, 200);
    },
  };
}
const audits = (action) => app.db.all('SELECT * FROM audit_log WHERE action = ? ORDER BY id', action);

test('Nhóm yếu theo chuyên đề: chỉ lớp mình dạy; giao phiếu luyện đúng nhóm, đúng học sinh mới thấy', async () => {
  const cls = (await lan.get('/api/classes')).data.classes[0];
  assert.equal((await minh.get(`/api/classes/${cls.id}/weak-groups`)).status, 404);
  assert.equal((await khac.get(`/api/classes/${cls.id}/weak-groups`)).status, 404);
  const groups = (await lan.get(`/api/classes/${cls.id}/weak-groups`)).data.groups;
  assert.ok(groups.length > 0);
  const g = groups.find((x) => x.topic === 'T12.XSDK') ?? groups[0];
  assert.ok(g.students.length >= 2);
  assert.ok(g.students.every((s) => s.value < 0.5 && s.n >= 3));
  assert.deepEqual(g.students.map((s) => s.value), [...g.students.map((s) => s.value)].sort((a, b) => a - b));

  assert.equal((await lan.post(`/api/classes/${cls.id}/practice-assignment`, { topic: 'KHONG-CO' })).status, 400);
  assert.equal((await lan.post(`/api/classes/${cls.id}/practice-assignment`, { topic: g.topic, studentIds: [999999] })).status, 400);
  const denyMinh = audits('practice_assign').filter((a) => a.outcome === 'denied').length;
  assert.equal((await minh.post(`/api/classes/${cls.id}/practice-assignment`, { topic: g.topic })).status, 403);
  assert.equal((await khac.post(`/api/classes/${cls.id}/practice-assignment`, { topic: g.topic })).status, 403);
  assert.equal(audits('practice_assign').filter((a) => a.outcome === 'denied').length, denyMinh + 2);

  const r = await lan.post(`/api/classes/${cls.id}/practice-assignment`, { topic: g.topic, count: 8 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.students, g.students.length);
  assert.ok(r.data.items >= 3);
  const asg = app.db.get('SELECT * FROM assignments WHERE id = ?', r.data.assignmentId);
  assert.deepEqual([...asg.target].sort(), g.students.map((s) => s.id).sort());
  assert.equal(asg.mode, 'homework');
  const exam = app.db.get('SELECT items_json FROM exams WHERE id = ?', r.data.examId);
  assert.ok(exam.items.every((it) => it.topic === g.topic));
  assert.equal(audits('practice_assign').filter((a) => a.outcome === 'ok').length, 1);

  // em trong nhóm thấy và làm được; em ngoài nhóm không thấy và không vào được
  const inUser = app.db.get('SELECT username FROM users WHERE id = ?', g.students[0].id);
  const outUser = app.db
    .all("SELECT id, username FROM users WHERE class_id = ? AND role = 'student'", cls.id)
    .find((u) => !g.students.some((s) => s.id === u.id));
  const sIn = client();
  const sOut = client();
  await sIn.login(inUser.username);
  await sOut.login(outUser.username);
  assert.ok((await sIn.get('/api/student/home')).data.assignments.some((a) => a.id === r.data.assignmentId && a.state === 'open'));
  assert.ok(!(await sOut.get('/api/student/home')).data.assignments.some((a) => a.id === r.data.assignmentId));
  assert.equal((await sOut.post('/api/attempts/start', { assignmentId: r.data.assignmentId })).status, 404);
  assert.equal((await sIn.post('/api/attempts/start', { assignmentId: r.data.assignmentId })).status, 200);

  // báo cáo, bảng điểm và mã đề chỉ gồm đúng các em được giao
  const rep = (await lan.get(`/api/assignments/${r.data.assignmentId}/report`)).data;
  assert.equal(rep.rows.length, g.students.length);
  const xlsx = await readXlsx((await lan.get(`/api/assignments/${r.data.assignmentId}/export.xlsx`)).data);
  assert.equal(xlsx.length, 1 + g.students.length);
  const vs = (await lan.get(`/api/assignments/${r.data.assignmentId}/variants`)).data;
  assert.equal(vs.students.length, g.students.length);

  // chọn tay học sinh (không theo nhóm yếu)
  const manual = await lan.post(`/api/classes/${cls.id}/practice-assignment`, { topic: g.topic, studentIds: [outUser.id], count: 5, title: 'Phiếu riêng' });
  assert.equal(manual.status, 200);
  assert.equal(manual.data.students, 1);
  assert.ok((await sOut.get('/api/student/home')).data.assignments.some((a) => a.id === manual.data.assignmentId && a.title === 'Phiếu riêng'));
});

test('Chuyên đề không ai yếu và chưa có câu duyệt: báo rõ, không tạo bài rỗng', async () => {
  const cls = (await lan.get('/api/classes')).data.classes[0];
  const before = app.db.get('SELECT COUNT(*) n FROM assignments').n;
  const none = await lan.post(`/api/classes/${cls.id}/practice-assignment`, { topic: 'T10.BPT2AN' });
  assert.equal(none.status, 400);
  assert.match(none.data.error, /yếu|Chưa/);
  const empty = await lan.post(`/api/classes/${cls.id}/practice-assignment`, { topic: 'T10.BPT2AN', studentIds: [app.db.get("SELECT id FROM users WHERE class_id = ? AND role = 'student'", cls.id).id] });
  assert.equal(empty.status, 400);
  assert.match(empty.data.error, /chưa có câu đã duyệt/i);
  assert.equal(app.db.get('SELECT COUNT(*) n FROM assignments').n, before);
});
