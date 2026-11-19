import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
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

async function login(username, b = base) {
  const r = await fetch(b + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: SAMPLE_PASSWORD }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return async (method, p, body, raw) => {
    const x = await fetch(b + p, { method, headers: { cookie, 'content-type': raw ? 'application/octet-stream' : 'application/json', 'x-smartexam': '1' }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    const ct = x.headers.get('content-type') ?? '';
    return { status: x.status, data: ct.includes('json') ? await x.json() : Buffer.from(await x.arrayBuffer()), type: ct };
  };
}
const raw = (sql, ...p) => app.db.raw.prepare(sql).get(...p);

test('Đề lưu theo bảng đề–câu và mã đề; nội dung câu không chép vào từng đề', async () => {
  const exam = app.db.get('SELECT id, items_json, variants_json FROM exams ORDER BY id LIMIT 1');
  assert.match(raw('SELECT snapshot_json s FROM exams WHERE id = ?', exam.id).s, /^"@exam:\d+"$/, 'đề chỉ còn dấu trỏ');
  assert.equal(raw('SELECT COUNT(*) n FROM exam_items WHERE exam_id = ?', exam.id).n, exam.items.length);
  assert.equal(raw('SELECT COUNT(*) n FROM exam_variants WHERE exam_id = ?', exam.id).n, exam.variants.length);
  assert.equal(raw('SELECT COUNT(*) n FROM exam_items WHERE exam_id = ? AND content_id IS NULL', exam.id).n, 0);
  // Đọc đề vẫn đủ nội dung như trước
  const snap = app.db.get('SELECT snapshot_json FROM exams WHERE id = ?', exam.id).snapshot;
  assert.equal(Object.keys(snap).length, exam.items.length);
  assert.ok(Object.values(snap).every((q) => q.stem));

  // Hai đề dùng chung câu → chỉ một bản nội dung
  const gv = await login('gv.lan');
  const qids = exam.items.slice(0, 3).map((x) => x.qid);
  const pick = qids.filter((id) => raw("SELECT status FROM questions WHERE id = ?", id).status === 'approved');
  const r1 = await gv('POST', '/api/exams', { title: 'Đề chung câu 1', items: pick.map((qid) => ({ qid })) });
  const r2 = await gv('POST', '/api/exams', { title: 'Đề chung câu 2', items: pick.map((qid) => ({ qid })) });
  assert.equal(r1.status, 200);
  for (const qid of pick) {
    const ids = app.db.raw.prepare('SELECT content_id FROM exam_items WHERE qid = ? AND exam_id IN (?, ?)').all(qid, r1.data.id, r2.data.id).map((x) => x.content_id);
    assert.equal(new Set(ids).size, 1, `câu ${qid} dùng chung một bản nội dung`);
  }
});

test('Sửa câu sau khi ra đề: đề cũ giữ nội dung cũ, tra ngược báo đề dùng nội dung cũ', async () => {
  const admin = await login('quanly');
  const q = (await admin('POST', '/api/questions', { type: 'mcq', stem: 'Câu tra ngược bản 1', options: ['1', '2', '3', '4'], answer: 0, topic: 'T11.DAOHAM', level: 1 })).data.id;
  await admin('POST', '/api/questions/approve', { ids: [q] });
  const e1 = (await admin('POST', '/api/exams', { title: 'Đề có câu tra ngược', items: [{ qid: q }] })).data.id;
  let u = (await admin('GET', `/api/questions/${q}/usage`)).data.exams;
  assert.deepEqual(u.map((x) => [x.id, x.outdated, x.position]), [[e1, false, 1]]);

  assert.equal((await admin('PUT', `/api/questions/${q}`, { stem: 'Câu tra ngược bản 2' })).status, 200);
  const d1 = await admin('GET', `/api/exams/${e1}`);
  assert.equal(d1.data.questions[q].stem, 'Câu tra ngược bản 1', 'đề cũ giữ nội dung lúc ra đề');
  u = (await admin('GET', `/api/questions/${q}/usage`)).data.exams;
  assert.equal(u[0].outdated, true);
  const list = (await admin('GET', '/api/questions?status=all&q=tra ngược')).data.questions;
  assert.equal(list.find((x) => x.id === q)?.usedIn, 1);

  // Trộn lại mã đề (đề chưa dùng) → bảng mã đề cập nhật theo
  await admin('POST', `/api/exams/${e1}/regenerate-variants`, { count: 2, startCode: 201 });
  const codes = app.db.raw.prepare('SELECT code FROM exam_variants WHERE exam_id = ? ORDER BY code').all(e1).map((x) => x.code);
  assert.deepEqual(codes, ['201', '202']);
});

test('Nhập gói kèm đề gốc: lưu file, tải lại được, không lưu trùng, chỉ trong trường', async () => {
  const admin = await login('quanly');
  const pdf = Buffer.from('%PDF-1.4\n% đề gốc thử\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  const mk = async (title) => {
    const zip = new JSZip();
    zip.file('goi.json', JSON.stringify({
      format: 'smartexam-package', version: 2,
      exam: { title, durationMin: 15, sections: [{ part: 'I', questions: ['c1'] }] },
      questions: [{ id: 'c1', type: 'mcq', topic: 'T12.OXYZ', level: 1, stem: `${title}: gốc tọa độ`, options: ['$(0;0;0)$', '$(1;0;0)$', '$(0;1;0)$', '$(0;0;1)$'], answer: 'A' }],
    }));
    zip.file('goc/de-khao-sat.pdf', pdf);
    return zip.generateAsync({ type: 'nodebuffer' });
  };
  const z1 = await mk('Đề có file gốc A');
  const dry = await admin('POST', '/api/import/package?filename=goi.zip&dryRun=1', undefined, z1);
  assert.deepEqual(dry.data.original, { name: 'de-khao-sat.pdf', size: pdf.length });
  const done = await admin('POST', '/api/import/package?filename=goi.zip&approve=1', undefined, z1);
  assert.equal(done.status, 200, JSON.stringify(done.data));
  const ex = (await admin('GET', `/api/exams/${done.data.exams[0].id}`)).data.exam;
  assert.equal(ex.document.name, 'de-khao-sat.pdf');
  const file = await admin('GET', `/api/documents/${ex.document.id}`);
  assert.equal(file.status, 200);
  assert.match(file.type, /pdf/);
  assert.deepEqual(file.data, pdf);
  const q = raw("SELECT document_id FROM questions WHERE stem = 'Đề có file gốc A: gốc tọa độ'");
  assert.equal(q.document_id, ex.document.id);

  const done2 = await admin('POST', '/api/import/package?filename=goi.zip&approve=1', undefined, await mk('Đề có file gốc B'));
  const ex2 = (await admin('GET', `/api/exams/${done2.data.exams[0].id}`)).data.exam;
  assert.equal(ex2.document.id, ex.document.id, 'cùng file thì không lưu hai lần');
  assert.equal(raw('SELECT COUNT(*) n FROM documents').n, 1);
  assert.equal((await (await login('hs.an.nm'))('GET', `/api/documents/${ex.document.id}`)).status, 403);
});

test('CSDL cũ còn chép nội dung câu vào đề được tự chuyển khi mở app', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'se-mig-'));
  const file = path.join(dir, 'app.db');
  const a1 = createApp({ dbFile: file });
  seedSample(a1);
  const q = a1.db.get("SELECT * FROM questions WHERE status = 'approved' LIMIT 1");
  // Ghi thẳng một đề kiểu cũ (không qua lớp truy cập dữ liệu)
  const legacySnap = { [q.id]: { id: q.id, type: q.type, stem: 'Nội dung kiểu cũ', options: [], answer: null } };
  const id = Number(a1.db.raw.prepare("INSERT INTO exams (school_id, title, blueprint_json, items_json, duration_min, variants_json, snapshot_json, created_by, created_at, official) VALUES (?,?,?,?,?,?,?,?,?,1)")
    .run(q.school_id, 'Đề kiểu cũ', '{}', JSON.stringify([{ qid: q.id, type: q.type }]), 15, JSON.stringify([{ code: '101', seed: 'x' }]), JSON.stringify(legacySnap), q.created_by, Date.now()).lastInsertRowid);
  assert.doesNotMatch(a1.db.raw.prepare('SELECT snapshot_json s FROM exams WHERE id = ?').get(id).s, /@exam:/);
  a1.db.close();

  const a2 = createApp({ dbFile: file });
  assert.match(a2.db.raw.prepare('SELECT snapshot_json s FROM exams WHERE id = ?').get(id).s, /@exam:/);
  assert.equal(a2.db.get('SELECT snapshot_json FROM exams WHERE id = ?', id).snapshot[q.id].stem, 'Nội dung kiểu cũ');
  assert.equal(a2.db.raw.prepare('SELECT COUNT(*) n FROM exam_variants WHERE exam_id = ?').get(id).n, 1);
  a2.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
