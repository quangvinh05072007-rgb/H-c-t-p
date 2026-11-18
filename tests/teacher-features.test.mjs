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
