import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server/app.mjs';
import { SAMPLE_PASSWORD, seedSample } from '../server/seed.mjs';

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
    return { status: res.status, data: await res.json() };
  };
}

test('Classroom modules, materials, announcements CRUD, student view tracking & RBAC', async () => {
  const teacher = client();
  const student = client();

  const tLogin = await teacher('POST', '/api/login', { username: 'gv.lan', password: SAMPLE_PASSWORD });
  assert.equal(tLogin.status, 200);
  const sLogin = await student('POST', '/api/login', { username: 'hs.an.nm', password: SAMPLE_PASSWORD });
  assert.equal(sLogin.status, 200);

  // 1. Seeded class 1 already has modules and announcements
  const clsBefore = await teacher('GET', '/api/classes/1');
  assert.equal(clsBefore.status, 200);
  assert.ok(Array.isArray(clsBefore.data.modules) && clsBefore.data.modules.length >= 2);
  assert.ok(Array.isArray(clsBefore.data.announcements) && clsBefore.data.announcements.length >= 1);

  // 2. RBAC: Student cannot create/edit/delete modules, materials, or announcements
  const sModCreate = await student('POST', '/api/classes/1/modules', { weekNo: 9, title: 'Unauthorized' });
  assert.equal(sModCreate.status, 403);
  const sMatCreate = await student('POST', '/api/classes/1/materials', {
    moduleId: clsBefore.data.modules[0].id,
    title: 'Unauthorized',
  });
  assert.equal(sMatCreate.status, 403);
  const sAnnCreate = await student('POST', '/api/classes/1/announcements', { title: 'Unauth', body: 'Nope' });
  assert.equal(sAnnCreate.status, 403);

  // 3. Teacher creates a new module, adds KaTeX material, and posts a pinned announcement
  const modRes = await teacher('POST', '/api/classes/1/modules', {
    weekNo: 4,
    title: 'Ôn tập Tích phân từng phần',
    description: 'Tổng hợp phương pháp và đề kiểm tra 15 phút',
    locked: false,
  });
  assert.equal(modRes.status, 200);
  assert.equal(modRes.data.week_no, 4);

  const matRes = await teacher('POST', '/api/classes/1/materials', {
    moduleId: modRes.data.id,
    kind: 'doc',
    title: 'Công thức Tích phân cơ bản',
    summary: 'Nhắc lại $u \\, dv$ và đổi biến số',
    content: 'Công thức: $$\\int u \\, dv = uv - \\int v \\, du$$',
    topicCode: 'TP',
  });
  assert.equal(matRes.status, 200);
  assert.equal(matRes.data.module_id, modRes.data.id);

  const annRes = await teacher('POST', '/api/classes/1/announcements', {
    title: 'Nhắc lịch ôn tập Tuần 04',
    body: 'Các em đọc tài liệu trước buổi thứ Sáu.',
    pinned: true,
  });
  assert.equal(annRes.status, 200);
  assert.equal(annRes.data.pinned, true);

  // 4. Student reads material -> view is tracked persistently in DB
  const sView = await student('POST', `/api/student/materials/${matRes.data.id}/view`, {});
  assert.equal(sView.status, 200);
  assert.equal(sView.data.ok, true);

  const sCls = await student('GET', '/api/student/class?classId=1');
  assert.equal(sCls.status, 200);
  const foundMod = sCls.data.modules.find((m) => m.id === modRes.data.id);
  assert.ok(foundMod);
  const foundMat = foundMod.materials.find((mt) => mt.id === matRes.data.id);
  assert.ok(foundMat);
  assert.equal(foundMat.viewed, true);
  assert.ok(sCls.data.announcements.some((a) => a.id === annRes.data.id));

  // 5. Teacher locks & cleans up created module + announcement
  const lockMod = await teacher('PATCH', `/api/classes/1/modules/${modRes.data.id}`, { locked: true });
  assert.equal(lockMod.status, 200);
  assert.equal(lockMod.data.locked, true);

  const delMat = await teacher('DELETE', `/api/classes/1/materials/${matRes.data.id}`);
  assert.equal(delMat.status, 200);
  const delMod = await teacher('DELETE', `/api/classes/1/modules/${modRes.data.id}`);
  assert.equal(delMod.status, 200);
  const delAnn = await teacher('DELETE', `/api/classes/1/announcements/${annRes.data.id}`);
  assert.equal(delAnn.status, 200);
});
