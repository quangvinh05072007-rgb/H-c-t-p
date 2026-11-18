import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import JSZip from 'jszip';
import { createApp } from '../server/app.mjs';
import { seedSample, SAMPLE_PASSWORD } from '../server/seed.mjs';
import { repairPackageText } from '../shared/packageRepair.mjs';
import { parsePackage } from '../shared/package.mjs';
import { mapDocxImages, docxQuestionBlocks } from '../shared/docxImageMap.mjs';
import { buildDocx, richBlocks, DocxImages, readDocx } from '../shared/docx.mjs';
import { buildAiPrompt } from '../shared/aiPrompt.mjs';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

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
    upload: async (path, buf) => {
      const r = await fetch(base + path, { method: 'POST', headers: { cookie, 'content-type': 'application/octet-stream', 'x-smartexam': '1' }, body: buf });
      return { status: r.status, data: await r.json() };
    },
    get: async (path) => {
      const r = await fetch(base + path, { headers: { cookie } });
      return { status: r.status, data: await r.json() };
    },
  };
}

// Viết đúng như AI hay viết sai: một dấu \, bọc ```json, có lời dẫn
const SLOPPY = [
  'Đây là JSON của bạn:',
  '```json',
  String.raw`{"format":"smartexam-package","version":1,"source":"Thử AI","questions":[`,
  String.raw`{"id":"c1","type":"mcq","topic":"T12.NGUYENHAM","level":2,"form":"Tích phân cơ bản","stem":"Tính $\int_0^1 \frac{2x}{x^2+1}dx$ (đề AI)","options":["A. $\ln 2$","B. $2\ln 2$","C. $\dfrac{1}{2}$","D. $1$"],"answer":"A","explanation":"Đặt $t = x^2+1$, $\neq 0$."},`,
  String.raw`{"id":"c2","type":"short","topic":"T12.KHAOSAT","level":3,"stem":"Cho đồ thị như hình [[image:hinh/c2.png]]\nTìm số cực trị (đề AI).","options":[],"answer":"2","explanation":"[AI tự giải] Đồ thị có $2$ điểm cực trị, $\beta \times \theta$."},`,
  String.raw`{"id":"c3","type":"tf","topic":"T12.XSDK","level":2,"stem":"Cho $P(A)=0{,}4$ (đề AI)","options":["a) $P(\bar A)=0{,}6$","b) ý hai","c) ý ba","d) ý bốn"],"answer":"ĐĐSS"}`,
  String.raw`],"exams":[{"title":"Đề thử AI","category":"kiem-tra","durationMin":15,"questions":["c1","c2","c3"]}],"lessons":[]}`,
  '```',
  'Chúc bạn dạy tốt!',
].join('\n');

test('Tự sửa JSON AI viết sai: bỏ ```, nhân đôi \\, giữ nguyên xuống dòng ngoài công thức', () => {
  const fixed = repairPackageText(SLOPPY);
  const pkg = JSON.parse(fixed.text);
  const q1 = pkg.questions[0];
  assert.match(q1.stem, /\$\\int_0\^1 \\frac\{2x\}/);
  assert.match(q1.explanation, /\\neq 0/);
  assert.match(pkg.questions[1].stem, /hình \[\[image:hinh\/c2\.png\]\]\nTìm/, '\\n ngoài công thức vẫn là xuống dòng');
  assert.match(pkg.questions[1].explanation, /\\beta \\times \\theta/);
  assert.ok(fixed.notes.length >= 2);
  // JSON đã đúng thì giữ nguyên
  const good = '{"a":"$\\\\frac{1}{2}$\\nxuống dòng \\u00e9"}';
  assert.equal(repairPackageText(good).text, good);
  assert.equal(JSON.parse(repairPackageText(good).text).a, '$\\frac{1}{2}$\nxuống dòng é');
});

test('Đọc gói: bỏ nhãn A./a), câu AI tự giải thành nháp, báo loại đề sai', () => {
  const p = parsePackage(SLOPPY, new Set(['hinh/c2.png']));
  assert.deepEqual(p.errors, []);
  const [q1, q2, q3] = p.questions;
  assert.equal(q1.options[0], '$\\ln 2$');
  assert.equal(q3.options[0], '$P(\\bar A)=0{,}6$');
  assert.equal(q1.needsReview, false);
  assert.equal(q2.needsReview, true);
  assert.doesNotMatch(q2.explanation, /AI tự giải/);
  assert.ok(p.warnings.some((w) => /AI tự giải/.test(w)));
  assert.ok(p.warnings.some((w) => /nhãn/.test(w)));
  const bad = parsePackage(SLOPPY.replace('"kiem-tra"', '"lung-tung"'), new Set(['hinh/c2.png']));
  assert.ok(bad.errors.some((e) => /category/.test(e.message)));
  // JSON hợp lệ nhưng \frac thành ký tự điều khiển (\f) → khôi phục
  const obj = JSON.parse(repairPackageText(SLOPPY).text);
  obj.questions[0].stem = 'Tính $\x0crac{1}{2}$';
  const p2 = parsePackage(obj, new Set(['hinh/c2.png']));
  assert.equal(p2.questions[0].stem, 'Tính $\\frac{1}{2}$');
});

test('Ghép hình từ Word theo thứ tự câu', () => {
  const text = ['SỞ GD [[img:logo]]', 'PHẦN I', 'Câu 1. Không hình', 'Câu 2: Hình [[img:img2]]', 'A. [[img:img3]] B. x', 'PHẦN III', 'Câu 1. Có hình [[img:img4]]'].join('\n');
  assert.deepEqual(docxQuestionBlocks(text), [[], ['img2', 'img3'], ['img4']]);
  const qs = [
    { id: 'c1', stem: 'không hình' },
    { id: 'c2', stem: 'Hình [[image:hinh/c2.png]]', options: ['[[image:hinh/c2-A.png]]', 'x', 'y', 'z'] },
    { id: 'c3', stem: 'a [[image:hinh/c3.png]] b [[image:hinh/c3b.png]]' },
  ];
  const m = mapDocxImages(qs, text, new Set());
  assert.deepEqual(m.assign, { 'hinh/c2.png': 'img2', 'hinh/c2-A.png': 'img3', 'hinh/c3.png': 'img4' });
  assert.ok(m.warnings.some((w) => /c3/.test(w)), 'thiếu hình thì báo');
  assert.deepEqual(mapDocxImages(qs, text, new Set(['hinh/c2.png'])).assign['hinh/c2-A.png'], 'img2', 'hình đã có sẵn thì không lấy chồng');
});

test('Lời nhắc cho AI: có mã chuyên đề, dạng toán của trường, bản chạy code trả goi.zip', async () => {
  const t = buildAiPrompt({ mode: 'text', forms: { 'T12.NGUYENHAM': ['Đổi biến số'] } });
  assert.match(t, /T12\.OXYZ/);
  assert.match(t, /T12\.NGUYENHAM: Đổi biến số/);
  assert.match(t, /"\$\\\\dfrac\{1\}\{2\}\$"/, 'dặn AI viết hai dấu \\ trong JSON');
  assert.doesNotMatch(t, /goi\.zip/);
  assert.match(buildAiPrompt({ mode: 'code' }), /goi\.zip/);
  app.db.run("UPDATE questions SET form = 'Nguyên hàm cơ bản' WHERE id = (SELECT id FROM questions WHERE topic = 'T12.NGUYENHAM' LIMIT 1)");
  const gv = await login('gv.lan');
  const r = await gv.get('/api/import/ai-prompt?mode=code');
  assert.equal(r.status, 200);
  assert.match(r.data.text, /Nguyên hàm cơ bản/, 'kèm dạng toán đang có trong ngân hàng');
  assert.equal((await (await login('hs.an.nm')).get('/api/import/ai-prompt')).status, 403);
});

test('Nhập: dán JSON AI viết sai + file Word gốc → tự lấy hình, xem trước, câu AI giải vào nháp', async () => {
  // File Word gốc có hình ở câu 2 (đề chia phần, đánh số lại từ 1)
  const imgs = new DocxImages((id) => (String(id) === '1' ? { mime: 'image/png', data: PNG, cx: 900000, cy: 600000 } : null));
  const blocks = [...richBlocks('ĐỀ THỬ'), ...richBlocks('Câu 1. Tính tích phân'), ...richBlocks('Câu 2. Cho đồ thị [[img:1]]', { images: imgs }), ...richBlocks('Câu 1. Ý đúng sai')];
  const docxBuf = await buildDocx(blocks, 'nodebuffer', imgs);
  const back = await readDocx(docxBuf);
  assert.equal(back.images.length, 1, 'file Word thử có 1 hình');

  const zip = new JSZip();
  zip.file('goi.json', SLOPPY);
  zip.file('_goc/de-goc.docx', docxBuf);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const gv = await login('gv.lan');
  const dry = await gv.upload('/api/import/package?filename=goi.zip&dryRun=1', buf);
  assert.equal(dry.status, 200, JSON.stringify(dry.data));
  assert.deepEqual(dry.data.errors, []);
  assert.deepEqual(dry.data.missingImages, []);
  assert.ok(dry.data.warnings.some((w) => /Đã lấy 1 hình từ file Word/.test(w)));
  assert.match(dry.data.imageData['hinh/c2.png'], /^data:image\/png;base64,/);
  assert.equal(dry.data.preview.length, 3);
  assert.equal(dry.data.preview[1].needsReview, true);

  // Không kèm Word: báo đúng hình còn thiếu để dán
  const onlyJson = await gv.upload('/api/import/package?filename=goi.json&dryRun=1', Buffer.from(SLOPPY));
  assert.deepEqual(onlyJson.data.missingImages, ['hinh/c2.png']);

  const done = await gv.upload('/api/import/package?filename=goi.zip&approve=1', buf);
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal(done.data.approved, 2);
  assert.equal(done.data.drafts, 1, 'câu AI tự giải vào nháp dù chọn Duyệt luôn');
  assert.equal(done.data.images, 1);
  const q = app.db.get("SELECT stem, status, explanation FROM questions WHERE stem LIKE 'Cho đồ thị như hình%'");
  assert.match(q.stem, /\[\[img:\d+\]\]/);
  assert.equal(q.status, 'draft');
  assert.doesNotMatch(q.explanation, /AI tự giải/);
  const q1 = app.db.get("SELECT stem, options_json FROM questions WHERE stem LIKE 'Tính $%(đề AI)'");
  assert.match(q1.stem, /\\frac\{2x\}/);
  assert.equal(q1.options[0], '$\\ln 2$');
});
