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
  const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: SAMPLE_PASSWORD }) });
  assert.equal(r.status, 200, username);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return async (method, path, body) => {
    const x = await fetch(base + path, { method, headers: { cookie, 'content-type': 'application/json', 'x-smartexam': '1' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const ct = x.headers.get('content-type') ?? '';
    return { status: x.status, data: ct.includes('json') ? await x.json() : null };
  };
}

test('Sửa đề đã giao tạo phiên bản mới; bài đã nộp vẫn mở đúng; không trộn lại mã đề', async () => {
  const gv = await login('gv.lan');
  const asg = app.db.get("SELECT a.exam_id, t.id att, t.student_id FROM assignments a JOIN attempts t ON t.assignment_id = a.id WHERE t.status != 'in_progress' LIMIT 1");
  const old = app.db.get('SELECT id, title, items_json, variants_json, created_by FROM exams WHERE id = ?', asg.exam_id);
  const owner = app.db.get('SELECT username FROM users WHERE id = ?', old.created_by).username;
  const author = owner === 'gv.lan' ? gv : await login(owner);
  const detail = await author('GET', `/api/exams/${old.id}`);
  assert.equal(detail.data.exam.locked, true);
  assert.match(detail.data.exam.lockReason, /đã giao/);

  const before = old.items.map((x) => x.qid);
  const extra = app.db.all(`SELECT id FROM questions WHERE status = 'approved' AND (scope IS NULL OR scope != 'private') AND id NOT IN (${before.join(',')}) LIMIT 2`).map((r) => r.id);
  const items = [...before.slice(2), ...extra].map((qid) => ({ qid }));
  const put = await author('PUT', `/api/exams/${old.id}`, { title: `${old.title} (sửa)`, items, durationMin: 20 });
  assert.equal(put.status, 200);
  assert.equal(put.data.newVersion, true);
  assert.equal(put.data.version, 2);
  assert.notEqual(put.data.id, old.id);

  const oldNow = app.db.get('SELECT items_json, variants_json, superseded_by FROM exams WHERE id = ?', old.id);
  assert.deepEqual(oldNow.items.map((x) => x.qid), before, 'bản cũ giữ nguyên câu');
  assert.deepEqual(oldNow.variants, old.variants, 'bản cũ giữ nguyên mã đề');
  assert.equal(oldNow.superseded_by, put.data.id);

  const stu = await login(app.db.get('SELECT username FROM users WHERE id = ?', asg.student_id).username);
  const res = await stu('GET', `/api/attempts/${asg.att}/result`);
  assert.equal(res.status, 200, 'bài đã nộp vẫn mở được');
  assert.ok(res.data.items.every((it) => it.stem));

  // Kho đề chỉ hiện bản mới nhất; chi tiết liệt kê các phiên bản
  const list = await author('GET', '/api/exams');
  assert.ok(!list.data.exams.some((e) => e.id === old.id));
  const v2 = list.data.exams.find((e) => e.id === put.data.id);
  assert.equal(v2.version, 2);
  const d2 = await author('GET', `/api/exams/${put.data.id}`);
  assert.deepEqual(d2.data.exam.versions.map((v) => v.version), [1, 2]);
  assert.equal(d2.data.exam.locked, false, 'phiên bản mới chưa dùng thì sửa thẳng được');

  // Bản cũ không sửa tiếp, không trộn lại mã đề
  assert.equal((await author('PUT', `/api/exams/${old.id}`, { title: 'x', items })).status, 409);
  assert.equal((await author('POST', `/api/exams/${old.id}/regenerate-variants`, { count: 2 })).status, 409);
});

test('Tải gói in khóa đề; đề chưa dùng thì sửa thẳng', async () => {
  const gv = await login('gv.lan');
  const qids = app.db.all("SELECT id FROM questions WHERE status = 'approved' AND (scope IS NULL OR scope != 'private') LIMIT 3").map((r) => r.id);
  const created = await gv('POST', '/api/exams', { title: 'Đề nháp vòng đời', items: qids.map((qid) => ({ qid })), durationMin: 15 });
  const id = created.data.id;
  const put = await gv('PUT', `/api/exams/${id}`, { title: 'Đề nháp vòng đời (sửa)', items: qids.slice(0, 2).map((qid) => ({ qid })) });
  assert.equal(put.data.id, id);
  assert.ok(!put.data.newVersion);
  const zip = await fetch(`${base}/api/exams/${id}/variants-zip`, { headers: { cookie: '' } });
  assert.equal(zip.status, 401);
  const z = await gv('GET', `/api/exams/${id}/variants-zip`);
  assert.equal(z.status, 200);
  const d = await gv('GET', `/api/exams/${id}`);
  assert.equal(d.data.exam.locked, true);
  assert.match(d.data.exam.lockReason, /gói in/);
  const put2 = await gv('PUT', `/api/exams/${id}`, { title: 'Đề nháp vòng đời (v2)', items: qids.map((qid) => ({ qid })) });
  assert.equal(put2.data.newVersion, true);
});

test('Bài tự luyện giữ câu hỏi lúc làm dù giáo viên sửa đáp án sau đó', async () => {
  const stu = await login('hs.chau.tb');
  const start = await stu('POST', '/api/practice/start', { mode: 'topic', topics: ['T12.NGUYENHAM'], count: 3 });
  assert.equal(start.status, 200);
  const qid = start.data.items[0].qid;
  const snap = app.db.get('SELECT snapshot_json FROM attempts WHERE id = ?', start.data.id).snapshot;
  assert.ok(snap?.[qid], 'đã chụp câu hỏi lúc bắt đầu');
  const before = snap[qid].stem;
  app.db.run('UPDATE questions SET stem = ? WHERE id = ?', 'ĐÃ SỬA SAU', qid);
  const again = await stu('GET', `/api/attempts/${start.data.id}`);
  assert.equal(again.data.items.find((i) => i.qid === qid).stem, before);
  app.db.run('UPDATE questions SET stem = ? WHERE id = ?', before, qid);
});

test('Kho riêng của giáo viên, đề xuất vào kho chung, chủ web nhận hoặc trả lại', async () => {
  const lan = await login('gv.lan');
  const minh = await login('gv.minh');
  const admin = await login('quanly');
  const mk = (who, stem) => who('POST', '/api/questions', { type: 'mcq', stem, options: ['1', '2', '3', '4'], answer: 0, topic: 'T11.DAOHAM', level: 1 });
  const q = (await mk(lan, 'Câu riêng của cô Lan')).data.id;
  assert.equal(app.db.get('SELECT scope FROM questions WHERE id = ?', q).scope, 'private');
  await lan('POST', '/api/questions/approve', { ids: [q] });
  assert.equal(app.db.get('SELECT status FROM questions WHERE id = ?', q).status, 'approved', 'giáo viên tự duyệt câu riêng để dùng');

  // Người khác không thấy, không dùng, không sửa
  assert.ok(!(await minh('GET', '/api/questions?status=all')).data.questions.some((x) => x.id === q));
  assert.equal((await minh('POST', '/api/exams', { title: 'Mượn câu', items: [{ qid: q }] })).status, 400);
  assert.equal((await minh('PUT', `/api/questions/${q}`, { level: 2 })).status, 404);
  // Chính mình dùng được trong đề
  assert.equal((await lan('POST', '/api/exams', { title: 'Bài tập lớp cô Lan', items: [{ qid: q }] })).status, 200);
  assert.ok((await lan('GET', '/api/questions?scope=mine&status=all')).data.questions.some((x) => x.id === q));

  // Đề xuất → chủ web thấy trong hàng chờ → nhận vào kho chung
  assert.equal((await lan('POST', '/api/questions/propose', { ids: [q] })).data.proposed, 1);
  assert.ok((await admin('GET', '/api/questions?scope=proposed&status=all')).data.questions.some((x) => x.id === q));
  assert.equal((await lan('POST', '/api/questions/adopt', { ids: [q] })).status, 403);
  assert.deepEqual((await admin('POST', '/api/questions/adopt', { ids: [q] })).data.adopted, [q]);
  const row = app.db.get('SELECT scope, status, proposed_at FROM questions WHERE id = ?', q);
  assert.deepEqual([row.scope, row.status, row.proposed_at], ['common', 'approved', null]);
  // Vào kho chung: mọi giáo viên thấy, nhưng chỉ chủ web sửa
  assert.ok((await minh('GET', '/api/questions?status=all')).data.questions.some((x) => x.id === q));
  assert.equal((await lan('PUT', `/api/questions/${q}`, { level: 2 })).status, 403);
  assert.equal((await admin('PUT', `/api/questions/${q}`, { level: 2 })).status, 200);

  // Trả lại kèm ghi chú
  const q2 = (await mk(lan, 'Câu riêng thứ hai của cô Lan')).data.id;
  await lan('POST', '/api/questions/propose', { ids: [q2] });
  assert.equal((await admin('POST', '/api/questions/return', { ids: [q2], note: 'Thiếu lời giải' })).data.returned, 1);
  const r2 = app.db.get('SELECT scope, proposed_at, review_note FROM questions WHERE id = ?', q2);
  assert.deepEqual([r2.scope, r2.proposed_at, r2.review_note], ['private', null, 'Thiếu lời giải']);

  // Câu chủ web tạo vào thẳng kho chung
  const q3 = (await mk(admin, 'Câu của chủ web')).data.id;
  assert.equal(app.db.get('SELECT scope FROM questions WHERE id = ?', q3).scope, 'common');
});

test('Học sinh chỉ thấy đề chính thức; chỉ chủ web đặt đề chính thức', async () => {
  const lan = await login('gv.lan');
  const admin = await login('quanly');
  const stu = await login('hs.an.nm');
  const qids = app.db.all("SELECT id FROM questions WHERE status = 'approved' AND (scope IS NULL OR scope != 'private') LIMIT 3").map((r) => r.id);
  const t = await lan('POST', '/api/exams', { title: 'Bài tập riêng cô Lan', items: qids.map((qid) => ({ qid })), visibility: 'school' });
  const a = await admin('POST', '/api/exams', { title: 'Đề chính thức của chủ web', items: qids.map((qid) => ({ qid })), visibility: 'school' });
  const cat = (await stu('GET', '/api/student/practice-exams')).data.exams.map((e) => e.id);
  assert.ok(!cat.includes(t.data.id), 'bài tập giáo viên không lên mục Đề thi');
  assert.ok(cat.includes(a.data.id), 'đề chủ web chia sẻ là đề chính thức');
  assert.equal((await lan('POST', `/api/exams/${t.data.id}/official`, { official: true })).status, 403);
  await admin('POST', `/api/exams/${a.data.id}/official`, { official: false });
  assert.ok(!(await stu('GET', '/api/student/practice-exams')).data.exams.some((e) => e.id === a.data.id));
  const list = (await lan('GET', '/api/exams')).data.exams;
  assert.equal(list.find((e) => e.id === t.data.id).official, false);
});
