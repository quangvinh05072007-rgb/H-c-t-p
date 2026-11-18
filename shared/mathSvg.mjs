// Dựng công thức LaTeX thành nét vẽ vector (MathJax → SVG → danh sách hình) để vẽ thẳng vào PDF.
// Chạy hoàn toàn trên máy chủ, không cần mạng. Chỉ dùng cho xuất PDF (Word đã có OMML riêng).
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

let engine = null;
function getEngine() {
  if (engine) return engine;
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  // Bỏ các gói cần tải thêm lúc chạy (autoload, require) để không bao giờ chờ mạng
  const packages = AllPackages.filter((p) => !['autoload', 'require', 'setoptions', 'colortbl', 'bussproofs', 'noundefined'].includes(p));
  const doc = mathjax.document('', {
    InputJax: new TeX({ packages, formatError: (_jax, err) => { throw err; } }),
    OutputJax: new SVG({ fontCache: 'none' }),
  });
  engine = { adaptor, doc };
  return engine;
}

/** Ma trận affine [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f. mul(m1, m2) = áp m2 trước rồi m1. */
export const mul = (m1, m2) => [
  m1[0] * m2[0] + m1[2] * m2[1],
  m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3],
  m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
  m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
];
const IDENTITY = [1, 0, 0, 1, 0, 0];

function parseTransform(str) {
  let m = IDENTITY;
  if (!str) return m;
  const re = /(translate|scale|matrix|rotate)\(([^)]*)\)/g;
  let t;
  while ((t = re.exec(str))) {
    const n = t[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let k = IDENTITY;
    if (t[1] === 'translate') k = [1, 0, 0, 1, n[0] || 0, n[1] || 0];
    else if (t[1] === 'scale') k = [n[0], 0, 0, n.length > 1 ? n[1] : n[0], 0, 0];
    else if (t[1] === 'matrix') k = n;
    else if (t[1] === 'rotate') {
      const r = ((n[0] || 0) * Math.PI) / 180;
      k = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
    }
    m = mul(m, k);
  }
  return m;
}

/**
 * Chuẩn hóa đường SVG về chỉ M / L / Q / C / Z tuyệt đối, có điểm điều khiển tường minh.
 * pdf-lib đọc sai lệnh T (cong trơn) đứng sau lệnh không phải Q, làm nét ngoặc "(" và chữ "C" bị móc.
 */
export function normalizePath(d) {
  const toks = String(d).match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  let i = 0;
  let cmd = '';
  let cx = 0, cy = 0, sx = 0, sy = 0;
  let qx = null, qy = null; // điểm điều khiển Q/T trước (để phản chiếu cho T)
  let c2x = null, c2y = null; // điểm điều khiển thứ hai của C/S trước
  const out = [];
  const num = () => Number(toks[i++]);
  const f = (n) => Math.round(n * 100) / 100;
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    let lastQ = false, lastC = false;
    if (C === 'Z') {
      out.push('Z');
      cx = sx; cy = sy;
      cmd = '';
    } else if (C === 'M') {
      cx = ox + num(); cy = oy + num(); sx = cx; sy = cy;
      out.push(`M${f(cx)} ${f(cy)}`);
      cmd = rel ? 'l' : 'L';
    } else if (C === 'L') {
      cx = ox + num(); cy = oy + num();
      out.push(`L${f(cx)} ${f(cy)}`);
    } else if (C === 'H') {
      cx = ox + num();
      out.push(`L${f(cx)} ${f(cy)}`);
    } else if (C === 'V') {
      cy = (rel ? cy : 0) + num();
      out.push(`L${f(cx)} ${f(cy)}`);
    } else if (C === 'Q' || C === 'T') {
      let px, py;
      if (C === 'Q') { px = ox + num(); py = oy + num(); }
      else if (qx !== null) { px = 2 * cx - qx; py = 2 * cy - qy; }
      else { px = cx; py = cy; }
      const ex = ox + num(), ey = oy + num();
      out.push(`Q${f(px)} ${f(py)} ${f(ex)} ${f(ey)}`);
      qx = px; qy = py; cx = ex; cy = ey; lastQ = true;
    } else if (C === 'C' || C === 'S') {
      let p1x, p1y;
      if (C === 'C') { p1x = ox + num(); p1y = oy + num(); }
      else if (c2x !== null) { p1x = 2 * cx - c2x; p1y = 2 * cy - c2y; }
      else { p1x = cx; p1y = cy; }
      const p2x = ox + num(), p2y = oy + num(), ex = ox + num(), ey = oy + num();
      out.push(`C${f(p1x)} ${f(p1y)} ${f(p2x)} ${f(p2y)} ${f(ex)} ${f(ey)}`);
      c2x = p2x; c2y = p2y; cx = ex; cy = ey; lastC = true;
    } else if (C === 'A') {
      // MathJax không dùng cung tròn; gặp thì nối thẳng tới điểm cuối
      i += 5;
      cx = ox + num(); cy = oy + num();
      out.push(`L${f(cx)} ${f(cy)}`);
    } else {
      i++;
    }
    if (!lastQ) { qx = null; qy = null; }
    if (!lastC) { c2x = null; c2y = null; }
  }
  return out.join('');
}

const cache = new Map();

/**
 * LaTeX → hộp công thức. Đơn vị: em (1 em = cỡ chữ). Trả null nếu công thức lỗi (để in dạng chữ thay thế).
 * { width, ascent, descent, prims: [{ kind: 'path'|'rect'|'text'|'line', m, d?, x?, y?, w?, h?, text?, size?, x2?, y2?, sw? }] }
 * Tọa độ prims tính trong hệ SVG gốc (đơn vị 1/1000 em, trục y hướng xuống, đường cơ sở ở y = 0, mép trái x = 0).
 */
export function latexToBox(latex, { display = false } = {}) {
  const key = `${display ? 'D' : 'I'}:${latex}`;
  if (cache.has(key)) return cache.get(key);
  let box = null;
  try {
    box = build(latex, display);
  } catch {
    box = null;
  }
  if (cache.size > 5000) cache.clear();
  cache.set(key, box);
  return box;
}

function build(latex, display) {
  const { adaptor, doc } = getEngine();
  const node = doc.convert(String(latex), { display, em: 16, ex: 8, containerWidth: 1280 });
  const svg = adaptor.childNodes(node).find((c) => adaptor.kind(c) === 'svg');
  if (!svg) return null;
  const vb = String(adaptor.getAttribute(svg, 'viewBox') || '').split(/\s+/).map(Number);
  if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n))) return null;
  const [minX, minY, w, h] = vb;
  const prims = [];
  let bad = false;
  const shift = [1, 0, 0, 1, -minX, 0];
  const walk = (el, m) => {
    const kind = adaptor.kind(el);
    if (kind === '#text' || kind === '#comment') return;
    if (adaptor.getAttribute(el, 'data-mml-node') === 'merror') bad = true;
    const here = mul(m, parseTransform(adaptor.getAttribute(el, 'transform')));
    const num = (a) => Number(adaptor.getAttribute(el, a) || 0);
    if (kind === 'path') {
      const d = adaptor.getAttribute(el, 'd');
      if (d) prims.push({ kind: 'path', m: here, d: normalizePath(d) });
      return;
    }
    if (kind === 'rect') {
      prims.push({ kind: 'rect', m: here, x: num('x'), y: num('y'), w: num('width'), h: num('height') });
      return;
    }
    if (kind === 'line') {
      prims.push({ kind: 'line', m: here, x: num('x1'), y: num('y1'), x2: num('x2'), y2: num('y2'), sw: Number(adaptor.getAttribute(el, 'stroke-width') || 40) });
      return;
    }
    if (kind === 'text') {
      const text = adaptor.textContent(el);
      const size = parseFloat(adaptor.getAttribute(el, 'font-size') || '1000');
      if (text) prims.push({ kind: 'text', m: here, x: num('x'), y: num('y'), text, size });
      return;
    }
    for (const c of adaptor.childNodes(el)) walk(c, here);
  };
  for (const c of adaptor.childNodes(svg)) walk(c, shift);
  if (bad || !prims.length) return null;
  return { width: w / 1000, ascent: -minY / 1000, descent: (h + minY) / 1000, prims };
}
