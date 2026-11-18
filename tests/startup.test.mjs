import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../server/index.mjs';

// Khởi động máy chủ thật (không qua createApp trực tiếp) để bắt lỗi ở tệp khởi động.
test('Máy chủ khởi động được và trả lời /api/meta', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartexam-start-'));
  const log = console.log;
  console.log = () => {};
  try {
    const { server, app } = startServer({ port: 0, dataDir: dir, viteMiddleware: (req, res) => res.end('') });
    await new Promise((r) => (server.listening ? r() : server.once('listening', r)));
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/meta`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray((await res.json()).topics));
    await new Promise((r) => server.close(r));
    await app.importJobs.close();
    app.db.close();
  } finally {
    console.log = log;
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
