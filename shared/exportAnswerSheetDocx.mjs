// Tạo file Word (.docx) Bảng đáp án tổng hợp & Ma trận đáp án chéo chuẩn in bằng thư viện `docx`.
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { displayedAnswer } from './generate.mjs';
import { crossAnswerKey } from './exportExam.mjs';

const PART_LABEL = { mcq: 'Phần I (Trắc nghiệm 4 lựa chọn)', tf: 'Phần II (Đúng / Sai)', short: 'Phần III (Trả lời ngắn)' };

function makeCell(text, { bold = false, shaded = false, align = AlignmentType.CENTER } = {}) {
  return new TableCell({
    shading: shaded ? { fill: 'EFF4FF' } : undefined,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    },
    children: [
      new Paragraph({
        alignment: align,
        spacing: { before: 40, after: 40 },
        children: [new TextRun({ text: String(text ?? ''), bold, size: 20, font: 'Times New Roman' })],
      }),
    ],
  });
}

export async function exportAnswerSheetDocx(exam, variants, qById, baseItems = []) {
  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: String(exam.school || '').toUpperCase(), bold: true, size: 24, font: 'Times New Roman' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: `BẢNG ĐÁP ÁN CHÍNH THỨC — ${String(exam.title || '').toUpperCase()}`, bold: true, size: 26, font: 'Times New Roman' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: `Thời gian làm bài: ${exam.durationMin ?? 90} phút · Số mã đề: ${variants.length}`, italics: true, size: 21, font: 'Times New Roman' })],
    }),
  ];

  for (const v of variants) {
    children.push(
      new Paragraph({
        spacing: { before: 140, after: 80 },
        children: [new TextRun({ text: `Mã đề ${v.code}`, bold: true, size: 24, color: '1D4ED8', font: 'Times New Roman' })],
      }),
    );

    for (const type of ['mcq', 'tf', 'short']) {
      const items = v.layout.filter((x) => x.type === type);
      if (!items.length) continue;
      children.push(
        new Paragraph({
          spacing: { before: 60, after: 40 },
          children: [new TextRun({ text: PART_LABEL[type], italics: true, size: 20, font: 'Times New Roman' })],
        }),
      );
      const chunkSize = 10;
      for (let start = 0; start < items.length; start += chunkSize) {
        const slice = items.slice(start, start + chunkSize);
        const headRow = new TableRow({
          children: [
            makeCell('Câu', { bold: true, shaded: true }),
            ...slice.map((_, idx) => makeCell(start + idx + 1, { bold: true, shaded: true })),
          ],
        });
        const ansRow = new TableRow({
          children: [
            makeCell('Đáp án', { bold: true }),
            ...slice.map((it) => makeCell(displayedAnswer(it, qById[it.qid]))),
          ],
        });
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headRow, ansRow],
          }),
        );
        children.push(new Paragraph({ text: '', spacing: { after: 60 } }));
      }
    }
  }

  if (baseItems?.length && variants.length > 1) {
    const matrix = crossAnswerKey(baseItems, variants, qById);
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 100 },
        children: [new TextRun({ text: 'MA TRẬN ĐÁP ÁN CHÉO GIỮA CÁC MÃ ĐỀ', bold: true, size: 24, font: 'Times New Roman' })],
      }),
    );
    const headerRow = new TableRow({
      children: [
        makeCell('Câu gốc', { bold: true, shaded: true }),
        ...matrix.codes.map((c) => makeCell(`Mã ${c}`, { bold: true, shaded: true })),
      ],
    });
    const bodyRows = matrix.rows.map((r, idx) =>
      new TableRow({
        children: [
          makeCell(idx + 1, { bold: true }),
          ...matrix.codes.map((c) => makeCell(`${r.cells[c].part}.${r.cells[c].no}: ${r.cells[c].answer}`)),
        ],
      }),
    );
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...bodyRows],
      }),
    );
  }

  const doc = new Document({
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
