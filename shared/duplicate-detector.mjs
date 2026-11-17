/**
 * SmartExam AI - Bộ chỉ mục Tìm kiếm BM25 (MiniSearch) & Phát hiện Trùng lặp Câu hỏi
 * Kết hợp tìm kiếm toàn văn tiếng Việt không dấu, khung cấu trúc LaTeX (Compute Engine) và độ tương đồng Jaccard.
 */
import MiniSearch from 'minisearch';
import { extractMathSkeleton } from './math-engine.mjs';

export function normalizeText(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\[\[img:[^\]]+\]\]/g, ' [hinh] ')
    .replace(/\\dfrac\b/g, '\\frac')
    .replace(/[\$]/g, ' ')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractTokens(str) {
  const norm = normalizeText(str);
  if (!norm) return new Set();
  const words = norm.split(' ').filter((w) => w.length >= 2);
  const ngrams = new Set(words);
  for (let i = 0; i <= norm.length - 3; i++) {
    ngrams.add(norm.slice(i, i + 3));
  }
  return ngrams;
}

export function similarityScore(strA, strB) {
  const tokensA = extractTokens(strA);
  const tokensB = extractTokens(strB);

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  const textJaccard = union === 0 ? 0 : intersection / union;

  // Kết hợp thêm khung cấu trúc toán học nếu cả hai câu đều có công thức
  const hasMathA = /\$[^$]+\$/.test(String(strA ?? ''));
  const hasMathB = /\$[^$]+\$/.test(String(strB ?? ''));
  if (hasMathA && hasMathB && textJaccard >= 0.35) {
    const skelA = extractTokens(extractMathSkeleton(strA));
    const skelB = extractTokens(extractMathSkeleton(strB));
    if (skelA.size > 0 && skelB.size > 0) {
      let skelInter = 0;
      for (const t of skelA) if (skelB.has(t)) skelInter++;
      const skelUnion = skelA.size + skelB.size - skelInter;
      const skelScore = skelUnion === 0 ? 0 : skelInter / skelUnion;
      return Number((0.7 * textJaccard + 0.3 * skelScore).toFixed(3));
    }
  }

  return Number(textJaccard.toFixed(3));
}

function makeMiniSearch() {
  return new MiniSearch({
    fields: ['stemNorm', 'optionsNorm', 'skeleton', 'topic'],
    storeFields: ['id', 'type', 'topic', 'level', 'stem'],
    tokenize: (text) => normalizeText(text).split(' ').filter((w) => w.length >= 2),
    processTerm: (term) => term,
    searchOptions: {
      boost: { stemNorm: 3, skeleton: 2, optionsNorm: 1.5, topic: 1 },
      fuzzy: 0.18,
      prefix: true,
    },
  });
}

function toIndexDoc(q) {
  const stem = String(q.stem ?? '');
  const opts = Array.isArray(q.options) ? q.options.join(' ') : '';
  return {
    id: q.id,
    type: q.type ?? 'mcq',
    topic: q.topic ?? '',
    level: q.level ?? 2,
    stem,
    stemNorm: normalizeText(stem),
    optionsNorm: normalizeText(opts),
    skeleton: normalizeText(extractMathSkeleton(stem)),
  };
}

/**
 * Chỉ mục tìm kiếm BM25 + Lọc ứng viên trùng lặp tốc độ cao dùng MiniSearch.
 */
export class QuestionSearchIndex {
  constructor(questions = []) {
    this.mini = makeMiniSearch();
    this.byId = new Map();
    this.replaceAll(questions);
  }

  replaceAll(questions = []) {
    this.mini = makeMiniSearch();
    this.byId.clear();
    const docs = [];
    for (const q of questions) {
      if (!q || q.id === undefined || q.id === null) continue;
      this.byId.set(q.id, q);
      docs.push(toIndexDoc(q));
    }
    if (docs.length) {
      this.mini.addAll(docs);
    }
  }

  /** Tìm kiếm toàn văn tiếng Việt không dấu + công thức, trả về danh sách id xếp hạng theo BM25. */
  search(query, { limit = 200, fuzzy = 0.2 } = {}) {
    const clean = normalizeText(query);
    if (!clean) return [];
    const results = this.mini.search(clean, {
      combineWith: 'OR',
      fuzzy,
      prefix: true,
      boost: { stemNorm: 3, skeleton: 2, optionsNorm: 1.5, topic: 1 },
    });
    return results.slice(0, limit).map((r) => ({ id: r.id, score: r.score }));
  }

  /** Lấy nhanh tối đa `poolSize` ứng viên liên quan qua BM25 rồi chấm điểm tương đồng chính xác. */
  findDuplicates(candidateStem, { threshold = 0.65, limit = 5, excludeId = null, poolSize = 40 } = {}) {
    const candNorm = normalizeText(candidateStem);
    if (candNorm.length < 10 || this.byId.size === 0) return [];

    // Nếu ngân hàng nhỏ (< 120 câu), quét trực tiếp luôn để không bỏ sót câu chỉ dùng ký hiệu ngắn
    let candidateQuestions;
    if (this.byId.size <= 120) {
      candidateQuestions = [...this.byId.values()];
    } else {
      const hits = this.mini.search(candNorm, {
        combineWith: 'OR',
        prefix: true,
        fuzzy: 0.2,
      }).slice(0, poolSize);
      candidateQuestions = hits.map((h) => this.byId.get(h.id)).filter(Boolean);
    }

    const filtered = excludeId !== null && excludeId !== undefined
      ? candidateQuestions.filter((q) => q.id !== excludeId)
      : candidateQuestions;

    return findDuplicates(candidateStem, filtered, { threshold, limit });
  }
}

export function findDuplicates(candidateStem, existingQuestions, { threshold = 0.65, limit = 5 } = {}) {
  if (!candidateStem || !existingQuestions?.length) return [];

  const candNorm = normalizeText(candidateStem);
  if (candNorm.length < 10) return [];

  const matches = [];

  for (const q of existingQuestions) {
    const qStem = q.stem || '';
    const score = similarityScore(candidateStem, qStem);

    if (score >= threshold) {
      let reason = 'Nội dung và câu chữ gần như tương tự';
      if (score >= 0.9) reason = 'Gần như trùng khớp hoàn toàn (trùng > 90%)';
      else if (score >= 0.75) reason = 'Cùng dạng câu hỏi và cấu trúc toán học';

      matches.push({
        id: q.id,
        type: q.type,
        topic: q.topic,
        stem: qStem,
        score,
        reason,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}
