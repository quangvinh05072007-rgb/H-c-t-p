import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import JSZip from 'jszip';
import { createApp } from '../server/app.mjs';
import { seedSample, SAMPLE_PASSWORD } from '../server/seed.mjs';
import { samplePackage } from '../shared/package.mjs';

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
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const lessonPkg = (summary, withImage = false) => {
  const pkg = samplePackage();
  pkg.questions = [];
  pkg.exams = [];
  pkg.source = summary;
  pkg.lessons = [{ topic: 'T12.NGUYENHAM', summary, formulas: ['$\\int x\\,dx = \\dfrac{x^2}{2} + C$'], examples: withImage ? [{ title: 'Ví dụ', problem: 'Tính', solution: 'Xem hình [[image:hinh/a.png]]' }] : [] }];
  return pkg;
};
async function zipOf(pkg) {
  const zip = new JSZip();
  zip.file('goi.json', JSON.stringify(pkg));
  zip.file('hinh/a.png', PNG);
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('Chủ web nhập bài tự học (kèm hình); giáo viên không thay được bài', async () => {
  const admin = await login('quanly');
  const r = await admin('POST', '/api/import/package?filename=goi.zip&approve=1', undefined, await zipOf(lessonPkg('Bản 1', true)));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.lessons, 1);
  const got = (await admin('GET', '/api/lessons')).data.lessons['T12.NGUYENHAM'];
  assert.equal(got.summary, 'Bản 1');
  assert.match(got.examples[0].solution, /\[\[img:\d+\]\]/);

  const gv = await login('gv.lan');
  const t = await gv('POST', '/api/import/package?filename=goi.json&approve=1', undefined, Buffer.from(JSON.stringify(lessonPkg('Giáo viên ghi đè'))));
  assert.equal(t.status, 400, 'gói chỉ có bài học thì giáo viên không nhập được gì');
  assert.match(t.data.error, /Bài tự học do chủ web nhập/);
  assert.equal((await gv('GET', '/api/lessons')).data.lessons['T12.NGUYENHAM'].summary, 'Bản 1');
  assert.equal((await gv('GET', '/api/admin/lessons')).status, 403);
  assert.equal((await gv('DELETE', '/api/admin/lessons/T12.NGUYENHAM')).status, 403);
});

test('Nhập lại giữ bản cũ trong lịch sử; khôi phục và về mặc định đều cất bản đang dùng', async () => {
  const admin = await login('quanly');
  await admin('POST', '/api/import/package?filename=goi.json&approve=1', undefined, Buffer.from(JSON.stringify(lessonPkg('Bản 2'))));
  const cur = () => admin('GET', '/api/lessons').then((x) => x.data.lessons['T12.NGUYENHAM']);
  assert.equal((await cur()).summary, 'Bản 2');

  let list = (await admin('GET', '/api/admin/lessons')).data.topics;
  let row = list.find((t) => t.code === 'T12.NGUYENHAM');
  assert.equal(row.versions, 1);
  assert.ok(row.imported && row.imported.updatedBy);
  assert.equal(list.find((t) => t.code === 'T10.MENHDE')?.imported ?? null, null);

  let versions = (await admin('GET', '/api/admin/lessons/T12.NGUYENHAM/versions')).data.versions;
  assert.deepEqual(versions.map((v) => v.title), ['Bản 1']);
  const r = await admin('POST', '/api/admin/lessons/T12.NGUYENHAM/restore', { versionId: versions[0].id });
  assert.equal(r.status, 200);
  assert.equal((await cur()).summary, 'Bản 1');
  versions = (await admin('GET', '/api/admin/lessons/T12.NGUYENHAM/versions')).data.versions;
  assert.deepEqual(versions.map((v) => v.title), ['Bản 2', 'Bản 1']);

  assert.equal((await admin('DELETE', '/api/admin/lessons/T12.NGUYENHAM')).status, 200);
  assert.equal(await cur(), undefined, 'học sinh quay về bài mặc định của app');
  row = (await admin('GET', '/api/admin/lessons')).data.topics.find((t) => t.code === 'T12.NGUYENHAM');
  assert.equal(row.imported, null);
  assert.equal(row.versions, 3);
  assert.equal((await admin('POST', '/api/admin/lessons/T12.NGUYENHAM/restore', { versionId: 999999 })).status, 404);
  assert.ok(app.db.get("SELECT COUNT(*) n FROM audit_log WHERE action IN ('lesson_restore','lesson_reset')").n >= 2);
});
