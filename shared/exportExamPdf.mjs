// Xuất đề thi và đáp án ra PDF vector chuẩn A4 tiếng Việt Unicode (dùng pdf-lib + @pdf-lib/fontkit, thuần Node.js).
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { displayedAnswer } from './generate.mjs';
import { crossAnswerKey } from './exportExam.mjs';
import { latexToBox, mul } from './mathSvg.mjs';

// Font Unicode có dấu tiếng Việt. Thứ tự ưu tiên: biến môi trường → Linux → Windows → macOS.
// Đặt SMARTEXAM_PDF_FONT / SMARTEXAM_PDF_FONT_BOLD để dùng font riêng (TTF/OTF).
const WIN_FONTS = path.join(process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows', 'Fonts');
const FONT_REGULAR_CANDIDATES = [
  process.env.SMARTEXAM_PDF_FONT,
  '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
  path.join(WIN_FONTS, 'times.ttf'),
  '/System/Library/Fonts/Supplemental/Times New Roman.ttf',
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
  '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
  path.join(WIN_FONTS, 'timesbd.ttf'),
  '/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf',
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
  const regIdx = FONT_REGULAR_CANDIDATES.findIndex((p) => fs.existsSync(p));
  const regPath = FONT_REGULAR_CANDIDATES[regIdx];
  const sameFamilyBold = process.env.SMARTEXAM_PDF_FONT ? null : FONT_BOLD_CANDIDATES.filter((p) => p !== process.env.SMARTEXAM_PDF_FONT_BOLD)[regIdx];
  const boldPath = (process.env.SMARTEXAM_PDF_FONT_BOLD && fs.existsSync(process.env.SMARTEXAM_PDF_FONT_BOLD) && process.env.SMARTEXAM_PDF_FONT_BOLD)
    || (sameFamilyBold && fs.existsSync(sameFamilyBold) && sameFamilyBold)
    || FONT_BOLD_CANDIDATES.find((p) => fs.existsSync(p))
    || regPath;
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

  // ---- Công thức thật: vẽ nét vector từ MathJax, xếp chung dòng với chữ ----
  const FLIP = [1, 0, 0, -1, 0, 0];
  const withMatrix = (m, fn) => {
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...m));
    fn();
    page.pushOperators(popGraphicsState());
  };
  /** Vẽ hộp công thức: mép trái x, đường cơ sở baseY, cỡ chữ size (pt). */
  const drawMathBox = (box, x, baseY, size, color) => {
    const k = size / 1000;
    const T = [k, 0, 0, -k, x, baseY];
    for (const p of box.prims) {
      const M = mul(T, p.m);
      if (p.kind === 'path') {
        withMatrix(mul(M, FLIP), () => page.drawSvgPath(p.d, { x: 0, y: 0, color, borderWidth: 0 }));
      } else if (p.kind === 'rect') {
        withMatrix(M, () => page.drawRectangle({ x: p.x, y: p.y, width: p.w, height: p.h, color, borderWidth: 0 }));
      } else if (p.kind === 'line') {
        withMatrix(M, () => page.drawLine({ start: { x: p.x, y: p.y }, end: { x: p.x2, y: p.y2 }, thickness: p.sw, color }));
      } else if (p.kind === 'text') {
        withMatrix(mul(M, FLIP), () => page.drawText(safeText(p.text, font), { x: p.x, y: -p.y, size: p.size, font, color }));
      }
    }
  };

  const MATH_SPLIT = /(\$\$[\s\S]+?\$\$|\$[^$]+?\$)/g;
  const LABEL_RE = /^(Câu \d+\.|[A-D]\.|[a-d]\)|Lời giải:)$/;

  /**
   * Xếp một đoạn chữ có công thức $...$ / $$...$$ thành các dòng, ngắt dòng ở khoảng trắng.
   * Công thức lỗi (MathJax không dựng được) thì in dạng chữ Unicode như trước.
   */
  const buildAtoms = (raw, { bold = false, size = 10.5, maxW = CONTENT_W, boldLabel = false } = {}) => {
    const atoms = [];
    const pushWords = (txt, fnt) => {
      for (const part of String(txt).split(/(\n|[ \t]+)/)) {
        if (!part) continue;
        if (part === '\n') atoms.push({ t: 'br' });
        else if (/^[ \t]+$/.test(part)) atoms.push({ t: 'sp' });
        else {
          const safe = safeText(part, fnt);
          atoms.push({ t: 'w', text: safe, font: fnt, w: fnt.widthOfTextAtSize(safe, size) });
        }
      }
    };
    let first = true;
    for (const seg of String(raw).replace(/\r/g, '').split(MATH_SPLIT)) {
      if (!seg) continue;
      const display = seg.startsWith('$$') && seg.endsWith('$$') && seg.length > 4;
      const inline = !display && seg.startsWith('$') && seg.endsWith('$') && seg.length > 2;
      if (display || inline) {
        const tex = display ? seg.slice(2, -2) : seg.slice(1, -1);
        const box = latexToBox(tex, { display });
        if (box) {
          const sc = Math.min(1, maxW / (box.width * size));
          if (display) atoms.push({ t: 'br' });
          atoms.push({ t: 'm', box, sc, w: box.width * size * sc, asc: box.ascent * size * sc, desc: box.descent * size * sc, display });
          if (display) atoms.push({ t: 'br' });
        } else {
          pushWords(latexToReadableUnicode(seg), bold ? fontBold : font);
        }
        first = false;
        continue;
      }
      if (first && boldLabel && !bold) {
        const m = seg.match(/^(Câu \d+\.|Lời giải:|\S+)(?=\s)/);
        if (m && LABEL_RE.test(m[1])) {
          pushWords(m[1], fontBold);
          pushWords(seg.slice(m[1].length), font);
          first = false;
          continue;
        }
      }
      pushWords(seg, bold ? fontBold : font);
      first = false;
    }
    return atoms;
  };

  /** Đo một đoạn nếu nó nằm gọn trên một dòng (không xuống dòng, không công thức riêng dòng). */
  const measureInline = (raw, opts) => {
    const atoms = buildAtoms(raw, { ...opts, maxW: 1e9 });
    if (atoms.some((a) => a.t === 'br')) return null;
    const spaceW = font.widthOfTextAtSize(' ', opts.size);
    let w = 0;
    let asc = 0;
    let desc = 0;
    const placed = [];
    atoms.forEach((a, i) => {
      if (a.t === 'sp') {
        if (i > 0 && i < atoms.length - 1) w += spaceW;
        return;
      }
      placed.push({ a, x: w });
      w += a.w;
      if (a.t === 'm') {
        asc = Math.max(asc, a.asc);
        desc = Math.max(desc, a.desc);
      }
    });
    return { placed, width: w, asc, desc };
  };

  const drawFlow = (raw, { bold = false, size = 10.5, indent = 0, color = rgb(0.08, 0.1, 0.14), lineGap = 4.2, spaceAfter = 4, boldLabel = false } = {}) => {
    const maxW = CONTENT_W - indent;
    const atoms = buildAtoms(raw, { bold, size, maxW, boldLabel });

    // Gom thành cụm không ngắt được (giữa hai khoảng trắng), rồi xếp cụm vào dòng
    const spaceW = font.widthOfTextAtSize(' ', size);
    const lines = [[]];
    let lineW = 0;
    let chunk = [];
    let pendingSpace = false;
    const flushChunk = () => {
      if (!chunk.length) return;
      const cw = chunk.reduce((a, b) => a + b.w, 0);
      const cur = lines[lines.length - 1];
      const gap = cur.length && pendingSpace ? spaceW : 0;
      if (cur.length && lineW + gap + cw > maxW) {
        lines.push([...chunk]);
        lineW = cw;
      } else {
        if (gap) cur.push({ t: 'gap', w: gap });
        cur.push(...chunk);
        lineW += gap + cw;
      }
      chunk = [];
      pendingSpace = false;
    };
    for (const a of atoms) {
      if (a.t === 'br') {
        flushChunk();
        if (lines[lines.length - 1].length) lines.push([]);
        lineW = 0;
        pendingSpace = false;
      } else if (a.t === 'sp') {
        flushChunk();
        pendingSpace = true;
      } else {
        chunk.push(a);
      }
    }
    flushChunk();
    while (lines.length > 1 && !lines[lines.length - 1].length) lines.pop();

    for (const ln of lines) {
      if (!ln.length) continue;
      let asc = size;
      let desc = lineGap;
      for (const a of ln) {
        if (a.t === 'm') {
          asc = Math.max(asc, a.asc + 1.5);
          desc = Math.max(desc, a.desc + 2.5);
        }
      }
      ensureSpace(asc + desc);
      const baseY = y - asc;
      const total = ln.reduce((a, b) => a + b.w, 0);
      let x = MARGIN_X + indent;
      if (ln.length === 1 && ln[0].t === 'm' && ln[0].display) x = MARGIN_X + indent + Math.max(0, (maxW - total) / 2);
      for (const a of ln) {
        if (a.t === 'w') page.drawText(a.text, { x, y: baseY, size, font: a.font, color });
        else if (a.t === 'm') drawMathBox(a.box, x, baseY, size * a.sc, color);
        x += a.w;
      }
      y -= asc + desc;
    }
    y -= spaceAfter;
  };

  const embeddedImageCache = new Map();
  /** Nhúng hình (PNG/JPG). Trả null nếu không có hoặc định dạng không in được (vd WebP). */
  const getEmbedded = async (imgId) => {
    if (!opts.imageResolver) return null;
    let embedded = embeddedImageCache.get(imgId);
    if (embedded === undefined) {
      const im = opts.imageResolver(imgId);
      embedded = null;
      if (im?.data) {
        try {
          if (im.mime?.includes('png')) embedded = await pdfDoc.embedPng(im.data);
          else if (im.mime?.includes('jpeg') || im.mime?.includes('jpg')) embedded = await pdfDoc.embedJpg(im.data);
        } catch {
          embedded = null;
        }
      }
      embeddedImageCache.set(imgId, embedded);
    }
    return embedded;
  };
  const MISSING_IMAGE = '[Hình không in được: hãy lưu hình dạng PNG hoặc JPG]';

  const drawImageToken = async (imgId) => {
    if (!opts.imageResolver) return;
    const embedded = await getEmbedded(imgId);
    if (!embedded) {
      // Không bỏ trống im lặng: ghi rõ để giáo viên biết mà sửa trước khi in
      drawWrapped(MISSING_IMAGE, { size: 9.5, indent: 16, color: rgb(0.7, 0.15, 0.15), spaceAfter: 4 });
      return;
    }
    // Hình học/đồ thị cần đủ lớn để đọc: rộng tối đa ~12 cm, cao tối đa ~9 cm
    const maxW = Math.min(CONTENT_W - 24, 340);
    const scale = Math.min(1, maxW / embedded.width, 255 / embedded.height);
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

  /** Phương án trắc nghiệm toàn hình: xếp 2 cột như đề in thật. labelled: [{ label, imgId, note }] */
  const drawImageOptionGrid = async (cells) => {
    const gap = 14;
    const colW = (CONTENT_W - 14 - gap) / 2;
    const maxH = 150;
    for (let r = 0; r < cells.length; r += 2) {
      const row = cells.slice(r, r + 2);
      const dims = [];
      for (const c of row) {
        const em = await getEmbedded(c.imgId);
        if (!em) { dims.push({ c, em: null, w: 0, h: 14 }); continue; }
        const sc = Math.min(1, (colW - 18) / em.width, maxH / em.height);
        dims.push({ c, em, w: em.width * sc, h: em.height * sc });
      }
      const rowH = Math.max(...dims.map((d) => d.h)) + 6;
      ensureSpace(rowH + 6);
      dims.forEach((d, i) => {
        const x0 = MARGIN_X + 14 + i * (colW + gap);
        page.drawText(safeText(`${d.c.label}.`, fontBold), { x: x0, y: y - 11, size: 10, font: fontBold, color: rgb(0.08, 0.1, 0.14) });
        if (d.em) page.drawImage(d.em, { x: x0 + 16, y: y - d.h, width: d.w, height: d.h });
        else page.drawText(safeText('[Hình không in được]', font), { x: x0 + 16, y: y - 11, size: 9, font, color: rgb(0.7, 0.15, 0.15) });
        if (d.c.note) page.drawText(safeText(d.c.note, font), { x: x0 + 16, y: y - d.h - 10, size: 9, font, color: rgb(0.2, 0.22, 0.26) });
      });
      y -= rowH + (row.some((c) => c.note) ? 12 : 0) + 4;
    }
  };

  const drawRichText = async (raw, optsText = {}) => {
    const tokens = String(raw ?? '').split(/(\[\[img:\d+\]\])/g);
    for (const tok of tokens) {
      const m = tok.match(/^\[\[img:(\d+)\]\]$/);
      if (m) {
        await drawImageToken(Number(m[1]));
      } else {
        if (tok.trim()) drawFlow(tok, { ...optsText, boldLabel: tok === tokens[0] });
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

        const imageOnly = (txt) => /^\s*\[\[img:\d+\]\]\s*[^\[$]{0,30}$/.test(String(txt ?? ''));
        if (type === 'mcq' && opts.imageResolver && (q.options ?? []).length === 4 && q.options.every(imageOnly)) {
          const perm = it.perm ?? [0, 1, 2, 3];
          await drawImageOptionGrid(perm.map((orig, d) => {
            const txt = String(q.options[orig]);
            return { label: 'ABCD'[d], imgId: Number(txt.match(/\[\[img:(\d+)\]\]/)[1]), note: latexToReadableUnicode(txt.replace(/\[\[img:\d+\]\]/, '').trim()) };
          }));
        } else if (type === 'mcq' && (q.options ?? []).length === 4 && !q.options.some((o) => /\[\[img:/.test(String(o)))) {
          const perm = it.perm ?? [0, 1, 2, 3];
          const optSize = 10;
          const indentX = 14;
          const avail = CONTENT_W - indentX;
          const measured = perm.map((orig, d) => measureInline(`${'ABCD'[d]}. ${q.options[orig] ?? ''}`, { size: optSize, boldLabel: true }));
          const widest = measured.every(Boolean) ? Math.max(...measured.map((m) => m.width)) : Infinity;
          const cols = widest + 12 <= avail / 4 ? 4 : widest + 12 <= avail / 2 ? 2 : 1;
          if (cols === 1) {
            for (let d = 0; d < perm.length; d++) {
              await drawRichText(`${'ABCD'[d]}. ${q.options?.[perm[d]] ?? ''}`, { size: optSize, indent: indentX, spaceAfter: 2 });
            }
          } else {
            const colW = avail / cols;
            for (let r = 0; r < 4; r += cols) {
              const row = measured.slice(r, r + cols);
              const asc = Math.max(optSize, ...row.map((m) => m.asc + 1.5));
              const desc = Math.max(4.2, ...row.map((m) => m.desc + 2.5));
              ensureSpace(asc + desc);
              const baseY = y - asc;
              row.forEach((m, c) => {
                const x0 = MARGIN_X + indentX + c * colW;
                for (const { a, x } of m.placed) {
                  if (a.t === 'w') page.drawText(a.text, { x: x0 + x, y: baseY, size: optSize, font: a.font, color: rgb(0.08, 0.1, 0.14) });
                  else if (a.t === 'm') drawMathBox(a.box, x0 + x, baseY, optSize * a.sc, rgb(0.08, 0.1, 0.14));
                }
              });
              y -= asc + desc + 2;
            }
          }
        } else if (type === 'mcq') {
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
