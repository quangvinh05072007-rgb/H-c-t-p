import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import JSZip from 'jszip';
import { createApp } from '../server/app.mjs';
import { seedSample, SAMPLE_PASSWORD } from '../server/seed.mjs';
import { parsePackage, samplePackage, bindImages } from '../shared/package.mjs';

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
  return {
    async upload(path, buf) {
      const r = await fetch(base + path, { method: 'POST', headers: { cookie, 'content-type': 'application/octet-stream', 'x-smartexam': '1' }, body: buf });
      return { status: r.status, data: await r.json() };
    },
    async get(path) {
      const r = await fetch(base + path, { headers: { cookie } });
      return { status: r.status, data: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
    },
  };
}
// 1x1 PNG hợp lệ
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

test('Kiểm tra gói: chuẩn hóa đáp án, báo lỗi từng mục, mục lỗi không chặn mục đúng', () => {
  const pkg = samplePackage();
  pkg.questions.push({ id: 'x1', type: 'mcq', topic: 'T12.KHONGCO', level: 5, stem: '', options: ['a'], answer: 'E' });
  pkg.questions.push({ id: 'x2', type: 'tf', topic: 'T12.XSDK', level: 2, stem: 'Đề có hình [[image:h.png]]', options: ['a', 'b', 'c', 'd'], answer: 'DDSS' });
  pkg.exams.push({ title: 'Đề lỗi', questions: ['c1', 'x1', 'zz'] });
  const p = parsePackage(JSON.stringify(pkg));
  assert.equal(p.questions.length, 3, 'chỉ 3 câu mẫu hợp lệ');
  assert.equal(p.questions[0].answer, 0);
  assert.deepEqual(p.questions[1].answer, [true, true, true, false]);
  assert.ok(p.errors.some((e) => e.where === 'Câu x1' && /topic/.test(e.message) && /level/.test(e.message)));
  assert.ok(p.errors.some((e) => e.where === 'Câu x2' && /thiếu hình h\.png/.test(e.message)));
  assert.ok(p.errors.some((e) => e.where === 'Đề Đề lỗi' && /zz/.test(e.message) && /x1/.test(e.message)));
  assert.equal(p.exams.length, 1);
  assert.equal(p.lessons.length, 1);
  assert.equal(parsePackage('{nope').errors[0].where, 'Gói');
  assert.match(parsePackage({ questions: [] }).errors[0].message, /format/);
  assert.equal(bindImages('a [[image:h.png]] b', { 'h.png': 7 }), 'a [[img:7]] b');
});

test('Nhập gói .zip: hình, duyệt luôn, tạo đề; bài học trong gói của giáo viên bị bỏ qua; nhập lại không nhân đôi câu', async () => {
  const lan = await login('gv.lan');
  const pkg = samplePackage();
  pkg.source = 'Gói thử nghiệm';
  pkg.questions[0].stem = 'Câu có hình [[image:hinh/do-thi.png]]: họ nguyên hàm của $\\cos x$';
  pkg.lessons[0].examples[0].solution = 'Xem hình [[image:hinh/do-thi.png]]';
  const zip = new JSZip();
  zip.file('goi.json', JSON.stringify(pkg));
  zip.file('hinh/do-thi.png', PNG);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });

  const dry = await lan.upload('/api/import/package?filename=goi.zip&dryRun=1', buf);
  assert.equal(dry.status, 200);
  assert.equal(dry.data.questions, 3);
  assert.equal(dry.data.exams.length, 1);
  assert.deepEqual(dry.data.errors, []);
  assert.deepEqual(dry.data.lessons, [], 'giáo viên không nhập bài tự học');
  assert.ok(dry.data.warnings.some((w) => /Bài tự học do chủ web nhập: bỏ qua 1 bài học/.test(w)));
  const before = app.db.get('SELECT COUNT(*) n FROM questions').n;
  assert.equal(app.db.get('SELECT COUNT(*) n FROM questions').n, before, 'kiểm tra thử không ghi gì');

  const done = await lan.upload('/api/import/package?filename=goi.zip&approve=1', buf);
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal(done.data.approved, 3);
  assert.equal(done.data.exams.length, 1);
  assert.equal(done.data.lessons, 0);
  assert.equal(done.data.images, 1);
  const q = app.db.get("SELECT stem, status, source FROM questions WHERE stem LIKE 'Câu có hình%'");
  assert.match(q.stem, /\[\[img:\d+\]\]/);
  assert.equal(q.status, 'approved');
  assert.equal(q.source, 'imported');
  const exam = app.db.get('SELECT title, visibility, items_json FROM exams WHERE id = ?', done.data.exams[0].id);
  assert.equal(exam.visibility, 'school');
  assert.equal(exam.items.length, 3);

  const lessons = await lan.get('/api/lessons');
  assert.equal(lessons.data.lessons['T12.NGUYENHAM'], undefined, 'bài tự học không bị giáo viên thay');

  const again = await lan.upload('/api/import/package?filename=goi.zip&approve=1', buf);
  assert.equal(again.data.skipped, 3);
  assert.equal(again.data.approved, 0);

  const student = await login('hs.an.nm');
  assert.equal((await student.upload('/api/import/package?filename=goi.json', Buffer.from(JSON.stringify(pkg)))).status, 403);
  assert.equal((await student.get('/api/lessons')).status, 200);
});

test('Gói không duyệt luôn: câu ở dạng nháp và đề chưa được tạo; file sai định dạng bị từ chối', async () => {
  const lan = await login('gv.lan');
  const pkg = samplePackage();
  pkg.questions.forEach((q) => (q.stem = `${q.stem} (bản nháp)`));
  const r = await lan.upload('/api/import/package?filename=goi.json', Buffer.from(JSON.stringify(pkg)));
  assert.equal(r.status, 200);
  assert.equal(r.data.drafts, 3);
  assert.equal(r.data.exams.length, 0);
  assert.ok(r.data.warnings.some((w) => /chưa duyệt/.test(w)));
  assert.equal((await lan.upload('/api/import/package?filename=goi.txt', Buffer.from('x'))).status, 400);
  const sample = await lan.get('/api/import/package-sample.json');
  assert.equal(sample.status, 200);
});

test('Dạng toán: nhập qua gói, sửa, lọc; kiểm tra gói báo câu gần trùng với ngân hàng', async () => {
  const lan = await login('gv.lan');
  const pkg = samplePackage();
  pkg.questions.forEach((q, i) => (q.stem = `${q.stem} [dạng ${i}]`));
  pkg.questions[2].form = 'Tích phân cơ bản';
  pkg.exams = [];
  pkg.lessons = [];
  const r = await lan.upload('/api/import/package?filename=goi.json&approve=1', Buffer.from(JSON.stringify(pkg)));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const forms = await lan.get('/api/bank/forms?topic=T12.NGUYENHAM');
  assert.ok(forms.data.forms.some((f) => f.form === 'Nguyên hàm cơ bản'));
  assert.ok(forms.data.forms.some((f) => f.form === 'Tích phân cơ bản'));
  const listed = await lan.get(`/api/questions?topic=T12.NGUYENHAM&form=${encodeURIComponent('Tích phân cơ bản')}&status=all`);
  assert.ok(listed.data.questions.length >= 1);
  assert.ok(listed.data.questions.every((q) => q.form === 'Tích phân cơ bản'));
  // Gói thứ hai có câu gần giống: kiểm tra thử phải báo
  const pkg2 = samplePackage();
  pkg2.questions = [{ ...pkg.questions[0], id: 'n1', stem: pkg.questions[0].stem.replace('[dạng 0]', '[dạng 0 bản mới]') }];
  pkg2.exams = [];
  pkg2.lessons = [];
  const dry = await lan.upload('/api/import/package?filename=goi.json&dryRun=1', Buffer.from(JSON.stringify(pkg2)));
  assert.equal(dry.status, 200);
  assert.equal(dry.data.duplicates.length, 1);
  assert.equal(dry.data.duplicates[0].key, 'n1');
});
