import { similarityScore } from '../../shared/duplicate-detector.mjs';

export interface BuilderHandoffPayload {
  title?: string;
  durationMin?: number;
  items: Array<{ qid: number; type: 'mcq' | 'tf' | 'short'; topic?: string | null; level?: number }>;
  questions?: Record<number, any>;
  classId?: number | null;
  source?: 'import' | 'bank' | 'weak';
  topics?: string[];
  createdAt?: number;
}

const HANDOFF_KEY = 'smartexam_builder_handoff_v1';

export function saveBuilderHandoff(payload: BuilderHandoffPayload) {
  try {
    sessionStorage.setItem(
      HANDOFF_KEY,
      JSON.stringify({ ...payload, createdAt: Date.now() }),
    );
  } catch {
    // ignore storage quota errors
  }
}

export function consumeBuilderHandoff(): BuilderHandoffPayload | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(HANDOFF_KEY);
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed as BuilderHandoffPayload;
  } catch {
    return null;
  }
}

export function computeExamMatrix(items: Array<{ topic?: string | null; level?: number }>) {
  const matrix: Record<string, { 1: number; 2: number; 3: number; total: number }> = {};
  for (const it of items) {
    const topic = it.topic || 'khac';
    const lv = (Number(it.level) === 1 || Number(it.level) === 2 || Number(it.level) === 3 ? Number(it.level) : 2) as 1 | 2 | 3;
    if (!matrix[topic]) matrix[topic] = { 1: 0, 2: 0, 3: 0, total: 0 };
    matrix[topic][lv]++;
    matrix[topic].total++;
  }
  return matrix;
}

export interface ExamDiagnostics {
  total: number;
  byType: { mcq: number; tf: number; short: number };
  byLevel: { 1: number; 2: number; 3: number };
  levelPct: { 1: number; 2: number; 3: number };
  topicsCount: number;
  missingSelectedTopics: string[];
  duplicatePairs: Array<{ idxA: number; idxB: number; qidA: number; qidB: number; score: number }>;
  estMinutes: number;
  alerts: Array<{ severity: 'ok' | 'warn' | 'bad'; text: string }>;
}

export function analyzeExamDiagnostics(
  items: Array<{ qid: number; type: string; topic?: string | null; level?: number }>,
  questions: Record<number, any>,
  blueprint: { levels?: Record<string, number>; topics?: string[]; durationMin?: number },
  meta?: { topics?: Array<{ code: string; name: string }> },
): ExamDiagnostics {
  const byType = { mcq: 0, tf: 0, short: 0 };
  const byLevel = { 1: 0, 2: 0, 3: 0 };
  const usedTopics = new Set<string>();
  let estMinutes = 0;

  for (const it of items) {
    if (it.type === 'mcq') byType.mcq++;
    else if (it.type === 'tf') byType.tf++;
    else if (it.type === 'short') byType.short++;

    const lv = (Number(it.level) === 1 || Number(it.level) === 2 || Number(it.level) === 3 ? Number(it.level) : 2) as 1 | 2 | 3;
    byLevel[lv]++;

    if (it.topic) usedTopics.add(it.topic);

    if (it.type === 'mcq') estMinutes += lv === 1 ? 1.2 : lv === 2 ? 2.0 : 3.2;
    else if (it.type === 'tf') estMinutes += lv === 1 ? 2.8 : lv === 2 ? 4.0 : 5.5;
    else estMinutes += lv === 1 ? 2.2 : lv === 2 ? 3.5 : 5.5;
  }

  const total = items.length;
  const levelPct = {
    1: total ? Math.round((byLevel[1] / total) * 100) : 0,
    2: total ? Math.round((byLevel[2] / total) * 100) : 0,
    3: total ? Math.round((byLevel[3] / total) * 100) : 0,
  };

  const selectedTopics = Array.isArray(blueprint.topics) ? blueprint.topics : [];
  const missingSelectedTopics = selectedTopics.filter((t) => !usedTopics.has(t));

  // Check duplicate or near-duplicate stems within the current exam paper
  const duplicatePairs: ExamDiagnostics['duplicatePairs'] = [];
  for (let i = 0; i < items.length; i++) {
    const qa = questions[items[i].qid];
    const stemA = String(qa?.stem ?? '').trim();
    if (stemA.length < 18) continue;
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].qid === items[j].qid) {
        duplicatePairs.push({ idxA: i, idxB: j, qidA: items[i].qid, qidB: items[j].qid, score: 1 });
        continue;
      }
      const qb = questions[items[j].qid];
      const stemB = String(qb?.stem ?? '').trim();
      if (stemB.length < 18) continue;
      const score = similarityScore(stemA, stemB);
      if (score >= 0.72) {
        duplicatePairs.push({ idxA: i, idxB: j, qidA: items[i].qid, qidB: items[j].qid, score });
      }
    }
  }

  const alerts: ExamDiagnostics['alerts'] = [];
  if (total === 0) {
    alerts.push({ severity: 'bad', text: 'Đề thi chưa có câu hỏi nào. Hãy sinh đề theo ma trận hoặc thêm câu từ Ngân hàng.' });
  } else {
    if (duplicatePairs.length > 0) {
      alerts.push({
        severity: 'bad',
        text: `Phát hiện ${duplicatePairs.length} cặp câu trùng hoặc gần giống nhau (VD: Câu ${duplicatePairs[0].idxA + 1} & Câu ${duplicatePairs[0].idxB + 1}).`,
      });
    }
    if (missingSelectedTopics.length > 0) {
      const names = missingSelectedTopics
        .slice(0, 3)
        .map((c) => meta?.topics?.find((t) => t.code === c)?.name ?? c)
        .join(', ');
      alerts.push({
        severity: 'warn',
        text: `Thiếu câu hỏi ở chuyên đề đã chọn: ${names}${missingSelectedTopics.length > 3 ? ` (+${missingSelectedTopics.length - 3})` : ''}.`,
      });
    }
    const targetTotal =
      Number(blueprint.levels?.[1] ?? 0) + Number(blueprint.levels?.[2] ?? 0) + Number(blueprint.levels?.[3] ?? 0);
    if (targetTotal > 0) {
      const target1 = Math.round((Number(blueprint.levels?.[1] ?? 0) / targetTotal) * 100);
      const target3 = Math.round((Number(blueprint.levels?.[3] ?? 0) / targetTotal) * 100);
      if (Math.abs(levelPct[1] - target1) > 18 || Math.abs(levelPct[3] - target3) > 18) {
        alerts.push({
          severity: 'warn',
          text: `Tỷ lệ mức độ thực tế (${levelPct[1]}/${levelPct[2]}/${levelPct[3]}%) lệch khá nhiều so với ma trận mục tiêu (${target1}/…/${target3}%).`,
        });
      }
    }
    const durationMin = Number(blueprint.durationMin || 90);
    if (estMinutes > durationMin * 1.25) {
      alerts.push({
        severity: 'warn',
        text: `Ước lượng thời gian giải (~${Math.round(estMinutes)} phút) vượt thời gian làm bài (${durationMin} phút).`,
      });
    }
    if (alerts.length === 0) {
      alerts.push({
        severity: 'ok',
        text: `Cấu trúc cân đối (${total} câu · ${usedTopics.size} chuyên đề · không phát hiện câu trùng).`,
      });
    }
  }

  return {
    total,
    byType,
    byLevel,
    levelPct,
    topicsCount: usedTopics.size,
    missingSelectedTopics,
    duplicatePairs,
    estMinutes: Math.round(estMinutes),
    alerts,
  };
}
