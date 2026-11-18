import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server/app.mjs';
import { seedSample, SAMPLE_PASSWORD } from '../server/seed.mjs';
import { guessCategory, examCategory, cleanCategory } from '../shared/examCategory.mjs';
import { buildInsights } from '../shared/insights.mjs';

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

function client() {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { cookie, 'content-type': 'application/json', 'x-smartexam': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: res.status, data: await res.json() };
  };
}
async function login(username) {
  const c = client();
  assert.equal((await c('POST', '/api/login', { username, password: SAMPLE_PASSWORD })).status, 200);
  return c;
}

test('Loại đề: đoán theo tên, giáo viên chọn thì dùng loại đã chọn', () => {
  assert.equal(guessCategory('Kiểm tra giữa kì I'), 'giua-ky');
  assert.equal(guessCategory('Đề thi cuối học kỳ II'), 'cuoi-ky');
  assert.equal(guessCategory('Đề minh họa tốt nghiệp THPT 2026'), 'thpt');
  assert.equal(guessCategory('Thi thử Sở Hà Nội lần 2'), 'khao-sat');
  assert.equal(guessCategory('Bài tập về nhà: Khảo sát hàm số'), 'on-tap', '"khảo sát hàm số" là tên chuyên đề');
  assert.equal(guessCategory('Ôn luyện hàm số', 90), 'on-tap');
  assert.equal(guessCategory('Kiểm tra 15 phút', 15), 'kiem-tra');
  assert.equal(guessCategory('Đề số 3', 90), 'khao-sat');
  assert.equal(examCategory('cuoi-ky', 'Kiểm tra giữa kì I', 90), 'cuoi-ky');
  assert.equal(cleanCategory('lung-tung'), null);
});

test('Kho đề học sinh: có loại đề; chọn Luyện tập hoặc Thi thật khi vào đề', async () => {
  const st = await login('hs.chau.tb');
  const cat = await st('GET', '/api/student/practice-exams');
  assert.equal(cat.status, 200);
  const exam = cat.data.exams.find((e) => e.questionCount >= 5);
  assert.ok(exam.category && exam.categoryLabel);
  assert.ok(Array.isArray(exam.history));

  // Luyện tập: không giới hạn giờ, được kiểm tra từng câu; vào lại thì tiếp bài cũ
  const p1 = await st('POST', '/api/student/practice-exams/start', { examId: exam.id, mode: 'practice' });
  assert.equal(p1.status, 200);
  assert.equal(p1.data.deadlineAt, null);
  const p2 = await st('POST', '/api/student/practice-exams/start', { examId: exam.id, mode: 'practice' });
  assert.equal(p2.data.id, p1.data.id, 'vào lại thì làm tiếp bài đang dở');
  const it = p1.data.items[0];
  const chk = await st('POST', `/api/practice/${p1.data.id}/check`, { qid: it.qid, response: it.type === 'mcq' ? 0 : null });
  assert.equal(chk.status, 200);

  // Thi thật: tính giờ theo đề, không xem đáp án giữa chừng
  const t = await st('POST', '/api/student/practice-exams/start', { examId: exam.id, mode: 'timed' });
  assert.equal(t.status, 200);
  assert.notEqual(t.data.id, p1.data.id);
  assert.equal(t.data.mode, 'timed');
  assert.ok(t.data.deadlineAt > Date.now() + (exam.durationMin - 1) * 60000);
  const bad = await st('POST', `/api/practice/${t.data.id}/check`, { qid: t.data.items[0].qid, response: 0 });
  assert.equal(bad.status, 400);

  // Nộp bài thi thật → lần làm ghi vào lịch sử của đề, ghép theo mã đề
  const fin = await st('POST', `/api/practice/${t.data.id}/finish`, { responses: {}, times: {} });
  assert.equal(fin.status, 200);
  const after = await st('GET', '/api/student/practice-exams');
  const same = after.data.exams.find((e) => e.id === exam.id);
  assert.ok(same.history.some((h) => h.id === t.data.id && h.mode === 'timed'));
  assert.ok(same.inProgress, 'bài luyện tập vẫn đang dở');
  assert.equal(same.inProgressMode, 'practice');
});

test('Giáo viên đổi loại đề; học sinh thấy đề ở nhóm mới', async () => {
  const gv = await login('gv.lan');
  const list = await gv('GET', '/api/exams');
  const mine = list.data.exams.find((e) => e.mine && e.visibility === 'school');
  assert.ok(mine, 'có đề dùng chung của giáo viên');
  const r = await gv('PUT', `/api/exams/${mine.id}/category`, { category: 'cuoi-ky' });
  assert.equal(r.status, 200);
  assert.equal((await gv('PUT', `/api/exams/${mine.id}/category`, { category: 'khong-co' })).status, 400);
  const detail = await gv('GET', `/api/exams/${mine.id}`);
  assert.equal(detail.data.exam.category, 'cuoi-ky');
  assert.equal(detail.data.exam.categorySet, true);
  const st = await login('hs.an.nm');
  const cat = await st('GET', '/api/student/practice-exams');
  assert.equal(cat.data.exams.find((e) => e.id === mine.id).category, 'cuoi-ky');
});

test('Hồ sơ học tập và báo cáo bài làm có so sánh với lần trước', async () => {
  const st = await login('hs.an.nm');
  const cat = await st('GET', '/api/student/practice-exams');
  const exam = cat.data.exams.find((e) => e.questionCount >= 5);
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const a = await st('POST', '/api/student/practice-exams/start', { examId: exam.id, mode: 'timed' });
    await st('POST', `/api/practice/${a.data.id}/finish`, { responses: {}, times: {} });
    ids.push(a.data.id);
  }
  const rep = await st('GET', `/api/attempts/${ids[1]}/result`);
  assert.equal(rep.status, 200);
  assert.equal(rep.data.previous?.id, ids[0]);

  const pf = await st('GET', '/api/student/profile');
  assert.equal(pf.status, 200);
  assert.ok(pf.data.history.some((h) => h.id === ids[1] && h.type === 'timed'));
  assert.ok(pf.data.scores.length >= 2);
  assert.ok(pf.data.topics.length >= 20, 'bản đồ có đủ chuyên đề 10–12');
  assert.ok(pf.data.insights.length >= 1);
  assert.equal((await (await login('gv.lan'))('GET', '/api/student/profile')).status, 403);
});

test('Phát hiện vấn đề: điểm đi xuống, chuyên đề tụt, hay bỏ trống, lâu chưa học', () => {
  const now = Date.parse('2026-11-19T10:00:00+07:00');
  const day = 86400000;
  const scores = [8, 8, 7.5, 5, 4.5, 4].map((s, i) => ({ at: now - (10 - i) * day, score10: s }));
  const evidence = [];
  for (let i = 0; i < 6; i++) evidence.push({ topic: 'T12.NGUYENHAM', score: 1, correct: 1, error_type: null, at: now - 40 * day });
  for (let i = 0; i < 5; i++) evidence.push({ topic: 'T12.NGUYENHAM', score: 0, correct: 0, error_type: 'formula', at: now - 3 * day });
  const recentResults = [{ items: [{ type: 'short', blank: true }, { type: 'short', blank: true }, { type: 'mcq', blank: true }] }];
  const out = buildInsights({ scores, evidence, activity: [{ day: '2026-11-12', questions: 10 }], recentResults, reviewDue: 0, nowMs: now });
  const keys = out.map((x) => x.key);
  assert.ok(keys.includes('trend-down'));
  assert.ok(keys.includes('drop-T12.NGUYENHAM'));
  assert.ok(keys.includes('err-formula'));
  assert.ok(keys.includes('blank'));
  assert.ok(out.length <= 5);
  assert.equal(out[0].tone, 'bad', 'vấn đề nặng đứng trước');
  assert.match(out.find((x) => x.key === 'blank').body, /Phần III/);
  const calm = buildInsights({ scores: [], evidence: [], nowMs: now });
  assert.equal(calm[0].key, 'ok');
});
