// Kiểm tra và xác thực biểu thức toán học thuần Node.js (dùng @cortex-js/compute-engine, không cần Python).
import {
  verifyMathEquivalence as verifySync,
  validateMathExpression as validateSync,
} from '../shared/math-engine.mjs';

export function isMathVerifyAvailable() {
  return true;
}

export async function verifyMathEquivalence(expr1, expr2) {
  return verifySync(expr1, expr2);
}

export async function validateMathExpression(expr) {
  return validateSync(expr);
}
