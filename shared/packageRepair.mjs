// Sửa các lỗi AI hay mắc khi viết gói nhập JSON, trước khi đọc. Không đoán nội dung: chỉ sửa cú pháp.
//  - Bọc trong ```json … ``` hoặc có lời dẫn trước/sau → lấy đúng khối { … }.
//  - LaTeX chỉ có một dấu \ (\frac, \sqrt, \times, \neq…) → nhân đôi để JSON giữ đúng công thức.

/** Lấy khối JSON chính: bỏ ``` và chữ thừa ngoài cặp { } ngoài cùng. */
function extractJson(s) {
  let t = String(s ?? '').replace(/^﻿/, '').trim();
  const fence = t.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)```/);
  let changed = false;
  if (fence) {
    t = fence[1].trim();
    changed = true;
  }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a > 0 || (b >= 0 && b < t.length - 1)) {
    if (a >= 0 && b > a) {
      t = t.slice(a, b + 1);
      changed = true;
    }
  }
  return { text: t, changed };
}

const JSON_ESC = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);

/**
 * Duyệt từng chuỗi trong JSON. Trong một chuỗi:
 *  - \ đứng trước ký tự không phải mã thoát JSON (\s, \d, \i, \l…) → \\ ;
 *  - \u không theo sau bởi 4 chữ số hex (\underline) → \\u ;
 *  - \b \f \n \r \t nằm TRONG công thức $…$ và theo sau là chữ cái (\frac, \beta, \neq, \right, \times) → \\ .
 *    Ngoài công thức, \n vẫn là xuống dòng như bình thường.
 */
function fixBackslashes(src) {
  let out = '';
  let inStr = false;
  let dollars = 0; // số dấu $ đã gặp trong chuỗi hiện tại: lẻ = đang trong công thức
  let fixes = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (!inStr) {
      if (ch === '"') {
        inStr = true;
        dollars = 0;
      }
      out += ch;
      continue;
    }
    if (ch === '"') {
      inStr = false;
      out += ch;
      continue;
    }
    if (ch === '$') dollars++;
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const nx = src[i + 1];
    if (nx === '\\') {
      out += '\\\\';
      i++;
      continue;
    }
    if (nx === '"' || nx === '/') {
      out += '\\' + nx;
      i++;
      continue;
    }
    if (nx === 'u') {
      if (/^[0-9a-fA-F]{4}$/.test(src.slice(i + 2, i + 6))) {
        out += '\\u';
        i++;
      } else {
        out += '\\\\';
        fixes++;
      }
      continue;
    }
    if ('bfnrt'.includes(nx)) {
      const inMath = dollars % 2 === 1;
      const nextIsLetter = /[A-Za-z]/.test(src[i + 2] ?? '');
      if (inMath && nextIsLetter) {
        out += '\\\\';
        fixes++;
      } else {
        out += '\\' + nx;
        i++;
      }
      continue;
    }
    if (!JSON_ESC.has(nx)) {
      out += '\\\\';
      fixes++;
      continue;
    }
    out += ch;
  }
  return { text: out, fixes };
}

/** Ký tự điều khiển lọt vào chuỗi sau khi đọc (JSON hợp lệ nhưng viết \frac một dấu) → khôi phục lệnh LaTeX. */
export function restoreControlChars(s) {
  if (typeof s !== 'string' || !/[\x08\x0c\t\r]/.test(s)) return { text: s, fixes: 0 };
  let fixes = 0;
  const text = s
    .replace(/\x0c(?=[a-zA-Z])/g, () => (fixes++, '\\f'))
    .replace(/\x08(?=[a-zA-Z])/g, () => (fixes++, '\\b'))
    .replace(/\t(?=[a-zA-Z]{2})/g, () => (fixes++, '\\t'))
    .replace(/\r(?=[a-zA-Z]{2})/g, () => (fixes++, '\\r'));
  return { text, fixes };
}

/**
 * Sửa văn bản gói trước JSON.parse. Trả { text, notes: [chuỗi mô tả đã sửa gì] }.
 * Chỉ dùng khi bản gốc không đọc được hoặc có dấu hiệu lỗi; bản gốc đúng thì giữ nguyên.
 */
export function repairPackageText(raw) {
  const notes = [];
  const ex = extractJson(raw);
  if (ex.changed) notes.push('Đã bỏ phần chữ thừa hoặc dấu ``` quanh JSON.');
  const fx = fixBackslashes(ex.text);
  if (fx.fixes) notes.push(`Đã tự sửa ${fx.fixes} chỗ công thức thiếu dấu \\ (AI viết \\frac thay vì \\\\frac).`);
  return { text: fx.text, notes };
}
