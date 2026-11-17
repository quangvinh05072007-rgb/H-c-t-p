// Xuất đề thi và đáp án ra PDF vector chuẩn A4 tiếng Việt Unicode (dùng pdf-lib + @pdf-lib/fontkit, thuần Node.js).
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { displayedAnswer } from './generate.mjs';
import { crossAnswerKey } from './exportExam.mjs';

// Font Unicode có dấu tiếng Việt. Thứ tự ưu tiên: biến môi trường → Linux → Windows → macOS.
// Đặt SMARTEXAM_PDF_FONT / SMARTEXAM_PDF_FONT_BOLD để dùng font riêng (TTF/OTF).
const WIN_FONTS = path.join(process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows', 'Fonts');
const FONT_REGULAR_CANDIDATES = [
  process.env.SMARTEXAM_PDF_FONT,
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/TTF/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  path.join(WIN_FONTS, 'arial.ttf'),
  path.join(WIN_FONTS, 'times.ttf'),
  path.join(WIN_FONTS, 'tahoma.ttf'),
  path.join(WIN_FONTS, 'segoeui.ttf'),
  '/Library/Fonts/Arial Unicode.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
].filter(Boolean);
const FONT_BOLD_CANDIDATES = [
  process.env.SMARTEXAM_PDF_FONT_BOLD,
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  path.join(WIN_FONTS, 'arialbd.ttf'),
  path.join(WIN_FONTS, 'timesbd.ttf'),
  path.join(WIN_FONTS, 'tahomabd.ttf'),
  path.join(WIN_FONTS, 'segoeuib.ttf'),
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
].filter(Boolean);

let cachedFonts = null;
function loadUnicodeFonts() {
  if (cachedFonts) return cachedFonts;
  const regPath = FONT_REGULAR_CANDIDATES.find((p) => fs.existsSync(p));
  const boldPath = FONT_BOLD_CANDIDATES.find((p) => fs.existsSync(p)) || regPath;
  if (!regPath) {
    throw new Error('Không tìm thấy font Unicode (DejaVu Sans, Arial, Times New Roman…) để xuất PDF tiếng Việt. Đặt biến SMARTEXAM_PDF_FONT trỏ tới file .ttf.');
  }
  cachedFonts = {
    regular: fs.readFileSync(regPath),
    bold: fs.readFileSync(boldPath),
  };
  return cachedFonts;
}

const SUPERSCRIPTS = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', 'n': 'ⁿ', 'i': 'ⁱ' };
const SUBSCRIPTS = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', 'n': 'ₙ', 'i': 'ᵢ', 'x': 'ₓ' };

/** Chuyển LaTeX trong $...$ sang ký hiệu toán học Unicode dễ đọc khi in PDF văn bản vector. */
export function latexToReadableUnicode(text) {
  if (!text) return '';
  const mapGroup = (s, table) => [...s].map((c) => table[c] ?? c).join('');
  const convertExpr = (latex) => {
    let s = String(latex ?? '').trim();
    // Phân số đơn giản: \frac{a}{b} → a/b hoặc (a)/(b)
    for (let pass = 0; pass < 3; pass++) {
      s = s.replace(/\\(?:d|t|c)?frac\{([^{}]+)\}\{([^{}]+)\}/g, (_, num, den) => {
        const n = /^[a-zA-Z0-9]+$/.test(num.trim()) ? num.trim() : `(${num.trim()})`;
        const d = /^[a-zA-Z0-9]+$/.test(den.trim()) ? den.trim() : `(${den.trim()})`;
        return `${n}/${d}`;
      });
    }
    s = s
      .replace(/\\sqrt\[([^\]]+)\]\{([^{}]+)\}/g, (_, deg, inner) => `${deg}√(${inner})`)
      .replace(/\\sqrt\{([^{}]+)\}/g, (_, inner) => (/^[a-zA-Z0-9]+$/.test(inner.trim()) ? `√${inner.trim()}` : `√(${inner.trim()})`))
      .replace(/\\overrightarrow\{([^{}]+)\}/g, '$1⃗')
      .replace(/\\vec\{([^{}]+)\}/g, '$1⃗')
      .replace(/\\overline\{([^{}]+)\}/g, '$1̄')
      .replace(/\\mathbb\{R\}/g, 'ℝ')
      .replace(/\\mathbb\{N\}/g, 'ℕ')
      .replace(/\\mathbb\{Z\}/g, 'ℤ')
      .replace(/\\mathbb\{Q\}/g, 'ℚ')
      .replace(/\\mathbb\{C\}/g, 'ℂ')
      .replace(/\\int(?![a-zA-Z])/g, '∫')
      .replace(/\\sum(?![a-zA-Z])/g, '∑')
      .replace(/\\prod(?![a-zA-Z])/g, '∏')
      .replace(/\\infty(?![a-zA-Z])/g, '∞')
      .replace(/\\alpha(?![a-zA-Z])/g, 'α')
      .replace(/\\beta(?![a-zA-Z])/g, 'β')
      .replace(/\\gamma(?![a-zA-Z])/g, 'γ')
      .replace(/\\Delta(?![a-zA-Z])/g, 'Δ')
      .replace(/\\delta(?![a-zA-Z])/g, 'δ')
      .replace(/\\theta(?![a-zA-Z])/g, 'θ')
      .replace(/\\lambda(?![a-zA-Z])/g, 'λ')
      .replace(/\\pi(?![a-zA-Z])/g, 'π')
      .replace(/\\varphi(?![a-zA-Z])|\\phi(?![a-zA-Z])/g, 'φ')
      .replace(/\\omega(?![a-zA-Z])/g, 'ω')
      .replace(/\\Omega(?![a-zA-Z])/g, 'Ω')
      .replace(/\\le(?![a-zA-Z])|\\leq(?![a-zA-Z])/g, '≤')
      .replace(/\\ge(?![a-zA-Z])|\\geq(?![a-zA-Z])/g, '≥')
      .replace(/\\ne(?![a-zA-Z])|\\neq(?![a-zA-Z])/g, '≠')
      .replace(/\\approx(?![a-zA-Z])/g, '≈')
      .replace(/\\equiv(?![a-zA-Z])/g, '≡')
      .replace(/\\pm(?![a-zA-Z])/g, '±')
      .replace(/\\mp(?![a-zA-Z])/g, '∓')
      .replace(/\\times(?![a-zA-Z])/g, '×')
      .replace(/\\cdot(?![a-zA-Z])/g, '·')
      .replace(/\\div(?![a-zA-Z])/g, '÷')
      .replace(/\\in(?![a-zA-Z])/g, '∈')
      .replace(/\\notin(?![a-zA-Z])/g, '∉')
      .replace(/\\subset(?![a-zA-Z])/g, '⊂')
      .replace(/\\subseteq(?![a-zA-Z])/g, '⊆')
      .replace(/\\cup(?![a-zA-Z])/g, '∪')
      .replace(/\\cap(?![a-zA-Z])/g, '∩')
      .replace(/\\emptyset(?![a-zA-Z])|\\varnothing(?![a-zA-Z])/g, '∅')
      .replace(/\\forall(?![a-zA-Z])/g, '∀')
      .replace(/\\exists(?![a-zA-Z])/g, '∃')
      .replace(/\\Leftrightarrow(?![a-zA-Z])|\\iff(?![a-zA-Z])/g, '⇔')
      .replace(/\\Rightarrow(?![a-zA-Z])|\\implies(?![a-zA-Z])/g, '⇒')
      .replace(/\\to(?![a-zA-Z])|\\rightarrow(?![a-zA-Z])/g, '→')
      .replace(/\\circ(?![a-zA-Z])/g, '°')
      .replace(/\\left\s*/g, '')
      .replace(/\\right\s*/g, '')
      .replace(/\\[,;:!]/g, ' ')
      .replace(/\\text\{([^{}]*)\}/g, '$1')
      .replace(/\\(?:sin|cos|tan|cot|arcsin|arccos|arctan|ln|log|lim|max|min|tg|cotg)(?![a-zA-Z])/g, (m) => m.slice(1))
      .replace(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g, (_, body) => `{ ${body.replace(/\\\\/g, '; ')} }`)
      .replace(/\^\{([^{}]+)\}/g, (_, p) => ([...p].every((c) => SUPERSCRIPTS[c]) ? mapGroup(p, SUPERSCRIPTS) : `^(${p})`))
      .replace(/\^([0-9ni+-])/g, (_, p) => SUPERSCRIPTS[p] ?? `^${p}`)
      .replace(/_\{([^{}]+)\}/g, (_, p) => ([...p].every((c) => SUBSCRIPTS[c]) ? mapGroup(p, SUBSCRIPTS) : `_${p}`))
      .replace(/_([0-9nix+-])/g, (_, p) => SUBSCRIPTS[p] ?? `_${p}`)
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return s;
  };

  return String(text)
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, e) => ` ${convertExpr(e)} `)
    .replace(/\$([^$]+?)\$/g, (_, e) => convertExpr(e))
    .replace(/\r?\n+/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

const PART_TITLE = {
  mcq: 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn. Thí sinh trả lời từ câu 1 đến câu {n}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.',
  tf: 'PHẦN II. Câu trắc nghiệm đúng sai. Thí sinh trả lời từ câu 1 đến câu {n}. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.',
  short: 'PHẦN III. Câu trắc nghiệm trả lời ngắn. Thí sinh trả lời từ câu 1 đến câu {n}.',
};

/**
 * Tạo PDF đề thi vector A4 chuẩn tiếng Việt Unicode bằng pdf-lib.
 */
export async function examToPdf(exam, variants, qById, opts = {}) {
  const { regular: regBytes, bold: boldBytes } = loadUnicodeFonts();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const font = await pdfDoc.embedFont(regBytes, { subset: true });
  const fontBold = await pdfDoc.embedFont(boldBytes, { subset: true });

  const A4_W = 595.28;
  const A4_H = 841.89;
  const MARGIN_X = 46;
  const MARGIN_TOP = 48;
  const MARGIN_BOTTOM = 46;
  const CONTENT_W = A4_W - MARGIN_X * 2;

  const pages = [];
  let page = pdfDoc.addPage([A4_W, A4_H]);
  pages.push(page);
  let y = A4_H - MARGIN_TOP;

  const newPage = () => {
    page = pdfDoc.addPage([A4_W, A4_H]);
    pages.push(page);
    y = A4_H - MARGIN_TOP;
  };

  const ensureSpace = (neededHeight) => {
    if (y - neededHeight < MARGIN_BOTTOM) {
      newPage();
    }
  };

  const safeText = (txt, fnt) => {
    // Đảm bảo ký tự nào chưa có glyph trong font không làm vỡ pdf-lib
    let out = '';
    for (const ch of String(txt ?? '')) {
      if (ch === '\n' || ch === '\r' || ch === '\t') {
        out += ' ';
        continue;
      }
      try {
        fnt.encodeText(ch);
        out += ch;
      } catch {
        out += '?';
      }
    }
    return out;
  };

  const wrapLines = (text, fnt, size, maxWidth) => {
    const clean = safeText(text, fnt);
    const paragraphs = String(text ?? '').split('\n');
    const lines = [];
    for (const para of paragraphs) {
      const pSafe = safeText(para.trim(), fnt);
      if (!pSafe) {
        lines.push('');
        continue;
      }
      const words = pSafe.split(/\s+/);
      let current = '';
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (fnt.widthOfTextAtSize(candidate, size) <= maxWidth) {
          current = candidate;
        } else {
          if (current) lines.push(current);
          if (fnt.widthOfTextAtSize(word, size) <= maxWidth) {
            current = word;
          } else {
            // Ngắt từ quá dài
            let chunk = '';
            for (const ch of word) {
              if (fnt.widthOfTextAtSize(chunk + ch, size) <= maxWidth) chunk += ch;
              else {
                if (chunk) lines.push(chunk);
                chunk = ch;
              }
            }
            current = chunk;
          }
        }
      }
      if (current) lines.push(current);
    }
    return lines.length ? lines : [clean];
  };

  const drawWrapped = (text, { bold = false, size = 10.5, indent = 0, color = rgb(0.08, 0.1, 0.14), lineGap = 4.2, spaceAfter = 4, align = 'left' } = {}) => {
    const fnt = bold ? fontBold : font;
    const maxW = CONTENT_W - indent;
    const lines = wrapLines(text, fnt, size, maxW);
    const lineH = size + lineGap;
    for (const ln of lines) {
      ensureSpace(lineH);
      let x = MARGIN_X + indent;
      if (align === 'center') {
        const w = fnt.widthOfTextAtSize(ln, size);
        x = MARGIN_X + (CONTENT_W - w) / 2;
      }
      page.drawText(ln, { x, y: y - size, size, font: fnt, color });
      y -= lineH;
    }
    y -= spaceAfter;
  };

  const embeddedImageCache = new Map();
  const drawImageToken = async (imgId) => {
    if (!opts.imageResolver) return;
    let embedded = embeddedImageCache.get(imgId);
    if (embedded === undefined) {
      const im = opts.imageResolver(imgId);
      if (!im?.data) {
        embeddedImageCache.set(imgId, null);
        return;
      }
      try {
        embedded = im.mime?.includes('png') ? await pdfDoc.embedPng(im.data) : await pdfDoc.embedJpg(im.data);
      } catch {
        embedded = null;
      }
      embeddedImageCache.set(imgId, embedded);
    }
    if (!embedded) return;
    const maxW = Math.min(CONTENT_W - 24, 340);
    const scale = Math.min(1, maxW / embedded.width, 190 / embedded.height);
    const drawW = embedded.width * scale;
    const drawH = embedded.height * scale;
    ensureSpace(drawH + 10);
    page.drawImage(embedded, {
      x: MARGIN_X + 16,
      y: y - drawH,
      width: drawW,
      height: drawH,
    });
    y -= drawH + 8;
  };

  const drawRichText = async (raw, optsText = {}) => {
    const tokens = String(raw ?? '').split(/(\[\[img:\d+\]\])/g);
    for (const tok of tokens) {
      const m = tok.match(/^\[\[img:(\d+)\]\]$/);
      if (m) {
        await drawImageToken(Number(m[1]));
      } else {
        const readable = latexToReadableUnicode(tok);
        if (readable) drawWrapped(readable, optsText);
      }
    }
  };

  const drawVariantHeader = (vCode) => {
    ensureSpace(96);
    const topY = y;
    // Khung tiêu đề bên trái: Trường / Kỳ thi; bên phải: Mã đề đóng khung
    drawWrapped(String(exam.school || 'TRƯỜNG THPT').toUpperCase(), { bold: true, size: 10.5, align: 'center', spaceAfter: 2 });
    drawWrapped(String(exam.title || 'ĐỀ KIỂM TRA').toUpperCase(), { bold: true, size: 13, align: 'center', spaceAfter: 2 });
    drawWrapped(`Thời gian làm bài: ${exam.durationMin ?? 90} phút, không kể thời gian phát đề`, { size: 9.5, align: 'center', color: rgb(0.28, 0.32, 0.38), spaceAfter: 6 });

    // Hộp Mã đề nổi bật + Dòng Họ tên & SBD
    ensureSpace(34);
    const boxW = 94;
    const boxH = 22;
    const boxX = MARGIN_X + CONTENT_W - boxW;
    page.drawRectangle({
      x: boxX,
      y: y - boxH + 4,
      width: boxW,
      height: boxH,
      borderWidth: 1.2,
      borderColor: rgb(0.12, 0.16, 0.24),
      color: rgb(0.96, 0.97, 0.99),
    });
    const codeLabel = safeText(`Mã đề: ${vCode}`, fontBold);
    const codeW = fontBold.widthOfTextAtSize(codeLabel, 10.5);
    page.drawText(codeLabel, {
      x: boxX + (boxW - codeW) / 2,
      y: y - 12,
      size: 10.5,
      font: fontBold,
      color: rgb(0.08, 0.1, 0.14),
    });

    page.drawText(safeText('Họ và tên thí sinh: ....................................................  SBD: ................', font), {
      x: MARGIN_X,
      y: y - 12,
      size: 10,
      font,
      color: rgb(0.15, 0.18, 0.24),
    });
    y -= 28;
    page.drawLine({
      start: { x: MARGIN_X, y },
      end: { x: MARGIN_X + CONTENT_W, y },
      thickness: 0.7,
      color: rgb(0.7, 0.74, 0.8),
    });
    y -= 12;
    void topY;
  };

  for (let vi = 0; vi < variants.length; vi++) {
    const v = variants[vi];
    if (vi > 0) newPage();
    drawVariantHeader(v.code);

    for (const type of ['mcq', 'tf', 'short']) {
      const items = v.layout.filter((x) => x.type === type);
      if (!items.length) continue;
      ensureSpace(36);
      drawWrapped(PART_TITLE[type].replace('{n}', String(items.length)), {
        bold: true,
        size: 10.5,
        color: rgb(0.08, 0.22, 0.45),
        spaceAfter: 6,
      });

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const q = qById[it.qid];
        if (!q) continue;
        ensureSpace(30);
        await drawRichText(`Câu ${i + 1}. ${q.stem}`, { size: 10.5, spaceAfter: 3 });

        if (type === 'mcq') {
          const perm = it.perm ?? [0, 1, 2, 3];
          for (let d = 0; d < perm.length; d++) {
            const orig = perm[d];
            await drawRichText(`${'ABCD'[d]}. ${q.options?.[orig] ?? ''}`, {
              size: 10,
              indent: 14,
              spaceAfter: 2,
            });
          }
        } else if (type === 'tf') {
          for (let k = 0; k < (q.options?.length ?? 0); k++) {
            await drawRichText(`${'abcd'[k]}) ${q.options[k]}`, {
              size: 10,
              indent: 14,
              spaceAfter: 2,
            });
          }
        }

        if (opts.withSolutions && q.explanation) {
          await drawRichText(`Lời giải: ${q.explanation}`, {
            size: 9.5,
            indent: 14,
            color: rgb(0.12, 0.31, 0.47),
            spaceAfter: 4,
          });
        }
        y -= 4;
      }
    }

    drawWrapped('----- HẾT -----', { bold: true, size: 10.5, align: 'center', spaceAfter: 8 });
  }

  // Trang Đáp án
  newPage();
  drawWrapped('BẢNG ĐÁP ÁN CHÍNH THỨC', { bold: true, size: 13, align: 'center', spaceAfter: 10 });
  for (const v of variants) {
    ensureSpace(44);
    drawWrapped(`Mã đề ${v.code}`, { bold: true, size: 11, color: rgb(0.08, 0.22, 0.45), spaceAfter: 4 });
    for (const type of ['mcq', 'tf', 'short']) {
      const items = v.layout.filter((x) => x.type === type);
      if (!items.length) continue;
      const partName = { mcq: 'Phần I', tf: 'Phần II', short: 'Phần III' }[type];
      const summary = items.map((it, idx) => `${idx + 1}.${displayedAnswer(it, qById[it.qid])}`).join('   ');
      drawWrapped(`${partName}: ${summary}`, { size: 9.5, indent: 8, spaceAfter: 4 });
    }
    y -= 6;
  }

  if (opts.baseItems?.length && variants.length > 1) {
    const key = crossAnswerKey(opts.baseItems, variants, qById);
    ensureSpace(80);
    drawWrapped('MA TRẬN ĐÁP ÁN CHÉO GIỮA CÁC MÃ ĐỀ', { bold: true, size: 11.5, align: 'center', spaceAfter: 6 });
    const cols = key.codes.length + 1;
    const colW = Math.min(72, CONTENT_W / cols);
    const rowH = 18;
    const drawRow = (cells, header = false) => {
      ensureSpace(rowH + 4);
      const startX = MARGIN_X;
      for (let c = 0; c < cells.length; c++) {
        const x = startX + c * colW;
        page.drawRectangle({
          x,
          y: y - rowH,
          width: colW,
          height: rowH,
          borderWidth: 0.5,
          borderColor: rgb(0.75, 0.78, 0.84),
          color: header ? rgb(0.93, 0.95, 0.98) : rgb(1, 1, 1),
        });
        const fnt = header ? fontBold : font;
        const lbl = safeText(String(cells[c] ?? ''), fnt).slice(0, 14);
        page.drawText(lbl, { x: x + 4, y: y - 13, size: 8.5, font: fnt, color: rgb(0.1, 0.12, 0.16) });
      }
      y -= rowH;
    };
    drawRow(['Câu gốc', ...key.codes.map((c) => `Mã ${c}`)], true);
    for (let rIdx = 0; rIdx < key.rows.length; rIdx++) {
      const r = key.rows[rIdx];
      drawRow([String(rIdx + 1), ...key.codes.map((c) => `${r.cells[c].part}.${r.cells[c].no}: ${r.cells[c].answer}`)]);
    }
  }

  // Đánh số trang
  const totalPages = pages.length;
  for (let i = 0; i < totalPages; i++) {
    const p = pages[i];
    const label = safeText(`Trang ${i + 1} / ${totalPages}`, font);
    const w = font.widthOfTextAtSize(label, 8.5);
    p.drawText(label, {
      x: A4_W - MARGIN_X - w,
      y: 22,
      size: 8.5,
      font,
      color: rgb(0.45, 0.5, 0.58),
    });
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
