import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import JSZip from 'jszip';
import { verifyMathEquivalence, validateMathExpression, isMathVerifyAvailable } from '../server/math-verify.mjs';
import { shortMatches } from '../shared/grading.mjs';
import { QuestionSearchIndex } from '../shared/duplicate-detector.mjs';
import { examToPdf, latexToReadableUnicode } from '../shared/exportExamPdf.mjs';
import { exportAnswerSheetDocx } from '../shared/exportAnswerSheetDocx.mjs';
import { importFile } from '../server/importers.mjs';
import { createApp } from '../server/app.mjs';
import { seedSample, SAMPLE_PASSWORD } from '../server/seed.mjs';

test('Compute Engine: kiểm tra tương đương đại số & chấm trả lời ngắn thuần Node.js', async () => {
  assert.equal(isMathVerifyAvailable(), true);

  const eq1 = await verifyMathEquivalence('\\frac{3}{2}', '1,5');
  assert.equal(eq1.valid, true);
  assert.equal(eq1.equivalent, true);

  const eq2 = await verifyMathEquivalence('\\sqrt{8}', '2\\sqrt{2}');
  assert.equal(eq2.valid, true);
  assert.equal(eq2.equivalent, true);

  const eq3 = await verifyMathEquivalence('x^2 - 1', '(x - 1)(x + 1)');
  assert.equal(eq3.valid, true);
  assert.equal(eq3.equivalent, true);

  const eqBad = await verifyMathEquivalence('x^2 + 1', 'x^2 + 2');
  assert.equal(eqBad.valid, true);
  assert.equal(eqBad.equivalent, false);

  const invalid = await validateMathExpression('\\frac{1}{2');
  assert.equal(invalid.valid, false);

  // shortMatches tích hợp Compute Engine
  assert.equal(shortMatches('2\\sqrt{2}', '\\sqrt{8}'), true);
  assert.equal(shortMatches('1,5', '\\frac{3}{2}'), true);
  assert.equal(shortMatches('x^2 - 1', '(x-1)(x+1)'), true);
  assert.equal(shortMatches('5', '6'), false);
});

test('MiniSearch BM25: tìm kiếm tiếng Việt không dấu & lọc ứng viên trùng lặp', () => {
  const pool = [
    { id: 1, type: 'short', topic: 'T12.NGUYENHAM', level: 2, stem: 'Tính tích phân $\\int_0^1 x^2\\,dx$.', options: [] },
    { id: 2, type: 'mcq', topic: 'T12.OXYZ', level: 1, stem: 'Trong không gian Oxyz, tìm tâm mặt cầu $(x-1)^2+y^2+z^2=9$.', options: ['(1;0;0)', '(0;1;0)', '(0;0;1)', '(1;1;1)'] },
    { id: 3, type: 'mcq', topic: 'T12.HAMSO', level: 2, stem: 'Tìm số điểm cực trị của hàm số $y = x^3 - 3x$.', options: ['0', '1', '2', '3'] },
  ];
  const index = new QuestionSearchIndex(pool);

  const hits = index.search('tich phan');
  assert.ok(hits.some((h) => h.id === 1));

  const hitsGeo = index.search('mat cau');
  assert.ok(hitsGeo.some((h) => h.id === 2));

  const dups = index.findDuplicates('Tính tích phân $\\int_0^1 x^2\\,dx$ bằng bao nhiêu?', { threshold: 0.65 });
  assert.ok(dups.length >= 1);
  assert.equal(dups[0].id, 1);
});

test('PDF Unicode & DOCX Answer Sheet Export tạo file hợp lệ thuần Node.js', async () => {
  const unicodeMath = latexToReadableUnicode('Tính $\\int_0^1 \\frac{x^2}{2}\\,dx \\le \\sqrt{4}$');
  assert.ok(unicodeMath.includes('∫') && unicodeMath.includes('≤') && unicodeMath.includes('√4'));

  const qById = {
    1: { id: 1, type: 'mcq', stem: 'Đạo hàm của $y=x^2$ là gì?', options: ['$2x$', '$x$', '$x^2$', '$2$'], answer: 0, explanation: 'Áp dụng $(x^n)\'=nx^{n-1}$.' },
    2: { id: 2, type: 'tf', stem: 'Cho hàm số $f(x)=\\sqrt{x}$.', options: ['Tập xác định $x \\ge 0$', 'Đồng biến trên $(0;+\\infty)$', '$f(4)=2$', '$f(0)=1$'], answer: [true, true, true, false], explanation: 'Thay trực tiếp giá trị.' },
    3: { id: 3, type: 'short', stem: 'Tính $\\int_0^2 2x\\,dx$.', options: [], answer: '4', explanation: '$x^2|_0^2 = 4$.' },
  };
  const items = [
    { qid: 1, type: 'mcq' },
    { qid: 2, type: 'tf' },
    { qid: 3, type: 'short' },
  ];
  const variants = [
    { code: '101', layout: [{ qid: 1, type: 'mcq', perm: [0, 1, 2, 3] }, { qid: 2, type: 'tf', perm: null }, { qid: 3, type: 'short', perm: null }] },
    { code: '102', layout: [{ qid: 1, type: 'mcq', perm: [1, 0, 2, 3] }, { qid: 2, type: 'tf', perm: null }, { qid: 3, type: 'short', perm: null }] },
  ];
  const exam = { title: 'Đề kiểm tra Giữa kỳ I', school: 'THPT Chuyên', durationMin: 90 };

  const pdfBuf = await examToPdf(exam, variants, qById, { withSolutions: true, baseItems: items });
  assert.ok(Buffer.isBuffer(pdfBuf));
  assert.equal(pdfBuf.subarray(0, 5).toString('utf8'), '%PDF-');
  assert.ok(pdfBuf.length > 5000);

  const docxBuf = await exportAnswerSheetDocx(exam, variants, qById, items);
  const zip = await JSZip.loadAsync(docxBuf);
  const docXml = await zip.file('word/document.xml').async('string');
  assert.match(docXml, /MA TRẬN ĐÁP ÁN CHÉO/);
  assert.match(docXml, /Mã đề 101/);
});

test('API end-to-end: GET /api/exams/:id/pdf, GET /api/exams/:id/variants-zip và tìm kiếm MiniSearch', async () => {
  const app = createApp({ dbFile: ':memory:', aiImpl: { enabled: false } });
  seedSample(app);
  const server = http.createServer(app.handle);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    let cookie = '';
    const loginRes = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'gv.lan', password: SAMPLE_PASSWORD }),
    });
    assert.equal(loginRes.status, 200);
    cookie = loginRes.headers.get('set-cookie').split(';')[0];

    const metaRes = await fetch(`${base}/api/meta`);
    const meta = await metaRes.json();
    assert.equal(meta.aiProvider, undefined);
    assert.equal(meta.mathVerifyAvailable, true);
    assert.equal(meta.coreEngines.computeEngine, true);
    assert.equal(meta.coreEngines.miniSearch, true);
    assert.equal(meta.coreEngines.pdfExport, true);

    const searchRes = await fetch(`${base}/api/questions?q=dao+ham`, { headers: { cookie } });
    assert.equal(searchRes.status, 200);
    const searchData = await searchRes.json();
    assert.ok(Array.isArray(searchData.questions));

    const examsRes = await fetch(`${base}/api/exams`, { headers: { cookie } });
    const examsData = await examsRes.json();
    const examId = examsData.exams[0].id;

    const pdfRes = await fetch(`${base}/api/exams/${examId}/pdf`, { headers: { cookie } });
    assert.equal(pdfRes.status, 200);
    assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
    const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
    assert.equal(pdfBytes.subarray(0, 5).toString('utf8'), '%PDF-');

    const zipRes = await fetch(`${base}/api/exams/${examId}/variants-zip`, { headers: { cookie } });
    assert.equal(zipRes.status, 200);
    const zip = await JSZip.loadAsync(Buffer.from(await zipRes.arrayBuffer()));
    const names = Object.keys(zip.files);
    assert.ok(names.some((n) => n.startsWith('De-thi-PDF/') && n.endsWith('.pdf')));
    assert.ok(names.some((n) => n.startsWith('De-thi-Word/') && n.endsWith('.docx')));
    assert.ok(names.includes('Bang-dap-an-va-Ma-tran.docx'));
  } finally {
    server.close();
  }
});
