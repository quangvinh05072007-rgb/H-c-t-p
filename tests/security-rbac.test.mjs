import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server/app.mjs';
import { SAMPLE_PASSWORD, seedSample } from '../server/seed.mjs';

let clock = Date.parse('2026-10-19T08:00:00+07:00');
let app;
let server;
let base;

before(async () => {
  app = createApp({ dbFile: ':memory:', clock: () => clock, aiImpl: { enabled: false } });
  seedSample(app);
  server = http.createServer(app.handle);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  app?.db?.close();
});

function client() {
  let cookie = '';
  let token = '';
  const call = async (method, p, body, opts = {}) => {
    const headers = { ...opts.headers };
    if (opts.useBearer && token) headers['authorization'] = `Bearer ${token}`;
    else if (!opts.anon && cookie) headers['cookie'] = cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(base + p, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const ct = res.headers.get('content-type') ?? '';
    const data = ct.includes('json') ? await res.json().catch(() => null) : await res.text();
    if (data && typeof data === 'object' && data.token) token = data.token;
    return { status: res.status, data, headers: res.headers, ct };
  };
  return {
    call,
    get: (p, opts) => call('GET', p, undefined, opts),
    post: (p, b = {}, opts) => call('POST', p, b, opts),
    put: (p, b = {}, opts) => call('PUT', p, b, opts),
    get token() {
      return token;
    },
    get cookie() {
      return cookie;
    },
    async login(username, password = SAMPLE_PASSWORD) {
      const r = await call('POST', '/api/login', { username, password });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      return r.data;
    },
  };
}

test('OMR template requires staff auth when examId is specified and escapes HTML/XSS', async () => {
  const anon = client();
  const lan = client();
  const minh = client();
  const student = client();
  const khac = client();

  await lan.login('gv.lan');
  await minh.login('gv.minh');
  await student.login('hs.an.nm');
  await khac.login('gv.khac');

  // Create a private exam by gv.lan with XSS payload in title
  const qRes = await lan.post('/api/questions', {
    type: 'mcq',
    stem: 'Câu hỏi kiểm tra bảo mật $1+1=2$',
    options: ['1', '2', '3', '4'],
    answer: 1,
    topic: 'T11.DAOHAM',
    level: 1,
    explanation: 'Đáp án 2',
  });
  assert.equal(qRes.status, 200);
  await lan.post('/api/questions/approve', { ids: [qRes.data.id] });

  const xssTitle = 'Đề thi <script>alert(1)</script> & "test"';
  const examRes = await lan.post('/api/exams', {
    title: xssTitle,
    items: [{ qid: qRes.data.id }],
    durationMin: 45,
    variants: 1,
    seed: 'omr-sec-1',
  });
  assert.equal(examRes.status, 200);
  const examId = examRes.data.id;

  // Anonymous or student cannot access examId template
  assert.equal((await anon.get(`/api/omr/template?examId=${examId}`)).status, 401);
  assert.equal((await student.get(`/api/omr/template?examId=${examId}`)).status, 403);
  // Another teacher cannot access private exam template, nor cross-school
  assert.equal((await minh.get(`/api/omr/template?examId=${examId}`)).status, 404);
  assert.equal((await khac.get(`/api/omr/template?examId=${examId}`)).status, 404);
  // Invalid examId rejected
  assert.equal((await lan.get('/api/omr/template?examId=abc')).status, 400);

  // Owner can render and XSS is HTML-escaped
  const ok = await lan.get(`/api/omr/template?examId=${examId}`);
  assert.equal(ok.status, 200);
  assert.ok(!ok.data.includes('<script>alert(1)</script>'));
  assert.ok(ok.data.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));

  // Anonymous generic template still works & escapes schoolName/examTitle
  const generic = await anon.get('/api/omr/template?schoolName=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E&durationMin=99999');
  assert.equal(generic.status, 200);
  assert.ok(!generic.data.includes('<img src=x onerror=alert(1)>'));
  assert.ok(generic.data.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(generic.data.includes('600 phút'));
});

test('Variant regeneration, private practice start, and unapproved bank endpoints enforce ownership and status', async () => {
  const lan = client();
  const minh = client();
  const student = client();
  const admin = client();

  await lan.login('gv.lan');
  await minh.login('gv.minh');
  await student.login('hs.an.nm');
  await admin.login('quanly');

  // Draft question (not approved)
  const draftQ = await lan.post('/api/questions', {
    type: 'mcq',
    stem: 'Câu hỏi nháp chưa duyệt',
    options: ['A', 'B', 'C', 'D'],
    answer: 0,
    topic: 'T11.DAOHAM',
    level: 1,
    explanation: 'Nháp',
  });
  assert.equal(draftQ.status, 200);

  // Student cannot probe draft question via infinite-stream or mistake note
  assert.equal((await student.post('/api/student/infinite-stream/check', { qid: draftQ.data.id, response: 0 })).status, 404);
  assert.equal((await student.post('/api/student/mistakes/note', { qid: draftQ.data.id, note: 'leak' })).status, 404);

  // Mass-assignment attempt on PUT /api/questions/:id cannot force status='approved' or created_by
  const updateRes = await lan.put(`/api/questions/${draftQ.data.id}`, {
    stem: 'Câu hỏi nháp sửa',
    status: 'approved',
    created_by: 9999,
  });
  assert.equal(updateRes.status, 200);
  const qRow = app.db.get('SELECT status, created_by FROM questions WHERE id = ?', draftQ.data.id);
  assert.equal(qRow.status, 'draft');
  assert.notEqual(qRow.created_by, 9999);

  // Approved question + shared exam
  await lan.post('/api/questions/approve', { ids: [draftQ.data.id] });
  const sharedExam = await lan.post('/api/exams', {
    title: 'Đề chung trường cho RBAC test',
    items: [{ qid: draftQ.data.id }],
    durationMin: 15,
    variants: 2,
    seed: 'rbac-shared-1',
    visibility: 'school',
  });
  assert.equal(sharedExam.status, 200);

  const privateExam = await lan.post('/api/exams', {
    title: 'Đề riêng tư bí mật',
    items: [{ qid: draftQ.data.id }],
    durationMin: 15,
    variants: 1,
    seed: 'rbac-priv-1',
    visibility: 'private',
  });
  assert.equal(privateExam.status, 200);

  // Another teacher (gv.minh) CANNOT regenerate variants on gv.lan's shared exam
  const regenMinh = await minh.post(`/api/exams/${sharedExam.data.id}/regenerate-variants`, { count: 2 });
  assert.equal(regenMinh.status, 403);

  // Student CANNOT start practice on a private exam
  const startPriv = await student.post('/api/student/practice-exams/start', { examId: privateExam.data.id });
  assert.equal(startPriv.status, 404);

  // Đề giáo viên chia sẻ chỉ dùng chung giữa giáo viên; học sinh chỉ làm được đề chính thức của chủ web
  const startShared = await student.post('/api/student/practice-exams/start', { examId: sharedExam.data.id });
  assert.equal(startShared.status, 404);
  assert.equal((await lan.post(`/api/exams/${sharedExam.data.id}/official`, { official: true })).status, 403, 'giáo viên không tự đặt đề chính thức');
  assert.equal((await admin.post(`/api/exams/${sharedExam.data.id}/official`, { official: true })).status, 200);
  const startPub = await student.post('/api/student/practice-exams/start', { examId: sharedExam.data.id });
  assert.equal(startPub.status, 200);
});

test('Retake blocks un-released assignments and student class isolation enforces join codes & locked modules', async () => {
  const lan = client();
  const minh = client();
  const student = client();

  await lan.login('gv.lan');
  await minh.login('gv.minh');
  await student.login('hs.an.nm');

  // Teacher B (minh) inspects /api/classes?scope=all: codes of other teachers' classes are masked & unsearchable
  const allClsRes = await minh.get('/api/classes?scope=all&search=12A1-2026');
  assert.equal(allClsRes.status, 200);
  assert.equal(allClsRes.data.classes.length, 0, 'cannot search other teacher class by join code');
  const allClsList = await minh.get('/api/classes?scope=all');
  const class1 = allClsList.data.classes.find((c) => c.name === '12A1');
  assert.ok(class1);
  assert.equal(class1.code, null, 'other teacher class code must be masked');

  // Student class directory masks codes of unenrolled classes and blocks switching/viewing without join code
  const sCls = await student.get('/api/student/class');
  assert.equal(sCls.status, 200);
  const class2 = sCls.data.allClasses.find((c) => !c.enrolled);
  assert.ok(class2, 'student should see another school class in directory');
  assert.equal(class2.code, null, 'unenrolled class code must be masked for student');
  assert.equal((await student.get(`/api/student/class?classId=${class2.id}`)).status, 403);
  assert.equal((await student.post('/api/student/class/switch', { classId: class2.id })).status, 403);

  // Locked module material view is rejected
  const lockedMod = await minh.post(`/api/classes/${class2.id}/modules`, {
    weekNo: 99,
    title: 'Module khóa',
    locked: true,
  });
  assert.equal(lockedMod.status, 200);
  const lockedMat = await minh.post(`/api/classes/${class2.id}/materials`, {
    moduleId: lockedMod.data.id,
    title: 'Tài liệu bí mật',
    content: 'Nội dung',
  });
  assert.equal(lockedMat.status, 200);
  assert.equal((await student.post(`/api/student/materials/${lockedMat.data.id}/view`, {})).status, 403);

  // Un-released assignment retake protection
  const qRes = await lan.post('/api/questions', {
    type: 'mcq',
    stem: 'Câu hỏi kiểm tra retake bảo mật',
    options: ['1', '2', '3', '4'],
    answer: 0,
    topic: 'T11.DAOHAM',
    level: 1,
    explanation: 'Đáp án 1',
  });
  await lan.post('/api/questions/approve', { ids: [qRes.data.id] });
  const exRes = await lan.post('/api/exams', {
    title: 'Đề kiểm tra ẩn đáp án tới khi đóng',
    items: [{ qid: qRes.data.id }],
    durationMin: 15,
    variants: 1,
    seed: 'retake-lock-1',
  });
  const asgRes = await lan.post('/api/assignments', {
    examId: exRes.data.id,
    classId: sCls.data.class.id,
    mode: 'exam',
    title: 'Kiểm tra đóng đáp án',
    openAt: clock - 1000,
    closeAt: clock + 86400000,
    durationMin: 15,
    showResult: 'score_only_until_close',
  });
  assert.equal(asgRes.status, 200);
  const assignmentId = asgRes.data.ids[0];
  assert.ok(assignmentId);

  // Invalid/missing assignmentId returns 400 cleanly (never 500)
  assert.equal((await student.post('/api/attempts/start', {})).status, 400);

  const startAtt = await student.post('/api/attempts/start', { assignmentId });
  assert.equal(startAtt.status, 200);
  // Cannot retake while in_progress
  assert.equal((await student.post(`/api/attempts/${startAtt.data.id}/retake`, {})).status, 403);
  // Invalid payload rejected on save
  assert.equal((await student.put(`/api/attempts/${startAtt.data.id}/save`, { responses: 'bad' })).status, 400);
  const submitAtt = await student.post(`/api/attempts/${startAtt.data.id}/submit`, { responses: { [qRes.data.id]: 0 } });
  assert.equal(submitAtt.status, 200);
  // Cannot retake before close when show_result is score_only_until_close
  assert.equal((await student.post(`/api/attempts/${startAtt.data.id}/retake`, {})).status, 403);

  // Cross-teacher assignment attempt isolation (even if student later moves class)
  const class2Row = app.db.get('SELECT id, code FROM classes WHERE id = ?', class2.id);
  const join2 = await student.post('/api/student/class/join', { code: class2Row.code });
  assert.equal(join2.status, 200);
  // Student is now in minh's class, yet attempt belongs to lan's assignment -> minh CANNOT view/feedback it
  assert.equal((await minh.get(`/api/teacher/attempts/${startAtt.data.id}`)).status, 404);
  assert.equal((await minh.post(`/api/teacher/attempts/${startAtt.data.id}/feedback`, { feedback: 'x' })).status, 404);
  // Original assignment teacher (lan) CAN still view it
  assert.equal((await lan.get(`/api/teacher/attempts/${startAtt.data.id}`)).status, 200);
});

test('Password change revokes other sessions, /api/meta hides lanIps from anon/students, CSV escapes formulas, and malformed URLs do not 500', async () => {
  const anon = client();
  const s1 = client();
  const s2 = client();

  // /api/meta hides lanIps from unauthenticated and student users
  const metaAnon = await anon.get('/api/meta');
  assert.equal(metaAnon.status, 200);
  assert.deepEqual(metaAnon.data.lanIps, []);

  await s1.login('hs.chau.tb');
  await s2.login('hs.chau.tb');

  const metaStudent = await s1.get('/api/meta');
  assert.equal(metaStudent.status, 200);
  assert.deepEqual(metaStudent.data.lanIps, []);

  // Old password wrong -> 400
  const badPw = await s1.post('/api/me/password', { oldPassword: 'wrong-password', newPassword: 'newpassword123' });
  assert.equal(badPw.status, 400);

  // Change password on s1 -> s2 should be invalidated (401), s1 stays valid
  const okPw = await s1.post('/api/me/password', { oldPassword: SAMPLE_PASSWORD, newPassword: 'newpassword123' });
  assert.equal(okPw.status, 200);
  assert.equal((await s1.get('/api/me')).status, 200);
  assert.equal((await s2.get('/api/me')).status, 401);

  // Restore password back so other tests/seed users remain consistent if reused
  const restorePw = await s1.post('/api/me/password', { oldPassword: 'newpassword123', newPassword: SAMPLE_PASSWORD });
  assert.equal(restorePw.status, 200);

  // Math verify rejects oversized expression (>1500 chars)
  const longExpr = '1+'.repeat(800) + '1';
  const mathRes = await s1.post('/api/math/verify', { student: longExpr, expected: '2' });
  assert.equal(mathRes.status, 400);

  // CSV formula injection sanitization on assignment export
  const lan = client();
  await lan.login('gv.lan');
  const firstAsg = app.db.get('SELECT id FROM assignments WHERE created_by = (SELECT id FROM users WHERE username = ?) LIMIT 1', 'gv.lan');
  if (firstAsg) {
    const evilUser = app.db.get("SELECT id FROM users WHERE role = 'student' AND class_id = (SELECT class_id FROM assignments WHERE id = ?) LIMIT 1", firstAsg.id);
    if (evilUser) {
      const origName = app.db.get('SELECT display_name FROM users WHERE id = ?', evilUser.id).display_name;
      app.db.run('UPDATE users SET display_name = ? WHERE id = ?', '=cmd|"/C calc"!A0', evilUser.id);
      const csvRes = await lan.get(`/api/assignments/${firstAsg.id}/export.csv`);
      assert.equal(csvRes.status, 200);
      assert.ok(csvRes.data.includes("\"'=cmd|\"\"/C calc\"\"!A0\""));
      app.db.run('UPDATE users SET display_name = ? WHERE id = ?', origName, evilUser.id);
    }
  }

  // Malformed percent encoding & path traversal should not crash or leak files
  const badPct = await anon.get('/api/exams/%E0%A4%A');
  assert.equal(badPct.status, 400);
  const trav = await anon.get('/../package.json');
  assert.notEqual(trav.status, 200);
});
