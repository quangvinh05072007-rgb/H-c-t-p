import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server/app.mjs';
import { seedSample, SAMPLE_PASSWORD } from '../server/seed.mjs';
import { schoolYearOf, termOf, gradeFromItems, cleanExamMeta } from '../shared/examMeta.mjs';
import { parsePackage } from '../shared/package.mjs';

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
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return async (method, path, body, raw) => {
    const x = await fetch(base + path, {
      method,
      headers: { cookie, 'content-type': raw ? 'application/octet-stream' : 'application/json', 'x-smartexam': '1' },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    return { status: x.status, data: (x.headers.get('content-type') ?? '').includes('json') ? await x.json() : null };
  };
}

test('Suy ra năm học, học kỳ, khối; kiểm tra thông tin nhập', () => {
  assert.equal(schoolYearOf(Date.parse('2026-03-15T10:00:00+07:00')), '2025-2026');
  assert.equal(schoolYearOf(Date.parse('2026-09-05T10:00:00+07:00')), '2026-2027');
  assert.equal(termOf(Date.parse('2026-10-01T10:00:00+07:00')), 'HK1');
  assert.equal(termOf(Date.parse('2026-04-01T10:00:00+07:00')), 'HK2');
  assert.equal(gradeFromItems([{ topic: 'T12.OXYZ' }, { topic: 'T12.XSDK' }, { topic: 'T11.DAOHAM' }]), 12);
  const ok = cleanExamMeta({ schoolYear: '2025 - 2026', grade: '12', term: 'hk2', date: '2026-03-15', tags: 'ôn thi, 12A1, ôn thi' });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.value, { schoolYear: '2025-2026', grade: 12, term: 'HK2', examDate: '2026-03-15', tags: ['ôn thi', '12A1'] });
  const bad = cleanExamMeta({ schoolYear: '2025-2027', grade: 9, term: 'HK3', examDate: '15/03/2026' });
  assert.equal(bad.errors.length, 4);
});

test('Sửa thông tin đề (cả khi đã khóa), danh sách có thống kê lớp đã giao và điểm TB', async () => {
  const gv = await login('gv.lan');
  const used = app.db.get("SELECT e.id FROM exams e JOIN assignments a ON a.exam_id = e.id JOIN users u ON u.id = e.created_by WHERE u.username = 'gv.lan' LIMIT 1");
  const r = await gv('PUT', `/api/exams/${used.id}/meta`, { schoolYear: '2025-2026', grade: 12, term: 'HK2', category: 'giua-ky', session: 'Lần 1', source: 'Tổ Toán', examDate: '2026-03-15', tags: ['12A1'] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.meta.schoolYear, '2025-2026');
  assert.equal(r.data.category, 'giua-ky');
  assert.equal(r.data.meta.guessed.grade, false);
  assert.equal((await gv('PUT', `/api/exams/${used.id}/meta`, { schoolYear: 'năm ngoái' })).status, 400);
  const minh = await login('gv.minh');
  assert.equal((await minh('PUT', `/api/exams/${used.id}/meta`, { session: 'x' })).status, 403);

  const list = (await gv('GET', '/api/exams')).data.exams;
  const e = list.find((x) => x.id === used.id);
  assert.equal(e.term, 'HK2');
  assert.equal(e.session, 'Lần 1');
  assert.deepEqual(e.tags, ['12A1']);
  assert.ok(e.classes.length >= 1, 'có lớp đã giao');
  assert.ok(e.questionCount > 0 && e.variantCount > 0);
  const d = await gv('GET', `/api/exams/${used.id}`);
  assert.equal(d.data.exam.meta.examDate, '2026-03-15');
  assert.ok(d.data.exam.stats.classes.length >= 1);

  // Phiên bản mới mang theo thông tin đề
  const items = d.data.exam.items.slice(1).map((x) => ({ qid: x.qid }));
  const v2 = await gv('PUT', `/api/exams/${used.id}`, { title: 'Đề sửa bản 2', items });
  assert.equal(v2.data.newVersion, true);
  const d2 = await gv('GET', `/api/exams/${v2.data.id}`);
  assert.equal(d2.data.exam.meta.session, 'Lần 1');
  assert.ok(d2.data.exam.stats.classes.length >= 1, 'thống kê gộp cả phiên bản cũ');
});

test('Thư mục riêng: tạo, xếp đề, đổi tên, xóa; người khác không đụng được', async () => {
  const gv = await login('gv.lan');
  const minh = await login('gv.minh');
  const f = await gv('POST', '/api/exam-folders', { name: 'Ôn thi HK2 – 12A1' });
  assert.equal(f.status, 200);
  const examId = (await gv('GET', '/api/exams')).data.exams[0].id;
  assert.equal((await gv('POST', `/api/exam-folders/${f.data.id}/items`, { examId })).status, 200);
  const list = (await gv('GET', '/api/exams')).data.exams;
  assert.deepEqual(list.find((x) => x.id === examId).folderIds, [f.data.id]);
  assert.equal((await gv('GET', '/api/exam-folders')).data.folders.find((x) => x.id === f.data.id).n, 1);
  assert.equal((await minh('POST', `/api/exam-folders/${f.data.id}/items`, { examId })).status, 404);
  assert.equal((await minh('GET', '/api/exam-folders')).data.folders.length, 0);
  assert.equal((await gv('PUT', `/api/exam-folders/${f.data.id}`, { name: 'Ôn thi HK2' })).status, 200);
  assert.equal((await gv('POST', `/api/exam-folders/${f.data.id}/items`, { examId, add: false })).status, 200);
  assert.deepEqual((await gv('GET', '/api/exams')).data.exams.find((x) => x.id === examId).folderIds, []);
  assert.equal((await gv('DELETE', `/api/exam-folders/${f.data.id}`)).status, 200);
});

test('Gói nhập bản 2: một đề có thông tin đề và chia phần; câu ghi vị trí trong đề gốc', async () => {
  const pkg = {
    format: 'smartexam-package',
    version: 2,
    source: 'Sở thử – Khảo sát – Lần 1 – 2026',
    exam: {
      title: 'Khảo sát lớp 12 lần 1 (gói bản 2)', category: 'khao-sat', schoolYear: '2025-2026', grade: 12, term: 'HK2',
      session: 'Lần 1', source: 'Sở GD&ĐT Thử', date: '2026-03-15', durationMin: 90, variants: 2,
      sections: [{ part: 'I', questions: ['c1', 'c2'] }, { part: 'III', questions: ['c3'] }],
    },
    questions: [
      { id: 'c1', sourceNo: 'Phần I – Câu 1', type: 'mcq', topic: 'T12.NGUYENHAM', level: 1, stem: 'Bản 2: $\\int 2x\\,dx$ bằng', options: ['$x^2+C$', '$2x^2+C$', '$x+C$', '$2+C$'], answer: 'A' },
      { id: 'c2', sourceNo: 'Phần I – Câu 2', type: 'mcq', topic: 'T12.OXYZ', level: 1, stem: 'Bản 2: điểm $O$ có tọa độ', options: ['$(0;0;0)$', '$(1;0;0)$', '$(0;1;0)$', '$(0;0;1)$'], answer: 'A' },
      { id: 'c3', sourceNo: 'Phần III – Câu 1', type: 'short', topic: 'T12.KHAOSAT', level: 2, stem: 'Bản 2: số cực trị của $y=x^3-3x$', options: [], answer: '2' },
    ],
  };
  const p = parsePackage(JSON.stringify(pkg));
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.exams[0].keys, ['c1', 'c2', 'c3']);
  assert.equal(p.exams[0].meta.term, 'HK2');
  const bad = parsePackage(JSON.stringify({ ...pkg, exam: { ...pkg.exam, schoolYear: '2026' } }));
  assert.ok(bad.errors.some((e) => /Năm học/.test(e.message)));

  const admin = await login('quanly');
  const r = await admin('POST', '/api/import/package?filename=goi.json&approve=1', undefined, Buffer.from(JSON.stringify(pkg)));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.exams.length, 1);
  const e = (await admin('GET', `/api/exams/${r.data.exams[0].id}`)).data.exam;
  assert.equal(e.official, true, 'chủ web nhập đề dùng chung → đề chính thức');
  assert.deepEqual([e.meta.schoolYear, e.meta.grade, e.meta.term, e.meta.session, e.meta.source, e.meta.examDate], ['2025-2026', 12, 'HK2', 'Lần 1', 'Sở GD&ĐT Thử', '2026-03-15']);
  assert.equal(e.category, 'khao-sat');
  const q = app.db.get("SELECT source_no, scope FROM questions WHERE stem LIKE 'Bản 2: số cực trị%'");
  assert.equal(q.source_no, 'Phần III – Câu 1');
  assert.equal(q.scope, 'common');
});

test('Độ phủ ngân hàng không đếm câu trong kho riêng của giáo viên khác', async () => {
  const lan = await login('gv.lan');
  const minh = await login('gv.minh');
  const before = (await minh('GET', '/api/bank/coverage')).data;
  const q = (await lan('POST', '/api/questions', { type: 'mcq', stem: 'Câu riêng cho độ phủ', options: ['1', '2', '3', '4'], answer: 0, topic: 'T10.MENHDE', level: 1 })).data.id;
  await lan('POST', '/api/questions/approve', { ids: [q] });
  const after = (await minh('GET', '/api/bank/coverage')).data;
  assert.equal(JSON.stringify(after), JSON.stringify(before));
});
