// Lõi toán học ký hiệu thuần Node.js dựa trên @cortex-js/compute-engine.
// Không phụ thuộc Python hay tiến trình ngoài; dùng chung cho chấm bài, kiểm tra công thức và chống trùng lặp.
import { ComputeEngine } from '@cortex-js/compute-engine';

let _ce = null;

export function getComputeEngine() {
  if (!_ce) {
    _ce = new ComputeEngine();
  }
  return _ce;
}

/** Tiền xử lý LaTeX tiếng Việt: dấu phẩy thập phân, dấu trừ unicode, \dfrac, \tg, \cotg, biến dẫn xuất x=. */
export function preprocessLatex(raw) {
  if (raw === null || raw === undefined) return '';
  let s = String(raw).trim();
  if (!s) return '';
  // Bỏ cặp $...$ hoặc \(...\) bọc ngoài nếu có
  s = s.replace(/^\$+|\$+$/g, '').trim();
  s = s.replace(/^\\\(([\s\S]*)\\\)$/, '$1').trim();
  s = s.replace(/^\\\[([\s\S]*)\\\]$/, '$1').trim();
  // Dấu trừ unicode → ASCII
  s = s.replace(/[−–—]/g, '-');
  // Bỏ tiền tố biến gán đơn giản như "x = 2,5" hoặc "S = 12" (chỉ khi vế trái là 1 chữ cái)
  s = s.replace(/^[a-zA-Z]\s*=\s*(?=.+)/, '');
  // Dấu phẩy thập phân tiếng Việt giữa hai chữ số (vd: 1,25 → 1.25), tránh nhầm tọa độ (1; 2) hoặc (1, 2) có dấu cách
  s = s.replace(/(\d),(\d)/g, '$1.$2');
  // Chuẩn hóa các lệnh LaTeX phổ biến trong đề thi Việt Nam
  s = s
    .replace(/\\dfrac\b/g, '\\frac')
    .replace(/\\tfrac\b/g, '\\frac')
    .replace(/\\cfrac\b/g, '\\frac')
    .replace(/\\tg\b/g, '\\tan')
    .replace(/\\cotg\b/g, '\\cot')
    .replace(/\\arctg\b/g, '\\arctan')
    .replace(/\\ln\b/g, '\\ln')
    .replace(/\\lg\b/g, '\\log_{10}')
    .replace(/\\left\s*/g, '')
    .replace(/\\right\s*/g, '')
    .replace(/\\,/g, ' ')
    .replace(/\\;/g, ' ')
    .replace(/\\:/g, ' ')
    .replace(/\\!/g, '');
  return s.trim();
}

function hasErrorNode(json) {
  if (Array.isArray(json)) {
    if (json[0] === 'Error') return true;
    return json.some((child) => hasErrorNode(child));
  }
  return false;
}

function hasUnbalancedBraces(s) {
  let depth = 0;
  let paren = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '(') paren++;
    else if (ch === ')') paren--;
    if (depth < 0 || paren < 0) return true;
  }
  return depth !== 0 || paren !== 0;
}

export function parseMathExpr(raw) {
  const cleaned = preprocessLatex(raw);
  if (!cleaned) {
    return { valid: false, cleaned: '', expr: null, error: 'Biểu thức trống.' };
  }
  if (hasUnbalancedBraces(cleaned)) {
    return { valid: false, cleaned, expr: null, error: 'Dấu ngoặc { } hoặc ( ) chưa cân bằng.' };
  }
  try {
    const ce = getComputeEngine();
    const expr = ce.parse(cleaned);
    if (!expr || hasErrorNode(expr.json)) {
      return {
        valid: false,
        cleaned,
        expr: null,
        error: 'Cú pháp LaTeX hoặc biểu thức toán học không hợp lệ.',
      };
    }
    return { valid: true, cleaned, expr, error: null };
  } catch (err) {
    return {
      valid: false,
      cleaned,
      expr: null,
      error: err?.message || 'Không phân tích được biểu thức toán.',
    };
  }
}

export function validateMathExpression(raw) {
  const parsed = parseMathExpr(raw);
  if (!parsed.valid) {
    return { valid: false, is_number: false, error: parsed.error };
  }
  const { expr } = parsed;
  const unknowns = expr.unknowns ?? [];
  const isNumber = unknowns.length === 0 && (typeof expr.N === 'function' ? Number.isFinite(Number(expr.N().numericValue)) || expr.isNumber : false);
  return {
    valid: true,
    is_number: Boolean(isNumber),
    unknowns,
    canonical: expr.canonical?.latex ?? expr.latex,
  };
}

/** Đánh giá tương đương số học tại nhiều điểm mẫu khi biểu thức chứa hàm siêu việt mà isEqual chưa kết luận. */
function numericSampleEquivalent(ce, expr1, expr2) {
  try {
    const u1 = expr1.unknowns ?? [];
    const u2 = expr2.unknowns ?? [];
    const vars = [...new Set([...u1, ...u2])];
    if (vars.length > 2) return null;

    if (vars.length === 0) {
      const v1 = expr1.N().numericValue;
      const v2 = expr2.N().numericValue;
      const n1 = typeof v1 === 'number' ? v1 : typeof v1?.re === 'number' && Math.abs(v1.im ?? 0) < 1e-10 ? v1.re : NaN;
      const n2 = typeof v2 === 'number' ? v2 : typeof v2?.re === 'number' && Math.abs(v2.im ?? 0) < 1e-10 ? v2.re : NaN;
      if (Number.isFinite(n1) && Number.isFinite(n2)) {
        return Math.abs(n1 - n2) <= 1e-7 * Math.max(1, Math.abs(n1), Math.abs(n2));
      }
      return null;
    }

    const sampleSets =
      vars.length === 1
        ? [0.37, 0.89, 1.43, 2.17, -0.61]
        : [
            [0.37, 0.83],
            [1.19, 0.47],
            [1.73, 2.11],
            [-0.53, 1.37],
          ];

    let compared = 0;
    for (const pt of sampleSets) {
      const sub =
        vars.length === 1
          ? { [vars[0]]: pt }
          : { [vars[0]]: pt[0], [vars[1]]: pt[1] };
      const e1 = expr1.subs(sub).N();
      const e2 = expr2.subs(sub).N();
      const n1 = typeof e1.numericValue === 'number' ? e1.numericValue : NaN;
      const n2 = typeof e2.numericValue === 'number' ? e2.numericValue : NaN;
      if (!Number.isFinite(n1) || !Number.isFinite(n2)) continue;
      compared++;
      if (Math.abs(n1 - n2) > 1e-6 * Math.max(1, Math.abs(n1), Math.abs(n2))) {
        return false;
      }
    }
    return compared >= 2 ? true : null;
  } catch {
    return null;
  }
}

/**
 * Kiểm tra hai biểu thức toán học có tương đương nhau không (thuần Node.js, <5ms).
 * Trả về { valid, equivalent, method, error? }.
 */
export function verifyMathEquivalence(expr1Raw, expr2Raw) {
  const p1 = parseMathExpr(expr1Raw);
  if (!p1.valid) {
    return { valid: false, equivalent: false, error: `Biểu thức 1: ${p1.error}` };
  }
  const p2 = parseMathExpr(expr2Raw);
  if (!p2.valid) {
    return { valid: false, equivalent: false, error: `Biểu thức 2: ${p2.error}` };
  }

  const e1 = p1.expr;
  const e2 = p2.expr;

  if (p1.cleaned === p2.cleaned || e1.isSame(e2)) {
    return { valid: true, equivalent: true, method: 'syntactic' };
  }

  try {
    const eqVal = e1.isEqual(e2);
    if (eqVal === true) {
      return { valid: true, equivalent: true, method: 'symbolic_equal' };
    }
    if (typeof e1.isIdenticallyEqual === 'function') {
      const idVal = e1.isIdenticallyEqual(e2);
      if (idVal === true) {
        return { valid: true, equivalent: true, method: 'symbolic_identity' };
      }
      if (idVal === false && eqVal === false) {
        return { valid: true, equivalent: false, method: 'symbolic_diff' };
      }
    }
    const ce = getComputeEngine();
    const diff = ce.box(['Subtract', e1, e2]).simplify();
    if (diff.isEqual(0) === true) {
      return { valid: true, equivalent: true, method: 'symbolic_simplify' };
    }
    const sampled = numericSampleEquivalent(ce, e1, e2);
    if (sampled !== null) {
      return { valid: true, equivalent: sampled, method: 'numeric_sampling' };
    }
    return { valid: true, equivalent: eqVal === true, method: 'symbolic_fallback' };
  } catch (err) {
    return {
      valid: false,
      equivalent: false,
      error: err?.message || 'Lỗi khi so sánh biểu thức.',
    };
  }
}

/** Trích xuất khung cấu trúc toán học của một câu hỏi để phát hiện trùng lặp cả khi đổi nhẹ ký hiệu/LaTeX. */
export function extractMathSkeleton(stem) {
  if (!stem) return '';
  const ce = getComputeEngine();
  return String(stem)
    .replace(/\$([^$]+)\$/g, (_, latex) => {
      try {
        const cleaned = preprocessLatex(latex);
        const expr = ce.parse(cleaned);
        if (expr && !hasErrorNode(expr.json)) {
          return ' ' + expr.canonical.latex.replace(/\d+(?:\.\d+)?/g, '#') + ' ';
        }
      } catch {
        // fallback giữ nguyên nội dung đã làm sạch
      }
      return ' ' + latex.replace(/\\dfrac/g, '\\frac').replace(/\d+/g, '#') + ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
}
