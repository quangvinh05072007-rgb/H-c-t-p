import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server/app.mjs';
import { seedSample, SAMPLE_PASSWORD } from '../server/seed.mjs';
import { parseCurriculum, diffOutcomes, competencyCode, strandCode } from '../shared/curriculum.mjs';

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
  return async (method, p, body, raw) => {
    const x = await fetch(base + p, { method, headers: { cookie, 'content-type': raw ? 'application/octet-stream' : 'application/json', 'x-smartexam': '1' }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    return { status: x.status, data: await x.json() };
  };
}
const upload = (who, pkg, q = 'approve=1') => who('POST', `/api/import/package?filename=goi.json&${q}`, undefined, Buffer.from(JSON.stringify(pkg)));

// Dữ liệu thử: KHÔNG phải nguyên văn chương trình chính thức
const OUTCOMES = [
  { code: '10.DS.1.1', grade: 10, topic: 'T10.MENHDE', strand: 'DS', content: 'Mệnh đề', text: 'YCCĐ thử A về mệnh đề', competencies: ['TD'] },
  { code: '10.DS.1.2', grade: 10, topic: 'T10.MENHDE', strand: 'DS', content: 'Mệnh đề', text: 'YCCĐ thử B về tập hợp' },
  { code: '12.DS.3.1', grade: 12, topic: 'T12.NGUYENHAM', strand: 'Số và Đại số', content: 'Nguyên hàm', text: 'YCCĐ thử C về nguyên hàm', competencies: ['Giải quyết vấn đề toán học'] },
];
const curriculumPkg = (outcomes = OUTCOMES, name = 'Chương trình thử') => ({ format: 'smartexam-package', version: 2, source: name, curriculum: { name, sourceDoc: 'Văn bản thử', outcomes } });

test('Đọc chương trình: chuẩn hóa mạch, năng lực; báo lỗi từng YCCĐ; so sánh phiên bản', () => {
  assert.equal(strandCode('hình học và đo lường'), 'HH');
  assert.equal(competencyCode('mô hình hóa toán học'), 'MH');
  assert.equal(competencyCode('t'), null);
  const r = parseCurriculum({ name: 'X', outcomes: [...OUTCOMES, { code: '10.DS.1.1', topic: 'T10.MENHDE', text: 'trùng' }, { code: '11.X', grade: 10, topic: 'T11.DAOHAM', text: 'sai lớp' }] });
  assert.equal(r.value.outcomes.length, 3);
  assert.deepEqual(r.value.outcomes[2].competencies, ['GQ']);
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0].message, /trùng mã/);
  assert.match(r.errors[1].message, /thuộc lớp 11/);
  const d = diffOutcomes(OUTCOMES, [{ ...OUTCOMES[0], text: 'đổi' }, OUTCOMES[2], { ...OUTCOMES[1], code: '10.DS.1.3' }]);
  assert.deepEqual(d, { added: ['10.DS.1.3'], removed: ['10.DS.1.2'], changed: ['10.DS.1.1'] });
});

test('Chủ web nhập chương trình → bản nháp; công bố rồi giáo viên, học sinh mới thấy', async () => {
  const admin = await login('quanly');
  const gv = await login('gv.lan');
  const hs = await login('hs.an.nm');
  const dry = await upload(admin, curriculumPkg(), 'dryRun=1');
  assert.equal(dry.status, 200, JSON.stringify(dry.data));
  assert.deepEqual(dry.data.curriculum, { name: 'Chương trình thử', sourceDoc: 'Văn bản thử', outcomes: 3, byGrade: { 10: 2, 12: 1 } });

  const done = await upload(admin, curriculumPkg());
  assert.equal(done.status, 200, JSON.stringify(done.data));
  const id = done.data.curriculum.id;
  assert.equal((await gv('GET', '/api/curriculum')).data.curriculum, null, 'bản nháp chưa ai thấy');

  const list = (await admin('GET', '/api/curricula')).data.versions;
  assert.deepEqual(list.map((v) => [v.id, v.status, v.outcomes]), [[id, 'draft', 3]]);
  assert.equal((await admin('POST', `/api/curricula/${id}/publish`)).status, 200);

  const seen = (await hs('GET', '/api/curriculum?topic=T10.MENHDE')).data;
  assert.equal(seen.curriculum.name, 'Chương trình thử');
  assert.deepEqual(seen.outcomes.map((o) => o.code), ['10.DS.1.1', '10.DS.1.2']);
  assert.equal((await gv('GET', '/api/curricula')).status, 403);
  assert.equal((await gv('POST', `/api/curricula/${id}/publish`)).status, 403);

  const prompt = (await gv('GET', '/api/import/ai-prompt')).data.text;
  assert.match(prompt, /12\.DS\.3\.1 YCCĐ thử C/);
  assert.match((await admin('GET', '/api/curricula/ai-prompt')).data.text, /NGUYÊN VĂN/);
});

test('Câu hỏi gắn YCCĐ: qua gói (bỏ mã lạ), sửa câu, lọc ngân hàng, độ phủ', async () => {
  const admin = await login('quanly');
  const gv = await login('gv.lan');
  const pkg = {
    format: 'smartexam-package', version: 2, source: 'Gói câu có YCCĐ',
    questions: [
      { id: 'c1', type: 'short', topic: 'T12.NGUYENHAM', level: 1, stem: 'Câu YCCĐ: tính $\\int_0^1 3x^2\\,dx$.', answer: '1', outcomes: ['12.DS.3.1', 'KHONG.CO'] },
      { id: 'c2', type: 'short', topic: 'T10.MENHDE', level: 1, stem: 'Câu YCCĐ: số tập con của tập 2 phần tử?', answer: '4', outcomes: '10.DS.1.2' },
    ],
  };
  const dry = await upload(gv, pkg, 'dryRun=1');
  assert.ok(dry.data.warnings.some((w) => /1 câu ghi mã YCCĐ không có trong chương trình, đã bỏ các mã: KHONG\.CO/.test(w)), JSON.stringify(dry.data.warnings));
  const done = await upload(gv, pkg);
  assert.equal(done.status, 200, JSON.stringify(done.data));

  const bank = (await gv('GET', '/api/questions?q=Câu YCCĐ')).data.questions;
  const q1 = bank.find((q) => /3x\^2/.test(q.stem));
  const q2 = bank.find((q) => /tập con/.test(q.stem));
  assert.deepEqual(q1.outcomes, ['12.DS.3.1']);
  assert.deepEqual(q2.outcomes, ['10.DS.1.2']);
  const filtered = (await gv('GET', '/api/questions?outcome=12.DS.3.1')).data.questions.map((q) => q.id);
  assert.ok(filtered.includes(q1.id) && !filtered.includes(q2.id));

  // Giáo viên sửa câu của mình: gắn thêm mã; mã lạ bị từ chối, không ghi gì
  const r = await gv('PUT', `/api/questions/${q2.id}`, { outcomes: ['10.DS.1.1', '10.DS.1.2'] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.question.outcomes, ['10.DS.1.1', '10.DS.1.2']);
  const bad = await gv('PUT', `/api/questions/${q2.id}`, { outcomes: ['XX.1'], stem: 'đổi' });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /XX\.1/);
  assert.equal((await gv('GET', `/api/questions/${q2.id}`)).data.question.stem, q2.stem);
  // Tạo câu mới kèm mã
  const nq = await gv('POST', '/api/questions', { type: 'short', stem: 'Câu mới gắn YCCĐ', answer: '2', topic: 'T10.MENHDE', level: 1, outcomes: ['10.DS.1.1'] });
  assert.deepEqual((await gv('GET', `/api/questions/${nq.data.id}`)).data.question.outcomes, ['10.DS.1.1']);

  // Độ phủ: số câu ĐÃ DUYỆT theo từng YCCĐ
  const cur = (await admin('GET', '/api/curricula')).data.versions[0];
  const detail = (await admin('GET', `/api/curricula/${cur.id}`)).data;
  const cov = Object.fromEntries(detail.outcomes.map((o) => [o.code, o.questions]));
  assert.equal(cov['12.DS.3.1'], 1);
  assert.equal(cov['10.DS.1.2'], 1);
  assert.equal(cov['10.DS.1.1'], 1, 'câu mới còn nháp nên chưa tính');
});

test('Phiên bản mới: so sánh với bản đang dùng, công bố thì bản cũ lưu trữ, câu vẫn giữ mã; giáo viên không nhập chương trình', async () => {
  const admin = await login('quanly');
  const gv = await login('gv.lan');
  const old = (await admin('GET', '/api/curricula')).data.versions[0];
  const next = [{ ...OUTCOMES[0], text: 'YCCĐ thử A (sửa câu chữ)' }, OUTCOMES[2], { ...OUTCOMES[1], code: '10.DS.1.3' }];
  const done = await upload(admin, curriculumPkg(next, 'Chương trình thử bản 2'));
  const id = done.data.curriculum.id;
  const d = (await admin('GET', `/api/curricula/${id}`)).data.diff;
  assert.deepEqual([d.added, d.removed, d.changed], [['10.DS.1.3'], ['10.DS.1.2'], ['10.DS.1.1']]);

  assert.equal((await admin('POST', `/api/curricula/${id}/publish`)).status, 200);
  const versions = (await admin('GET', '/api/curricula')).data.versions;
  assert.deepEqual(versions.map((v) => [v.id, v.status]), [[id, 'published'], [old.id, 'archived']]);
  const cov = Object.fromEntries((await admin('GET', `/api/curricula/${id}`)).data.outcomes.map((o) => [o.code, o.questions]));
  assert.equal(cov['12.DS.3.1'], 1, 'liên kết theo mã còn nguyên');
  assert.equal((await admin('DELETE', `/api/curricula/${id}`)).status, 409, 'không xóa bản đang dùng');
  assert.equal((await admin('DELETE', `/api/curricula/${old.id}`)).status, 200);

  const t = await upload(gv, { ...curriculumPkg(), questions: [{ id: 'x', type: 'short', topic: 'T10.MENHDE', level: 1, stem: 'Câu kèm chương trình của giáo viên', answer: '1' }] }, 'dryRun=1');
  assert.equal(t.data.curriculum, null);
  assert.ok(t.data.warnings.some((w) => /Chương trình chuẩn do chủ web nhập/.test(w)));
  const only = await upload(gv, curriculumPkg());
  assert.equal(only.status, 400);
  assert.match(only.data.error, /^Chương trình chuẩn do chủ web nhập/);
  assert.equal((await admin('GET', '/api/curricula')).data.versions.length, 1);
});
