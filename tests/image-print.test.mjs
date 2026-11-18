import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { examToPdf } from '../shared/exportExamPdf.mjs';
import { parsePackage, samplePackage } from '../shared/package.mjs';

// 1x1 PNG hợp lệ và một "WebP" (chỉ cần chữ ký) để giả lập hình không in được
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const WEBP = Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary');

async function readPdf(buf) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const ops = await page.getOperatorList();
  const images = [];
  // pdf-lib vẽ hình bằng: save → dịch chuyển tới (x, y) → xoay/co giãn → vẽ. Lấy phép dịch đầu tiên sau save.
  let ctm = null;
  let fresh = false;
  ops.fnArray.forEach((fn, i) => {
    if (fn === pdfjs.OPS.save) fresh = true;
    if (fn === pdfjs.OPS.transform && fresh) {
      ctm = ops.argsArray[i];
      fresh = false;
    }
    if (fn === pdfjs.OPS.paintImageXObject) images.push({ x: ctm?.[4], y: ctm?.[5] });
  });
  const text = (await page.getTextContent()).items.map((t) => t.str).join(' ');
  return { images, text };
}

test('PDF: hình không in được thì ghi chú rõ; phương án toàn hình xếp 2 cột', async () => {
  const store = { 1: { data: PNG, mime: 'image/png' }, 2: { data: PNG, mime: 'image/png' }, 3: { data: PNG, mime: 'image/png' }, 4: { data: PNG, mime: 'image/png' }, 9: { data: WEBP, mime: 'image/webp' } };
  const qById = {
    1: { id: 1, type: 'mcq', stem: 'Đồ thị nào là của hàm $y=x^2$?', options: ['[[img:1]]', '[[img:2]]', '[[img:3]]', '[[img:4]]'], answer: 0 },
    2: { id: 2, type: 'short', stem: 'Cho hình chóp như hình [[img:9]] Tính thể tích.', options: [], answer: '4' },
  };
  const variants = [{ code: '101', layout: [{ qid: 1, type: 'mcq', perm: [0, 1, 2, 3] }, { qid: 2, type: 'short', perm: null }] }];
  const buf = await examToPdf({ title: 'Đề có hình', school: 'THPT', durationMin: 90 }, variants, qById, {
    baseItems: [{ qid: 1, type: 'mcq' }, { qid: 2, type: 'short' }],
    imageResolver: (id) => store[id],
  });
  const { images, text } = await readPdf(buf);
  assert.equal(images.length, 4, '4 hình phương án được in, hình WebP thì không');
  const xs = [...new Set(images.map((im) => Math.round(im.x)))];
  const ys = [...new Set(images.map((im) => Math.round(im.y)))];
  assert.equal(xs.length, 2, 'phương án xếp 2 cột');
  assert.equal(ys.length, 2, 'và 2 hàng');
  assert.match(text, /Hình không in được/);
});

test('Gói nhập: hình không phải PNG/JPG báo đúng lý do thay vì "thiếu hình"', () => {
  const pkg = samplePackage();
  pkg.questions[0].stem = 'Xem hình [[image:a.webp]] và [[image:b.png]]';
  const p = parsePackage(JSON.stringify(pkg), new Set(), { 'a.webp': 'không phải PNG/JPG (hãy lưu lại dạng PNG hoặc JPG)' });
  const err = p.errors.find((e) => /a\.webp/.test(e.message));
  assert.match(err.message, /không phải PNG\/JPG/);
  assert.ok(p.errors.some((e) => /thiếu hình b\.png/.test(e.message)));
});
