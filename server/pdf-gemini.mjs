// Bóc tách PDF scan thành câu hỏi LaTeX có cấu trúc chuẩn GDPT 2018 bằng Gemini Multimodal (@google/genai) + @napi-rs/canvas.
import { createCanvas } from '@napi-rs/canvas';
import { classifyQuestion } from '../shared/classify.mjs';
import { applyAnswerEntries } from '../shared/parse.mjs';
import { solutionAnswers, isSolutionHeading } from './pdf-ocr-layout.mjs';

const PART_ROMAN = { 1: 'I', 2: 'II', 3: 'III' };

export async function geminiExtractScannedPdf(buf, pageTexts, ai, { onProgress = () => {}, signal } = {}) {
  let end = pageTexts.findIndex((text) => isSolutionHeading(text));
  if (end < 0) end = pageTexts.length;
  if (!end) end = pageTexts.length;
  const maxPages = Math.min(end, 16);

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, verbosity: 0 }).promise;
  const renderedPages = [];
  const images = [];

  try {
    for (let n = 1; n <= maxPages; n++) {
      signal?.throwIfAborted?.();
      onProgress({ page: n, pages: maxPages, stage: 'render' });
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.2, 1800 / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const pngBuf = canvas.toBuffer('image/png');
      const key = `scan_p${n}`;
      images.push({
        key,
        mime: 'image/png',
        data: pngBuf,
        cx: Math.round(canvas.width * 3500),
        cy: Math.round(canvas.height * 3500),
      });
      renderedPages.push({ page: n, key, data: pngBuf, mimeType: 'image/png' });
      page.cleanup();
    }

    const extractedQuestions = [];
    const batchSize = 2;
    for (let i = 0; i < renderedPages.length; i += batchSize) {
      signal?.throwIfAborted?.();
      const batch = renderedPages.slice(i, i + batchSize);
      const items = await ai.extractExamFromImages(batch, { signal });
      extractedQuestions.push(...items);
      onProgress({
        page: Math.min(i + batchSize, renderedPages.length),
        pages: maxPages,
        stage: 'gemini-vision',
      });
    }

    const questions = extractedQuestions.map((item, idx) => {
      const c = classifyQuestion({ type: item.type, stem: item.stem, options: item.options });
      const partRoman = PART_ROMAN[item.part] ?? (item.type === 'mcq' ? 'I' : item.type === 'tf' ? 'II' : 'III');
      const pageKey = `scan_p${item.page || 1}`;
      const warnings = [];
      if (item.hasFigure) {
        warnings.push('Câu hỏi có hình vẽ/đồ thị trong bản scan — kiểm tra lại hình đối chiếu từ trang gốc.');
      }
      return {
        part: partRoman,
        num: item.num || idx + 1,
        type: item.type,
        stem: item.stem,
        options: item.options,
        answer: item.answer,
        answerSources: item.answer !== null && item.answer !== undefined ? ['ai'] : [],
        explanation: item.explanation || '',
        topic: c.topic,
        level: item.level ?? c.level,
        tagConfidence: c.confidence,
        topicAlternatives: c.alternatives,
        sourceStem: `[[img:${pageKey}]]`,
        ocrText: item.stem,
        scanPages: [item.page || 1],
        fromAi: true,
        warnings,
      };
    });

    if (end < pageTexts.length) {
      const entries = solutionAnswers(pageTexts.slice(end).join('\n'));
      if (entries.length) {
        applyAnswerEntries(questions, entries, 'file');
      }
    }

    return {
      questions,
      images,
      warnings: [
        `Đã bóc tách ${questions.length} câu hỏi từ ${maxPages} trang PDF scan bằng Gemini Multimodal AI (giữ nguyên công thức LaTeX).`,
        ...(end < pageTexts.length
          ? [`Đã đối chiếu đáp án từ trang lời giải (${questions.filter((q) => q.answer !== null).length}/${questions.length} câu có đáp án).`]
          : []),
      ],
      info: {
        ocr: true,
        ai: true,
        ocrPages: maxPages,
        engine: 'Gemini Multimodal AI',
        answerCount: questions.filter((q) => q.answer !== null).length,
      },
    };
  } finally {
    await doc.destroy();
  }
}
