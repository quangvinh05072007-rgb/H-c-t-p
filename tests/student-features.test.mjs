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

function client() {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { cookie, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: res.status, data: await res.json(), cookie: sc };
  };
}

test('Giáo viên tạo lớp có mã tham gia; Học sinh dùng mã tham gia lớp và xem bài', async () => {
  const teacher = client();
  const tLogin = await teacher('POST', '/api/login', { username: 'gv.lan', password: SAMPLE_PASSWORD });
  assert.equal(tLogin.status, 200);

  // 1. Tạo lớp mới
  const created = await teacher('POST', '/api/classes', { name: '10A3', grade: 10 });
  assert.equal(created.status, 200);
  assert.equal(created.data.name, '10A3');
  assert.ok(created.data.code && created.data.code.startsWith('10A3-'));

  // 2. Học sinh đăng nhập
  const student = client();
  const sLogin = await student('POST', '/api/login', { username: 'hs.an.nm', password: SAMPLE_PASSWORD });
  assert.equal(sLogin.status, 200);

  // Học sinh rời lớp hiện tại (nếu có)
  const leave = await student('POST', '/api/student/class/leave');
  assert.equal(leave.status, 200);

  // Học sinh kiểm tra lớp khi chưa vào lớp
  const noClass = await student('GET', '/api/student/class');
  assert.equal(noClass.status, 200);
  assert.equal(noClass.data.class, null);

  // Nhập sai mã
  const badJoin = await student('POST', '/api/student/class/join', { code: 'MA-KHONG-TON-TAI' });
  assert.equal(badJoin.status, 404);

  // Tham gia lớp vừa tạo bằng mã
  const join = await student('POST', '/api/student/class/join', { code: created.data.code.toLowerCase() });
  assert.equal(join.status, 200);
  assert.equal(join.data.ok, true);
  assert.equal(join.data.class.id, created.data.id);

  // Kiểm tra thông tin lớp đã vào
  const myClass = await student('GET', '/api/student/class');
  assert.equal(myClass.status, 200);
  assert.equal(myClass.data.class.id, created.data.id);
  assert.equal(myClass.data.class.code, created.data.code);
});

test('Học sinh xem danh mục đề tự luyện Toán và bắt đầu luyện đề', async () => {
  const student = client();
  const sLogin = await student('POST', '/api/login', { username: 'hs.chau.tb', password: SAMPLE_PASSWORD });
  assert.equal(sLogin.status, 200);

  const cat = await student('GET', '/api/student/practice-exams');
  assert.equal(cat.status, 200);
  assert.ok(cat.data.exams.length >= 4);

  // App chỉ có môn Toán
  const subjects = cat.data.exams.map((e) => e.subject);
  assert.ok(subjects.includes('Toán'));

  const firstExam = cat.data.exams[0];
  const start = await student('POST', '/api/student/practice-exams/start', { examId: firstExam.id });
  assert.equal(start.status, 200);
  assert.equal(start.data.kind, 'practice');
  assert.equal(start.data.title, firstExam.title);
  assert.ok(start.data.items.length > 0);
});

test('Học sinh xem tổng quan nhận recentAttempt và làm lại đề thi', async () => {
  const student = client();
  const sLogin = await student('POST', '/api/login', { username: 'hs.an.nm', password: SAMPLE_PASSWORD });
  assert.equal(sLogin.status, 200);

  // Xem tổng quan
  const home = await student('GET', '/api/student/home');
  assert.equal(home.status, 200);
  assert.ok(home.data.recentAttempt !== undefined);

  // Nếu có recentAttempt, thử gọi retake
  if (home.data.recentAttempt) {
    const retake = await student('POST', `/api/attempts/${home.data.recentAttempt.id}/retake`);
    assert.equal(retake.status, 200);
    assert.equal(retake.data.kind, 'practice');
    assert.ok(retake.data.title.includes('Làm lại:'));
    assert.ok(retake.data.items.length > 0);
  }
});

test('Học sinh luyện tốc độ (Speed Drill 15 phút) và nhận dự đoán điểm số/radar năng lực', async () => {
  const student = client();
  await student('POST', '/api/login', { username: 'hs.an.nm', password: SAMPLE_PASSWORD });

  // 1. Khởi động Luyện tốc độ 12 câu
  const speed = await student('POST', '/api/practice/start', { mode: 'speed_drill', count: 12 });
  assert.equal(speed.status, 200);
  assert.equal(speed.data.kind, 'practice');
  assert.ok(speed.data.title.includes('Luyện phản xạ tốc độ'));
  assert.equal(speed.data.items.length, 12);

  // 2. Kiểm tra tổng quan trả về radar năng lực và dự đoán điểm
  const home = await student('GET', '/api/student/home');
  assert.equal(home.status, 200);
  assert.ok(home.data.radar !== undefined);
  assert.ok(home.data.prediction !== undefined);
  assert.ok(typeof home.data.prediction.bracket === 'string');
});

test('Giáo viên gửi Lời phê & Tem khích lệ; Giao bài củng cố 5 câu cho cả lớp theo chuyên đề yếu', async () => {
  const teacher = client();
  await teacher('POST', '/api/login', { username: 'gv.lan', password: SAMPLE_PASSWORD });

  // 1. Giáo viên xem một attempt đã nộp
  const student = client();
  await student('POST', '/api/login', { username: 'hs.an.nm', password: SAMPLE_PASSWORD });
  const home = await student('GET', '/api/student/home');
  const targetAttemptId = home.data.recentAttempt?.id || 1;

  // 2. Giáo viên đóng dấu tem và gửi lời phê
  const feedbackRes = await teacher('POST', `/api/teacher/attempts/${targetAttemptId}/feedback`, {
    stamp: '🌟 Tiến bộ vượt bậc',
    feedback: 'Em làm phần câu hỏi trắc nghiệm rất chắc tay. Cố gắng phát huy nhé!',
  });
  assert.equal(feedbackRes.status, 200);
  assert.equal(feedbackRes.data.ok, true);
  assert.equal(feedbackRes.data.teacherStamp, '🌟 Tiến bộ vượt bậc');

  // 3. Học sinh kiểm tra thấy lời phê giáo viên gửi
  const homeAfter = await student('GET', '/api/student/home');
  assert.equal(homeAfter.status, 200);
  assert.ok(homeAfter.data.teacherFeedback !== null);
  assert.equal(homeAfter.data.teacherFeedback.teacherStamp, '🌟 Tiến bộ vượt bậc');

  // 4. Giáo viên giao bài tập củng cố 5 câu 1-chạm cho lớp
  const remedial = await teacher('POST', '/api/teacher/classes/1/remedial', {});
  assert.equal(remedial.status, 200);
  assert.equal(remedial.data.ok, true);
  assert.equal(remedial.data.questionCount, 5);
  assert.ok(/Củng cố/i.test(remedial.data.title));
});


test('Câu đánh dấu khi làm bài được đưa vào Sổ tay lỗi sai, kể cả khi làm đúng, và không ghi đè ghi chú cũ', async () => {
  const student = client();
  assert.equal((await student('POST', '/api/login', { username: 'hs.chau.tb', password: SAMPLE_PASSWORD })).status, 200);
  const cat = await student('GET', '/api/student/practice-exams');
  const start = await student('POST', '/api/student/practice-exams/start', { examId: cat.data.exams[0].id });
  assert.equal(start.status, 200);
  const items = start.data.items;
  const [a, b] = items;
  // Ghi chú sẵn cho câu b: không được bị ghi đè khi nộp bài
  const pre = await student('POST', '/api/student/mistakes/note', { qid: b.qid, note: 'ghi chú riêng', tag: 'careless' });
  assert.equal(pre.status, 200);
  const done = await student('POST', `/api/practice/${start.data.id}/finish`, { responses: {}, times: {}, flagged: [a.qid, b.qid, 999999] });
  assert.equal(done.status, 200);
  const nb = await student('GET', '/api/student/mistakes');
  const byQ = Object.fromEntries(nb.data.mistakes.map((m) => [m.qid, m]));
  assert.ok(byQ[a.qid], 'câu đánh dấu phải có trong Sổ tay');
  assert.match(byQ[a.qid].note, /Đánh dấu/);
  assert.equal(byQ[b.qid].note, 'ghi chú riêng');
  assert.equal(byQ[b.qid].tag, 'careless');
  assert.ok(!byQ[999999], 'không nhận câu ngoài bài làm');
});

test('Thi thử THPT: đúng cấu trúc 12/4/6, 90 phút, không xem đáp án giữa chừng, nộp xong có điểm', async () => {
  const student = client();
  assert.equal((await student('POST', '/api/login', { username: 'hs.an.nm', password: SAMPLE_PASSWORD })).status, 200);
  const start = await student('POST', '/api/practice/start', { mode: 'mock' });
  assert.equal(start.status, 200);
  assert.equal(start.data.mode, 'mock');
  const counts = { mcq: 0, tf: 0, short: 0 };
  for (const it of start.data.items) counts[it.type]++;
  assert.deepEqual(counts, { mcq: 12, tf: 4, short: 6 });
  const mins = Math.round((start.data.deadlineAt - start.data.startedAt) / 60000);
  assert.equal(mins, 90);
  const peek = await student('POST', `/api/practice/${start.data.id}/check`, { qid: start.data.items[0].qid, response: 0 });
  assert.equal(peek.status, 400);
  const done = await student('POST', `/api/practice/${start.data.id}/finish`, { responses: {}, times: {} });
  assert.equal(done.status, 200);
  assert.ok(done.data.result && typeof done.data.result.score10 === 'number');
});

test('Mục tiêu điểm: lưu, kiểm tra giới hạn; dự báo chỉ dựa trên bài đã công bố điểm; có kế hoạch hôm nay', async () => {
  const student = client();
  assert.equal((await student('POST', '/api/login', { username: 'hs.an.nm', password: SAMPLE_PASSWORD })).status, 200);
  const g0 = await student('GET', '/api/student/goal');
  assert.equal(g0.status, 200);
  assert.ok(Array.isArray(g0.data.plan) && g0.data.plan.length >= 1);
  assert.equal(g0.data.week.length, 7);
  if (g0.data.forecast) {
    assert.ok(g0.data.forecast.low <= g0.data.forecast.score && g0.data.forecast.score <= g0.data.forecast.high);
    assert.ok(g0.data.forecast.basis >= 2);
  }
  assert.equal((await student('PUT', '/api/student/goal', { target: 11 })).status, 400);
  const g1 = await student('PUT', '/api/student/goal', { target: 8.1 });
  assert.equal(g1.status, 200);
  assert.equal(g1.data.target, 8);
  const g2 = await student('GET', '/api/student/goal');
  assert.equal(g2.data.target, 8);
  for (const t of g2.data.gainTopics) assert.ok(t.gain > 0 && t.mastery < 0.75);
});

test('Dự báo điểm bỏ qua bài nộp trắng quá nửa', async () => {
  const student = client();
  assert.equal((await student('POST', '/api/login', { username: 'hs.chau.tb', password: SAMPLE_PASSWORD })).status, 200);
  const before = await student('GET', '/api/student/goal');
  const start = await student('POST', '/api/practice/start', { mode: 'mock' });
  await student('POST', `/api/practice/${start.data.id}/finish`, { responses: {}, times: {} });
  const after = await student('GET', '/api/student/goal');
  assert.deepEqual(after.data.forecast, before.data.forecast);
});
