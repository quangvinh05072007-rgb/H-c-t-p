import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { examToPdf } from '../shared/exportExamPdf.mjs';
import { latexToBox, normalizePath } from '../shared/mathSvg.mjs';

test('Công thức LaTeX dựng thành nét vẽ; công thức lỗi trả null', () => {
  const frac = latexToBox('\\dfrac{x^2+1}{x-1}');
  assert.ok(frac.width > 2 && frac.ascent > 1 && frac.descent > 0.5, 'phân số cao hơn dòng chữ');
  assert.ok(frac.prims.some((p) => p.kind === 'rect'), 'có gạch phân số');
  assert.ok(latexToBox('60^\\circ').prims.length >= 3);
  assert.ok(latexToBox('\\begin{cases} x>0 \\\\ y<1 \\end{cases}'));
  assert.equal(latexToBox('\\frac{1}{'), null);
  assert.equal(latexToBox('\\lenhkhongco{x}'), null);
});

test('Chuẩn hóa đường SVG: T/H/V thành Q/L có điểm điều khiển tường minh', () => {
  assert.equal(normalizePath('M0 0L10 0T20 10'), 'M0 0L10 0Q10 0 20 10');
  assert.equal(normalizePath('M0 0Q5 5 10 0T20 0'), 'M0 0Q5 5 10 0Q15 -5 20 0');
  assert.equal(normalizePath('M1 2H5V7Z'), 'M1 2L5 2L5 7Z');
  assert.equal(normalizePath('m1 1l2 2'), 'M1 1L3 3');
});

test('PDF: công thức được vẽ thật, không còn mã LaTeX thô trong chữ', async () => {
  const qById = {
    1: { id: 1, type: 'mcq', stem: 'Góc bằng $60^\\circ$, tính $\\left|\\dfrac{a}{b}\\right|$ và $x_1 + x_2$', options: ['$\\dfrac{1}{2}$', '$\\sqrt{3}$', '$1$', '$2$'], answer: 0 },
    2: { id: 2, type: 'short', stem: 'Công thức lỗi $\\frac{1}{$ vẫn in được dạng chữ.', options: [], answer: '1' },
  };
  const variants = [{ code: '101', layout: [{ qid: 1, type: 'mcq', perm: [0, 1, 2, 3] }, { qid: 2, type: 'short', perm: null }] }];
  const buf = await examToPdf({ title: 'Đề công thức', school: 'THPT', durationMin: 90 }, variants, qById, {
    baseItems: [{ qid: 1, type: 'mcq' }, { qid: 2, type: 'short' }],
  });
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const text = (await page.getTextContent()).items.map((t) => t.str).join(' ').replace(/\s+/g, ' ');
  assert.doesNotMatch(text, /\\dfrac|\\circ|\^circ|\\left|\\right/);
  assert.match(text, /Góc bằng/);
  assert.match(text, /vẫn in được/);
  const ops = await page.getOperatorList();
  const paths = ops.fnArray.filter((f) => f === pdfjs.OPS.constructPath).length;
  assert.ok(paths > 15, `công thức vẽ bằng nét (có ${paths} nét)`);
});
