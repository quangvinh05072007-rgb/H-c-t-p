// Máy chủ API SmartExam AI. createApp(config) trả về hàm xử lý yêu cầu http, dùng cho cả chạy thật và test.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, toQuestion } from './db.mjs';
import { hashPassword, verifyPassword, verifyPasswordAsync, newToken, tempPassword, LoginLimiter, parseCookies, safeCsvCell, sanitizeFilename, posInt } from './security.mjs';
import { importFile, importText, answerFileToText, answerEntriesFromText, tagDrafts } from './importers.mjs';
import { applyAnswerEntries, answerFromSolution, sameAnswer } from '../shared/parse.mjs';
import { makeAi } from './ai.mjs';
import { gradeAttempt, gradeQuestion } from '../shared/grading.mjs';
import { vnDay, scheduleReview, startOfDayMs, isDue, overdueDays } from '../shared/spaced.mjs';
import { buildProgress } from '../shared/progress.mjs';
import crypto from 'node:crypto';
import { buildXlsx } from '../shared/xlsxWrite.mjs';
import { hashSeed } from '../shared/rng.mjs';
import { generateExam, imageOptions, apportion, makeVariant, makeVariants, variantLayout, assignVariants, toOriginalResponse, OFFICIAL_BLUEPRINT } from '../shared/generate.mjs';
import { diagnoseAttempt, diagnoseItem, computeMastery, recommend, selectPractice } from '../shared/diagnose.mjs';
import { examToDocx, crossAnswerKey } from '../shared/exportExam.mjs';
import { examToPdf } from '../shared/exportExamPdf.mjs';
import { exportAnswerSheetDocx } from '../shared/exportAnswerSheetDocx.mjs';
import { TOPICS, TOPIC_BY_CODE, LEVELS, SOURCES, SOURCE_HINT, ERROR_TYPES, QUESTION_TYPES } from '../shared/topics.mjs';
import { CSV_TEMPLATE, SHEET_HEADERS } from '../shared/sheet.mjs';
import { seedSample } from './seed.mjs';
import { SAMPLE_QUESTIONS } from './seedQuestions.mjs';
import { registerReports } from './reports.mjs';
import { registerFamily } from './family.mjs';
import { ImportJobs } from './import-jobs.mjs';
import { mathOcrAvailable, recognizeMathImages } from './math-ocr.mjs';
import { isMathVerifyAvailable, verifyMathEquivalence, validateMathExpression } from './math-verify.mjs';
import { findDuplicates, QuestionSearchIndex } from '../shared/duplicate-detector.mjs';
import { isOmrAvailable, processOmrImage, generateOmrTemplateHtml } from './omr.mjs';
import JSZip from 'jszip';

export const SAVE_GRACE_MS = 30 * 1000; // ân hạn mạng sau giờ nộp
export const LATE_WINDOW_MS = 15 * 60 * 1000; // nhận bản đồng bộ muộn (mất mạng) để giáo viên quyết định
const SESSION_MS = 12 * 3600 * 1000;
const DAY_GOAL = 10;

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
const fail = (status, message, extra) => {
  throw new HttpError(status, message, extra);
};

const DUMMY_HASH = hashPassword('khong-co-tai-khoan');
const dayKey = vnDay; // ngày lịch giờ Việt Nam

/** Kiểm tra câu hỏi đủ điều kiện duyệt. Trả về danh sách lỗi (rỗng = hợp lệ). */
export function validateQuestion(q) {
  const errs = [];
  if (!QUESTION_TYPES[q.type]) errs.push('Loại câu không hợp lệ.');
  if (!String(q.stem ?? '').trim()) errs.push('Thiếu đề bài.');
  if (!TOPIC_BY_CODE[q.topic]) errs.push('Chưa chọn chuyên đề.');
  if (![1, 2, 3].includes(Number(q.level))) errs.push('Chưa chọn mức độ.');
  if (q.type === 'mcq') {
    if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some((o) => !String(o ?? '').trim())) errs.push('Cần đủ 4 phương án A–D.');
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) errs.push('Chưa chọn đáp án đúng.');
  } else if (q.type === 'tf') {
    if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some((o) => !String(o ?? '').trim())) errs.push('Cần đủ 4 ý a)–d).');
    if (!Array.isArray(q.answer) || q.answer.length !== 4 || q.answer.some((x) => typeof x !== 'boolean')) errs.push('Chọn Đúng/Sai cho cả 4 ý.');
  } else if (q.type === 'short') {
    if (!String(q.answer ?? '').trim()) errs.push('Chưa nhập đáp án.');
  }
  return errs;
}

export function createApp(config = {}) {
  const db = openDb(config.dbFile ?? ':memory:');
  let clockFn = config.clock ?? (() => Date.now());
  const now = () => clockFn();
  const ai = config.aiImpl ?? makeAi(config);
  const limiter = new LoginLimiter();
  const mathLimiter = new LoginLimiter(120, 60 * 1000, 5000);
  const distDir = config.distDir;
  const isHttpsReq = (req) => Boolean(req?.socket?.encrypted || String(req?.headers?.['x-forwarded-proto'] ?? '').split(',')[0].trim().toLowerCase() === 'https');
  const sessionCookie = (token, maxAge, req) =>
    `se_session=${token}; HttpOnly; ${isHttpsReq(req) ? 'SameSite=None; Secure' : 'SameSite=Lax'}; Path=/; Max-Age=${maxAge}`;

  // ---------------- tiện ích ----------------
  /** Ghi nhật ký (chỉ thêm). extra: { target, old, new, reason, outcome: 'ok' | 'denied' }. */
  function audit(user, action, detail, ip, extra = {}) {
    const js = (v) => (v === undefined ? null : JSON.stringify(v));
    db.run(
      'INSERT INTO audit_log (school_id, user_id, action, detail, ip, at, target, old_json, new_json, reason, outcome) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      user?.school_id ?? null,
      user?.id ?? null,
      action,
      detail ? String(detail).slice(0, 500) : null,
      ip ?? null,
      now(),
      extra.target ?? null,
      js(extra.old),
      js(extra.new),
      extra.reason ? String(extra.reason).slice(0, 500) : null,
      extra.outcome ?? 'ok',
    );
  }

  /** Từ chối thao tác nhạy cảm: ghi nhận lần thử rồi trả 403. */
  function deny(user, action, target, why, ip) {
    audit(user, action, why, ip, { target, outcome: 'denied' });
    fail(403, `Bạn không có quyền làm việc này. ${why}`);
  }

  /** Lý do bắt buộc cho thao tác nhạy cảm. */
  function needReason(body) {
    const r = String(body?.reason ?? '').trim();
    if (r.length < 5) fail(400, 'Phải nhập lý do (ít nhất 5 ký tự).');
    return r;
  }

  const VERSION_FIELDS = ['type', 'stem', 'options', 'answer', 'explanation', 'topic', 'level', 'status', 'distractors', 'group_id', 'ocrText', 'sourceStem'];
  const questionSnapshot = (row) => Object.fromEntries(VERSION_FIELDS.map((k) => [k, (k === 'ocrText' ? row.ocrText ?? row.ocr_text : k==='sourceStem'?row.sourceStem??row.source_stem:row[k]) ?? null]));
  /** Lưu trạng thái TRƯỚC khi sửa, để xem lịch sử và khôi phục. */
  function recordVersion(row, user, reason) {
    const n = (db.get('SELECT MAX(version) v FROM question_versions WHERE qid = ?', row.id)?.v ?? 0) + 1;
    db.run('INSERT INTO question_versions (school_id, qid, version, snapshot_json, changed_by, reason, at) VALUES (?,?,?,?,?,?,?)', row.school_id, row.id, n, JSON.stringify(questionSnapshot(row)), user?.id ?? null, reason ? String(reason).slice(0, 300) : null, now());
    return n;
  }
  function writeQuestionFields(id, f) {
    db.run(
      'UPDATE questions SET type = ?, stem = ?, options_json = ?, answer_json = ?, explanation = ?, topic = ?, level = ?, status = ?, distractors_json = ?, group_id = ?, ocr_text = ?, source_stem = ?, updated_at = ? WHERE id = ?',
      f.type,
      f.stem,
      JSON.stringify(f.options ?? []),
      JSON.stringify(f.answer ?? null),
      f.explanation ?? '',
      f.topic,
      Number(f.level),
      f.status,
      JSON.stringify(f.distractors ?? {}),
      f.group_id ?? null,
      String(f.ocrText ?? ''),
      String(f.sourceStem ?? ''),
      now(),
      id,
    );
    const row = db.get('SELECT school_id FROM questions WHERE id = ?', id);
    if (reviewPolicy(row.school_id) === 'double') {
      db.run("UPDATE questions SET status = CASE WHEN status = 'archived' THEN status ELSE 'draft' END, approvals_json = NULL, approved_by = NULL WHERE id = ?", id);
    }
  }

  const reviewPolicy = (schoolId) => db.get('SELECT review_policy p FROM schools WHERE id = ?', schoolId)?.p ?? 'single';
  /** Đề xem được: đề dùng chung của trường, đề của chính mình; quản lý xem hết trong trường. */
  function visibleExam(user, id) {
    const e = db.get('SELECT * FROM exams WHERE id = ?', id);
    if (!e || e.school_id !== user.school_id) fail(404, 'Không tìm thấy đề.');
    if (e.visibility !== 'school' && e.created_by !== user.id && user.role !== 'admin') fail(404, 'Không tìm thấy đề.');
    return e;
  }

  function questionUsed(schoolId, qid) {
    if (db.get('SELECT 1 x FROM evidence WHERE school_id = ? AND qid = ? LIMIT 1', schoolId, qid)) return true;
    return db.all('SELECT items_json FROM exams WHERE school_id = ?', schoolId).some((e) => e.items.some((x) => x.qid === qid));
  }

  /** Bài làm thuộc lớp mình phụ trách (admin: cả trường). Sai quyền → ghi nhận và 403. */
  function staffAttempt(user, id, action, ip) {
    const att = db.get('SELECT * FROM attempts WHERE id = ?', id);
    if (!att) fail(404, 'Không tìm thấy bài làm.');
    const target = `attempt:${att.id}`;
    if (att.school_id !== user.school_id) deny(user, action, target, 'Bài làm không thuộc trường của bạn.', ip);
    const asg = att.assignment_id ? db.get('SELECT * FROM assignments WHERE id = ?', att.assignment_id) : null;
    if (!asg) fail(400, 'Chỉ bài được giao mới thao tác được.');
    if (!teacherClassIds(user).includes(asg.class_id)) deny(user, action, target, 'Bạn không phụ trách lớp này.', ip);
    return { att, asg };
  }


  function publicUser(u) {
    if (!u) return null;
    const cls = u.class_id ? db.get('SELECT id, name, grade, code FROM classes WHERE id = ?', u.class_id) : null;
    const school = db.get('SELECT id, name, sample FROM schools WHERE id = ?', u.school_id);
    return { id: u.id, role: u.role, username: u.username, displayName: u.display_name, class: cls, school, xp: u.xp, streak: u.streak };
  }

  function questionsMap(schoolId, ids) {
    if (!ids.length) return {};
    const rows = db.all(`SELECT * FROM questions WHERE school_id = ? AND id IN (${ids.map(() => '?').join(',')})`, schoolId, ...ids);
    return Object.fromEntries(rows.map((r) => [r.id, toQuestion(r)]));
  }

  /** Học sinh được giao bài (bài giao cho cả lớp thì target = null). */
  const targeted = (a, students) => (Array.isArray(a.target) ? students.filter((s) => a.target.includes(s.id)) : students);

  function teacherClassIds(user) {
    if (user.role === 'admin') return db.all('SELECT id FROM classes WHERE school_id = ?', user.school_id).map((c) => c.id);
    return db.all('SELECT id FROM classes WHERE school_id = ? AND teacher_id = ?', user.school_id, user.id).map((c) => c.id);
  }

  function selectedClassIds(user, value) {
    const allowed = teacherClassIds(user);
    if (value === undefined) return allowed;
    if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) fail(400, 'Mã lớp không hợp lệ.');
    const id = Number(value);
    if (!allowed.includes(id)) fail(403, 'Bạn không phụ trách lớp này.');
    return [id];
  }

  function canSeeStudent(user, studentId) {
    if (user.role === 'student') return user.id === studentId;
    const s = db.get("SELECT * FROM users WHERE id = ? AND role = 'student' AND school_id = ?", studentId, user.school_id);
    if (!s) return false;
    return user.role === 'admin' || teacherClassIds(user).includes(s.class_id);
  }

  // ---------------- câu hỏi trong bài làm ----------------
  function attemptQuestions(att) {
    if (att.assignment_id) {
      const asg = db.get('SELECT exam_id FROM assignments WHERE id = ?', att.assignment_id);
      const exam = db.get('SELECT snapshot_json FROM exams WHERE id = ?', asg.exam_id);
      return exam.snapshot;
    }
    return questionsMap(att.school_id, att.layout.map((x) => x.qid));
  }

  function publicItem(it, q, i, partIndex) {
    const options = q.type === 'mcq' ? (it.perm ?? [0, 1, 2, 3]).map((k) => q.options[k]) : q.type === 'tf' ? q.options : [];
    return { qid: it.qid, type: q.type, stem: q.stem, options, no: partIndex, topic: q.topic, level: q.level };
  }

  function originalResponses(att, responses) {
    const out = {};
    for (const it of att.layout) out[it.qid] = toOriginalResponse(it, responses?.[it.qid]);
    return out;
  }

  function visibilityFor(att) {
    if (att.kind === 'practice') {
      const done = att.status !== 'in_progress';
      return { scoreVisible: done, answersVisible: done, policy: 'after_submit', releaseAt: null };
    }
    if (att.status === 'in_progress') {
      return { scoreVisible: false, answersVisible: false, policy: 'after_close', releaseAt: null };
    }
    const asg = db.get('SELECT show_result, close_at FROM assignments WHERE id = ?', att.assignment_id);
    if (!asg) return { scoreVisible: false, answersVisible: false, policy: 'after_close', releaseAt: null };
    const closed = now() > asg.close_at;
    const policy = asg.show_result || 'score_only_until_close';
    const scoreVisible = policy === 'after_submit' || policy === 'score_only_until_close' || closed;
    const answersVisible = policy === 'after_submit' || closed;
    return { scoreVisible, answersVisible, policy, releaseAt: asg.close_at };
  }

  function resultVisible(att) {
    return visibilityFor(att).scoreVisible;
  }

  function attemptView(att) {
    const qmap = attemptQuestions(att);
    const counters = { mcq: 0, tf: 0, short: 0 };
    const items = att.layout.map((it, i) => publicItem(it, qmap[it.qid], i, ++counters[it.type]));
    const vis = visibilityFor(att);
    const resp = att.responses ?? {};
    const answeredCount = Object.values(resp).filter((v) => {
      if (v === null || v === undefined || v === '') return false;
      if (Array.isArray(v)) return v.some((x) => x !== null && x !== undefined);
      return true;
    }).length;
    const view = {
      id: att.id,
      kind: att.kind,
      mode: att.mode ?? null,
      title: att.title,
      status: att.status,
      startedAt: att.started_at,
      deadlineAt: att.deadline_at,
      submittedAt: att.submitted_at,
      serverNow: now(),
      version: att.version,
      responses: att.responses,
      times: att.times,
      checked: att.checked,
      items,
      answeredCount,
      resultVisible: vis.scoreVisible,
      scoreVisible: vis.scoreVisible,
      answersVisible: vis.answersVisible,
      resultPolicy: vis.policy,
      releaseAt: vis.releaseAt,
      teacherFeedback: vis.scoreVisible ? att.teacher_feedback ?? null : null,
      teacherStamp: vis.scoreVisible ? att.teacher_stamp ?? null : null,
      feedbackAt: vis.scoreVisible ? att.feedback_at ?? null : null,
    };
    if (vis.scoreVisible) view.result = resultDetail(att, qmap, vis.answersVisible);
    return view;
  }

  function resultDetail(att, qmap, includeItems = true) {
    const byQ = Object.fromEntries((att.result?.items ?? []).map((x) => [x.qid, x]));
    const diag = Object.fromEntries((att.diagnosis?.items ?? []).map((x) => [x.qid, x]));
    return {
      score10: att.score10,
      points: att.points,
      max: att.max_points,
      byPart: att.result?.byPart,
      errorCount: att.diagnosis?.errorCount,
      topics: att.diagnosis?.topics,
      dominantError: att.diagnosis?.dominantError,
      late: att.late ? { at: att.late.at, accepted: !!att.late.accepted } : null,
      items: includeItems
        ? att.layout.map((it) => {
            const q = qmap[it.qid];
            const correctDisplayed = q.type === 'mcq' ? (it.perm ?? [0, 1, 2, 3]).indexOf(q.answer) : q.answer;
            return { qid: it.qid, correctAnswer: correctDisplayed, explanation: q.explanation, source: q.source, grade: byQ[it.qid] ?? null, diagnosis: diag[it.qid] ?? null };
          })
        : [],
    };
  }

  // ---------------- chấm và ghi bằng chứng học tập ----------------
  function bumpActivity(studentId, nQuestions, nCorrect, xp) {
    const t = now();
    const day = dayKey(t);
    db.run(
      'INSERT INTO activity (student_id, day, questions, correct) VALUES (?,?,?,?) ON CONFLICT(student_id, day) DO UPDATE SET questions = questions + excluded.questions, correct = correct + excluded.correct',
      studentId,
      day,
      nQuestions,
      nCorrect,
    );
    const u = db.get('SELECT last_active_day, streak FROM users WHERE id = ?', studentId);
    let streak = u.streak;
    if (u.last_active_day !== day) {
      const yesterday = dayKey(t - 86400000);
      streak = u.last_active_day === yesterday ? streak + 1 : 1;
    }
    db.run('UPDATE users SET xp = xp + ?, streak = ?, last_active_day = ? WHERE id = ?', xp, streak, day, studentId);
  }

  function recordEvidence(att, q, response, seconds) {
    const g = gradeQuestion(q, response);
    const d = diagnoseItem(q, response, seconds);
    const t = now();
    db.run(
      'INSERT INTO evidence (school_id, student_id, qid, topic, level, score, correct, error_type, attempt_id, at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      att.school_id,
      att.student_id,
      q.id,
      q.topic,
      q.level,
      g.points / g.max,
      g.correct ? 1 : 0,
      d?.errors?.[0]?.type ?? (d?.kind === 'blank' ? 'blank' : null),
      att.id,
      t,
    );
    const cur = db.get('SELECT * FROM review_items WHERE student_id = ? AND qid = ?', att.student_id, q.id);
    const prev = cur ? { box: cur.box, due_day: cur.due_day ?? vnDay(cur.due_at), last_day: cur.last_day, lapses: cur.lapses } : null;
    const { state: next, action } = scheduleReview(prev, g.correct, t);
    if (action === 'skip' || action === 'early' || action === 'none') {
      // giữ nguyên lịch
    } else if (next) {
      db.run(
        'INSERT INTO review_items (student_id, qid, school_id, box, due_at, due_day, last_day, lapses) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(student_id, qid) DO UPDATE SET box = excluded.box, due_at = excluded.due_at, due_day = excluded.due_day, last_day = excluded.last_day, lapses = excluded.lapses',
        att.student_id,
        q.id,
        att.school_id,
        next.box,
        startOfDayMs(next.due_day),
        next.due_day,
        next.last_day,
        next.lapses,
      );
    } else if (cur) db.run('DELETE FROM review_items WHERE student_id = ? AND qid = ?', att.student_id, q.id);
    return { g, d };
  }

  /** Chốt bài: chấm, chẩn đoán, ghi bằng chứng. Gọi trong giao dịch. Bỏ qua câu đã "kiểm tra" khi luyện tập. */
  function finalize(att, responses, times, status, opts = {}) {
    const qmap = attemptQuestions(att);
    const qs = att.layout.map((it) => qmap[it.qid]);
    const orig = originalResponses(att, responses);
    const grade = gradeAttempt(qs, orig);
    const diag = diagnoseAttempt(qs, orig, times);
    const t = opts.rescore ? att.submitted_at ?? now() : status === 'auto_submitted' ? Math.min(att.deadline_at ?? now(), now()) : now();
    db.run(
      `UPDATE attempts SET status = ?, submitted_at = ?, responses_json = ?, times_json = ?, score10 = ?, points = ?, max_points = ?, result_json = ?, diagnosis_json = ? WHERE id = ?`,
      status,
      t,
      JSON.stringify(responses ?? {}),
      JSON.stringify(times ?? {}),
      grade.score10,
      grade.points,
      grade.max,
      JSON.stringify(grade),
      JSON.stringify(diag),
      att.id,
    );
    let n = 0;
    let nc = 0;
    for (const q of qs) {
      if (att.checked?.[q.id]) continue;
      const answered = gradeQuestion(q, orig[q.id]).answered;
      if (!answered && att.kind === 'practice') continue;
      const { g } = recordEvidence(att, q, orig[q.id], times?.[q.id]);
      n++;
      if (g.correct) nc++;
    }
    if (!opts.rescore) bumpActivity(att.student_id, n, nc, att.kind === 'assignment' ? 50 + nc * 5 : nc * 10 + n * 2);
    return getAttempt(att.id);
  }

  function getAttempt(id) {
    return db.get('SELECT * FROM attempts WHERE id = ?', id);
  }

  /** Bài hết giờ mà chưa nộp → chốt bằng bản lưu cuối. */
  function finalizeIfExpired(att) {
    if (att && att.status === 'in_progress' && att.deadline_at && now() > att.deadline_at + SAVE_GRACE_MS) {
      return db.tx(() => finalize(att, att.responses, att.times, 'auto_submitted'));
    }
    return att;
  }

  function sweepExpired(where, ...params) {
    const rows = db.all(`SELECT * FROM attempts WHERE status = 'in_progress' AND deadline_at IS NOT NULL AND deadline_at < ? ${where}`, now() - SAVE_GRACE_MS, ...params);
    for (const a of rows) finalizeIfExpired(a);
  }

  function ownAttempt(user, id) {
    const att = db.get('SELECT * FROM attempts WHERE id = ? AND school_id = ?', id, user.school_id);
    if (!att || att.student_id !== user.id) fail(404, 'Không tìm thấy bài làm.');
    return att;
  }

  function mergeEvents(att, body, clientId) {
    const ev = Array.isArray(att.events) ? att.events.slice() : [];
    for (const e of Array.isArray(body.events) ? body.events.slice(0, 50) : []) {
      if (['hidden', 'blur', 'fullscreen_exit', 'paste', 'offline', 'online'].includes(e?.type)) ev.push({ type: e.type, at: Number(e.at) || now() });
    }
    if (clientId && att.client_id && clientId !== att.client_id && !ev.some((e) => e.type === 'second_device' && e.client === clientId)) {
      ev.push({ type: 'second_device', at: now(), client: String(clientId).slice(0, 40) });
    }
    return ev.slice(-500);
  }

  // ---------------- năng lực học sinh ----------------
  function studentMastery(studentId) {
    const ev = db.all('SELECT topic, level, score, at FROM evidence WHERE student_id = ? AND topic IS NOT NULL', studentId);
    return computeMastery(ev, now());
  }

  function studentErrorCount(studentId, sinceMs = 60 * 86400000) {
    const rows = db.all('SELECT error_type, COUNT(*) n FROM evidence WHERE student_id = ? AND correct = 0 AND error_type IS NOT NULL AND at > ? GROUP BY error_type', studentId, now() - sinceMs);
    const out = { concept: 0, formula: 0, transform: 0, careless: 0, blank: 0 };
    for (const r of rows) out[r.error_type] = r.n;
    return out;
  }

  function buildCompetencyRadar(evidence, attempts) {
    const levelStats = { 1: { c: 0, t: 0 }, 2: { c: 0, t: 0 }, 3: { c: 0, t: 0 } };
    for (const ev of evidence) {
      if (ev.level && levelStats[ev.level]) {
        levelStats[ev.level].t++;
        if (ev.correct) levelStats[ev.level].c++;
      }
    }
    const partStats = { I: { c: 0, t: 0 }, II: { c: 0, t: 0 }, III: { c: 0, t: 0 } };
    for (const att of attempts) {
      if (Array.isArray(att.items)) {
        for (const it of att.items) {
          const p = it.type === 'mcq' ? 'I' : it.type === 'tf' ? 'II' : 'III';
          if (partStats[p]) {
            partStats[p].t++;
            if (it.correct) partStats[p].c++;
          }
        }
      }
    }
    const pct = (c, t, def) => (t > 0 ? Math.round((c / t) * 100) : def);
    const pI = pct(partStats.I.c, partStats.I.t, 82);
    const pII = pct(partStats.II.c, partStats.II.t, 64);
    const pIII = pct(partStats.III.c, partStats.III.t, 52);
    const l1 = pct(levelStats[1].c, levelStats[1].t, 85);
    const l2 = pct(levelStats[2].c, levelStats[2].t, 68);
    const l3 = pct(levelStats[3].c, levelStats[3].t, 46);

    const expectedScore = Math.min(10, Math.max(0, (pI * 3.0 + pII * 4.0 + pIII * 3.0) / 100));
    const minScore = Math.max(0, Math.round((expectedScore - 0.45) * 4) / 4);
    const maxScore = Math.min(10, Math.round((expectedScore + 0.55) * 4) / 4);

    return {
      metrics: [
        { label: 'Phần I (Trắc nghiệm)', pct: pI, target: '3,0 đ', color: '#10b981' },
        { label: 'Phần II (Đúng/Sai)', pct: pII, target: '4,0 đ', color: '#0284c7' },
        { label: 'Phần III (Trả lời ngắn)', pct: pIII, target: '3,0 đ', color: '#d97706' },
        { label: 'Nhận biết (Mức 1)', pct: l1, target: 'Cơ bản', color: '#6366f1' },
        { label: 'Thông hiểu (Mức 2)', pct: l2, target: 'Trọng tâm', color: '#8b5cf6' },
        { label: 'Vận dụng (Mức 3)', pct: l3, target: 'Phân hóa 8+', color: '#ec4899' },
      ],
      prediction: {
        min: minScore,
        max: maxScore,
        bracket: `${minScore.toFixed(2).replace('.', ',')} – ${maxScore.toFixed(2).replace('.', ',')} điểm`,
        advice: pII < 70
          ? 'Cần rèn luyện thêm câu Đúng/Sai (Phần II) để tối ưu điểm số 1,0 đ/câu.'
          : pIII < 60
          ? 'Nên luyện kỹ kỹ năng tính toán và chuẩn hóa đáp số Phần III (0,5 đ/câu).'
          : 'Duy trì phản xạ làm đề tổng hợp để ổn định phong độ 8+.',
      },
    };
  }

  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function studentProfile(studentId, forStaff = false) {
    const u = db.get('SELECT * FROM users WHERE id = ?', studentId);
    const mastery = studentMastery(studentId);
    const errorCount = studentErrorCount(studentId);
    const { blank, ...errs } = errorCount;
    const tNow = now();
    const attempts = db
      .all(
        `SELECT a.id, a.kind, a.title, a.status, a.score10, a.points, a.max_points, a.result_json, a.submitted_at, a.started_at, a.teacher_feedback, a.teacher_stamp, a.feedback_at, s.mode, s.show_result, s.close_at FROM attempts a LEFT JOIN assignments s ON s.id = a.assignment_id
         WHERE a.student_id = ? ORDER BY a.started_at DESC LIMIT 30`,
        studentId,
      )
      .map((a) => {
        const isDone = a.status !== 'in_progress';
        const closed = !a.close_at || tNow > a.close_at;
        const policy = a.show_result || 'after_submit';
        const canSeeScore = forStaff || a.kind === 'practice' || (isDone && (policy === 'after_submit' || policy === 'score_only_until_close' || closed));
        const canSeeAnswers = forStaff || a.kind === 'practice' || (isDone && (policy === 'after_submit' || closed));
        let stats = null;
        let items = [];
        if (a.result_json && canSeeAnswers) {
          try {
            const res = JSON.parse(a.result_json);
            if (Array.isArray(res.items)) {
              items = res.items;
              const c = res.items.filter((i) => i.correct).length;
              const b = res.items.filter((i) => !i.answered).length;
              const w = res.items.length - c - b;
              stats = { correct: c, wrong: w, blank: b, total: res.items.length };
            }
          } catch {}
        }
        const { result_json, show_result, close_at, ...rest } = a;
        return {
          ...rest,
          score10: canSeeScore && isDone ? a.score10 : null,
          points: canSeeScore && isDone ? a.points : null,
          max_points: canSeeScore && isDone ? a.max_points : null,
          scoreVisible: canSeeScore,
          answersVisible: canSeeAnswers,
          stats,
          items,
        };
      });
    const due = db.get('SELECT COUNT(*) n FROM review_items WHERE student_id = ? AND due_day <= ?', studentId, dayKey(now())).n;
    const reviewTotal = db.get('SELECT COUNT(*) n FROM review_items WHERE student_id = ?', studentId).n;
    const days = db.all('SELECT day, questions, correct FROM activity WHERE student_id = ? ORDER BY day DESC LIMIT 28', studentId);
    const evidence = db.all('SELECT topic, level, score, correct, at FROM evidence WHERE student_id = ?', studentId);
    const competency = buildCompetencyRadar(evidence, attempts);
    const rowFeedback = db.get(
      `SELECT a.id, a.title, a.teacher_feedback, a.teacher_stamp, a.feedback_at, COALESCE(u.display_name, 'Giáo viên bộ môn') as teacher_name
       FROM attempts a
       LEFT JOIN assignments s ON s.id = a.assignment_id
       LEFT JOIN users u ON u.id = s.created_by
       WHERE a.student_id = ? AND (a.teacher_feedback IS NOT NULL OR a.teacher_stamp IS NOT NULL)
       ORDER BY a.feedback_at DESC LIMIT 1`,
      studentId,
    );
    const teacherFeedback = rowFeedback
      ? {
          id: rowFeedback.id,
          title: rowFeedback.title,
          teacherFeedback: rowFeedback.teacher_feedback,
          teacherStamp: rowFeedback.teacher_stamp,
          feedbackAt: rowFeedback.feedback_at,
          teacherName: rowFeedback.teacher_name,
        }
      : null;
    return {
      student: publicUser(u),
      mastery: Object.values(mastery).sort((a, b) => a.value - b.value),
      errorCount,
      blankCount: blank,
      recommendations: recommend(mastery, errs),
      attempts,
      review: { due, total: reviewTotal },
      days,
      teacherFeedback,
      radar: competency.metrics,
      prediction: competency.prediction,
    };
  }

  // ---------------- định tuyến ----------------
  const routes = [];
  const route = (method, pattern, roles, handler) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    routes.push({ method, pattern, re, keys, roles, handler });
  };
  const reports = registerReports({ route, db, now, fail, audit, teacherClassIds, sweepExpired, saveGraceMs: SAVE_GRACE_MS });
  registerFamily({ route, db, now, fail, audit, teacherClassIds, sweepExpired });

  // ---- phiên ----
  route('POST', '/api/login', null, async ({ req, body, ip, setCookie }) => {
    if (body.role !== undefined && !['student','teacher','admin'].includes(body.role)) fail(400, 'Chọn Học sinh, Giáo viên hoặc Quản lý trường.');
    const username = String(body.username ?? '').trim().toLowerCase();
    const key = `${username}|${ip}`;
    if (limiter.blocked(key, now())) fail(429, 'Sai mật khẩu quá nhiều lần. Đợi 10 phút rồi thử lại.');
    const u = db.get('SELECT * FROM users WHERE username = ? AND active = 1', username);
    // Luôn băm một lần dù không có tài khoản: không lộ tên đăng nhập nào tồn tại qua thời gian trả lời.
    const okPw = u ? await verifyPasswordAsync(body.password ?? '', u.pass_hash) : (await verifyPasswordAsync(body.password ?? '', DUMMY_HASH), false);
    if (!okPw) {
      limiter.fail(key, now());
      fail(401, 'Sai tên đăng nhập hoặc mật khẩu.');
    }
    limiter.reset(key);
    if (body.role && body.role !== u.role) fail(403, `Tài khoản này thuộc vai trò ${u.role === 'student' ? 'Học sinh' : u.role === 'teacher' ? 'Giáo viên' : 'Quản lý trường'}. Hãy đổi lựa chọn rồi đăng nhập lại.`);
    const token = newToken();
    db.tx(() => {
      db.run('DELETE FROM sessions WHERE expires_at < ?', now());
      db.run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)', token, u.id, now(), now() + SESSION_MS);
    });
    setCookie(sessionCookie(token, SESSION_MS / 1000, req));
    audit(u, 'login', null, ip);
    return { token, user: publicUser(u) };
  });
  route('POST', '/api/logout', ['admin', 'teacher', 'student'], ({ req, user, token, setCookie, ip }) => {
    db.run('DELETE FROM sessions WHERE token = ?', token);
    setCookie(sessionCookie('', 0, req));
    audit(user, 'logout', null, ip);
    return { ok: true };
  });
  route('GET', '/api/me', ['admin', 'teacher', 'student'], ({ user }) => ({ user: publicUser(user) }));
  route('POST', '/api/me/password', ['admin', 'teacher', 'student'], async ({ user, token, body, ip }) => {
    const pwKey = `pw:${user.id}|${ip ?? ''}`;
    if (limiter.blocked(pwKey, now())) fail(429, 'Nhập sai mật khẩu cũ quá nhiều lần. Đợi 10 phút rồi thử lại.');
    const oldPw = String(body.oldPassword ?? '');
    const okOld = await verifyPasswordAsync(oldPw, user.pass_hash);
    if (!okOld) {
      limiter.fail(pwKey, now());
      fail(400, 'Mật khẩu cũ không đúng.');
    }
    limiter.reset(pwKey);
    const newPw = String(body.newPassword ?? '');
    if (newPw.length < 6 || newPw.length > 128 || !newPw.trim()) fail(400, 'Mật khẩu mới cần 6–128 ký tự và không chỉ chứa khoảng trắng.');
    if (newPw === oldPw) fail(400, 'Mật khẩu mới phải khác mật khẩu cũ.');
    db.tx(() => {
      db.run('UPDATE users SET pass_hash = ? WHERE id = ?', hashPassword(newPw), user.id);
      db.run('DELETE FROM sessions WHERE user_id = ? AND token != ?', user.id, token ?? '');
    });
    audit(user, 'password_change', null, ip);
    return { ok: true };
  });
  route('GET', '/api/meta', null, ({ user }) => ({
    topics: TOPICS.map(({ code, grade, name }) => ({ code, grade, name })),
    levels: LEVELS,
    sources: SOURCES,
    sourceHints: SOURCE_HINT,
    errorTypes: ERROR_TYPES,
    types: QUESTION_TYPES,
    officialBlueprint: OFFICIAL_BLUEPRINT,
    aiEnabled: ai.enabled,
    aiProvider: 'gemini',
    mathOcrAvailable: mathOcrAvailable(),
    mathVerifyAvailable: isMathVerifyAvailable(),
    omrAvailable: isOmrAvailable(),
    coreEngines: {
      computeEngine: true,
      geminiMultimodal: ai.enabled,
      miniSearch: true,
      pdfExport: true,
      docxExport: true,
    },
    lanIps: user && ['admin', 'teacher'].includes(user.role)
      ? Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address)
      : [],
    aiHint: ai.enabled ? null : 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets để bật bóc tách PDF/ảnh đa phương thức.',
    serverNow: now(),
  }));


  // ---- ngân hàng câu hỏi (giáo viên, quản lý) ----
  const STAFF = ['admin', 'teacher'];
  route('POST', '/api/math/verify', null, async ({ body, ip }) => {
    const k = `math:${ip ?? 'local'}`;
    if (mathLimiter.blocked(k, now())) fail(429, 'Gửi quá nhiều yêu cầu kiểm tra biểu thức. Đợi một lát.');
    mathLimiter.fail(k, now());
    const expr1 = String(body.expr1 ?? '').trim();
    const expr2 = String(body.expr2 ?? '').trim();
    if (!expr1 || !expr2) fail(400, 'Cần truyền cả hai biểu thức expr1 và expr2.');
    if (expr1.length > 1500 || expr2.length > 1500) fail(400, 'Biểu thức quá dài (tối đa 1500 ký tự).');
    return verifyMathEquivalence(expr1, expr2);
  });

  route('POST', '/api/math/validate', null, async ({ body, ip }) => {
    const k = `math:${ip ?? 'local'}`;
    if (mathLimiter.blocked(k, now())) fail(429, 'Gửi quá nhiều yêu cầu kiểm tra biểu thức. Đợi một lát.');
    mathLimiter.fail(k, now());
    const expr = String(body.expr ?? '').trim();
    if (!expr) fail(400, 'Cần truyền biểu thức expr.');
    if (expr.length > 1500) fail(400, 'Biểu thức quá dài (tối đa 1500 ký tự).');
    return validateMathExpression(expr);
  });

  const questionIndexes = new Map();
  function invalidateQuestionIndex(schoolId) {
    questionIndexes.delete(schoolId);
  }
  function getQuestionIndex(schoolId) {
    let idx = questionIndexes.get(schoolId);
    if (!idx) {
      const rows = db.all("SELECT id, type, stem, options_json, topic, level FROM questions WHERE school_id = ? AND status != 'archived'", schoolId)
        .map((r) => ({
          id: r.id,
          type: r.type,
          stem: r.stem,
          options: JSON.parse(r.options_json || '[]'),
          topic: r.topic,
          level: r.level,
        }));
      idx = new QuestionSearchIndex(rows);
      questionIndexes.set(schoolId, idx);
    }
    return idx;
  }

  route('GET', '/api/questions', STAFF, ({ user, query }) => {
    const where = ['school_id = ?'];
    const p = [user.school_id];
    if (query.status && query.status !== 'all') (where.push('status = ?'), p.push(query.status));
    else where.push("status != 'archived'");
    if (query.type) (where.push('type = ?'), p.push(query.type));
    if (query.topic) (where.push('topic = ?'), p.push(query.topic));
    if (query.source) (where.push('source = ?'), p.push(query.source));
    if (query.level) (where.push('level = ?'), p.push(Number(query.level)));
    if (query.grade) {
      const g = Number(query.grade);
      const gradeTopics = Object.keys(TOPIC_BY_CODE).filter((k) => TOPIC_BY_CODE[k].grade === g);
      if (gradeTopics.length) {
        where.push(`topic IN (${gradeTopics.map(() => '?').join(',')})`);
        p.push(...gradeTopics);
      }
    }
    const qTerm = String(query.q ?? '').trim();
    if (qTerm) {
      const bm25Hits = getQuestionIndex(user.school_id).search(qTerm, { limit: 400 });
      if (bm25Hits.length > 0) {
        const hitIds = bm25Hits.map((h) => h.id);
        where.push(`(id IN (${hitIds.map(() => '?').join(',')}) OR stem LIKE ? OR ocr_text LIKE ?)`);
        p.push(...hitIds, `%${qTerm}%`, `%${qTerm}%`);
      } else {
        where.push('(stem LIKE ? OR ocr_text LIKE ?)');
        p.push(`%${qTerm}%`, `%${qTerm}%`);
      }
    }
    const countRow = db.get(`SELECT COUNT(*) total FROM questions WHERE ${where.join(' AND ')}`, ...p);
    const total = countRow ? countRow.total : 0;
    const limit = query.limit !== undefined ? Math.min(200, Math.max(1, Number(query.limit) || 20)) : 500;
    const offset = Math.max(0, Number(query.offset) || 0);
    const rows = db.all(`SELECT * FROM questions WHERE ${where.join(' AND ')} ORDER BY status = 'draft' DESC, updated_at DESC LIMIT ? OFFSET ?`, ...p, limit, offset).map((r) => ({ ...toQuestion(r), explanationDraft: r.explanation_draft ?? null, draftCheck: r.draft_check ?? null, approvals: r.approvals ?? [] }));
    const usage = db.all('SELECT qid, COUNT(*) n, AVG(score) p FROM evidence WHERE school_id = ? GROUP BY qid', user.school_id);
    const um = Object.fromEntries(usage.map((u) => [u.qid, u]));
    const counts = db.all("SELECT status, COUNT(*) n FROM questions WHERE school_id = ? AND status != 'archived' GROUP BY status", user.school_id);
    return {
      questions: rows.map((q) => ({ ...q, stats: um[q.id] ? { n: um[q.id].n, p: Math.round(um[q.id].p * 100) / 100 } : null, problems: validateQuestion(q) })),
      counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
      total,
      hasMore: offset + rows.length < total,
      reviewPolicy: reviewPolicy(user.school_id),
    };
  });

  function insertQuestion(user, q, source, status = 'draft', extra = {}) {
    const t = now();
    const r = db.run(
      `INSERT INTO questions (school_id, type, stem, options_json, answer_json, explanation, topic, level, source, status, distractors_json, origin, parent_id, tag_confidence, created_by, approved_by, created_at, updated_at, group_id, ocr_text, source_stem)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      user.school_id,
      q.type,
      String(q.stem ?? ''),
      JSON.stringify(q.options ?? []),
      JSON.stringify(q.answer ?? null),
      String(q.explanation ?? ''),
      q.topic ?? null,
      Number(q.level) || 2,
      source,
      status,
      JSON.stringify(q.distractors ?? {}),
      extra.origin ?? null,
      extra.parent_id ?? null,
      q.tagConfidence ?? null,
      user.id,
      status === 'approved' ? user.id : null,
      t,
      t,
      q.group_id ? String(q.group_id).slice(0, 40) : null,
      String(q.ocrText ?? ''),
      String(q.sourceStem ?? ''),
    );
    invalidateQuestionIndex(user.school_id);
    return Number(r.lastInsertRowid);
  }

  route('POST', '/api/questions', STAFF, ({ user, body, ip }) => {
    if (!QUESTION_TYPES[body.type]) fail(400, 'Chọn loại câu: trắc nghiệm, đúng/sai hoặc trả lời ngắn.');
    const canAutoApprove = body.autoApprove === true && reviewPolicy(user.school_id) !== 'double' && validateQuestion(body).length === 0;
    const status = canAutoApprove ? 'approved' : 'draft';
    const id = insertQuestion(user, body, 'teacher', status);
    audit(user, 'question_create', `#${id}${canAutoApprove ? ' (duyệt ngay)' : ''}`, ip);
    const created = toQuestion(db.get('SELECT * FROM questions WHERE id = ?', id));
    return { id, question: created };
  });
  route('POST', '/api/questions/check-duplicate', STAFF, ({ user, body }) => {
    const stem = String(body.stem ?? '').trim();
    if (!stem) return { duplicates: [] };
    const currentId = body.currentId ? Number(body.currentId) : null;
    const duplicates = getQuestionIndex(user.school_id).findDuplicates(stem, {
      threshold: typeof body.threshold === 'number' ? body.threshold : 0.65,
      limit: typeof body.limit === 'number' ? body.limit : 5,
      excludeId: currentId,
    });
    return { duplicates };
  });
  route('POST', '/api/questions/check-duplicates-batch', STAFF, ({ user, body }) => {
    const items = Array.isArray(body.items) ? body.items.slice(0, 120) : [];
    if (!items.length) return { matches: {} };
    const threshold = typeof body.threshold === 'number' ? body.threshold : 0.68;
    const idx = getQuestionIndex(user.school_id);
    const matches = {};
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const stem = String(it?.stem ?? '').trim();
      if (stem.length < 15) continue;
      const bankDups = idx.findDuplicates(stem, { threshold, limit: 3 });
      const batchPeers = items
        .filter((other, j) => j !== i && String(other?.stem ?? '').trim().length >= 15)
        .map((other) => ({ id: -(Number(other.index ?? 0) + 1), stem: other.stem, type: other.type, topic: other.topic, origIndex: other.index }));
      const intraDups = findDuplicates(stem, batchPeers, { threshold: Math.max(0.75, threshold), limit: 2 })
        .map((d) => ({ ...d, batchIndex: Math.abs(d.id) - 1 }));
      if (bankDups.length || intraDups.length) {
        matches[String(it.index ?? i)] = { bank: bankDups, batch: intraDups };
      }
    }
    return { matches };
  });

  route('PUT', '/api/questions/:id', STAFF, ({ user, params, body, ip }) => {
    const q = db.get('SELECT * FROM questions WHERE id = ? AND school_id = ?', params.id, user.school_id);
    if (!q) fail(404, 'Không tìm thấy câu hỏi.');
    const EDITABLE_FIELDS = ['type', 'stem', 'options', 'answer', 'explanation', 'topic', 'level', 'distractors', 'group_id', 'ocrText', 'sourceStem'];
    const patch = {};
    for (const k of EDITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body ?? {}, k)) patch[k] = body[k];
    }
    const merged = { ...toQuestion(q), ...patch };
    if (!QUESTION_TYPES[merged.type]) fail(400, 'Loại câu không hợp lệ.');
    if (patch.level !== undefined && ![1, 2, 3].includes(Number(merged.level))) fail(400, 'Mức độ phải là 1, 2 hoặc 3.');
    const answerChanged = JSON.stringify(merged.answer ?? null) !== JSON.stringify(toQuestion(q).answer ?? null);
    const sensitive = answerChanged && questionUsed(user.school_id, q.id);
    let reason = null;
    if (sensitive) {
      if (user.role !== 'admin' && q.created_by !== user.id) deny(user, 'question_answer_change', `question:${q.id}`, 'Chỉ người tạo câu hoặc quản lý mới đổi đáp án câu đã dùng.', ip);
      reason = needReason(body);
    }
    if (merged.status === 'approved') {
      const errs = validateQuestion(merged);
      if (errs.length) fail(400, `Câu đã duyệt phải hợp lệ: ${errs.join(' ')}`);
    }
    const contentChanged = VERSION_FIELDS.filter((k) => k !== 'status').some((k) => JSON.stringify(merged[k] ?? null) !== JSON.stringify(toQuestion(q)[k] ?? null));
    recordVersion(q, user, reason ?? body.versionNote ?? 'Sửa câu hỏi');
    db.run(
      'UPDATE questions SET type = ?, stem = ?, options_json = ?, answer_json = ?, explanation = ?, topic = ?, level = ?, distractors_json = ?, group_id = ?, ocr_text = ?, source_stem = ?, tag_confidence = 1, updated_at = ? WHERE id = ?',
      merged.type,
      merged.stem,
      JSON.stringify(merged.options ?? []),
      JSON.stringify(merged.answer ?? null),
      merged.explanation ?? '',
      merged.topic,
      Number(merged.level),
      JSON.stringify(merged.distractors ?? {}),
      merged.group_id ? String(merged.group_id).slice(0, 40) : null,
      String(merged.ocrText ?? ''),
      String(merged.sourceStem ?? ''),
      now(),
      q.id,
    );
    if (contentChanged) {
      if (reviewPolicy(user.school_id) === 'double' && q.status === 'approved') db.run("UPDATE questions SET status = 'draft', approvals_json = NULL, approved_by = NULL WHERE id = ?", q.id);
      else db.run('UPDATE questions SET approvals_json = NULL WHERE id = ?', q.id);
    }
    if (sensitive) audit(user, 'question_answer_change', `#${q.id}`, ip, { target: `question:${q.id}`, old: { answer: toQuestion(q).answer }, new: { answer: merged.answer }, reason });
    else audit(user, 'question_edit', `#${q.id}`, ip, { target: `question:${q.id}` });
    invalidateQuestionIndex(user.school_id);
    return { question: toQuestion(db.get('SELECT * FROM questions WHERE id = ?', q.id)) };
  });
  // Chính sách duyệt: 'single' (một người duyệt là xong) hoặc 'double' (cần hai người khác nhau, trong đó có người không phải tác giả).
  route('POST', '/api/questions/approve', STAFF, ({ user, body, ip }) => {
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number);
    const double = reviewPolicy(user.school_id) === 'double';
    const approved = [];
    const pending = [];
    const rejected = [];
    db.tx(() => {
      for (const id of ids) {
        const q = db.get('SELECT * FROM questions WHERE id = ? AND school_id = ?', id, user.school_id);
        if (!q) continue;
        const errs = validateQuestion(toQuestion(q));
        if (errs.length) {
          rejected.push({ id, errors: errs });
          continue;
        }
        if (!double) {
          db.run("UPDATE questions SET status = 'approved', approved_by = ?, updated_at = ? WHERE id = ?", user.id, now(), id);
          approved.push(id);
          continue;
        }
        if (q.status === 'approved') continue;
        const who = [...new Set([...(q.approvals ?? []), user.id])];
        const enough = who.length >= 2 && who.some((u) => u !== q.created_by);
        if (enough) {
          db.run("UPDATE questions SET status = 'approved', approved_by = ?, approvals_json = ?, updated_at = ? WHERE id = ?", user.id, JSON.stringify(who), now(), id);
          approved.push(id);
        } else {
          db.run('UPDATE questions SET approvals_json = ? WHERE id = ?', JSON.stringify(who), id);
          pending.push({ id, message: who.length < 2 ? 'Cần một giáo viên khác duyệt thêm.' : 'Cần một người không phải tác giả câu duyệt.' });
        }
      }
    });
    if (approved.length) {
      invalidateQuestionIndex(user.school_id);
      audit(user, 'question_approve', approved.map((x) => `#${x}`).join(' '), ip);
    }
    if (pending.length) audit(user, 'question_approve_first', pending.map((x) => `#${x.id}`).join(' '), ip);
    return { approved, rejected, pending };
  });
  route('GET', '/api/admin/settings', ['admin'], ({ user }) => ({ reviewPolicy: reviewPolicy(user.school_id) }));
  route('PUT', '/api/admin/settings', ['admin'], ({ user, body, ip }) => {
    const old = reviewPolicy(user.school_id);
    const next = body.reviewPolicy === 'double' ? 'double' : body.reviewPolicy === 'single' ? 'single' : null;
    if (!next) fail(400, 'Chính sách duyệt phải là "single" hoặc "double".');
    db.run('UPDATE schools SET review_policy = ? WHERE id = ?', next, user.school_id);
    audit(user, 'settings_change', `chính sách duyệt câu hỏi: ${next === 'double' ? 'hai người' : 'một người'}`, ip, { target: `school:${user.school_id}`, old: { reviewPolicy: old }, new: { reviewPolicy: next } });
    return { reviewPolicy: next };
  });
  route('POST', '/api/questions/archive', STAFF, ({ user, body, ip }) => {
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number);
    const rows = ids.map((id) => db.get('SELECT id, status, created_by FROM questions WHERE id = ? AND school_id = ?', id, user.school_id)).filter(Boolean);
    const foreign = rows.filter((q) => user.role !== 'admin' && q.created_by !== user.id);
    if (foreign.length) deny(user, 'question_archive', foreign.map((q) => `question:${q.id}`).join(','), 'Chỉ người tạo câu hoặc quản lý mới ẩn được câu này.', ip);
    for (const q of rows) db.run("UPDATE questions SET status = 'archived', updated_at = ? WHERE id = ?", now(), q.id);
    invalidateQuestionIndex(user.school_id);
    audit(user, 'question_archive', ids.map((x) => `#${x}`).join(' '), ip, { target: rows.map((q) => `question:${q.id}`).join(','), old: rows.map((q) => ({ id: q.id, status: q.status })), new: { status: 'archived' } });
    return { ok: true };
  });

  // ---- nhập đề ----
  function storeImportedImages(user,res) {
    const idMap={};for(const im of res.images??[])idMap[im.key]=saveImage(user,im);
    const fix=t=>typeof t==='string'?t.replace(/\[\[img:(\w+)\]\]/g,(m,k)=>idMap[k]!==undefined?`[[img:${idMap[k]}]]`:m):t;
    for(const q of res.questions){q.stem=fix(q.stem);q.options=(q.options??[]).map(fix);q.explanation=fix(q.explanation);q.sourceStem=fix(q.sourceStem??(q.ocrText?q.stem:''));}
    delete res.images;return res;
  }
  const importJobs=new ImportJobs(db,async(job,options)=>{
    const owner=db.get('SELECT * FROM users WHERE id=? AND school_id=? AND active=1',job.owner_id,job.school_id);
    if(!owner||!['teacher','admin'].includes(owner.role))fail(403,'Tài khoản tạo tác vụ không còn quyền nhập đề.');
    const result=job.meta?.engine==='marker'?await recognizeMathImages(job.input,job.meta,options):await (config.importRunner??importFile)(job.name,Buffer.from(job.input),ai,options);
    options.signal.throwIfAborted();
    audit(owner,'import_parse',`${job.name}: ${result.questions.length} câu (tác vụ #${job.id})`);
    return storeImportedImages(owner,result);
  });
  route('POST','/api/import/jobs',STAFF,({user,raw,query})=>{if(!query.filename)fail(400,'Thiếu tên file.');return {id:importJobs.add(user,query.filename,raw)};});
  route('GET','/api/import/jobs',STAFF,({user})=>({jobs:importJobs.list(user)}));
  route('GET','/api/import/jobs/:id',STAFF,({user,params})=>({job:importJobs.get(user,params.id)}));
  route('PUT','/api/import/jobs/:id/draft',STAFF,({user,params,body})=>({job:importJobs.saveDraft(user,params.id,body?.questions)}));
  route('DELETE','/api/import/jobs/:id/draft',STAFF,({user,params})=>({job:importJobs.clearDraft(user,params.id)}));
  route('POST','/api/import/jobs/:id/cancel',STAFF,({user,params})=>({job:importJobs.cancel(user,params.id)}));
  route('POST','/api/import/jobs/:id/retry',STAFF,({user,params})=>({job:importJobs.retry(user,params.id)}));
  route('POST', '/api/import', STAFF, async ({ user, raw, query, body, ip }) => {
    let res;
    if (query.filename) res = await importFile(String(query.filename), raw, ai);
    else if (typeof body?.text === 'string') res = importText(body.text);
    else fail(400, 'Gửi file hoặc dán văn bản đề.');
    audit(user, 'import_parse', `${query.filename ?? 'văn bản dán'}: ${res.questions.length} câu, ${(res.images??[]).length} hình`, ip);
    return storeImportedImages(user,res);
  });
  function saveImage(user, im) {
    const buf = Buffer.from(im.data);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    const hit = db.get('SELECT id FROM images WHERE school_id = ? AND sha = ?', user.school_id, sha);
    if (hit) return hit.id;
    return Number(db.run('INSERT INTO images (school_id, sha, mime, data, cx, cy, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)', user.school_id, sha, im.mime, buf, im.cx ?? 0, im.cy ?? 0, user.id, now()).lastInsertRowid);
  }
  function imageResolver(schoolId) {
    return (id) => {
      const r = db.get('SELECT mime, data, cx, cy FROM images WHERE id = ? AND school_id = ?', id, schoolId);
      return r ? { mime: r.mime, data: Buffer.from(r.data), cx: r.cx || 3000000, cy: r.cy || 2000000 } : null;
    };
  }
  route('GET', '/api/images/:id', ['admin', 'teacher', 'student'], ({ user, params }) => {
    const r = db.get('SELECT mime, data FROM images WHERE id = ? AND school_id = ?', params.id, user.school_id);
    if (!r) fail(404, 'Không tìm thấy hình.');
    return { __file: { name: `hinh-${params.id}`, type: r.mime, data: Buffer.from(r.data), inline: true } };
  });
  route('POST','/api/images',STAFF,({user,raw,ip})=>{
    if(!raw?.length||raw.length>5*1024*1024)fail(400,'Hình cần nhỏ hơn 5 MB.');
    const mime=raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':raw[0]===255&&raw[1]===216&&raw[2]===255?'image/jpeg':raw.subarray(0,4).toString()==='RIFF'&&raw.subarray(8,12).toString()==='WEBP'?'image/webp':null;
    if(!mime)fail(400,'Chỉ nhận hình PNG, JPG hoặc WebP hợp lệ.');
    const id=saveImage(user,{data:raw,mime});audit(user,'image_upload',`#${id}`,ip);return {id};
  });
  route('POST','/api/math-ocr',STAFF,({user,body})=>{
    if(!mathOcrAvailable())fail(503,'Bộ nhận dạng công thức chưa sẵn sàng.');
    if(!QUESTION_TYPES[body.type])fail(400,'Chọn loại câu cần nhận dạng.');
    const ids=[...new Set((Array.isArray(body.imageIds)?body.imageIds:[]).map(Number))];
    if(!ids.length||ids.length>3||ids.some(id=>!Number.isInteger(id)||id<1))fail(400,'Mỗi lần nhận dạng từ 1 đến 3 ảnh gốc.');
    const pictures=ids.map(id=>{const image=db.get('SELECT data FROM images WHERE id=? AND school_id=?',id,user.school_id);if(!image)fail(404,'Không tìm thấy hình trong trường của bạn.');return {data:Buffer.from(image.data).toString('base64')};});
    const id=importJobs.add(user,'Nhận dạng công thức từ ảnh',Buffer.from(JSON.stringify(pictures)),{engine:'marker',type:body.type,sourceStem:ids.map(id=>`[[img:${id}]]`).join('\n')});
    return {id};
  });
  // File đáp án rời: đọc thành bảng đáp án, rồi đối chiếu với các câu đang duyệt.
  route('POST', '/api/import/answers', STAFF, async ({ user, raw, query, body, ip }) => {
    let text;
    if (query.filename) text = await answerFileToText(String(query.filename), raw);
    else if (typeof body?.text === 'string') text = body.text;
    else fail(400, 'Gửi file đáp án hoặc dán bảng đáp án.');
    const entries = answerEntriesFromText(text);
    if (!entries.length) fail(400, 'Không đọc được đáp án nào. Mỗi dòng cần dạng "1. A", "Câu 2: C" hoặc bảng Câu | Đáp án.');
    audit(user, 'import_answers', `${query.filename ?? 'văn bản dán'}: ${entries.length} đáp án`, ip);
    return { entries, count: entries.length };
  });
  route('POST', '/api/import/apply-key', STAFF, ({ user, body, ip }) => {
    const qs = Array.isArray(body.questions) ? body.questions : [];
    const entries = Array.isArray(body.entries) ? body.entries : [];
    if (!qs.length || !entries.length) fail(400, 'Cần có câu hỏi và bảng đáp án.');
    const { applied, unmatched } = applyAnswerEntries(qs, entries, 'file');
    const out = tagDrafts(qs.map(({ suspicion, ...q }) => q), body.kind ?? null);
    audit(user, 'import_apply_key', `${applied}/${entries.length} đáp án khớp, ${out.filter((q) => q.answerConflict).length} câu mâu thuẫn`, ip);
    return { questions: out, applied, unmatched, conflicts: out.filter((q) => q.answerConflict).length };
  });
  route('POST', '/api/import/save', STAFF, ({ user, body, ip }) => {
    const job=body.jobId?importJobs.row(user,body.jobId):null;
    if(job&&job.state!=='completed')fail(409,'Tác vụ chưa hoàn tất.');
    if(job?.saved_ids)return {ids:job.saved_ids};
    const qs = Array.isArray(body.questions) ? body.questions : [];
    if (!qs.length) fail(400, 'Không có câu nào để lưu.');
    const ids = db.tx(() => {
      const ids=qs.map((q) => insertQuestion(user, q, q.fromAi ? 'ai_modified' : 'imported', 'draft', { origin: String(body.origin ?? '').slice(0, 200) }));
      if(job)db.run('UPDATE import_jobs SET saved_ids_json=? WHERE id=?',JSON.stringify(ids),job.id);
      return ids;
    });
    audit(user, 'import_save', `${ids.length} câu từ ${body.origin ?? 'văn bản'}`, ip);
    return { ids };
  });
  route('GET', '/api/import/template.csv', STAFF, () => ({ __file: { name: 'mau-nhap-cau-hoi.csv', type: 'text/csv; charset=utf-8', data: Buffer.from(CSV_TEMPLATE, 'utf8') } }));

  // ---- AI ----
  route('POST', '/api/ai/similar', STAFF, async ({ user, body, ip }) => {
    const q = toQuestion(db.get('SELECT * FROM questions WHERE id = ? AND school_id = ?', body.id, user.school_id));
    if (!q) fail(404, 'Không tìm thấy câu gốc.');
    const gen = await ai.similarQuestion(q);
    const id = insertQuestion(user, { ...gen, type: gen.type ?? q.type, topic: q.topic, level: q.level }, 'ai_generated', 'draft', { parent_id: q.id, origin: `AI từ câu #${q.id}` });
    audit(user, 'ai_similar', `#${q.id} → #${id}`, ip);
    return { id };
  });
  // AI chỉ viết NHÁP lời giải: nằm riêng, học sinh không thấy, giáo viên phải duyệt. AI tự giải độc lập
  // và kết luận đáp án nào thì so với đáp án đã duyệt — lệch thì cảnh báo, không cho duyệt nếu không xác nhận.
  route('POST', '/api/ai/explain', STAFF, async ({ user, body, ip }) => {
    const row = db.get('SELECT * FROM questions WHERE id = ? AND school_id = ?', body.id, user.school_id);
    if (!row) fail(404, 'Không tìm thấy câu hỏi.');
    const q = toQuestion(row);
    const draft = await ai.explain(q);
    const aiAnswer = answerFromSolution(q.type, draft);
    const matches = aiAnswer === null || q.answer === null || q.answer === undefined ? null : sameAnswer(q.type, q.answer, aiAnswer);
    const check = { aiAnswer, matches, at: now(), model: ai.model ?? null };
    db.run('UPDATE questions SET explanation_draft = ?, draft_check_json = ? WHERE id = ?', draft, JSON.stringify(check), q.id);
    audit(user, 'ai_explain', `#${q.id}${matches === false ? ' — AI ra đáp án khác đáp án đã duyệt' : ''}`, ip, { target: `question:${q.id}`, new: { check } });
    return { draft, check };
  });
  route('POST', '/api/questions/:id/draft/approve', STAFF, ({ user, params, body, ip }) => {
    const row = db.get('SELECT * FROM questions WHERE id = ?', params.id);
    if (!row) fail(404, 'Không tìm thấy câu hỏi.');
    const target = `question:${row.id}`;
    if (row.school_id !== user.school_id) deny(user, 'explanation_approve', target, 'Câu hỏi không thuộc trường của bạn.', ip);
    if (!row.explanation_draft) fail(400, 'Câu này không có lời giải nháp.');
    if (row.draft_check?.matches === false && body.confirmMismatch !== true) {
      fail(409, 'AI tự giải ra đáp án khác đáp án đã duyệt của câu này. Kiểm tra lại đáp án hoặc lời giải, rồi xác nhận nếu vẫn muốn dùng.', { mismatch: true, aiAnswer: row.draft_check.aiAnswer });
    }
    const text = body.text !== undefined ? String(body.text).trim() : row.explanation_draft;
    if (!text) fail(400, 'Lời giải trống.');
    recordVersion(row, user, 'Duyệt lời giải do AI viết');
    db.run('UPDATE questions SET explanation = ?, explanation_draft = NULL, draft_check_json = NULL, updated_at = ? WHERE id = ?', text, now(), row.id);
    if (reviewPolicy(user.school_id) === 'double') db.run("UPDATE questions SET status = 'draft', approvals_json = NULL, approved_by = NULL WHERE id = ?", row.id);
    invalidateQuestionIndex(user.school_id);
    audit(user, 'explanation_approve', `#${row.id}${body.text !== undefined ? ' (đã sửa tay)' : ''}`, ip, { target, old: { explanation: row.explanation }, new: { explanation: text }, reason: row.draft_check?.matches === false ? 'Giáo viên xác nhận dù AI ra đáp án khác' : undefined });
    return { ok: true };
  });
  route('POST', '/api/questions/:id/draft/reject', STAFF, ({ user, params, ip }) => {
    const row = db.get('SELECT * FROM questions WHERE id = ?', params.id);
    if (!row) fail(404, 'Không tìm thấy câu hỏi.');
    const target = `question:${row.id}`;
    if (row.school_id !== user.school_id) deny(user, 'explanation_reject', target, 'Câu hỏi không thuộc trường của bạn.', ip);
    db.run('UPDATE questions SET explanation_draft = NULL, draft_check_json = NULL WHERE id = ?', row.id);
    audit(user, 'explanation_reject', `#${row.id}`, ip, { target });
    return { ok: true };
  });

  // ---- đề thi ----
  route('POST', '/api/exams/generate', STAFF, ({ user, body }) => {
    const pool = db.all("SELECT id, type, topic, level, status FROM questions WHERE school_id = ? AND status = 'approved'", user.school_id);
    const recent = db.all('SELECT items_json FROM exams WHERE school_id = ? ORDER BY created_at DESC LIMIT 5', user.school_id).flatMap((e) => e.items.map((x) => x.qid));
    const bp = { ...OFFICIAL_BLUEPRINT, ...body, avoidIds: recent, seed: body.seed ?? `${user.id}-${now()}` };
    const res = generateExam(pool, bp);
    const qmap = questionsMap(user.school_id, res.items.map((x) => x.qid));
    return { ...res, blueprint: bp, questions: qmap, poolSize: pool.length };
  });
  // ---- lịch sử phiên bản câu hỏi ----
  route('GET', '/api/questions/:id/versions', STAFF, ({ user, params }) => {
    const q = db.get('SELECT id FROM questions WHERE id = ? AND school_id = ?', params.id, user.school_id);
    if (!q) fail(404, 'Không tìm thấy câu hỏi.');
    const rows = db.all('SELECT v.version, v.snapshot_json, v.reason, v.at, u.display_name FROM question_versions v LEFT JOIN users u ON u.id = v.changed_by WHERE v.qid = ? ORDER BY v.version DESC', q.id);
    return { versions: rows.map((r) => ({ version: r.version, at: r.at, by: r.display_name, reason: r.reason, snapshot: r.snapshot })) };
  });
  route('POST', '/api/questions/:id/restore', STAFF, ({ user, params, body, ip }) => {
    const q = db.get('SELECT * FROM questions WHERE id = ?', params.id);
    if (!q) fail(404, 'Không tìm thấy câu hỏi.');
    const target = `question:${q.id}`;
    if (q.school_id !== user.school_id) deny(user, 'question_restore', target, 'Câu hỏi không thuộc trường của bạn.', ip);
    const v = db.get('SELECT * FROM question_versions WHERE qid = ? AND version = ?', q.id, Number(body.version));
    if (!v) fail(404, 'Không có phiên bản này.');
    const snap = v.snapshot;
    if (snap?.status === 'approved' && reviewPolicy(user.school_id) !== 'double') {
      const errs = validateQuestion(snap);
      if (errs.length) fail(400, `Phiên bản khôi phục không hợp lệ để duyệt: ${errs.join(' ')}`);
    }
    const answerChanged = JSON.stringify(snap.answer ?? null) !== JSON.stringify(q.answer ?? null);
    const sensitive = answerChanged && questionUsed(user.school_id, q.id);
    let reason = body.reason ? String(body.reason).trim() : null;
    if (sensitive) {
      if (user.role !== 'admin' && q.created_by !== user.id) deny(user, 'question_answer_change', target, 'Chỉ người tạo câu hoặc quản lý mới đổi đáp án câu đã dùng.', ip);
      reason = needReason(body);
    }
    db.tx(() => {
      recordVersion(q, user, `Trước khi khôi phục phiên bản ${v.version}`);
      writeQuestionFields(q.id, snap);
    });
    invalidateQuestionIndex(user.school_id);
    audit(user, sensitive ? 'question_answer_change' : 'question_restore', `#${q.id} ← phiên bản ${v.version}`, ip, { target, old: questionSnapshot(q), new: snap, reason });
    return { ok: true };
  });

  // ---- thao tác hàng loạt (có hoàn tác) ----
  const BULK_ACTIONS = ['set_topic', 'set_level', 'archive', 'unarchive'];
  route('POST', '/api/questions/bulk', STAFF, ({ user, body, ip }) => {
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isInteger))];
    if (!ids.length) fail(400, 'Chọn ít nhất một câu.');
    if (ids.length > 500) fail(400, 'Mỗi lần tối đa 500 câu.');
    if (!BULK_ACTIONS.includes(body.action)) fail(400, 'Thao tác không hợp lệ.');
    if (body.action === 'set_topic' && !TOPIC_BY_CODE[body.value]) fail(400, 'Chuyên đề không hợp lệ.');
    if (body.action === 'set_level' && ![1, 2, 3].includes(Number(body.value))) fail(400, 'Mức độ phải là 1, 2 hoặc 3.');
    const rows = ids.map((id) => db.get('SELECT * FROM questions WHERE id = ? AND school_id = ?', id, user.school_id)).filter(Boolean);
    if (rows.length !== ids.length) fail(404, 'Có câu không thuộc ngân hàng của trường.');
    const foreign = rows.filter((q) => user.role !== 'admin' && q.created_by !== user.id);
    if (foreign.length) deny(user, `bulk_${body.action}`, foreign.map((q) => `question:${q.id}`).join(','), 'Chỉ người tạo câu hoặc quản lý mới sửa hàng loạt được câu này.', ip);
    const before = [];
    db.tx(() => {
      for (const q of rows) {
        const next = { ...questionSnapshot(q) };
        if (body.action === 'set_topic') next.topic = body.value;
        else if (body.action === 'set_level') next.level = Number(body.value);
        else if (body.action === 'archive') next.status = 'archived';
        else if (body.action === 'unarchive') next.status = q.status === 'archived' ? 'draft' : q.status; // phải duyệt lại sau khi khôi phục
        if (JSON.stringify(next) === JSON.stringify(questionSnapshot(q))) continue;
        recordVersion(q, user, `Hàng loạt: ${body.action}`);
        writeQuestionFields(q.id, next);
        before.push({ id: q.id, snapshot: questionSnapshot(q), ver: db.get('SELECT MAX(version) v FROM question_versions WHERE qid = ?', q.id).v });
      }
    });
    if (before.length) invalidateQuestionIndex(user.school_id);
    const batchId = Number(db.run('INSERT INTO bulk_ops (school_id, user_id, action, value, before_json, at) VALUES (?,?,?,?,?,?)', user.school_id, user.id, body.action, body.value === undefined ? null : String(body.value), JSON.stringify(before), now()).lastInsertRowid);
    audit(user, `bulk_${body.action}`, `${before.length}/${ids.length} câu`, ip, { target: `bulk:${batchId}`, new: { action: body.action, value: body.value ?? null, ids: before.map((b) => b.id) } });
    return { batchId, changed: before.length, unchanged: ids.length - before.length };
  });
  route('POST', '/api/questions/bulk/:id/undo', STAFF, ({ user, params, ip }) => {
    const op = db.get('SELECT * FROM bulk_ops WHERE id = ?', params.id);
    if (!op) fail(404, 'Không tìm thấy thao tác.');
    const target = `bulk:${op.id}`;
    if (op.school_id !== user.school_id) deny(user, 'bulk_undo', target, 'Thao tác không thuộc trường của bạn.', ip);
    if (op.user_id !== user.id && user.role !== 'admin') deny(user, 'bulk_undo', target, 'Chỉ người thực hiện hoặc quản lý mới hoàn tác được.', ip);
    if (op.undone_at) fail(400, 'Thao tác này đã được hoàn tác.');
    let restored = 0;
    const skipped = [];
    db.tx(() => {
      for (const b of op.before) {
        const cur = db.get('SELECT * FROM questions WHERE id = ?', b.id);
        if (!cur || (db.get('SELECT MAX(version) v FROM question_versions WHERE qid = ?', b.id).v ?? 0) !== b.ver) {
          skipped.push(b.id); // câu đã bị sửa tiếp sau thao tác hàng loạt: không ghi đè
          continue;
        }
        recordVersion(cur, user, `Hoàn tác thao tác hàng loạt #${op.id}`);
        writeQuestionFields(b.id, b.snapshot);
        restored++;
      }
      db.run('UPDATE bulk_ops SET undone_at = ? WHERE id = ?', now(), op.id);
    });
    if (restored) invalidateQuestionIndex(user.school_id);
    audit(user, 'bulk_undo', `thao tác #${op.id}: khôi phục ${restored}, bỏ qua ${skipped.length}`, ip, { target, new: { restored, skipped } });
    return { restored, skipped };
  });

  // ---- mẫu ma trận đề ----
  const cleanBlueprint = (bp) => {
    const counts = {};
    for (const t of ['mcq', 'tf', 'short']) counts[t] = Math.max(0, Math.min(100, Math.floor(Number(bp?.counts?.[t]) || 0)));
    if (!counts.mcq && !counts.tf && !counts.short) fail(400, 'Mẫu cần có ít nhất một câu.');
    const levels = {};
    for (const l of [1, 2, 3]) levels[l] = Math.max(0, Math.min(100, Number(bp?.levels?.[l]) || 0));
    if (levels[1] + levels[2] + levels[3] <= 0) fail(400, 'Tỉ lệ mức độ không được bằng 0.');
    const topics = (Array.isArray(bp?.topics) ? bp.topics : []).filter((t) => TOPIC_BY_CODE[t]);
    return { counts, levels, topics, durationMin: Math.max(5, Math.min(300, Math.floor(Number(bp?.durationMin) || 90))) };
  };
  route('GET', '/api/blueprints', STAFF, ({ user }) => ({
    blueprints: db
      .all('SELECT b.id, b.name, b.blueprint_json, b.shared, b.owner_id, b.created_at, u.display_name owner FROM blueprint_templates b JOIN users u ON u.id = b.owner_id WHERE b.school_id = ? AND (b.shared = 1 OR b.owner_id = ?) ORDER BY b.created_at DESC', user.school_id, user.id)
      .map((b) => ({ id: b.id, name: b.name, blueprint: b.blueprint, shared: !!b.shared, owner: b.owner, mine: b.owner_id === user.id })),
  }));
  route('POST', '/api/blueprints', STAFF, ({ user, body, ip }) => {
    const name = String(body.name ?? '').trim().slice(0, 80);
    if (!name) fail(400, 'Đặt tên cho mẫu.');
    const blueprint = cleanBlueprint(body.blueprint);
    const id = Number(db.run('INSERT INTO blueprint_templates (school_id, owner_id, name, blueprint_json, shared, created_at) VALUES (?,?,?,?,?,?)', user.school_id, user.id, name, JSON.stringify(blueprint), body.shared ? 1 : 0, now()).lastInsertRowid);
    audit(user, 'blueprint_create', name, ip, { target: `blueprint:${id}` });
    return { id };
  });
  route('DELETE', '/api/blueprints/:id', STAFF, ({ user, params, ip }) => {
    const b = db.get('SELECT * FROM blueprint_templates WHERE id = ?', params.id);
    if (!b) fail(404, 'Không tìm thấy mẫu.');
    const target = `blueprint:${b.id}`;
    if (b.school_id !== user.school_id) deny(user, 'blueprint_delete', target, 'Mẫu không thuộc trường của bạn.', ip);
    if (b.owner_id !== user.id && user.role !== 'admin') deny(user, 'blueprint_delete', target, 'Chỉ người tạo mẫu hoặc quản lý mới xóa được.', ip);
    db.run('DELETE FROM blueprint_templates WHERE id = ?', b.id);
    audit(user, 'blueprint_delete', b.name, ip, { target, old: b.blueprint });
    return { ok: true };
  });

  // ---- nhân bản đề ----
  route('POST', '/api/exams/:id/clone', STAFF, ({ user, params, body, ip }) => {
    const e = visibleExam(user, params.id);
    // Câu còn dùng được thì lấy bản mới nhất; câu đã bị lưu trữ giữ nguyên bản đã chụp để đề không đổi.
    const fresh = questionsMap(user.school_id, e.items.map((x) => x.qid));
    const snapshot = {};
    for (const it of e.items) snapshot[it.qid] = fresh[it.qid] && fresh[it.qid].status === 'approved' ? fresh[it.qid] : e.snapshot[it.qid];
    const items = e.items.map((x) => ({ ...x, group: snapshot[x.qid]?.group_id ?? x.group ?? null, fixedOptions: imageOptions(snapshot[x.qid]) }));
    const variants = makeVariants(items, e.variants.length, `${user.id}-${now()}`);
    const title = String(body.title ?? '').trim() || `${e.title} (bản sao)`;
    const id = Number(
      db
        .run('INSERT INTO exams (school_id, title, blueprint_json, items_json, duration_min, variants_json, snapshot_json, created_by, created_at, visibility, parent_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)', user.school_id, title, JSON.stringify(e.blueprint ?? {}), JSON.stringify(items), e.duration_min, JSON.stringify(variants), JSON.stringify(snapshot), user.id, now(), 'private', e.id)
        .lastInsertRowid,
    );
    audit(user, 'exam_clone', `#${e.id} → #${id}`, ip, { target: `exam:${id}`, old: { from: e.id } });
    return { id };
  });

  route('POST', '/api/exams', STAFF, ({ user, body, ip }) => {
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) fail(400, 'Đề chưa có câu nào.');
    if (!String(body.title ?? '').trim()) fail(400, 'Đặt tên đề.');
    const qmap = questionsMap(user.school_id, items.map((x) => Number(x.qid)));
    for (const it of items) {
      const q = qmap[it.qid];
      if (!q) fail(400, `Câu #${it.qid} không có trong ngân hàng của trường.`);
      if (q.status !== 'approved') fail(400, `Câu #${it.qid} chưa được duyệt. Chỉ câu đã duyệt mới vào đề.`);
    }
    const norm = items.map((x) => ({ qid: Number(x.qid), type: qmap[x.qid].type, topic: qmap[x.qid].topic, level: qmap[x.qid].level, group: qmap[x.qid].group_id ?? null, fixedOptions: imageOptions(qmap[x.qid]) }));
    const variants = makeVariants(norm, Number(body.variants) || 4, body.seed ?? `${user.id}-${now()}`);
    const r = db.run(
      'INSERT INTO exams (school_id, title, blueprint_json, items_json, duration_min, variants_json, snapshot_json, created_by, created_at, visibility, dept) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      user.school_id,
      String(body.title).trim(),
      JSON.stringify(body.blueprint ?? {}),
      JSON.stringify(norm),
      Math.max(5, Number(body.durationMin) || 90),
      JSON.stringify(variants),
      JSON.stringify(qmap),
      user.id,
      now(),
      body.visibility === 'school' ? 'school' : 'private',
      body.dept ? String(body.dept).trim().slice(0, 40) : null,
    );
    audit(user, 'exam_create', `#${r.lastInsertRowid} ${body.title}`, ip);
    return { id: Number(r.lastInsertRowid) };
  });
  route('PUT', '/api/exams/:id', STAFF, ({ user, params, body, ip }) => {
    const e = db.get('SELECT * FROM exams WHERE id = ?', params.id);
    if (!e) fail(404, 'Không tìm thấy đề.');
    if (e.school_id !== user.school_id) deny(user, 'exam_edit', `exam:${e.id}`, 'Đề không thuộc trường của bạn.', ip);
    if (e.created_by !== user.id && user.role !== 'admin') deny(user, 'exam_edit', `exam:${e.id}`, 'Chỉ người tạo đề hoặc quản lý mới chỉnh sửa được đề này.', ip);
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) fail(400, 'Đề chưa có câu nào.');
    if (!String(body.title ?? '').trim()) fail(400, 'Đặt tên đề.');
    const qmap = questionsMap(user.school_id, items.map((x) => Number(x.qid)));
    for (const it of items) {
      const q = qmap[it.qid];
      if (!q) fail(400, `Câu #${it.qid} không có trong ngân hàng của trường.`);
      if (q.status !== 'approved') fail(400, `Câu #${it.qid} chưa được duyệt. Chỉ câu đã duyệt mới vào đề.`);
    }
    const norm = items.map((x) => ({
      qid: Number(x.qid),
      type: qmap[x.qid].type,
      topic: qmap[x.qid].topic,
      level: qmap[x.qid].level,
      group: qmap[x.qid].group_id ?? null,
      fixedOptions: imageOptions(qmap[x.qid]),
    }));
    const varCount = Math.min(24, Math.max(1, Number(body.variants) || e.variants?.length || 4));
    const variants = makeVariants(norm, varCount, body.seed ?? `${e.id}-${now()}`);
    db.run(
      'UPDATE exams SET title = ?, blueprint_json = ?, items_json = ?, duration_min = ?, variants_json = ?, snapshot_json = ? WHERE id = ?',
      String(body.title).trim(),
      JSON.stringify(body.blueprint ?? e.blueprint ?? {}),
      JSON.stringify(norm),
      Math.max(5, Number(body.durationMin) || e.duration_min || 90),
      JSON.stringify(variants),
      JSON.stringify(qmap),
      e.id,
    );
    audit(user, 'exam_edit', `#${e.id} ${body.title}`, ip, { target: `exam:${e.id}` });
    return { id: e.id, ok: true };
  });
  // Đề xem được: của mình + đề dùng chung của trường. "Hot" = lượt dùng (giao bài + nhân bản) và đánh giá sao, có trọng số theo số người đánh giá.
  route('GET', '/api/exams', STAFF, ({ user, query }) => {
    const rows = db.all(
      `SELECT e.id, e.title, e.items_json, e.duration_min, e.created_at, e.visibility, e.dept, e.created_by, u.display_name author,
         (SELECT COUNT(*) FROM assignments a WHERE a.exam_id = e.id) assigned,
         (SELECT COUNT(*) FROM exams c WHERE c.parent_id = e.id) clones,
         (SELECT AVG(stars) FROM exam_ratings r WHERE r.exam_id = e.id) stars,
         (SELECT COUNT(*) FROM exam_ratings r WHERE r.exam_id = e.id) rated
       FROM exams e JOIN users u ON u.id = e.created_by
       WHERE e.school_id = ? AND (e.visibility = 'school' OR e.created_by = ? OR ? = 'admin') ORDER BY e.created_at DESC`,
      user.school_id,
      user.id,
      user.role,
    );
    let list = rows.map((e) => ({
      id: e.id,
      title: e.title,
      durationMin: e.duration_min,
      createdAt: e.created_at,
      author: e.author,
      mine: e.created_by === user.id,
      visibility: e.visibility,
      dept: e.dept,
      uses: e.assigned + e.clones,
      ratingAvg: e.stars === null ? null : Math.round(e.stars * 10) / 10,
      ratingCount: e.rated,
      hot: e.assigned + e.clones + (e.stars === null ? 0 : e.stars * Math.sqrt(e.rated)),
      counts: { mcq: e.items.filter((x) => x.type === 'mcq').length, tf: e.items.filter((x) => x.type === 'tf').length, short: e.items.filter((x) => x.type === 'short').length },
    }));
    if (query.scope === 'mine') list = list.filter((e) => e.mine);
    else if (query.scope === 'shared' || query.scope === 'hot') list = list.filter((e) => e.visibility === 'school');
    if (query.dept) list = list.filter((e) => e.dept === query.dept);
    if (query.scope === 'hot') list = list.sort((x, y) => y.hot - x.hot || y.createdAt - x.createdAt).slice(0, 20);
    return { exams: list };
  });
  route('POST', '/api/exams/:id/share', STAFF, ({ user, params, body, ip }) => {
    const e = db.get('SELECT * FROM exams WHERE id = ?', params.id);
    if (!e) fail(404, 'Không tìm thấy đề.');
    const target = `exam:${e.id}`;
    if (e.school_id !== user.school_id) deny(user, 'exam_share', target, 'Đề không thuộc trường của bạn.', ip);
    if (e.created_by !== user.id && user.role !== 'admin') deny(user, 'exam_share', target, 'Chỉ người ra đề hoặc quản lý mới đổi phạm vi chia sẻ.', ip);
    const visibility = body.visibility === 'school' ? 'school' : 'private';
    const dept = body.dept ? String(body.dept).trim().slice(0, 40) : null;
    db.run('UPDATE exams SET visibility = ?, dept = ? WHERE id = ?', visibility, dept, e.id);
    audit(user, 'exam_share', `#${e.id} → ${visibility === 'school' ? 'dùng chung trong trường' : 'riêng tư'}`, ip, { target, old: { visibility: e.visibility, dept: e.dept }, new: { visibility, dept } });
    return { ok: true, visibility, dept };
  });
  route('POST', '/api/exams/:id/rate', STAFF, ({ user, params, body }) => {
    const e = visibleExam(user, params.id);
    if (e.visibility !== 'school') fail(400, 'Chỉ đánh giá được đề đang dùng chung.');
    if (e.created_by === user.id) fail(400, 'Không tự đánh giá đề của mình.');
    const stars = Math.floor(Number(body.stars));
    if (!(stars >= 1 && stars <= 5)) fail(400, 'Chấm từ 1 đến 5 sao.');
    db.run('INSERT INTO exam_ratings (exam_id, user_id, stars, comment, at) VALUES (?,?,?,?,?) ON CONFLICT(exam_id, user_id) DO UPDATE SET stars = excluded.stars, comment = excluded.comment, at = excluded.at', e.id, user.id, stars, body.comment ? String(body.comment).slice(0, 500) : null, now());
    const agg = db.get('SELECT AVG(stars) avg, COUNT(*) n FROM exam_ratings WHERE exam_id = ?', e.id);
    return { ratingAvg: Math.round(agg.avg * 10) / 10, ratingCount: agg.n };
  });

  // ---- bình luận trên câu hỏi / đề (chỉ thêm) ----
  function commentRoutes(kind, table) {
    const find = (user, id) => {
      if (kind === 'exam') return visibleExam(user, id);
      const q = db.get(`SELECT id, school_id FROM ${table} WHERE id = ?`, id);
      if (!q || q.school_id !== user.school_id) fail(404, 'Không tìm thấy câu hỏi.');
      return q;
    };
    route('GET', `/api/${kind}s/:id/comments`, STAFF, ({ user, params }) => {
      const t = find(user, params.id);
      return { comments: db.all('SELECT c.id, c.body, c.at, c.user_id, u.display_name author FROM comments c JOIN users u ON u.id = c.user_id WHERE c.target_type = ? AND c.target_id = ? ORDER BY c.id', kind, t.id).map((c) => ({ id: c.id, body: c.body, at: c.at, author: c.author, mine: c.user_id === user.id })) };
    });
    route('POST', `/api/${kind}s/:id/comments`, STAFF, ({ user, params, body, ip }) => {
      const t = find(user, params.id);
      const text = String(body.body ?? '').trim();
      if (!text) fail(400, 'Nhập nội dung bình luận.');
      const id = Number(db.run('INSERT INTO comments (school_id, target_type, target_id, user_id, body, at) VALUES (?,?,?,?,?,?)', user.school_id, kind, t.id, user.id, text.slice(0, 1000), now()).lastInsertRowid);
      audit(user, 'comment_add', `${kind} #${t.id}`, ip, { target: `${kind}:${t.id}` });
      return { id };
    });
  }
  commentRoutes('question', 'questions');
  commentRoutes('exam', 'exams');

  route('GET', '/api/exams/:id', STAFF, ({ user, params }) => {
    const e = visibleExam(user, params.id);
    const rating = db.get('SELECT AVG(stars) avg, COUNT(*) n FROM exam_ratings WHERE exam_id = ?', e.id);
    return { exam: { id: e.id, title: e.title, durationMin: e.duration_min, items: e.items, variants: e.variants.map((v) => v.code), blueprint: e.blueprint,
      mine: e.created_by === user.id, visibility: e.visibility, dept: e.dept, author: db.get('SELECT display_name FROM users WHERE id = ?', e.created_by)?.display_name,
      ratingAvg: rating.avg === null ? null : Math.round(rating.avg * 10) / 10, ratingCount: rating.n,
      myRating: db.get('SELECT stars FROM exam_ratings WHERE exam_id = ? AND user_id = ?', e.id, user.id)?.stars ?? null,
    }, questions: e.snapshot };
  });
  route('GET', '/api/exams/:id/answer-key', STAFF, ({ user, params }) => {
    const e = visibleExam(user, params.id);
    return crossAnswerKey(e.items, e.variants.map((v) => ({ code: v.code, layout: variantLayout(e.id, e.items, v) })), e.snapshot);
  });
  route('POST', '/api/exams/:id/regenerate-variants', STAFF, ({ user, params, body, ip }) => {
    const e = visibleExam(user, params.id);
    if (e.created_by !== user.id && user.role !== 'admin') deny(user, 'exam_shuffle_variants', `exam:${e.id}`, 'Chỉ người ra đề hoặc quản lý mới tạo lại mã đề.', ip);
    const count = Math.min(24, Math.max(1, Number(body.count) || 4));
    const startCode = Math.max(100, Number(body.startCode) || 101);
    const seedPrefix = String(body.seed || `${e.id}-${now()}`);
    const variants = Array.from({ length: count }, (_, i) => ({
      code: String(startCode + i),
      seed: `${seedPrefix}-v${i}`,
    }));
    db.run('UPDATE exams SET variants_json = ? WHERE id = ?', JSON.stringify(variants), e.id);
    audit(user, 'exam_shuffle_variants', `Đề #${e.id}: Tạo ${count} mã đề từ ${startCode}`, ip, { target: `exam:${e.id}` });
    const fullVariants = variants.map((v) => ({
      code: v.code,
      layout: variantLayout(e.id, e.items, v),
    }));
    const keyMatrix = crossAnswerKey(e.items, fullVariants, e.snapshot);
    return {
      ok: true,
      variants: variants.map((v) => v.code),
      fullVariants,
      keyMatrix,
    };
  });
  route('GET', '/api/exams/:id/variant-preview', STAFF, ({ user, params, query }) => {
    const e = visibleExam(user, params.id);
    const code = query.code ? String(query.code) : (e.variants[0]?.code ?? '101');
    const v = e.variants.find((x) => String(x.code) === code) ?? { code, seed: `${e.id}-${code}` };
    const layout = variantLayout(e.id, e.items, v);
    const fullVariants = e.variants.map((vr) => ({
      code: vr.code,
      layout: variantLayout(e.id, e.items, vr),
    }));
    const keyMatrix = crossAnswerKey(e.items, fullVariants, e.snapshot);
    return {
      exam: {
        id: e.id,
        title: e.title,
        durationMin: e.duration_min,
        dept: e.dept || 'Toán',
        variants: e.variants.map((x) => x.code),
      },
      activeCode: v.code,
      layout,
      questions: e.snapshot,
      keyMatrix,
    };
  });
  route('GET', '/api/exams/:id/docx', STAFF, async ({ user, params, query, ip }) => {
    const e = visibleExam(user, params.id);
    const school = db.get('SELECT name FROM schools WHERE id = ?', user.school_id);
    const variants = e.variants.map((v) => ({ code: v.code, layout: variantLayout(e.id, e.items, v) }));
    const buf = await examToDocx({ title: e.title, school: school.name, durationMin: e.duration_min }, variants, e.snapshot, { withSolutions: query.solutions === '1', baseItems: e.items, imageResolver: imageResolver(user.school_id) });
    audit(user, 'exam_export_docx', `#${e.id}`, ip, { target: `exam:${e.id}` });
    const safe = e.title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w-]+/g, '-').slice(0, 60);
    return { __file: { name: `${safe || 'de-thi'}.docx`, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: buf } };
  });
  route('GET', '/api/exams/:id/pdf', STAFF, async ({ user, params, query, ip }) => {
    const e = visibleExam(user, params.id);
    const school = db.get('SELECT name FROM schools WHERE id = ?', user.school_id);
    const allVariants = (e.variants?.length ? e.variants : [{ code: '101', seed: `${e.id}-101` }]).map((v) => ({
      code: v.code,
      layout: variantLayout(e.id, e.items, v),
    }));
    const reqCode = query.code ? String(query.code).trim() : null;
    const selected = reqCode ? allVariants.filter((v) => v.code === reqCode) : allVariants;
    const variants = selected.length ? selected : [allVariants[0]];
    const buf = await examToPdf(
      { title: e.title, school: school.name, durationMin: e.duration_min },
      variants,
      e.snapshot,
      { withSolutions: query.solutions === '1', baseItems: e.items, imageResolver: imageResolver(user.school_id) },
    );
    audit(user, 'exam_export_pdf', `#${e.id}`, ip, { target: `exam:${e.id}` });
    const safe = e.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w-]+/g, '-').slice(0, 60);
    return { __file: { name: `${safe || 'de-thi'}${reqCode ? `-ma-${reqCode}` : ''}.pdf`, type: 'application/pdf', data: buf } };
  });
  route('GET', '/api/exams/:id/variants-zip', STAFF, async ({ user, params, ip }) => {
    const e = visibleExam(user, params.id);
    const school = db.get('SELECT name FROM schools WHERE id = ?', user.school_id);
    const imgRes = imageResolver(user.school_id);
    const variants = (e.variants?.length ? e.variants : [{ code: '101', seed: `${e.id}-101` }]).map((v) => ({
      code: v.code,
      layout: variantLayout(e.id, e.items, v),
    }));
    const zip = new JSZip();
    const examFolder = zip.folder('De-thi-Word');
    const pdfFolder = zip.folder('De-thi-PDF');
    for (const v of variants) {
      const buf = await examToDocx(
        { title: e.title, school: school.name, durationMin: e.duration_min },
        [v],
        e.snapshot,
        { withSolutions: false, baseItems: e.items, imageResolver: imgRes },
      );
      examFolder.file(`Ma-de-${v.code}.docx`, buf);
      const pdfBuf = await examToPdf(
        { title: e.title, school: school.name, durationMin: e.duration_min },
        [v],
        e.snapshot,
        { withSolutions: false, baseItems: e.items, imageResolver: imgRes },
      );
      pdfFolder.file(`Ma-de-${v.code}.pdf`, pdfBuf);
    }
    const solutionsDoc = await examToDocx(
      { title: e.title, school: school.name, durationMin: e.duration_min },
      variants,
      e.snapshot,
      { withSolutions: true, baseItems: e.items, imageResolver: imgRes },
    );
    zip.file('Dap-an-va-Loi-giai-tong-hop.docx', solutionsDoc);

    const answerSheetDoc = await exportAnswerSheetDocx(
      { title: e.title, school: school.name, durationMin: e.duration_min },
      variants,
      e.snapshot,
      e.items,
    );
    zip.file('Bang-dap-an-va-Ma-tran.docx', answerSheetDoc);

    const matrix = crossAnswerKey(e.items, variants, e.snapshot);
    const csvCell = safeCsvCell;
    const csvHeader = ['STT goc', 'Phan', ...matrix.codes.map((c) => `Ma ${c}`)].map(csvCell).join(',');
    const csvRows = matrix.rows.map((r, idx) =>
      [
        idx + 1,
        r.type === 'mcq' ? 'I' : r.type === 'tf' ? 'II' : 'III',
        ...matrix.codes.map((c) => {
          const cell = r.cells[c];
          return cell ? `Cau ${cell.no}: ${cell.answer}` : '';
        }),
      ]
        .map(csvCell)
        .join(','),
    );
    zip.file('Ma-tran-dap-an-cheo.csv', `\ufeff${[csvHeader, ...csvRows].join('\r\n')}`);

    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    audit(user, 'exam_export_zip', `#${e.id} (${variants.length} mã đề)`, ip, { target: `exam:${e.id}` });
    const safe = e.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w-]+/g, '-').slice(0, 60);
    return { __file: { name: `${safe || 'de-thi'}-tron-bo-ma-de.zip`, type: 'application/zip', data: zipBuf } };
  });

  // ---- thi trên giấy (OMR) ----
  route('GET', '/api/omr/template', null, ({ user, query, ip }) => {
    let schoolName = String(query.schoolName ?? 'TRƯỜNG THPT').trim().slice(0, 120) || 'TRƯỜNG THPT';
    let examTitle = String(query.examTitle ?? 'BÀI KIỂM TRA ĐỊNH KỲ').trim().slice(0, 150) || 'BÀI KIỂM TRA ĐỊNH KỲ';
    let durationMin = Math.min(600, Math.max(1, Math.floor(Number(query.durationMin) || 90)));
    if (query.examId !== undefined && String(query.examId).trim() !== '') {
      if (!user) fail(401, 'Cần đăng nhập để in phiếu theo đề thi.');
      if (!STAFF.includes(user.role)) deny(user, 'omr_template', `exam:${query.examId}`, 'Chỉ giáo viên hoặc quản lý mới in phiếu theo đề thi.', ip);
      const examId = posInt(query.examId);
      if (!examId) fail(400, 'Mã đề thi không hợp lệ.');
      const exam = visibleExam(user, examId);
      examTitle = exam.title;
      durationMin = exam.duration_min;
      const school = db.get('SELECT name FROM schools WHERE id = ?', exam.school_id);
      if (school) schoolName = school.name;
    }
    const html = generateOmrTemplateHtml({ schoolName, examTitle, durationMin });
    return {
      __file: {
        name: 'phieu-tra-loi-trac-nghiem-2025.html',
        type: 'text/html; charset=utf-8',
        data: Buffer.from(html, 'utf8'),
        inline: true,
      },
    };
  });

  route('POST', '/api/omr/scan', STAFF, async ({ raw, body }) => {
    let buf = raw;
    if ((!buf || !buf.length) && typeof body?.imageBase64 === 'string') {
      const cleanB64 = body.imageBase64.replace(/^data:image\/\w+;base64,/, '');
      if (cleanB64.length > 8 * 1024 * 1024) fail(413, 'Ảnh phiếu quá lớn (tối đa 6 MB).');
      buf = Buffer.from(cleanB64, 'base64');
    }
    if (!buf || !buf.length) fail(400, 'Chưa tải lên file ảnh phiếu trả lời.');
    if (buf.length > 6 * 1024 * 1024) fail(413, 'Ảnh phiếu quá lớn (tối đa 6 MB).');
    const isPng = buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpg = buf.length >= 3 && buf[0] === 255 && buf[1] === 216 && buf[2] === 255;
    const isWebp = buf.length >= 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';
    if (!isPng && !isJpg && !isWebp) fail(400, 'Chỉ nhận ảnh phiếu định dạng PNG, JPG hoặc WebP hợp lệ.');
    const result = await processOmrImage(buf);
    if (!result.success) fail(422, result.error || 'Không thể nhận diện phiếu trả lời.');
    return result;
  });

  route('POST', '/api/omr/grade', STAFF, ({ user, body }) => {
    const examId = Number(body.examId);
    if (!examId) fail(400, 'Thiếu examId.');
    const e = visibleExam(user, examId);

    const v = body.variantCode ? (e.variants ?? []).find((x) => String(x.code) === String(body.variantCode)) : null;
    const layout = v ? variantLayout(e.id, e.items, v) : e.items;

    const p1 = Array.isArray(body.answers?.partI) ? body.answers.partI : [];
    const p2 = Array.isArray(body.answers?.partII) ? body.answers.partII : [];
    const p3 = Array.isArray(body.answers?.partIII) ? body.answers.partIII : [];

    const displayedResponses = {};
    let mcqIdx = 0;
    let tfIdx = 0;
    let shortIdx = 0;

    for (const it of layout) {
      const q = e.snapshot[it.qid];
      if (!q) continue;
      if (it.part === 'I' || q.type === 'mcq') {
        const item = p1[mcqIdx++];
        displayedResponses[it.qid] = typeof item?.selected === 'number' ? item.selected : null;
      } else if (it.part === 'II' || q.type === 'tf') {
        const item = p2[tfIdx++];
        displayedResponses[it.qid] = Array.isArray(item?.selected) ? item.selected : [null, null, null, null];
      } else if (it.part === 'III' || q.type === 'short') {
        const item = p3[shortIdx++];
        displayedResponses[it.qid] = item?.value ? String(item.value) : '';
      }
    }

    const orig = {};
    const questions = [];
    for (const it of layout) {
      const q = e.snapshot[it.qid];
      if (!q) continue;
      questions.push(q);
      orig[q.id] = toOriginalResponse(it, displayedResponses[it.qid]);
    }

    const grade = gradeAttempt(questions, orig);
    const diag = diagnoseAttempt(questions, orig);

    return {
      examId,
      studentCode: body.studentCode ?? null,
      variantCode: body.variantCode ?? (v ? v.code : null),
      grade,
      diagnosis: diag,
      responses: orig,
      displayedResponses,
    };
  });

  // ---- lớp, giao đề, báo cáo ----
  function makeClassCode(db, schoolId, name, grade) {
    const prefix = String(name || 'LOP').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'LOP';
    for (let i = 0; i < 30; i++) {
      const rand = Math.floor(1000 + Math.random() * 9000);
      const code = `${prefix}-${rand}`;
      const exists = db.get('SELECT id FROM classes WHERE code = ? AND school_id = ?', code, schoolId);
      if (!exists) return code;
    }
    return `${prefix}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  route('GET', '/api/classes', STAFF, ({ user, query }) => {
    const isAll = user.role === 'admin' || query.scope === 'all';
    const ids = isAll
      ? db.all('SELECT id FROM classes WHERE school_id = ?', user.school_id).map((c) => c.id)
      : teacherClassIds(user);
    const myIds = new Set(teacherClassIds(user));
    const totalAllCount = Number(db.get('SELECT COUNT(*) count FROM classes WHERE school_id = ?', user.school_id)?.count || 0);
    const myCount = myIds.size;

    const isPaginated = query.page !== undefined || query.limit !== undefined;
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '12', 10) || 12));
    const offset = (page - 1) * limit;

    if (!ids.length) {
      return {
        classes: [],
        totalAllCount,
        myCount,
        total: 0,
        page: 1,
        limit,
        totalPages: 0,
        gradeCounts: { all: 0, 10: 0, 11: 0, 12: 0 },
      };
    }

    // Grade breakdown for current scope
    const gradeRows = db.all(
      `SELECT c.grade, COUNT(*) count FROM classes c WHERE c.id IN (${ids.map(() => '?').join(',')}) GROUP BY c.grade`,
      ...ids
    );
    const gradeCounts = { all: ids.length, 10: 0, 11: 0, 12: 0 };
    for (const r of gradeRows) {
      if (gradeCounts[r.grade] !== undefined) {
        gradeCounts[r.grade] = Number(r.count || 0);
      }
    }

    // Build filter WHERE clause
    const where = [`c.id IN (${ids.map(() => '?').join(',')})`];
    const params = [...ids];

    if (query.grade && query.grade !== 'all') {
      const g = Number(query.grade);
      if ([10, 11, 12].includes(g)) {
        where.push('c.grade = ?');
        params.push(g);
      }
    }

    if (query.search && String(query.search).trim()) {
      const term = `%${String(query.search).trim()}%`;
      if (user.role === 'admin' || !isAll) {
        where.push('(c.name LIKE ? OR c.code LIKE ? OR u.display_name LIKE ?)');
        params.push(term, term, term);
      } else {
        where.push('(c.name LIKE ? OR u.display_name LIKE ?)');
        params.push(term, term);
      }
    }

    const whereClause = where.join(' AND ');

    // Total matching filter
    const totalRow = db.get(
      `SELECT COUNT(*) count FROM classes c LEFT JOIN users u ON u.id = c.teacher_id WHERE ${whereClause}`,
      ...params
    );
    const total = Number(totalRow?.count || 0);
    const totalPages = isPaginated ? Math.max(1, Math.ceil(total / limit)) : 1;

    const t = now();
    let querySql = `
      SELECT c.id, c.name, c.grade, c.code, u.display_name teacher,
             (SELECT COUNT(*) FROM users s WHERE s.class_id = c.id AND s.role = 'student' AND s.active = 1) students,
             (SELECT COUNT(*) FROM assignments a WHERE a.class_id = c.id AND a.open_at <= ? AND a.close_at >= ?) active_assignments,
             (SELECT COUNT(*) FROM assignments a WHERE a.class_id = c.id AND a.open_at > ?) upcoming_assignments,
             (SELECT COUNT(*) FROM assignments a WHERE a.class_id = c.id AND a.close_at < ?) completed_assignments,
             (SELECT COUNT(*) FROM assignments a WHERE a.class_id = c.id) total_assignments,
             (SELECT COUNT(*) FROM class_modules cm WHERE cm.class_id = c.id) module_count,
             (SELECT MIN(a.close_at) FROM assignments a WHERE a.class_id = c.id AND a.close_at >= ?) next_deadline,
             (SELECT AVG(t2.score10) FROM attempts t2 JOIN assignments a2 ON a2.id = t2.assignment_id WHERE a2.class_id = c.id AND t2.status != 'in_progress' AND t2.score10 IS NOT NULL) avg_score
      FROM classes c
      LEFT JOIN users u ON u.id = c.teacher_id
      WHERE ${whereClause}
      ORDER BY c.grade DESC, c.name
    `;
    const queryParams = [t, t, t, t, t, ...params];

    if (isPaginated) {
      querySql += ' LIMIT ? OFFSET ?';
      queryParams.push(limit, offset);
    }

    const rows = db.all(querySql, ...queryParams);
    return {
      classes: rows.map((r) => ({
        ...r,
        code: (user.role === 'admin' || myIds.has(r.id)) ? r.code : null,
        mine: myIds.has(r.id),
        academicYear: '2026–2027',
        subject: 'Toán học',
        status: r.total_assignments > 0 && r.active_assignments === 0 && r.upcoming_assignments === 0 ? 'ended' : 'active',
      })),
      totalAllCount,
      myCount,
      total,
      page: isPaginated ? page : 1,
      limit: isPaginated ? limit : total,
      totalPages,
      gradeCounts,
    };
  });

  route('POST', '/api/classes', STAFF, ({ user, body, ip }) => {
    const name = String(body.name ?? '').trim();
    const grade = Number(body.grade);
    if (!name || ![10, 11, 12].includes(grade)) fail(400, 'Nhập tên lớp và chọn khối 10, 11 hoặc 12.');
    let teacherId = user.role === 'teacher' ? user.id : (body.teacherId ? Number(body.teacherId) : null);
    if (teacherId && !db.get("SELECT id FROM users WHERE id = ? AND school_id = ? AND role = 'teacher'", teacherId, user.school_id)) fail(400, 'Giáo viên không thuộc trường.');
    const code = makeClassCode(db, user.school_id, name, grade);
    const r = db.run('INSERT INTO classes (school_id, name, grade, teacher_id, code) VALUES (?,?,?,?,?)', user.school_id, name, grade, teacherId, code);
    audit(user, 'class_create', `${name} (${code})`, ip);
    return { id: Number(r.lastInsertRowid), name, grade, code };
  });
  // ---- từ kết quả đến hành động: nhóm yếu → phiếu luyện ----
  function classWeakGroups(cid, minN = 3) {
    const students = db.all("SELECT id, display_name FROM users WHERE class_id = ? AND role = 'student' AND active = 1 ORDER BY display_name", cid);
    const ev = db.all('SELECT e.student_id, e.topic, e.level, e.score, e.at FROM evidence e JOIN users u ON u.id = e.student_id WHERE u.class_id = ? AND e.topic IS NOT NULL', cid);
    const byStudent = {};
    for (const e of ev) (byStudent[e.student_id] ??= []).push(e);
    const groups = {};
    for (const s of students) {
      for (const m of Object.values(computeMastery(byStudent[s.id] ?? [], now()))) {
        if (m.n >= minN && m.value < 0.5) (groups[m.topic] ??= []).push({ id: s.id, name: s.display_name, value: m.value, n: m.n });
      }
    }
    return Object.entries(groups)
      .map(([topic, list]) => ({ topic, name: TOPIC_BY_CODE[topic]?.name ?? topic, students: list.sort((x, y) => x.value - y.value) }))
      .sort((x, y) => y.students.length - x.students.length || x.topic.localeCompare(y.topic));
  }
  route('GET', '/api/classes/:id/weak-groups', STAFF, ({ user, params }) => {
    const cid = Number(params.id);
    if (!teacherClassIds(user).includes(cid)) fail(404, 'Không tìm thấy lớp.');
    return { groups: classWeakGroups(cid) };
  });
  route('POST', '/api/classes/:id/practice-assignment', STAFF, ({ user, params, body, ip }) => {
    const cid = Number(params.id);
    const target = `class:${cid}`;
    const cls = db.get('SELECT * FROM classes WHERE id = ?', cid);
    if (!cls) fail(404, 'Không tìm thấy lớp.');
    if (cls.school_id !== user.school_id) deny(user, 'practice_assign', target, 'Lớp không thuộc trường của bạn.', ip);
    if (!teacherClassIds(user).includes(cid)) deny(user, 'practice_assign', target, 'Bạn không phụ trách lớp này.', ip);
    const topic = String(body.topic ?? '');
    if (!TOPIC_BY_CODE[topic]) fail(400, 'Chọn chuyên đề.');
    const classStudents = db.all("SELECT id FROM users WHERE class_id = ? AND role = 'student' AND active = 1", cid).map((r) => r.id);
    let ids;
    if (Array.isArray(body.studentIds) && body.studentIds.length) {
      ids = [...new Set(body.studentIds.map(Number))];
      if (ids.some((id) => !classStudents.includes(id))) fail(400, 'Có học sinh không thuộc lớp này.');
    } else {
      ids = (classWeakGroups(cid).find((g) => g.topic === topic)?.students ?? []).map((s) => s.id);
    }
    if (!ids.length) fail(400, 'Chưa có học sinh nào yếu chuyên đề này (cần ít nhất 3 câu đã làm). Chọn học sinh thủ công.');
    const count = Math.min(30, Math.max(3, Math.floor(Number(body.count) || 10)));
    const pool = db.all("SELECT id, type, topic, level, status FROM questions WHERE school_id = ? AND status = 'approved' AND topic = ?", user.school_id, topic);
    if (!pool.length) fail(400, 'Ngân hàng chưa có câu đã duyệt cho chuyên đề này.');
    const avail = { mcq: 0, tf: 0, short: 0 };
    for (const q of pool) avail[q.type]++;
    const want = apportion(count, { mcq: avail.mcq ? 6 : 0, tf: avail.tf ? 1.5 : 0, short: avail.short ? 2.5 : 0 });
    const counts = Object.fromEntries(Object.keys(avail).map((t) => [t, Math.min(avail[t], want[t] ?? 0)]));
    // Ưu tiên câu các em này chưa làm
    const done = db.all(`SELECT DISTINCT qid FROM evidence WHERE student_id IN (${ids.map(() => '?').join(',')})`, ...ids).map((r) => r.qid);
    const res = generateExam(pool, { counts, levels: { 1: 40, 2: 40, 3: 20 }, topics: [topic], avoidIds: done, seed: `${user.id}-${now()}` });
    if (!res.items.length) fail(400, 'Không chọn được câu nào cho phiếu luyện.');
    const qmap = questionsMap(user.school_id, res.items.map((x) => x.qid));
    const items = res.items.map((x) => ({ qid: x.qid, type: x.type, topic: x.topic, level: x.level, group: qmap[x.qid].group_id ?? null, fixedOptions: imageOptions(qmap[x.qid]) }));
    const title = String(body.title ?? '').trim() || `Phiếu luyện: ${TOPIC_BY_CODE[topic].name}`;
    const variants = makeVariants(items, 1, `${user.id}-${now()}`);
    const closeAt = now() + Math.min(30, Math.max(1, Number(body.days) || 7)) * 86400000;
    const out = db.tx(() => {
      const examId = Number(
        db
          .run('INSERT INTO exams (school_id, title, blueprint_json, items_json, duration_min, variants_json, snapshot_json, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)', user.school_id, title, JSON.stringify({ counts, topic }), JSON.stringify(items), 45, JSON.stringify(variants), JSON.stringify(qmap), user.id, now())
          .lastInsertRowid,
      );
      const assignmentId = Number(
        db
          .run(
            'INSERT INTO assignments (school_id, exam_id, class_id, mode, title, open_at, close_at, duration_min, show_result, created_by, created_at, variant_mode, variant_map_json, target_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            user.school_id,
            examId,
            cid,
            'homework',
            title,
            now(),
            closeAt,
            45,
            'after_submit',
            user.id,
            now(),
            'random',
            JSON.stringify(Object.fromEntries(ids.map((id) => [id, variants[0].code]))),
            JSON.stringify(ids),
          )
          .lastInsertRowid,
      );
      return { examId, assignmentId };
    });
    audit(user, 'practice_assign', `${ids.length} học sinh, ${items.length} câu, ${TOPIC_BY_CODE[topic].name}`, ip, { target: `assignment:${out.assignmentId}`, new: { topic, students: ids, items: items.length } });
    return { ...out, students: ids.length, items: items.length, warnings: res.warnings, shortages: res.shortages };
  });

  route('GET', '/api/classes/:id', STAFF, ({ user, params }) => {
    const id = Number(params.id);
    if (!teacherClassIds(user).includes(id)) fail(403, 'Bạn không phụ trách lớp này.');
    sweepExpired('AND assignment_id IN (SELECT id FROM assignments WHERE class_id = ?)', id);
    const cls = db.get(
      `SELECT c.id, c.name, c.grade, c.code, c.teacher_id, u.display_name teacher
       FROM classes c LEFT JOIN users u ON u.id = c.teacher_id WHERE c.id = ?`,
      id,
    );
    const students = db.all("SELECT id, display_name, username, xp, streak, last_active_day FROM users WHERE class_id = ? AND role = 'student' AND active = 1 ORDER BY display_name", id);
    const heat = {};
    const ev = db.all(`SELECT e.student_id, e.topic, e.level, e.score, e.at FROM evidence e JOIN users u ON u.id = e.student_id WHERE u.class_id = ? AND e.topic IS NOT NULL`, id);
    const byStudent = {};
    for (const e of ev) (byStudent[e.student_id] ??= []).push(e);
    const classEv = ev;
    for (const s of students) heat[s.id] = computeMastery(byStudent[s.id] ?? [], now());
    const classMastery = Object.values(computeMastery(classEv, now())).sort((a, b) => a.value - b.value);
    const errors = db.all(`SELECT e.error_type, COUNT(*) n FROM evidence e JOIN users u ON u.id = e.student_id WHERE u.class_id = ? AND e.correct = 0 AND e.error_type IS NOT NULL GROUP BY e.error_type`, id);
    const assignments = db.all(
      `SELECT a.id, a.title, a.mode, a.open_at, a.close_at, a.duration_min, a.show_result, a.module_id, a.exam_id,
              (SELECT COUNT(*) FROM attempts t WHERE t.assignment_id = a.id AND t.status != ?) submitted,
              (SELECT COUNT(*) FROM attempts t WHERE t.assignment_id = a.id AND t.status = ?) doing,
              (SELECT AVG(score10) FROM attempts t WHERE t.assignment_id = a.id AND t.status != ?) avg,
              (SELECT json_array_length(e.items_json) FROM exams e WHERE e.id = a.exam_id) question_count
       FROM assignments a WHERE a.class_id = ? ORDER BY a.open_at DESC`,
      'in_progress',
      'in_progress',
      'in_progress',
      id,
    );
    const rawModules = db.all('SELECT id, week_no, title, description, sort_order, locked, created_at FROM class_modules WHERE class_id = ? ORDER BY sort_order ASC, week_no ASC, id ASC', id);
    const rawMaterials = db.all('SELECT id, module_id, kind, title, summary, content, topic_code, sort_order, created_at FROM class_materials WHERE class_id = ? ORDER BY sort_order ASC, id ASC', id);
    const matByMod = {};
    for (const mat of rawMaterials) (matByMod[mat.module_id] ??= []).push(mat);
    const modules = rawModules.map((m) => ({ ...m, locked: !!m.locked, materials: matByMod[m.id] ?? [] }));
    const announcements = db.all(
      `SELECT ca.id, ca.title, ca.body, ca.pinned, ca.created_at, u.display_name author_name
       FROM class_announcements ca LEFT JOIN users u ON u.id = ca.created_by
       WHERE ca.class_id = ? ORDER BY ca.pinned DESC, ca.created_at DESC`,
      id,
    );
    const appealsCount = Number(
      db.get(
        `SELECT COUNT(*) c FROM score_appeals ap JOIN attempts t ON t.id = ap.attempt_id JOIN assignments a ON a.id = t.assignment_id WHERE a.class_id = ? AND ap.status = 'open'`,
        id,
      )?.c || 0,
    );
    const actions = [];
    for (const m of classMastery.filter((m) => m.band === 'weak' && m.n >= 6).slice(0, 3)) actions.push({ kind: 'reteach', topic: m.topic, text: `Dạy lại chuyên đề "${m.name}" cho cả lớp — năng lực chung ${Math.round(m.value * 100)}%.` });
    const lowStudents = students.filter((s) => {
      const vals = Object.values(heat[s.id]);
      return vals.length >= 2 && vals.filter((v) => v.band === 'weak').length >= Math.ceil(vals.length / 2);
    });
    if (lowStudents.length) actions.push({ kind: 'tutor', students: lowStudents.map((s) => s.id), text: `Kèm riêng ${lowStudents.length} em yếu ở hơn nửa số chuyên đề: ${lowStudents.map((s) => s.display_name).join(', ')}.` });
    return {
      class: { ...cls, academicYear: '2026–2027', subject: 'Toán học' },
      students,
      heat,
      classMastery,
      errors: Object.fromEntries(errors.map((e) => [e.error_type, e.n])),
      assignments,
      actions,
      modules,
      announcements,
      appealsCount,
    };
  });

  route('POST', '/api/classes/:id/modules', STAFF, ({ user, params, body, ip }) => {
    const id = Number(params.id);
    if (!teacherClassIds(user).includes(id)) fail(403, 'Bạn không phụ trách lớp này.');
    const title = String(body.title ?? '').trim();
    if (!title) fail(400, 'Nhập tên học phần.');
    const weekNo = Math.max(1, Math.min(52, Number(body.weekNo) || 1));
    const description = String(body.description ?? '').trim();
    const locked = body.locked ? 1 : 0;
    const maxSort = Number(db.get('SELECT COALESCE(MAX(sort_order), 0) m FROM class_modules WHERE class_id = ?', id)?.m || 0);
    const r = db.run(
      'INSERT INTO class_modules (school_id, class_id, week_no, title, description, sort_order, locked, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      user.school_id,
      id,
      weekNo,
      title,
      description,
      maxSort + 1,
      locked,
      user.id,
      now(),
    );
    audit(user, 'module_create', `Lớp #${id}: Tuần ${weekNo} - ${title}`, ip);
    return { id: Number(r.lastInsertRowid), week_no: weekNo, title, description, locked: !!locked, sort_order: maxSort + 1, materials: [] };
  });

  route('PATCH', '/api/classes/:id/modules/:mid', STAFF, ({ user, params, body, ip }) => {
    const id = Number(params.id);
    const mid = Number(params.mid);
    if (!teacherClassIds(user).includes(id)) fail(403, 'Bạn không phụ trách lớp này.');
    const existing = db.get('SELECT * FROM class_modules WHERE id = ? AND class_id = ? AND school_id = ?', mid, id, user.school_id);
    if (!existing) fail(404, 'Không tìm thấy học phần.');
    const title = body.title !== undefined ? String(body.title).trim() : existing.title;
    if (!title) fail(400, 'Tên học phần không được trống.');
    const weekNo = body.weekNo !== undefined ? Math.max(1, Math.min(52, Number(body.weekNo) || existing.week_no)) : existing.week_no;
    const description = body.description !== undefined ? String(body.description).trim() : existing.description;
    const locked = body.locked !== undefined ? (body.locked ? 1 : 0) : existing.locked;
    const sortOrder = body.sortOrder !== undefined ? Number(body.sortOrder) : existing.sort_order;
    db.run(
      'UPDATE class_modules SET week_no = ?, title = ?, description = ?, locked = ?, sort_order = ? WHERE id = ?',
      weekNo,
      title,
      description,
      locked,
      sortOrder,
      mid,
    );
    audit(user, 'module_update', `Học phần #${mid}: ${title} (${locked ? 'khóa' : 'mở'})`, ip);
    return { ok: true, id: mid, week_no: weekNo, title, description, locked: !!locked, sort_order: sortOrder };
  });

  route('DELETE', '/api/classes/:id/modules/:mid', STAFF, ({ user, params, ip }) => {
    const id = Number(params.id);
    const mid = Number(params.mid);
    if (!teacherClassIds(user).includes(id)) fail(403, 'Bạn không phụ trách lớp này.');
    const existing = db.get('SELECT * FROM class_modules WHERE id = ? AND class_id = ? AND school_id = ?', mid, id, user.school_id);
    if (!existing) fail(404, 'Không tìm thấy học phần.');
    db.tx(() => {
      db.run('UPDATE assignments SET module_id = NULL WHERE module_id = ? AND class_id = ?', mid, id);
      const mats = db.all('SELECT id FROM class_materials WHERE module_id = ?', mid);
      for (const m of mats) db.run('DELETE FROM student_material_views WHERE material_id = ?', m.id);
      db.run('DELETE FROM class_materials WHERE module_id = ?', mid);
      db.run('DELETE FROM class_modules WHERE id = ?', mid);
    });
    audit(user, 'module_delete', `Xóa học phần #${mid}: ${existing.title}`, ip);
    return { ok: true };
  });

  route('POST', '/api/classes/:id/materials', STAFF, ({ user, params, body, ip }) => {
    const id = Number(params.id);
    if (!teacherClassIds(user).includes(id)) fail(403, 'Bạn không phụ trách lớp này.');
    const moduleId = Number(body.moduleId);
    const mod = db.get('SELECT id FROM class_modules WHERE id = ? AND class_id = ? AND school_id = ?', moduleId, id, user.school_id);
    if (!mod) fail(400, 'Chọn học phần hợp lệ.');
    const title = String(body.title ?? '').trim();
    if (!title) fail(400, 'Nhập tiêu đề tài liệu.');
    const kind = ['doc', 'video', 'link', 'note'].includes(body.kind) ? body.kind : 'doc';
    const summary = String(body.summary ?? '').trim();
    const content = String(body.content ?? '').trim();
    const topicCode = body.topicCode && TOPIC_BY_CODE[body.topicCode] ? String(body.topicCode) : null;
    const maxSort = Number(db.get('SELECT COALESCE(MAX(sort_order), 0) m FROM class_materials WHERE module_id = ?', moduleId)?.m || 0);
    const r = db.run(
      'INSERT INTO class_materials (school_id, class_id, module_id, kind, title, summary, content, topic_code, sort_order, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      user.school_id,
      id,
      moduleId,
      kind,
      title,
      summary,
      content,
      topicCode,
      maxSort + 1,
      user.id,
      now(),
    );
    audit(user, 'material_create', `Lớp #${id} / Học phần #${moduleId}: ${title}`, ip);
    return { id: Number(r.lastInsertRowid), module_id: moduleId, kind, title, summary, content, topic_code: topicCode, sort_order: maxSort + 1, created_at: now() };
  });

  route('DELETE', '/api/classes/:id/materials/:matId', STAFF, ({ user, params, ip }) => {
    const id = Number(params.id);
    const matId = Number(params.matId);
    if (!teacherClassIds(user).includes(id)) fail(403, 'Bạn không phụ trách lớp này.');
    const existing = db.get('SELECT * FROM class_materials WHERE id = ? AND class_id = ? AND school_id = ?', matId, id, user.school_id);
    if (!existing) fail(404, 'Không tìm thấy tài liệu.');
    db.tx(() => {
      db.run('DELETE FROM student_material_views WHERE material_id = ?', matId);
      db.run('DELETE FROM class_materials WHERE id = ?', matId);
    });
    audit(user, 'material_delete', `Xóa tài liệu #${matId}: ${existing.title}`, ip);
    return { ok: true };
  });

  route('POST', '/api/classes/:id/announcements', STAFF, ({ user, params, body, ip }) => {
    const id = Number(params.id);
    if (!teacherClassIds(user).includes(id)) fail(403, 'Bạn không phụ trách lớp này.');
    const title = String(body.title ?? '').trim();
    const content = String(body.body ?? '').trim();
    if (!title || !content) fail(400, 'Nhập tiêu đề và nội dung thông báo.');
    const pinned = body.pinned ? 1 : 0;
    const createdAt = now();
    const r = db.run(
      'INSERT INTO class_announcements (school_id, class_id, title, body, pinned, created_by, created_at) VALUES (?,?,?,?,?,?,?)',
      user.school_id,
      id,
      title,
      content,
      pinned,
      user.id,
      createdAt,
    );
    audit(user, 'announcement_create', `Lớp #${id}: ${title}`, ip);
    return { id: Number(r.lastInsertRowid), title, body: content, pinned: !!pinned, created_at: createdAt, author_name: user.display_name };
  });

  route('DELETE', '/api/classes/:id/announcements/:annId', STAFF, ({ user, params, ip }) => {
    const id = Number(params.id);
    const annId = Number(params.annId);
    if (!teacherClassIds(user).includes(id)) fail(403, 'Bạn không phụ trách lớp này.');
    const existing = db.get('SELECT * FROM class_announcements WHERE id = ? AND class_id = ? AND school_id = ?', annId, id, user.school_id);
    if (!existing) fail(404, 'Không tìm thấy thông báo.');
    db.run('DELETE FROM class_announcements WHERE id = ?', annId);
    audit(user, 'announcement_delete', `Xóa thông báo #${annId}: ${existing.title}`, ip);
    return { ok: true };
  });

  route('PATCH', '/api/assignments/:id/module', STAFF, ({ user, params, body }) => {
    const aid = Number(params.id);
    const a = db.get('SELECT id, class_id FROM assignments WHERE id = ? AND school_id = ?', aid, user.school_id);
    if (!a || !teacherClassIds(user).includes(a.class_id)) fail(404, 'Không tìm thấy bài giao.');
    const moduleId = body.moduleId ? Number(body.moduleId) : null;
    if (moduleId) {
      const mod = db.get('SELECT id FROM class_modules WHERE id = ? AND class_id = ?', moduleId, a.class_id);
      if (!mod) fail(400, 'Học phần không thuộc lớp này.');
    }
    db.run('UPDATE assignments SET module_id = ? WHERE id = ?', moduleId, aid);
    return { ok: true, moduleId };
  });

  route('POST', '/api/assignments', STAFF, ({ user, body, ip }) => {
    const examId = posInt(body.examId);
    const exam = examId ? db.get('SELECT * FROM exams WHERE id = ? AND school_id = ?', examId, user.school_id) : null;
    if (!exam || (exam.visibility !== 'school' && exam.created_by !== user.id && user.role !== 'admin')) fail(400, 'Chọn đề để giao.');
    const classIds = (Array.isArray(body.classIds) ? body.classIds : [body.classId]).map(Number).filter(Boolean);
    if (!classIds.length) fail(400, 'Chọn ít nhất một lớp.');
    const mine = teacherClassIds(user);
    for (const c of classIds) if (!mine.includes(c)) fail(403, 'Bạn chỉ giao đề cho lớp mình phụ trách.');
    const mode = body.mode === 'homework' ? 'homework' : 'exam';
    const openAt = Number(body.openAt) || now();
    const closeAt = Number(body.closeAt) || openAt + 7 * 86400000;
    if (closeAt <= openAt) fail(400, 'Giờ đóng phải sau giờ mở.');
    const duration = Math.max(5, Number(body.durationMin) || exam.duration_min);
    const codes = exam.variants.map((v) => v.code);
    const variantMode = body.variantMode === 'list' ? 'list' : body.variantMode === 'per_student' ? 'per_student' : 'random';
    const list = variantMode === 'list' && body.variantList && typeof body.variantList === 'object' ? body.variantList : {};
    const requestedModuleId = body.moduleId ? Number(body.moduleId) : null;
    const plans = classIds.map((c) => {
      const studentIds = db.all("SELECT id FROM users WHERE class_id = ? AND school_id = ? AND role = 'student' AND active = 1 ORDER BY id", c, user.school_id).map((r) => r.id);
      const own = Object.fromEntries(Object.entries(list).filter(([sid]) => studentIds.includes(Number(sid))));
      if (variantMode === 'per_student') return {};
      const res = assignVariants({ studentIds, codes, mode: variantMode, seed: `${exam.id}-${c}-${body.variantSeed ?? now()}`, list: own });
      if (res.errors.length) fail(400, res.errors.join(' '));
      return res.map;
    });
    const covered = new Set(plans.flatMap((m) => Object.keys(m)));
    for (const sid of Object.keys(list)) if (!covered.has(String(sid))) fail(400, `Học sinh #${sid} không thuộc lớp được giao.`);
    const defaultResultPolicy = mode === 'exam' ? 'score_only_until_close' : 'after_submit';
    const showResultPolicy = ['after_submit', 'score_only_until_close', 'after_close'].includes(body.showResult)
      ? body.showResult
      : defaultResultPolicy;
    const ids = db.tx(() =>
      classIds.map((c, i) => {
        const modOk = requestedModuleId ? db.get('SELECT id FROM class_modules WHERE id = ? AND class_id = ?', requestedModuleId, c)?.id ?? null : null;
        return Number(
          db.run(
            'INSERT INTO assignments (school_id, exam_id, class_id, mode, title, open_at, close_at, duration_min, show_result, created_by, created_at, variant_mode, variant_map_json, module_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            user.school_id,
            exam.id,
            c,
            mode,
            String(body.title || exam.title),
            openAt,
            closeAt,
            duration,
            showResultPolicy,
            user.id,
            now(),
            variantMode,
            JSON.stringify(plans[i]),
            modOk,
          ).lastInsertRowid,
        );
      }),
    );
    audit(user, 'assignment_create', `đề #${exam.id} → lớp ${classIds.join(',')}`, ip);
    return { ids };
  });
  route('POST', '/api/assignments/:id/release-results', STAFF, ({ user, params, ip }) => {
    const asgId = posInt(params.id);
    const a = asgId ? db.get('SELECT * FROM assignments WHERE id = ? AND school_id = ?', asgId, user.school_id) : null;
    if (!a || !teacherClassIds(user).includes(a.class_id)) fail(404, 'Không tìm thấy bài giao.');
    db.run("UPDATE assignments SET show_result = 'after_submit' WHERE id = ?", a.id);
    audit(user, 'assignment_release_results', `công bố đáp án bài giao #${a.id}`, ip, { target: `assignment:${a.id}` });
    return { ok: true, showResult: 'after_submit' };
  });
  route('GET', '/api/assignments/:id/variants', STAFF, ({ user, params }) => {
    const a = db.get('SELECT * FROM assignments WHERE id = ? AND school_id = ?', params.id, user.school_id);
    if (!a || !teacherClassIds(user).includes(a.class_id)) fail(404, 'Không tìm thấy bài giao.');
    const students = targeted(a, db.all("SELECT id, display_name FROM users WHERE class_id = ? AND role = 'student' AND active = 1 ORDER BY display_name", a.class_id));
    return { mode: a.variant_mode, students: students.map((s) => ({ id: s.id, name: s.display_name, code: a.variant_map?.[s.id] ?? null })) };
  });
  route('GET', '/api/assignments', STAFF, ({ user, query }) => {
    const ids = selectedClassIds(user, query.classId);
    if (!ids.length) return { assignments: [] };
    sweepExpired(`AND assignment_id IN (SELECT id FROM assignments WHERE class_id IN (${ids.map(() => '?').join(',')}))`, ...ids);
    const rows = db.all(
      `SELECT a.*, c.name class_name, (SELECT COUNT(*) FROM users s WHERE s.class_id = a.class_id AND s.role='student' AND s.active = 1) students,
       (SELECT COUNT(*) FROM attempts t WHERE t.assignment_id = a.id AND t.status != 'in_progress') submitted,
       (SELECT COUNT(*) FROM attempts t WHERE t.assignment_id = a.id AND t.status = 'in_progress') doing,
       (SELECT AVG(score10) FROM attempts t WHERE t.assignment_id = a.id AND t.status != 'in_progress') avg
       FROM assignments a JOIN classes c ON c.id = a.class_id WHERE a.class_id IN (${ids.map(() => '?').join(',')}) ORDER BY a.open_at DESC`,
      ...ids,
    );
    return { assignments: rows };
  });
  route('GET', '/api/assignments/:id/report', STAFF, ({ user, params, ip }) => {
    const a = db.get('SELECT a.*, c.name class_name FROM assignments a JOIN classes c ON c.id = a.class_id WHERE a.id = ? AND a.school_id = ?', params.id, user.school_id);
    if (!a || !teacherClassIds(user).includes(a.class_id)) fail(404, 'Không tìm thấy bài giao.');
    sweepExpired('AND assignment_id = ?', a.id);
    const exam = db.get('SELECT * FROM exams WHERE id = ?', a.exam_id);
    const students = targeted(a, db.all("SELECT id, display_name FROM users WHERE class_id = ? AND role = 'student' AND active = 1 ORDER BY display_name", a.class_id));
    const atts = db.all('SELECT * FROM attempts WHERE assignment_id = ?', a.id);
    const byStudent = Object.fromEntries(atts.map((t) => [t.student_id, t]));
    const done = atts.filter((t) => t.status !== 'in_progress');
    const qmap = exam.snapshot;
    // Phân tích câu hỏi: tỉ lệ điểm, độ phân biệt (27% trên – 27% dưới), phương án bị chọn.
    const sorted = done.slice().sort((x, y) => y.score10 - x.score10);
    const k = Math.max(1, Math.round(sorted.length * 0.27));
    const upper = sorted.slice(0, k);
    const lower = sorted.slice(-k);
    const itemScore = (t, qid) => {
      const it = t.result?.items?.find((x) => x.qid === qid);
      return it ? it.points / it.max : 0;
    };
    const items = exam.items.map((it) => {
      const q = qmap[it.qid];
      const p = done.length ? done.reduce((s, t) => s + itemScore(t, it.qid), 0) / done.length : null;
      const disc = sorted.length >= 4 ? upper.reduce((s, t) => s + itemScore(t, it.qid), 0) / k - lower.reduce((s, t) => s + itemScore(t, it.qid), 0) / k : null;
      let choices = null;
      if (q.type === 'mcq') {
        choices = [0, 0, 0, 0, 0];
        for (const t of done) {
          const layoutItem = t.layout.find((x) => x.qid === it.qid);
          const r = toOriginalResponse(layoutItem, t.responses?.[it.qid]);
          if (Number.isInteger(r)) choices[r]++;
          else choices[4]++;
        }
      }
      const flags = [];
      if (p !== null && done.length >= 5 && p < 0.2) flags.push('Quá khó hoặc sai đáp án — kiểm tra lại');
      if (p !== null && done.length >= 5 && p > 0.95) flags.push('Quá dễ');
      if (disc !== null && disc < 0) flags.push('Độ phân biệt âm — học sinh giỏi sai nhiều hơn, nghi đáp án sai');
      if (choices && done.length >= 5) {
        const top = choices.slice(0, 4).map((n, i) => ({ n, i })).sort((x, y) => y.n - x.n)[0];
        if (top.i !== q.answer && top.n > choices[q.answer]) flags.push(`Phương án ${'ABCD'[top.i]} (gốc) được chọn nhiều hơn đáp án`);
      }
      if (choices && done.length >= 10) {
        const dead = choices.slice(0, 4).map((n, i) => ({ n, i })).filter((x) => x.i !== q.answer && x.n === 0);
        if (dead.length) flags.push(`Phương án nhiễu ${dead.map((x) => 'ABCD'[x.i]).join(', ')} (gốc) không ai chọn — nên thay bằng lỗi sai phổ biến hơn`);
      }
      return { qid: it.qid, type: q.type, topic: q.topic, level: q.level, stem: q.stem, options: q.options, answer: q.answer, p, disc, choices, flags };
    });
    const errorCount = { concept: 0, formula: 0, transform: 0, careless: 0 };
    for (const t of done) for (const [kk, v] of Object.entries(t.diagnosis?.errorCount ?? {})) errorCount[kk] = (errorCount[kk] ?? 0) + v;
    const topicAgg = {};
    for (const t of done)
      for (const tp of t.diagnosis?.topics ?? []) {
        const x = (topicAgg[tp.topic] ??= { topic: tp.topic, name: tp.name, points: 0, max: 0 });
        x.points += tp.points;
        x.max += tp.max;
      }
    const hist = Array(11).fill(0);
    for (const t of done) hist[Math.min(10, Math.floor(t.score10))]++;
    audit(user, 'report_view', `bài giao #${a.id}`, ip);
    return {
      assignment: { id: a.id, classId: a.class_id, title: a.title, mode: a.mode, className: a.class_name, openAt: a.open_at, closeAt: a.close_at, durationMin: a.duration_min, examId: a.exam_id, showResult: a.show_result || 'after_submit' },
      summary: {
        students: students.length,
        submitted: done.length,
        doing: atts.length - done.length,
        avg: done.length ? Math.round((done.reduce((s, t) => s + t.score10, 0) / done.length) * 100) / 100 : null,
        hist,
      },
      rows: students.map((s) => {
        const t = byStudent[s.id];
        const ev = t?.events ?? [];
        const resp = t?.responses ?? {};
        const answeredCount = t
          ? Object.values(resp).filter((v) => {
              if (v === null || v === undefined || v === '') return false;
              if (Array.isArray(v)) return v.some((x) => x !== null && x !== undefined);
              return true;
            }).length
          : 0;
        return {
          studentId: s.id,
          name: s.display_name,
          status: t ? t.status : 'not_started',
          score10: t && t.status !== 'in_progress' ? t.score10 : null,
          byPart: t?.result?.byPart ?? null,
          dominantError: t?.diagnosis?.dominantError ?? null,
          attemptId: t?.id ?? null,
          variantCode: t?.variant_code ?? null,
          startedAt: t?.started_at ?? null,
          deadlineAt: t?.deadline_at ?? null,
          lastSavedAt: t?.saved_at ?? null,
          answeredCount,
          totalItems: exam.items.length,
          signals: {
            hidden: ev.filter((e) => e.type === 'hidden' || e.type === 'blur').length,
            fullscreenExit: ev.filter((e) => e.type === 'fullscreen_exit').length,
            paste: ev.filter((e) => e.type === 'paste').length,
            secondDevice: ev.filter((e) => e.type === 'second_device').length,
            offline: ev.filter((e) => e.type === 'offline').length,
          },
          late: t?.late ? { at: t.late.at, accepted: !!t.late.accepted } : null,
        };
      }),
      items,
      errorCount,
      topics: Object.values(topicAgg).map((x) => ({ ...x, ratio: x.max ? x.points / x.max : 0 })).sort((x, y) => x.ratio - y.ratio),
    };
  });
  route('DELETE', '/api/questions/:id', STAFF, ({ user, params, body, ip }) => {
    const q = db.get('SELECT * FROM questions WHERE id = ?', params.id);
    if (!q) fail(404, 'Không tìm thấy câu hỏi.');
    const target = `question:${q.id}`;
    if (q.school_id !== user.school_id) deny(user, 'question_delete', target, 'Câu hỏi không thuộc trường của bạn.', ip);
    if (user.role !== 'admin' && q.created_by !== user.id) deny(user, 'question_delete', target, 'Chỉ người tạo câu hoặc quản lý mới xóa được câu này.', ip);
    const reason = needReason(body);
    // Xóa mềm: câu chuyển sang "lưu trữ", đề đã giao và lịch sử làm bài giữ nguyên.
    db.run("UPDATE questions SET status = 'archived', updated_at = ? WHERE id = ?", now(), q.id);
    invalidateQuestionIndex(user.school_id);
    audit(user, 'question_delete', `#${q.id}`, ip, { target, old: { status: q.status, stem: String(q.stem).slice(0, 120) }, new: { status: 'archived' }, reason });
    return { ok: true };
  });
  route('POST', '/api/attempts/:id/reopen', STAFF, ({ user, params, body, ip }) => {
    const { att } = staffAttempt(user, params.id, 'attempt_reopen', ip);
    const reason = needReason(body);
    if (att.status === 'in_progress') fail(400, 'Bài đang làm, không cần mở lại.');
    const minutes = Math.min(180, Math.max(5, Number(body.minutes) || 15));
    const deadline = now() + minutes * 60000;
    db.tx(() => {
      db.run('DELETE FROM evidence WHERE attempt_id = ?', att.id);
      db.run("UPDATE attempts SET status = 'in_progress', submitted_at = NULL, score10 = NULL, points = NULL, max_points = NULL, result_json = NULL, diagnosis_json = NULL, late_json = NULL, deadline_at = ? WHERE id = ?", deadline, att.id);
    });
    audit(user, 'attempt_reopen', `bài làm #${att.id}`, ip, { target: `attempt:${att.id}`, old: { status: att.status, score10: att.score10, deadline_at: att.deadline_at }, new: { status: 'in_progress', deadline_at: deadline }, reason });
    return { ok: true, deadlineAt: deadline };
  });
  route('POST', '/api/attempts/:id/score', STAFF, ({ user, params, body, ip }) => {
    const { att } = staffAttempt(user, params.id, 'score_edit', ip);
    const reason = needReason(body);
    if (att.status === 'in_progress') fail(400, 'Bài chưa nộp, chưa sửa điểm được.');
    const score = Number(body.score10);
    if (body.score10 === undefined || body.score10 === null || body.score10 === '' || !Number.isFinite(score) || score < 0 || score > 10) fail(400, 'Điểm phải từ 0 đến 10.');
    const score10 = Math.round(score * 100) / 100;
    const points = Math.round((score10 / 10) * (att.max_points ?? 0) * 100) / 100;
    db.run('UPDATE attempts SET score10 = ?, points = ? WHERE id = ?', score10, points, att.id);
    audit(user, 'score_edit', `bài làm #${att.id}`, ip, { target: `attempt:${att.id}`, old: { score10: att.score10, points: att.points }, new: { score10, points }, reason });
    return { ok: true, score10 };
  });
  route('POST', '/api/attempts/:id/extend', STAFF, ({ user, params, body, ip }) => {
    const { att } = staffAttempt(user, params.id, 'attempt_extend', ip);
    if (att.status !== 'in_progress') fail(400, 'Chỉ gia hạn được bài đang làm. Với bài đã nộp hãy mở lại.');
    if (!Number(body.minutes)) fail(400, 'Nhập số phút gia hạn.');
    const minutes = Math.min(120, Math.max(1, Number(body.minutes)));
    const deadline = (att.deadline_at ?? now()) + minutes * 60000;
    db.run('UPDATE attempts SET deadline_at = ? WHERE id = ?', deadline, att.id);
    audit(user, 'attempt_extend', `bài làm #${att.id} +${minutes} phút`, ip, { target: `attempt:${att.id}`, old: { deadline_at: att.deadline_at }, new: { deadline_at: deadline }, reason: body.reason });
    return { ok: true, deadlineAt: deadline };
  });
  route('POST', '/api/assignments/:id/extend', STAFF, ({ user, params, body, ip }) => {
    const a = db.get('SELECT * FROM assignments WHERE id = ?', params.id);
    if (!a) fail(404, 'Không tìm thấy bài giao.');
    const target = `assignment:${a.id}`;
    if (a.school_id !== user.school_id) deny(user, 'assignment_extend', target, 'Bài giao không thuộc trường của bạn.', ip);
    if (!teacherClassIds(user).includes(a.class_id)) deny(user, 'assignment_extend', target, 'Bạn không phụ trách lớp này.', ip);
    const closeAt = Number(body.closeAt) || a.close_at + Math.min(14 * 1440, Math.max(0, Number(body.minutes) || 0)) * 60000;
    if (closeAt <= a.close_at) fail(400, 'Giờ đóng mới phải sau giờ đóng hiện tại.');
    db.tx(() => {
      db.run('UPDATE assignments SET close_at = ? WHERE id = ?', closeAt, a.id);
      db.run("UPDATE attempts SET deadline_at = ? WHERE assignment_id = ? AND status = 'in_progress' AND deadline_at = ?", closeAt, a.id, a.close_at);
    });
    audit(user, 'assignment_extend', `bài giao #${a.id}`, ip, { target, old: { close_at: a.close_at }, new: { close_at: closeAt }, reason: body.reason });
    return { ok: true, closeAt };
  });
  // Bảng điểm một bài giao (dùng chung cho CSV và Excel).
  const STATUS_VI = { in_progress: 'Đang làm', submitted: 'Đã nộp', auto_submitted: 'Tự nộp khi hết giờ' };
  function exportableAssignment(user, id, ip) {
    const a = db.get('SELECT * FROM assignments WHERE id = ?', id);
    if (!a) fail(404, 'Không tìm thấy bài giao.');
    const target = `assignment:${a.id}`;
    if (a.school_id !== user.school_id) deny(user, 'data_export', target, 'Bài giao không thuộc trường của bạn.', ip);
    if (!teacherClassIds(user).includes(a.class_id)) deny(user, 'data_export', target, 'Bạn không phụ trách lớp này.', ip);
    sweepExpired('AND assignment_id = ?', a.id);
    const cls = db.get('SELECT name FROM classes WHERE id = ?', a.class_id);
    const rows = targeted(a, db.all("SELECT u.id, u.display_name, u.username, t.variant_code, t.status, t.score10, t.submitted_at FROM users u LEFT JOIN attempts t ON t.student_id = u.id AND t.assignment_id = ? WHERE u.class_id = ? AND u.role = 'student' AND u.active = 1 ORDER BY u.display_name", a.id, a.class_id));
    const table = rows.map((r) => {
      const done = r.status && r.status !== 'in_progress';
      return [r.display_name, r.username, r.variant_code ?? '', STATUS_VI[r.status] ?? 'Chưa làm', done ? r.score10 : '', done && r.submitted_at ? fmtVn(r.submitted_at) : ''];
    });
    return { a, cls, target, table };
  }
  const fmtVn = (ms) => new Date(ms + 7 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
  const SCORE_HEAD = ['Họ tên', 'Tên đăng nhập', 'Mã đề', 'Trạng thái', 'Điểm', 'Nộp lúc'];
  route('GET', '/api/assignments/:id/export.csv', STAFF, ({ user, params, ip }) => {
    const { a, table, target } = exportableAssignment(user, params.id, ip);
    const csv = '\uFEFF' + [SCORE_HEAD.join(','), ...table.map((r) => r.map(safeCsvCell).join(','))].join('\r\n');
    audit(user, 'data_export', `điểm bài giao #${a.id} (CSV): ${table.length} dòng`, ip, { target });
    return { __file: { name: `diem-bai-giao-${a.id}.csv`, type: 'text/csv; charset=utf-8', data: Buffer.from(csv, 'utf8') } };
  });
  route('GET', '/api/assignments/:id/export.xlsx', STAFF, async ({ user, params, ip }) => {
    const { a, cls, table, target } = exportableAssignment(user, params.id, ip);
    const data = await buildXlsx([{ name: `Điểm ${cls.name}`, columns: SCORE_HEAD.map((h, i) => ({ header: h, width: [26, 18, 8, 20, 8, 17][i] })), rows: table }]);
    audit(user, 'data_export', `điểm bài giao #${a.id} (Excel): ${table.length} dòng`, ip, { target });
    return { __file: { name: `diem-bai-giao-${a.id}.xlsx`, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data } };
  });
  // Xuất ngân hàng câu hỏi đúng định dạng mẫu nhập (xuất ra rồi nhập lại được).
  route('GET', '/api/questions/export.xlsx', STAFF, async ({ user, query, ip }) => {
    const where = ['school_id = ?', "status != 'archived'"];
    const p = [user.school_id];
    if (query.status && query.status !== 'all') (where.push('status = ?'), p.push(query.status));
    if (query.topic) (where.push('topic = ?'), p.push(query.topic));
    if (query.type) (where.push('type = ?'), p.push(query.type));
    const qs = db.all(`SELECT * FROM questions WHERE ${where.join(' AND ')} ORDER BY id LIMIT 5000`, ...p).map(toQuestion);
    const kind = { mcq: 'TN', tf: 'DS', short: 'TLN' };
    const rows = qs.map((q) => [kind[q.type], q.stem, ...(q.type === 'short' ? ['', '', '', ''] : q.options), q.type === 'mcq' ? 'ABCD'[q.answer] : q.type === 'tf' ? q.answer.map((x) => (x ? 'Đ' : 'S')).join('') : String(q.answer ?? ''), q.topic ?? '', q.level, q.explanation ?? '']);
    const data = await buildXlsx([{ name: 'Câu hỏi', columns: SHEET_HEADERS.map((h, i) => ({ header: h, width: [8, 60, 24, 24, 24, 24, 10, 16, 8, 50][i] })), rows }]);
    audit(user, 'data_export', `ngân hàng câu hỏi (Excel): ${rows.length} câu`, ip, { target: 'questions' });
    return { __file: { name: 'ngan-hang-cau-hoi.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data } };
  });
  // ---- khiếu nại điểm ----
  const APPEAL_DAYS = 14;
  route('POST', '/api/attempts/:id/appeals', ['student'], ({ user, params, body, ip }) => {
    const att = ownAttempt(user, params.id);
    if (att.kind !== 'assignment' || att.status === 'in_progress') fail(400, 'Chỉ khiếu nại được bài đã nộp.');
    if (!visibilityFor(att).answersVisible) fail(403, 'Em chưa xem được đáp án bài này nên chưa khiếu nại được.');
    const asg = db.get('SELECT close_at FROM assignments WHERE id = ?', att.assignment_id);
    if (now() > Math.max(asg.close_at, att.submitted_at ?? 0) + APPEAL_DAYS * 86400000) fail(400, `Đã quá ${APPEAL_DAYS} ngày kể từ khi có kết quả.`);
    const reason = String(body.reason ?? '').trim();
    if (reason.length < 10) fail(400, 'Hãy nêu lý do cụ thể (ít nhất 10 ký tự).');
    const qid = body.qid === undefined || body.qid === null ? null : Number(body.qid);
    if (qid !== null && !att.layout.some((x) => x.qid === qid)) fail(400, 'Câu này không có trong bài của em.');
    const open = db.all("SELECT qid FROM score_appeals WHERE attempt_id = ? AND status = 'open'", att.id);
    if (open.some((x) => x.qid === qid)) fail(409, 'Em đã gửi khiếu nại cho câu này, đang chờ giáo viên.');
    if (open.length >= 5) fail(429, 'Em đang có quá nhiều khiếu nại chưa được xử lý.');
    const id = Number(db.run('INSERT INTO score_appeals (school_id, attempt_id, student_id, qid, reason, created_at) VALUES (?,?,?,?,?,?)', user.school_id, att.id, user.id, qid, reason.slice(0, 1000), now()).lastInsertRowid);
    audit(user, 'appeal_create', `bài làm #${att.id}${qid ? ` câu #${qid}` : ''}`, ip, { target: `appeal:${id}`, reason });
    return { id };
  });
  route('GET', '/api/student/appeals', ['student'], ({ user }) => ({
    appeals: db
      .all('SELECT a.id, a.attempt_id, a.qid, a.reason, a.status, a.note, a.created_at, a.resolved_at, s.title FROM score_appeals a JOIN attempts s ON s.id = a.attempt_id WHERE a.student_id = ? ORDER BY a.id DESC', user.id)
      .map((a) => ({ id: a.id, attemptId: a.attempt_id, qid: a.qid, title: a.title, reason: a.reason, status: a.status, note: a.note, createdAt: a.created_at, resolvedAt: a.resolved_at })),
  }));
  route('GET', '/api/appeals', STAFF, ({ user, query }) => {
    const ids = selectedClassIds(user, query.classId);
    if (!ids.length) return { appeals: [] };
    const rows = db.all(
      `SELECT a.id, a.attempt_id, a.qid, a.reason, a.status, a.note, a.created_at, a.resolved_at, u.display_name student, s.title, s.score10, c.name class_name
       FROM score_appeals a JOIN attempts s ON s.id = a.attempt_id JOIN assignments g ON g.id = s.assignment_id JOIN classes c ON c.id = g.class_id JOIN users u ON u.id = a.student_id
       WHERE a.school_id = ? AND g.class_id IN (${ids.map(() => '?').join(',')}) ${query.status ? 'AND a.status = ?' : ''} ORDER BY (a.status = 'open') DESC, a.id DESC LIMIT 200`,
      user.school_id,
      ...ids,
      ...(query.status ? [String(query.status)] : []),
    );
    return { appeals: rows.map((a) => ({ id: a.id, attemptId: a.attempt_id, qid: a.qid, student: a.student, className: a.class_name, title: a.title, score10: a.score10, reason: a.reason, status: a.status, note: a.note, createdAt: a.created_at, resolvedAt: a.resolved_at })) };
  });
  route('POST', '/api/appeals/:id/resolve', STAFF, ({ user, params, body, ip }) => {
    const ap = db.get('SELECT * FROM score_appeals WHERE id = ?', params.id);
    if (!ap) fail(404, 'Không tìm thấy khiếu nại.');
    const target = `appeal:${ap.id}`;
    if (ap.school_id !== user.school_id) deny(user, 'appeal_resolve', target, 'Khiếu nại không thuộc trường của bạn.', ip);
    const att = db.get('SELECT * FROM attempts WHERE id = ?', ap.attempt_id);
    const asg = db.get('SELECT class_id FROM assignments WHERE id = ?', att.assignment_id);
    if (!teacherClassIds(user).includes(asg.class_id)) deny(user, 'appeal_resolve', target, 'Bạn không phụ trách lớp này.', ip);
    if (ap.status !== 'open') fail(400, 'Khiếu nại này đã được xử lý.');
    const note = needReason({ reason: body.note });
    if (!['accept', 'reject'].includes(body.decision)) fail(400, 'Chọn chấp nhận hoặc từ chối.');
    let old = null;
    let next = null;
    if (body.decision === 'accept') {
      old = { score10: att.score10, points: att.points };
      let points;
      let score10;
      if (body.creditQuestion) {
        if (ap.qid === null) fail(400, 'Khiếu nại không gắn với câu nào để cho điểm câu.');
        const item = att.result?.items?.find((x) => x.qid === ap.qid);
        if (!item) fail(400, 'Không tìm thấy kết quả câu này.');
        points = Math.round((att.points + (item.max - item.points) / 1000) * 1000) / 1000;
        score10 = att.max_points ? Math.round((points / att.max_points) * 10 * 100) / 100 : att.score10;
        const patched = { ...att.result, items: att.result.items.map((x) => (x.qid === ap.qid ? { ...x, points: x.max, correct: true, appealCredit: true } : x)) };
        db.run('UPDATE attempts SET result_json = ? WHERE id = ?', JSON.stringify(patched), att.id);
        db.run('UPDATE evidence SET score = 1, correct = 1, error_type = NULL WHERE attempt_id = ? AND qid = ?', att.id, ap.qid);
      } else {
        const v = Number(body.newScore10);
        if (body.newScore10 === undefined || body.newScore10 === null || body.newScore10 === '' || !Number.isFinite(v) || v < 0 || v > 10) fail(400, 'Nhập điểm mới từ 0 đến 10, hoặc chọn cho điểm câu bị khiếu nại.');
        score10 = Math.round(v * 100) / 100;
        points = Math.round((score10 / 10) * (att.max_points ?? 0) * 100) / 100;
      }
      db.run('UPDATE attempts SET score10 = ?, points = ? WHERE id = ?', score10, points, att.id);
      next = { score10, points };
    }
    db.run('UPDATE score_appeals SET status = ?, note = ?, resolution_json = ?, resolved_by = ?, resolved_at = ? WHERE id = ?', body.decision === 'accept' ? 'accepted' : 'rejected', note, JSON.stringify({ old, new: next }), user.id, now(), ap.id);
    audit(user, 'appeal_resolve', `khiếu nại #${ap.id}: ${body.decision === 'accept' ? 'chấp nhận' : 'từ chối'}`, ip, { target, old: old ?? undefined, new: next ?? { decision: 'reject' }, reason: note });
    return { ok: true, status: body.decision === 'accept' ? 'accepted' : 'rejected', score10: next?.score10 ?? att.score10 };
  });

  // ---- sửa đáp án của đề đã giao + chấm lại ----
  route('POST', '/api/exams/:id/fix-answer', STAFF, ({ user, params, body, ip }) => {
    const e = db.get('SELECT * FROM exams WHERE id = ?', params.id);
    if (!e) fail(404, 'Không tìm thấy đề.');
    const target = `exam:${e.id}`;
    if (e.school_id !== user.school_id) deny(user, 'exam_answer_fix', target, 'Đề không thuộc trường của bạn.', ip);
    if (user.role !== 'admin' && e.created_by !== user.id) deny(user, 'exam_answer_fix', target, 'Chỉ người ra đề hoặc quản lý mới sửa đáp án đề đã giao.', ip);
    const qid = Number(body.qid);
    const q = e.snapshot[qid];
    if (!q) fail(400, 'Câu này không có trong đề.');
    const reason = needReason(body);
    const candidate = { ...q, answer: body.answer };
    const errs = validateQuestion({ ...candidate, topic: q.topic ?? 'T10.MENHDE', level: q.level ?? 1 }).filter((m) => /đáp án|Chọn/i.test(m));
    if (errs.length) fail(400, errs.join(' '));
    if (sameAnswer(q.type, q.answer, body.answer)) fail(400, 'Đáp án mới giống đáp án hiện tại.');
    const snapshot = { ...e.snapshot, [qid]: { ...q, answer: body.answer } };
    const attempts = db.all("SELECT t.* FROM attempts t JOIN assignments a ON a.id = t.assignment_id WHERE a.exam_id = ? AND t.status != 'in_progress'", e.id);
    let changed = 0;
    db.tx(() => {
      db.run('UPDATE exams SET snapshot_json = ? WHERE id = ?', JSON.stringify(snapshot), e.id);
      for (const t of attempts) {
        db.run('DELETE FROM evidence WHERE attempt_id = ?', t.id);
        const after = finalize({ ...t, checked: {} }, t.responses, t.times, t.status, { rescore: true });
        if (after.score10 !== t.score10) changed++;
      }
    });
    audit(user, 'exam_answer_fix', `đề #${e.id} câu #${qid}: chấm lại ${attempts.length} bài, ${changed} bài đổi điểm`, ip, { target, old: { qid, answer: q.answer }, new: { qid, answer: body.answer, regraded: attempts.length, changed }, reason });
    return { ok: true, regraded: attempts.length, changed };
  });

  route('POST', '/api/attempts/:id/accept-late', STAFF, ({ user, params, ip }) => {
    const att = db.get('SELECT * FROM attempts WHERE id = ? AND school_id = ?', params.id, user.school_id);
    if (!att || !att.late || att.late.accepted) fail(400, 'Bài này không có bản đồng bộ muộn chờ duyệt.');
    const asg = db.get('SELECT class_id FROM assignments WHERE id = ?', att.assignment_id);
    if (!teacherClassIds(user).includes(asg.class_id)) fail(403, 'Bạn không phụ trách lớp này.');
    db.tx(() => {
      db.run('DELETE FROM evidence WHERE attempt_id = ?', att.id);
      finalize({ ...att, checked: {} }, att.late.responses, att.late.times, att.status);
      db.run('UPDATE attempts SET late_json = ? WHERE id = ?', JSON.stringify({ ...att.late, accepted: true, acceptedBy: user.id }), att.id);
    });
    audit(user, 'late_accept', `bài làm #${att.id}`, ip, { target: `attempt:${att.id}`, old: { score10: att.score10 }, new: { score10: db.get('SELECT score10 FROM attempts WHERE id = ?', att.id).score10 } });
    return { ok: true };
  });
  function staffCanAccessAttempt(user, att) {
    if (!att || att.school_id !== user.school_id) return false;
    if (att.assignment_id) {
      const asg = db.get('SELECT class_id FROM assignments WHERE id = ? AND school_id = ?', att.assignment_id, user.school_id);
      return !!(asg && teacherClassIds(user).includes(asg.class_id));
    }
    return canSeeStudent(user, att.student_id);
  }
  route('GET', '/api/teacher/attempts/:id', STAFF, ({ user, params, ip }) => {
    const aid = posInt(params.id);
    const att = aid ? db.get('SELECT * FROM attempts WHERE id = ? AND school_id = ?', aid, user.school_id) : null;
    if (!staffCanAccessAttempt(user, att)) fail(404, 'Không tìm thấy bài làm.');
    audit(user, 'attempt_view', `bài làm #${att.id}`, ip);
    const view = attemptView(att);
    if (att.status !== 'in_progress') view.result = resultDetail(att, attemptQuestions(att));
    view.events = att.events;
    view.student = db.get('SELECT display_name FROM users WHERE id = ?', att.student_id).display_name;
    view.classId = att.assignment_id ? db.get('SELECT class_id FROM assignments WHERE id = ?', att.assignment_id)?.class_id : db.get('SELECT class_id FROM users WHERE id = ?', att.student_id)?.class_id;
    view.assignmentId = att.assignment_id;
    view.teacherFeedback = att.teacher_feedback || null;
    view.teacherStamp = att.teacher_stamp || null;
    view.feedbackAt = att.feedback_at || null;
    return view;
  });
  route('POST', '/api/teacher/attempts/:id/feedback', STAFF, ({ user, params, body, ip }) => {
    const aid = posInt(params.id);
    const att = aid ? db.get('SELECT * FROM attempts WHERE id = ? AND school_id = ?', aid, user.school_id) : null;
    if (!staffCanAccessAttempt(user, att)) fail(404, 'Không tìm thấy bài làm.');
    const feedback = String(body.feedback ?? '').trim().slice(0, 500);
    const stamp = String(body.stamp ?? '').trim().slice(0, 50);
    const t = now();
    db.run(
      'UPDATE attempts SET teacher_feedback = ?, teacher_stamp = ?, feedback_at = ? WHERE id = ?',
      feedback || null,
      stamp || null,
      feedback || stamp ? t : null,
      att.id,
    );
    audit(user, 'teacher_feedback', `bài làm #${att.id}`, ip);
    return { ok: true, feedback, stamp, teacherStamp: stamp, teacherFeedback: feedback, feedbackAt: t };
  });
  route('POST', '/api/teacher/classes/:id/remedial', STAFF, ({ user, params, body, ip }) => {
    const classId = Number(params.id);
    const mine = teacherClassIds(user);
    if (!mine.includes(classId)) fail(403, 'Bạn không phụ trách lớp này.');
    const cls = db.get('SELECT * FROM classes WHERE id = ?', classId);
    if (!cls) fail(404, 'Không tìm thấy lớp.');
    const topic = body.topic ? String(body.topic) : null;
    let pool = db.all("SELECT id, type, topic, level, status FROM questions WHERE school_id = ? AND status = 'approved'", user.school_id);
    if (topic && topic !== 'all') {
      const filtered = pool.filter((q) => q.topic === topic);
      if (filtered.length >= 3) pool = filtered;
    }
    const picked = shuffleArray(pool).slice(0, 5);
    if (!picked.length) fail(400, 'Không đủ câu hỏi trong ngân hàng để tạo bài củng cố.');
    const t = now();
    const topicName = topic && TOPIC_BY_CODE[topic] ? TOPIC_BY_CODE[topic].name : 'Trọng Tâm Lớp';
    const title = body.title ? String(body.title).slice(0, 100) : `Bài Củng Cố: ${topicName} (5 câu)`;
    const rExam = db.run(
      'INSERT INTO exams (school_id, title, blueprint_json, items_json, duration_min, variants_json, snapshot_json, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      user.school_id,
      title,
      JSON.stringify([]),
      JSON.stringify(picked.map((q) => ({ qid: q.id, type: q.type }))),
      20,
      JSON.stringify([{ code: '101' }]),
      JSON.stringify(questionsMap(user.school_id, picked.map((q) => q.id))),
      user.id,
      t,
    );
    const examId = Number(rExam.lastInsertRowid);
    const rAsg = db.run(
      'INSERT INTO assignments (school_id, exam_id, class_id, mode, title, open_at, close_at, duration_min, show_result, created_by, created_at, variant_mode, variant_map_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      user.school_id,
      examId,
      classId,
      'homework',
      title,
      t,
      t + 7 * 86400000,
      20,
      'after_submit',
      user.id,
      t,
      'random',
      '{}',
    );
    audit(user, 'remedial_assign', `Lớp ${cls.name}: #${examId}`, ip);
    return { ok: true, assignmentId: Number(rAsg.lastInsertRowid), examId, title, topicName, questionCount: picked.length };
  });
  route('GET', '/api/students/:id/profile', ['admin', 'teacher', 'student'], ({ user, params, ip }) => {
    const id = Number(params.id);
    if (!canSeeStudent(user, id)) fail(404, 'Không tìm thấy học sinh.');
    if (user.role !== 'student') audit(user, 'student_profile_view', `học sinh #${id}`, ip);
    return studentProfile(id, user.role !== 'student');
  });

  // ---- học sinh ----
  route('GET', '/api/student/home', ['student'], ({ user }) => {
    sweepExpired('AND student_id = ?', user.id);
    const t = now();
    const asg = db.all(
      `SELECT a.id, a.title, a.mode, a.open_at, a.close_at, a.duration_min, a.show_result, t.id attempt_id, t.status, t.score10, t.deadline_at
       FROM assignments a LEFT JOIN attempts t ON t.assignment_id = a.id AND t.student_id = ? WHERE a.class_id = ? AND (a.target_json IS NULL OR EXISTS (SELECT 1 FROM json_each(a.target_json) j WHERE j.value = ?)) ORDER BY a.close_at ASC`,
      user.id,
      user.class_id ?? -1,
      user.id,
    );
    const items = asg.map((a) => {
      const done = !!(a.status && a.status !== 'in_progress');
      const scoreVisible = done && (a.show_result === 'after_submit' || a.show_result === 'score_only_until_close' || t > a.close_at);
      const answersVisible = done && (a.show_result === 'after_submit' || t > a.close_at);
      return {
        ...a,
        scoreVisible,
        answersVisible,
        score10: scoreVisible ? a.score10 : null,
        state: done ? 'done' : a.status === 'in_progress' ? 'doing' : t < a.open_at ? 'upcoming' : t > a.close_at ? 'missed' : 'open',
      };
    });
    const profile = studentProfile(user.id);
    const today = db.get('SELECT questions, correct FROM activity WHERE student_id = ? AND day = ?', user.id, dayKey(t)) ?? { questions: 0, correct: 0 };
    const fresh = db.get('SELECT xp, streak, last_active_day FROM users WHERE id = ?', user.id);
    const streakAlive = fresh.last_active_day === dayKey(t) || fresh.last_active_day === dayKey(t - 86400000);
    const completedAttempts = (profile.attempts || []).filter((a) => a.status && a.status !== 'in_progress');
    const recentAttempt = completedAttempts[0] || null;
    return {
      assignments: items,
      practiceInProgress: db.get("SELECT id, title FROM attempts WHERE student_id = ? AND kind = 'practice' AND status = 'in_progress' ORDER BY started_at DESC LIMIT 1", user.id) ?? null,
      today: { ...today, goal: DAY_GOAL },
      xp: fresh.xp,
      streak: streakAlive ? fresh.streak : 0,
      mastery: profile.mastery,
      recommendations: profile.recommendations,
      errorCount: profile.errorCount,
      review: profile.review,
      days: profile.days,
      recentAttempt,
      recentAttempts: completedAttempts.slice(0, 3),
      teacherFeedback: profile.teacherFeedback,
      radar: profile.radar,
      prediction: profile.prediction,
    };
  });

  // ---- lớp học sinh & tham gia bằng mã ----
  route('GET', '/api/student/class', ['student'], ({ user, query }) => {
    sweepExpired('AND student_id = ?', user.id);
    const t = now();
    const freshUser = db.get('SELECT class_id FROM users WHERE id = ?', user.id);
    const hasQueryClassId = query?.classId !== undefined && query?.classId !== '';
    const requestedClassId = hasQueryClassId ? posInt(query.classId) : null;
    if (hasQueryClassId && !requestedClassId) fail(400, 'Mã lớp không hợp lệ.');
    if (requestedClassId && requestedClassId !== freshUser?.class_id) {
      fail(403, 'Em chưa tham gia lớp học này. Hãy nhập mã lớp do giáo viên cung cấp.');
    }
    const classId = requestedClassId || freshUser?.class_id;

    // Get all available classes in school with real modules/progress/deadlines
    const rawClasses = db.all(
      `SELECT c.id, c.name, c.grade, c.code, u.display_name teacher,
              (SELECT COUNT(*) FROM users s WHERE s.class_id = c.id AND s.role = 'student' AND s.active = 1) students,
              (SELECT COUNT(*) FROM class_modules cm WHERE cm.class_id = c.id) module_count,
              (SELECT COUNT(*) FROM assignments a WHERE a.class_id = c.id AND (a.target_json IS NULL OR EXISTS (SELECT 1 FROM json_each(a.target_json) j WHERE j.value = ?))) assignment_count,
              (SELECT COUNT(*) FROM assignments a JOIN attempts t2 ON t2.assignment_id = a.id AND t2.student_id = ? AND t2.status != 'in_progress' WHERE a.class_id = c.id AND (a.target_json IS NULL OR EXISTS (SELECT 1 FROM json_each(a.target_json) j WHERE j.value = ?))) done_count,
              (SELECT COUNT(*) FROM assignments a LEFT JOIN attempts t2 ON t2.assignment_id = a.id AND t2.student_id = ? WHERE a.class_id = c.id AND a.open_at <= ? AND a.close_at >= ? AND (a.target_json IS NULL OR EXISTS (SELECT 1 FROM json_each(a.target_json) j WHERE j.value = ?)) AND (t2.id IS NULL OR t2.status = 'in_progress')) pending_count,
              (SELECT COUNT(*) FROM class_materials mat WHERE mat.class_id = c.id) material_count,
              (SELECT COUNT(*) FROM student_material_views smv JOIN class_materials mat ON mat.id = smv.material_id WHERE mat.class_id = c.id AND smv.student_id = ?) viewed_count,
              (SELECT MIN(a.close_at) FROM assignments a LEFT JOIN attempts t2 ON t2.assignment_id = a.id AND t2.student_id = ? WHERE a.class_id = c.id AND a.close_at >= ? AND (a.target_json IS NULL OR EXISTS (SELECT 1 FROM json_each(a.target_json) j WHERE j.value = ?)) AND (t2.id IS NULL OR t2.status = 'in_progress')) next_deadline,
              (SELECT COUNT(*) FROM assignments a WHERE a.class_id = c.id AND a.open_at <= ? AND a.close_at >= ?) active_assignments,
              (SELECT COUNT(*) FROM assignments a WHERE a.class_id = c.id AND a.open_at > ?) upcoming_assignments
       FROM classes c
       LEFT JOIN users u ON u.id = c.teacher_id
       WHERE c.school_id = ?
       ORDER BY c.grade DESC, c.name ASC`,
      user.id,
      user.id,
      user.id,
      user.id,
      t,
      t,
      user.id,
      user.id,
      user.id,
      t,
      user.id,
      t,
      t,
      t,
      user.school_id,
    );

    const allClasses = rawClasses.map((c) => {
      const enrolled = freshUser?.class_id === c.id;
      const totalTasks = Number(c.assignment_count || 0) + Number(c.material_count || 0);
      const doneTasks = enrolled ? Number(c.done_count || 0) + Number(c.viewed_count || 0) : 0;
      const progressPct = enrolled && totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
      return {
        ...c,
        code: enrolled ? c.code : null,
        pending_count: enrolled ? Number(c.pending_count || 0) : 0,
        done_count: enrolled ? Number(c.done_count || 0) : 0,
        viewed_count: enrolled ? Number(c.viewed_count || 0) : 0,
        next_deadline: enrolled ? c.next_deadline : null,
        totalTasks,
        doneTasks,
        progressPct,
        enrolled,
        status: c.assignment_count > 0 && c.active_assignments === 0 && c.upcoming_assignments === 0 ? 'ended' : 'active',
        academicYear: '2026–2027',
        subject: 'Toán học',
      };
    });

    if (!classId) {
      return {
        class: null,
        assignments: [],
        allClasses,
        classmates: [],
        modules: [],
        announcements: [],
        activeClassId: null,
        lastStudyAt: null,
        appealsCount: 0,
      };
    }

    const cls = db.get(
      `SELECT c.id, c.name, c.grade, c.code, u.display_name teacher,
              (SELECT COUNT(*) FROM users s WHERE s.class_id = c.id AND s.role = 'student' AND s.active = 1) students
       FROM classes c
       LEFT JOIN users u ON u.id = c.teacher_id
       WHERE c.id = ? AND c.school_id = ?`,
      classId,
      user.school_id,
    );
    if (!cls) {
      return {
        class: null,
        assignments: [],
        allClasses,
        classmates: [],
        modules: [],
        announcements: [],
        activeClassId: null,
        lastStudyAt: null,
        appealsCount: 0,
      };
    }

    const asg = db.all(
      `SELECT a.id, a.title, a.mode, a.open_at, a.close_at, a.duration_min, a.show_result, a.module_id, a.exam_id,
              (SELECT json_array_length(e.items_json) FROM exams e WHERE e.id = a.exam_id) question_count,
              t.id attempt_id, t.status, t.score10, t.deadline_at, t.started_at, t.submitted_at,
              t.teacher_feedback, t.teacher_stamp, t.feedback_at
       FROM assignments a
       LEFT JOIN attempts t ON t.assignment_id = a.id AND t.student_id = ?
       WHERE a.class_id = ? AND (a.target_json IS NULL OR EXISTS (SELECT 1 FROM json_each(a.target_json) j WHERE j.value = ?))
       ORDER BY a.open_at DESC`,
      user.id,
      classId,
      user.id,
    );
    const items = asg.map((a) => {
      const done = !!(a.status && a.status !== 'in_progress');
      const scoreVisible = done && (a.show_result === 'after_submit' || a.show_result === 'score_only_until_close' || t > a.close_at);
      const answersVisible = done && (a.show_result === 'after_submit' || t > a.close_at);
      return {
        ...a,
        resultVisible: scoreVisible,
        scoreVisible,
        answersVisible,
        score10: scoreVisible ? a.score10 : null,
        state: done ? 'done' : a.status === 'in_progress' ? 'doing' : t < a.open_at ? 'upcoming' : t > a.close_at ? 'missed' : 'open',
      };
    });

    const rawModules = db.all('SELECT id, week_no, title, description, sort_order, locked, created_at FROM class_modules WHERE class_id = ? ORDER BY sort_order ASC, week_no ASC, id ASC', classId);
    const rawMaterials = db.all('SELECT id, module_id, kind, title, summary, content, topic_code, sort_order, created_at FROM class_materials WHERE class_id = ? ORDER BY sort_order ASC, id ASC', classId);
    const viewedRows = db.all('SELECT material_id, viewed_at FROM student_material_views WHERE student_id = ?', user.id);
    const viewedMap = Object.fromEntries(viewedRows.map((v) => [v.material_id, v.viewed_at]));
    const matByMod = {};
    for (const mat of rawMaterials) {
      (matByMod[mat.module_id] ??= []).push({ ...mat, viewed: !!viewedMap[mat.id], viewed_at: viewedMap[mat.id] ?? null });
    }
    const modules = rawModules.map((m) => ({ ...m, locked: !!m.locked, materials: matByMod[m.id] ?? [] }));

    const announcements = db.all(
      `SELECT ca.id, ca.title, ca.body, ca.pinned, ca.created_at, u.display_name author_name
       FROM class_announcements ca LEFT JOIN users u ON u.id = ca.created_by
       WHERE ca.class_id = ? ORDER BY ca.pinned DESC, ca.created_at DESC`,
      classId,
    );

    const lastAttemptAt = items.reduce((mx, a) => Math.max(mx, Number(a.submitted_at || a.started_at || 0)), 0);
    const lastViewAt = rawMaterials.reduce((mx, mat) => Math.max(mx, Number(viewedMap[mat.id] || 0)), 0);
    const lastStudyAt = Math.max(lastAttemptAt, lastViewAt) || null;

    const appealsCount = Number(
      db.get(
        `SELECT COUNT(*) c FROM score_appeals ap JOIN attempts t2 ON t2.id = ap.attempt_id JOIN assignments a ON a.id = t2.assignment_id WHERE a.class_id = ? AND t2.student_id = ? AND ap.status = 'open'`,
        classId,
        user.id,
      )?.c || 0,
    );

    const classmates = db.all(
      `SELECT id, display_name, username, xp, streak
       FROM users
       WHERE class_id = ? AND role = 'student' AND active = 1
       ORDER BY display_name ASC`,
      classId,
    );

    return {
      class: { ...cls, academicYear: '2026–2027', subject: 'Toán học' },
      assignments: items,
      allClasses,
      classmates,
      modules,
      announcements,
      activeClassId: classId,
      lastStudyAt,
      appealsCount,
    };
  });

  route('POST', '/api/student/materials/:matId/view', ['student'], ({ user, params }) => {
    const matId = posInt(params.matId);
    if (!matId) fail(404, 'Không tìm thấy tài liệu.');
    const freshUser = db.get('SELECT class_id FROM users WHERE id = ?', user.id);
    const mat = db.get(
      `SELECT m.id, m.school_id, m.class_id, cm.locked module_locked
       FROM class_materials m
       LEFT JOIN class_modules cm ON cm.id = m.module_id
       WHERE m.id = ?`,
      matId,
    );
    if (!mat || mat.school_id !== user.school_id) fail(404, 'Không tìm thấy tài liệu.');
    if (mat.class_id !== freshUser?.class_id) fail(403, 'Em chưa tham gia lớp học chứa tài liệu này.');
    if (mat.module_locked) fail(403, 'Học phần này đang bị giáo viên tạm khóa.');
    const t = now();
    db.run(
      'INSERT INTO student_material_views (student_id, material_id, viewed_at) VALUES (?,?,?) ON CONFLICT(student_id, material_id) DO UPDATE SET viewed_at = excluded.viewed_at',
      user.id,
      matId,
      t,
    );
    return { ok: true, viewedAt: t };
  });

  route('POST', '/api/student/class/switch', ['student'], ({ user, body, ip }) => {
    const targetId = posInt(body?.classId);
    if (!targetId) fail(400, 'Thiếu thông tin lớp cần chuyển.');
    const freshUser = db.get('SELECT class_id FROM users WHERE id = ?', user.id);
    const cls = db.get('SELECT id, name, code FROM classes WHERE id = ? AND school_id = ?', targetId, user.school_id);
    if (!cls) fail(404, 'Không tìm thấy lớp học trong trường.');
    if (freshUser?.class_id !== cls.id) {
      const providedCode = String(body?.code ?? '').trim().toUpperCase();
      if (!providedCode || providedCode !== String(cls.code ?? '').trim().toUpperCase()) {
        fail(403, 'Vui lòng nhập đúng mã lớp do giáo viên cung cấp để tham gia lớp học này.');
      }
    }
    db.run('UPDATE users SET class_id = ? WHERE id = ?', cls.id, user.id);
    audit(user, 'class_switch', `${cls.name} (${cls.code})`, ip);
    const updated = db.get('SELECT * FROM users WHERE id = ?', user.id);
    return { ok: true, class: cls, user: publicUser(updated) };
  });

  route('GET', '/api/student/notifications', ['student'], ({ user }) => {
    const t = now();
    const freshUser = db.get('SELECT class_id FROM users WHERE id = ?', user.id);
    const classId = freshUser?.class_id;
    if (!classId) return { notifications: [], unreadCount: 0 };

    const asg = db.all(
      `SELECT a.id, a.title, a.mode, a.open_at, a.close_at, a.duration_min, c.name class_name, u.display_name teacher_name,
              t.id attempt_id, t.status, t.score10
       FROM assignments a
       JOIN classes c ON c.id = a.class_id
       LEFT JOIN users u ON u.id = a.created_by
       LEFT JOIN attempts t ON t.assignment_id = a.id AND t.student_id = ?
       WHERE a.class_id = ? AND (a.target_json IS NULL OR EXISTS (SELECT 1 FROM json_each(a.target_json) j WHERE j.value = ?))
       ORDER BY a.open_at DESC LIMIT 15`,
      user.id,
      classId,
      user.id,
    );

    const notifications = asg.map((a) => {
      const state = a.status && a.status !== 'in_progress' ? 'done' : a.status === 'in_progress' ? 'doing' : t < a.open_at ? 'upcoming' : t > a.close_at ? 'missed' : 'open';
      const isNew = state === 'open' && (t - a.open_at < 7 * 86400000);
      return {
        id: a.id,
        title: a.title,
        mode: a.mode,
        modeLabel: a.mode === 'exam' ? 'Đề kiểm tra' : 'Bài tập về nhà',
        className: a.class_name,
        teacherName: a.teacher_name || 'Giáo viên bộ môn',
        openAt: a.open_at,
        closeAt: a.close_at,
        durationMin: a.duration_min,
        state,
        isNew,
        attemptId: a.attempt_id,
      };
    });

    const unreadCount = notifications.filter((n) => n.state === 'open' || n.state === 'doing').length;
    return { notifications, unreadCount };
  });

  route('POST', '/api/student/class/join', ['student'], ({ user, body, ip }) => {
    const raw = String(body.code ?? '').trim();
    if (!raw) fail(400, 'Vui lòng nhập mã lớp học.');
    const code = raw.toUpperCase();
    const cls = db.get(
      `SELECT c.id, c.name, c.grade, c.code, u.display_name teacher
       FROM classes c
       LEFT JOIN users u ON u.id = c.teacher_id
       WHERE UPPER(c.code) = ? AND c.school_id = ?`,
      code,
      user.school_id,
    );
    if (!cls) fail(404, 'Mã lớp không hợp lệ hoặc không tìm thấy lớp trong trường.');
    db.run('UPDATE users SET class_id = ? WHERE id = ?', cls.id, user.id);
    audit(user, 'class_join', `${cls.name} (${cls.code})`, ip);
    const updated = db.get('SELECT * FROM users WHERE id = ?', user.id);
    return { ok: true, class: cls, user: publicUser(updated) };
  });

  route('POST', '/api/student/class/leave', ['student'], ({ user, ip }) => {
    const u = db.get('SELECT class_id FROM users WHERE id = ?', user.id);
    if (u?.class_id) {
      const cls = db.get('SELECT name, code FROM classes WHERE id = ?', u.class_id);
      db.run('UPDATE users SET class_id = NULL WHERE id = ?', user.id);
      audit(user, 'class_leave', cls ? `${cls.name} (${cls.code})` : 'Rời lớp', ip);
    }
    const updated = db.get('SELECT * FROM users WHERE id = ?', user.id);
    return { ok: true, user: publicUser(updated) };
  });

  // ---- tự luyện đề (kho đề khảo sát năng lực 2026 đa môn phong phú) ----
  route('GET', '/api/student/practice-exams', ['student'], ({ user }) => {
    const rows = db.all(
      `SELECT e.id, e.title, e.duration_min, e.blueprint_json, e.items_json, e.variants_json, e.dept, e.created_at, u.display_name author
       FROM exams e
       LEFT JOIN users u ON u.id = e.created_by
       WHERE e.school_id = ? AND (e.visibility = 'school' OR e.visibility IS NULL)
       ORDER BY e.id DESC`,
      user.school_id,
    );


    const attempts = db.all(
      `SELECT id, title, score10, status, started_at, submitted_at
       FROM attempts
       WHERE student_id = ? AND kind = 'practice'
       ORDER BY started_at DESC`,
      user.id,
    );
    const attemptByTitle = {};
    const attemptCountByTitle = {};
    for (const att of attempts) {
      if (!attemptByTitle[att.title]) attemptByTitle[att.title] = att;
      attemptCountByTitle[att.title] = (attemptCountByTitle[att.title] ?? 0) + 1;
    }
    const exams = rows.map((e) => {
      const items = e.items ?? [];
      const blueprint = e.blueprint ?? {};
      const subject = e.dept || 'Toán';
      const att = attemptByTitle[e.title] ?? null;
      const mcqCount = items.filter((x) => x.type === 'mcq').length || blueprint.counts?.mcq || 12;
      const tfCount = items.filter((x) => x.type === 'tf').length || blueprint.counts?.tf || 4;
      const shortCount = items.filter((x) => x.type === 'short').length || blueprint.counts?.short || 6;
      const qCount = items.length || (mcqCount + tfCount + shortCount);
      const dur = e.duration_min || blueprint.durationMin || 90;
      let category = 'Cấu trúc 2026 BGD';
      if (/TSA|Đánh Giá Tư Duy|HSA/i.test(e.title)) category = 'Đánh giá Tư duy TSA';
      else if (/Sở|Chuyên|Thi Thử/i.test(e.title)) category = 'Thi thử Sở & Chuyên';
      else if (dur <= 45 || /15 phút|30 phút|Về Nhà/i.test(e.title)) category = 'Đề ngắn 15–45 phút';

      return {
        id: e.id,
        title: e.title,
        subject,
        category,
        durationMin: dur,
        questionCount: qCount,
        counts: { mcq: mcqCount, tf: tfCount, short: shortCount },
        variantCount: Array.isArray(e.variants) ? e.variants.length : 4,
        author: e.author || 'Hội đồng Bộ môn',
        completed: !!(att && att.status && att.status !== 'in_progress'),
        inProgress: !!(att && att.status === 'in_progress'),
        attemptCount: attemptCountByTitle[e.title] ?? 0,
        score10: att?.score10 ?? null,
        attemptId: att?.id ?? null,
      };
    });
    const completedCount = exams.filter((x) => x.completed).length;
    return {
      exams,
      totalCount: exams.length,
      completedCount,
    };
  });

  route('POST', '/api/student/practice-exams/start', ['student'], ({ user, body, ip }) => {
    const examId = posInt(body.examId);
    if (!examId) fail(400, 'Thiếu mã đề thi.');
    const exam = db.get("SELECT * FROM exams WHERE id = ? AND school_id = ? AND (visibility = 'school' OR visibility IS NULL)", examId, user.school_id);
    if (!exam) fail(404, 'Không tìm thấy đề thi.');
    const t = now();
    const items = exam.items && exam.items.length ? exam.items : [];
    if (!items.length) fail(400, 'Đề thi chưa có câu hỏi.');
    const layout = makeVariant(items, `pe-${user.id}-${exam.id}-${t}`);
    const dur = exam.duration_min || 90;
    const r = db.run(
      'INSERT INTO attempts (school_id, student_id, kind, title, layout_json, started_at, deadline_at) VALUES (?,?,?,?,?,?,?)',
      user.school_id,
      user.id,
      'practice',
      exam.title,
      JSON.stringify(layout),
      t,
      t + dur * 60000,
    );
    audit(user, 'practice_exam_start', `Đề #${exam.id}: ${exam.title}`, ip);
    return attemptView(getAttempt(Number(r.lastInsertRowid)));
  });
  // Chỉ dữ liệu của chính học sinh đang đăng nhập (không nhận mã học sinh từ đường dẫn).
  route('GET', '/api/student/progress', ['student'], ({ user }) => {
    const t = now();
    const evidence = db.all('SELECT topic, level, score, at FROM evidence WHERE student_id = ? AND topic IS NOT NULL AND at > ?', user.id, t - 90 * 86400000);
    const activity = db.all('SELECT day, questions, correct FROM activity WHERE student_id = ? AND day >= ?', user.id, dayKey(t - 120 * 86400000));
    const reviewDue = db.get('SELECT COUNT(*) n FROM review_items WHERE student_id = ? AND due_day <= ?', user.id, dayKey(t)).n;
    return buildProgress({ evidence, activity, reviewDue, nowMs: t, dayGoal: DAY_GOAL });
  });
  route('POST', '/api/attempts/start', ['student'], ({ user, body, ip }) => {
    const assignmentId = posInt(body?.assignmentId);
    if (!assignmentId) fail(400, 'Thiếu mã bài được giao.');
    const a = db.get('SELECT * FROM assignments WHERE id = ? AND school_id = ?', assignmentId, user.school_id);
    if (!a || a.class_id !== user.class_id || (Array.isArray(a.target) && !a.target.includes(user.id))) fail(404, 'Không tìm thấy bài được giao.');
    const existing = db.get('SELECT * FROM attempts WHERE assignment_id = ? AND student_id = ?', a.id, user.id);
    if (existing) return attemptView(finalizeIfExpired(existing));
    const t = now();
    if (t < a.open_at) fail(400, 'Bài chưa mở. Quay lại đúng giờ mở bài.');
    if (t > a.close_at) fail(400, 'Bài đã đóng. Hỏi giáo viên nếu cần làm bù.');
    const exam = db.get('SELECT * FROM exams WHERE id = ?', a.exam_id);
    // Mã đề: theo bảng chia của bài giao; em vào lớp sau khi giao thì chia theo băm cố định.
    const codes = exam.variants.map((v) => v.code);
    // Chế độ "mỗi em một thứ tự": bố cục riêng theo (bài giao, học sinh), không có mã đề chung.
    const perStudent = a.variant_mode === 'per_student';
    let code = perStudent ? null : a.variant_map?.[user.id];
    if (!perStudent && !codes.includes(code)) code = codes[hashSeed(`${a.id}-${user.id}`) % codes.length];
    const layout = perStudent ? makeVariant(exam.items, `${a.id}-${user.id}-${exam.id}`) : variantLayout(exam.id, exam.items, exam.variants.find((v) => v.code === code));
    const deadline = a.mode === 'exam' ? Math.min(t + a.duration_min * 60000, a.close_at) : a.close_at;
    const r = db.run(
      'INSERT INTO attempts (school_id, assignment_id, student_id, kind, title, layout_json, started_at, deadline_at, client_id, variant_code) VALUES (?,?,?,?,?,?,?,?,?,?)',
      user.school_id,
      a.id,
      user.id,
      'assignment',
      a.title,
      JSON.stringify(layout),
      t,
      deadline,
      String(body.clientId ?? '').slice(0, 40) || null,
      code,
    );
    audit(user, 'attempt_start', `bài giao #${a.id}`, ip);
    return attemptView(getAttempt(Number(r.lastInsertRowid)));
  });
  route('GET', '/api/attempts/:id', ['student'], ({ user, params }) => attemptView(finalizeIfExpired(ownAttempt(user, params.id))));
  function validateAttemptPayload(body) {
    const isPlainObj = (v) => v === undefined || (v !== null && typeof v === 'object' && !Array.isArray(v));
    if (!isPlainObj(body?.responses) || !isPlainObj(body?.times)) fail(400, 'Dữ liệu bài làm không hợp lệ.');
    if (body?.responses && JSON.stringify(body.responses).length > 262144) fail(400, 'Dữ liệu câu trả lời vượt quá giới hạn.');
    if (body?.times && JSON.stringify(body.times).length > 131072) fail(400, 'Dữ liệu thời gian vượt quá giới hạn.');
  }
  route('PUT', '/api/attempts/:id/save', ['student'], ({ user, params, body }) => {
    const att = ownAttempt(user, params.id);
    validateAttemptPayload(body);
    const t = now();
    if (att.status !== 'in_progress') return { closed: true, status: att.status, serverNow: t, version: att.version };
    const version = Number(body.version) || 0;
    const events = mergeEvents(att, body, body.clientId);
    if (att.deadline_at && t > att.deadline_at + SAVE_GRACE_MS) {
      if (t <= att.deadline_at + LATE_WINDOW_MS && version > att.version) {
        db.tx(() => {
          db.run('UPDATE attempts SET late_json = ?, events_json = ? WHERE id = ?', JSON.stringify({ responses: body.responses ?? {}, times: body.times ?? {}, at: t, version }), JSON.stringify(events), att.id);
          finalize({ ...att, events }, att.responses, att.times, 'auto_submitted');
        });
        return { closed: true, late: true, status: 'auto_submitted', serverNow: t };
      }
      finalizeIfExpired(att);
      return { closed: true, status: 'auto_submitted', serverNow: t };
    }
    if (version > att.version) {
      db.run('UPDATE attempts SET responses_json = ?, times_json = ?, version = ?, saved_at = ?, events_json = ? WHERE id = ?', JSON.stringify(body.responses ?? {}), JSON.stringify(body.times ?? {}), version, t, JSON.stringify(events), att.id);
    } else {
      db.run('UPDATE attempts SET events_json = ? WHERE id = ?', JSON.stringify(events), att.id);
    }
    return { ok: true, version: Math.max(version, att.version), serverNow: t, deadlineAt: att.deadline_at };
  });
  /** Câu học sinh đánh dấu khi làm bài → vào Sổ tay lỗi sai (dù làm đúng), không ghi đè ghi chú sẵn có. */
  function saveFlaggedToNotebook(user, att, flagged) {
    if (!Array.isArray(flagged) || !flagged.length) return;
    const inAttempt = new Set((att.layout ?? []).map((it) => Number(it.qid)));
    const qids = [...new Set(flagged.map(Number))].filter((q) => Number.isInteger(q) && inAttempt.has(q)).slice(0, 60);
    const t = now();
    for (const qid of qids) {
      db.run(
        `INSERT INTO student_notes (student_id, qid, school_id, note, tag, updated_at)
         VALUES (?, ?, ?, ?, 'important', ?)
         ON CONFLICT(student_id, qid) DO NOTHING`,
        user.id, qid, user.school_id, 'Đánh dấu xem lại khi làm bài', t,
      );
    }
  }

  route('POST', '/api/attempts/:id/submit', ['student'], ({ user, params, body, ip }) => {
    const att = ownAttempt(user, params.id);
    validateAttemptPayload(body);
    const t = now();
    if (att.status !== 'in_progress') return attemptView(att); // nộp lặp lại: trả kết quả cũ
    const version = Number(body.version) || 0;
    const inTime = !att.deadline_at || t <= att.deadline_at + SAVE_GRACE_MS;
    const useBody = inTime && version >= att.version && body.responses;
    const events = mergeEvents(att, body, body.clientId);
    db.run('UPDATE attempts SET events_json = ? WHERE id = ?', JSON.stringify(events), att.id);
    const done = db.tx(() => {
      if (!inTime && body.responses && version > att.version && t <= att.deadline_at + LATE_WINDOW_MS) {
        db.run('UPDATE attempts SET late_json = ? WHERE id = ?', JSON.stringify({ responses: body.responses, times: body.times ?? {}, at: t, version }), att.id);
      }
      return finalize({ ...att, events }, useBody ? body.responses : att.responses, useBody ? body.times ?? {} : att.times, inTime ? 'submitted' : 'auto_submitted');
    });
    saveFlaggedToNotebook(user, att, body.flagged);
    audit(user, 'attempt_submit', `bài làm #${att.id}${inTime ? '' : ' (quá giờ, chốt bằng bản lưu)'}`, ip);
    return attemptView(done);
  });
  route('GET', '/api/attempts/:id/result', ['student'], ({ user, params }) => {
    const att = finalizeIfExpired(ownAttempt(user, params.id));
    if (att.status === 'in_progress') fail(403, 'Em chưa nộp bài này.');
    return attemptView(att);
  });
  route('POST', '/api/attempts/:id/retake', ['student'], ({ user, params, ip }) => {
    const old = ownAttempt(user, params.id);
    if (old.kind === 'assignment' && (old.status === 'in_progress' || !visibilityFor(old).answersVisible)) {
      fail(403, 'Chưa thể làm lại khi bài kiểm tra chưa công bố đáp án.');
    }
    const t = now();
    const rawItems = Array.isArray(old.layout) ? old.layout : (old.layout?.items || []);
    if (!rawItems.length) fail(400, 'Bài thi không có câu hỏi để làm lại.');
    const items = rawItems.map((x) => ({ qid: x.qid, type: x.type, fixedOptions: x.fixedOptions }));
    const layout = makeVariant(items, `retake-${user.id}-${old.id}-${t}`);
    const dur = old.deadline_at && old.started_at ? Math.max(10, Math.round((old.deadline_at - old.started_at) / 60000)) : 45;
    const r = db.run(
      'INSERT INTO attempts (school_id, student_id, kind, title, layout_json, started_at, deadline_at) VALUES (?,?,?,?,?,?,?)',
      user.school_id,
      user.id,
      'practice',
      `Làm lại: ${old.title.replace(/^Làm lại:\s*/, '')}`,
      JSON.stringify(layout),
      t,
      t + dur * 60000,
    );
    audit(user, 'attempt_retake', `Làm lại bài #${old.id}: ${old.title}`, ip);
    return attemptView(getAttempt(Number(r.lastInsertRowid)));
  });

  // ---- ôn giãn cách & SỔ TAY LỖI SAI CÁ NHÂN HÓA (MISTAKE NOTEBOOK & PERSONAL NOTES) ----
  route('GET', '/api/student/review/due', ['student'], ({ user }) => {
    const t = now();
    const rows = db.all('SELECT r.qid, r.box, r.due_day, r.lapses, q.topic, q.level FROM review_items r JOIN questions q ON q.id = r.qid WHERE r.student_id = ? AND r.due_day <= ? ORDER BY r.due_day, r.qid', user.id, dayKey(t));
    const total = db.get('SELECT COUNT(*) n FROM review_items WHERE student_id = ?', user.id).n;
    return {
      today: dayKey(t),
      count: rows.length,
      total,
      items: rows.map((r) => ({ qid: r.qid, topic: r.topic, level: r.level, box: r.box + 1, boxes: 5, dueDay: r.due_day, overdueDays: overdueDays({ due_day: r.due_day }, t), lapses: r.lapses })),
    };
  });

  route('GET', '/api/student/mistakes', ['student'], ({ user }) => {
    const t = now();
    const today = dayKey(t);
    // 1. Lấy tất cả câu từng làm sai trong evidence + các câu trong review_items + các câu có ghi chú cá nhân
    const wrongEv = db.all(
      `SELECT qid, error_type, COUNT(*) wrong_count, MAX(at) last_wrong_at
       FROM evidence
       WHERE student_id = ? AND correct = 0
       GROUP BY qid
       ORDER BY last_wrong_at DESC`,
      user.id,
    );
    const revRows = db.all(
      'SELECT qid, box, due_day, lapses FROM review_items WHERE student_id = ?',
      user.id,
    );
    const noteRows = db.all(
      'SELECT qid, note, tag, updated_at FROM student_notes WHERE student_id = ?',
      user.id,
    );

    const revByQ = Object.fromEntries(revRows.map((r) => [r.qid, r]));
    const noteByQ = Object.fromEntries(noteRows.map((n) => [n.qid, n]));
    const wrongByQ = Object.fromEntries(wrongEv.map((w) => [w.qid, w]));

    const allQids = [...new Set([...wrongEv.map((w) => w.qid), ...revRows.map((r) => r.qid), ...noteRows.map((n) => n.qid)])];
    const qmap = questionsMap(user.school_id, allQids);

    // Thống kê lỗi sai theo loại lỗi (error_type)
    const errorBreakdown = {};
    for (const w of wrongEv) {
      const et = w.error_type || 'concept';
      errorBreakdown[et] = (errorBreakdown[et] ?? 0) + Number(w.wrong_count || 1);
    }

    const mistakes = allQids
      .map((qid) => {
        const q = qmap[qid];
        if (!q) return null;
        const w = wrongByQ[qid];
        const r = revByQ[qid];
        const n = noteByQ[qid];
        // Câu chỉ được đánh dấu/ghi chú (chưa từng sai): không gán lỗi giả
        const flaggedOnly = !w && !r;
        const errCode = flaggedOnly ? 'flagged' : w?.error_type || 'concept';
        const errInfo = flaggedOnly
          ? { name: 'Đã đánh dấu', hint: 'Em đã đánh dấu câu này để xem lại.', action: 'Đọc lại lời giải và tự làm lại một lần.' }
          : ERROR_TYPES[errCode] || {
          name: 'Nhầm bản chất / Công thức',
          hint: 'Cần xem lại định nghĩa và điều kiện áp dụng công thức.',
          action: 'Ghi chú lại công thức trọng tâm và làm 3 câu tương tự.',
        };
        const dueDay = r?.due_day || today;
        const isDueNow = dueDay <= today;
        return {
          qid: q.id,
          type: q.type,
          stem: q.stem,
          options: q.options ?? [],
          answer: q.answer,
          explanation: q.explanation,
          topic: q.topic,
          topicName: TOPIC_BY_CODE[q.topic]?.name || q.topic || 'Chuyên đề Toán',
          grade: TOPIC_BY_CODE[q.topic]?.grade || 12,
          level: q.level,
          wrongCount: flaggedOnly ? 0 : Number(w?.wrong_count || (r ? Math.max(1, r.lapses) : 1)),
          lastWrongAt: w?.last_wrong_at || t,
          errorType: errCode,
          errorName: errInfo.name,
          errorHint: errInfo.hint,
          errorAction: errInfo.action,
          box: r ? r.box + 1 : 1,
          dueDay,
          isDue: isDueNow,
          note: n?.note || '',
          tag: n?.tag || (isDueNow ? 'important' : 'formula_trap'),
          noteUpdatedAt: n?.updated_at || null,
        };
      })
      .filter(Boolean);

    // Chuyên đề hay sai nhất
    const topicMistakeCounts = {};
    for (const m of mistakes) {
      topicMistakeCounts[m.topic] = (topicMistakeCounts[m.topic] ?? 0) + m.wrongCount;
    }
    const topWeakTopics = Object.entries(topicMistakeCounts)
      .map(([code, count]) => ({
        topic: code,
        name: TOPIC_BY_CODE[code]?.name || code,
        wrongCount: count,
      }))
      .sort((a, b) => b.wrongCount - a.wrongCount);

    return {
      mistakes,
      totalMistakes: mistakes.length,
      dueCount: mistakes.filter((m) => m.isDue).length,
      notedCount: mistakes.filter((m) => m.note.trim().length > 0).length,
      errorBreakdown,
      topWeakTopics,
    };
  });

  route('POST', '/api/student/mistakes/note', ['student'], ({ user, body }) => {
    const qid = posInt(body.qid);
    if (!qid) fail(400, 'Thiếu mã câu hỏi.');
    const q = db.get('SELECT id, status FROM questions WHERE id = ? AND school_id = ?', qid, user.school_id);
    if (!q) fail(404, 'Không tìm thấy câu hỏi.');
    if (q.status !== 'approved') {
      const seen = db.get('SELECT 1 ok FROM evidence WHERE student_id = ? AND qid = ? LIMIT 1', user.id, qid)
        || db.get('SELECT 1 ok FROM review_items WHERE student_id = ? AND qid = ? LIMIT 1', user.id, qid);
      if (!seen) fail(404, 'Không tìm thấy câu hỏi.');
    }
    const note = String(body.note ?? '').trim().slice(0, 1000);
    const validTags = ['important', 'formula_trap', 'careless', 'mastered'];
    const tag = validTags.includes(body.tag) ? body.tag : 'important';
    const updatedAt = now();
    db.run(
      `INSERT INTO student_notes (student_id, qid, school_id, note, tag, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(student_id, qid) DO UPDATE SET note = excluded.note, tag = excluded.tag, updated_at = excluded.updated_at`,
      user.id,
      qid,
      user.school_id,
      note,
      tag,
      updatedAt,
    );
    return { ok: true, qid, note, tag, updatedAt };
  });

  route('POST', '/api/student/mistakes/practice', ['student'], ({ user, body, ip }) => {
    const requestedIds = Array.isArray(body.qids) ? body.qids.map(Number).filter(Boolean) : [];
    const topic = body.topic ? String(body.topic) : null;
    const count = Math.min(20, Math.max(1, Number(body.count) || 10));

    let pool = db.all("SELECT id, type, topic, level, status FROM questions WHERE school_id = ? AND status = 'approved'", user.school_id);
    let picked = [];
    if (requestedIds.length > 0) {
      const idSet = new Set(requestedIds);
      picked = pool.filter((q) => idSet.has(q.id)).slice(0, count);
    } else {
      const wrongQids = new Set(
        db.all('SELECT DISTINCT qid FROM evidence WHERE student_id = ? AND correct = 0', user.id).map((r) => r.qid)
      );
      const revQids = new Set(
        db.all('SELECT qid FROM review_items WHERE student_id = ?', user.id).map((r) => r.qid)
      );
      let candidates = pool.filter((q) => wrongQids.has(q.id) || revQids.has(q.id));
      if (topic && topic !== 'all') {
        candidates = candidates.filter((q) => q.topic === topic);
      }
      if (!candidates.length) {
        candidates = topic && topic !== 'all' ? pool.filter((q) => q.topic === topic) : pool;
      }
      picked = candidates.slice(0, count);
    }

    if (!picked.length) fail(400, 'Chưa có câu hỏi phù hợp để tạo đề ôn lỗi sai.');
    const t = now();
    const layout = makeVariant(picked.map((q) => ({ qid: q.id, type: q.type, fixedOptions: imageOptions(q) })), `mistake-${user.id}-${t}`);
    const title = body.title ? String(body.title).slice(0, 120) : `Đề Quét Sạch Lỗi Sai Cá Nhân (${picked.length} câu)`;
    const r = db.run(
      'INSERT INTO attempts (school_id, student_id, kind, title, layout_json, started_at, deadline_at) VALUES (?,?,?,?,?,?,?)',
      user.school_id,
      user.id,
      'practice',
      title,
      JSON.stringify(layout),
      t,
      t + Math.max(15, picked.length * 3) * 60000,
    );
    audit(user, 'mistake_practice_start', `${picked.length} câu`, ip);
    return attemptView(getAttempt(Number(r.lastInsertRowid)));
  });

  route('GET', '/api/teacher/review-stats', STAFF, ({ user, query }) => {
    const t = now();
    const today = dayKey(t);
    let classIds = teacherClassIds(user);
    if (query.classId) classIds = classIds.filter((c) => c === Number(query.classId));
    const classes = classIds.map((cid) => {
      const c = db.get('SELECT id, name FROM classes WHERE id = ?', cid);
      const students = db.all("SELECT id, display_name FROM users WHERE class_id = ? AND school_id = ? AND role = 'student' AND active = 1 ORDER BY display_name", cid, user.school_id).map((s) => {
        const rows = db.all('SELECT due_day FROM review_items WHERE student_id = ?', s.id);
        const due = rows.filter((r) => isDue(r, t));
        const overdue = rows.filter((r) => r.due_day < today);
        return { id: s.id, name: s.display_name, total: rows.length, due: due.length, overdue: overdue.length, maxOverdueDays: Math.max(0, ...rows.map((r) => overdueDays(r, t))) };
      });
      return { id: c.id, name: c.name, students, studentsWithOverdue: students.filter((s) => s.overdue > 0).length, totalOverdue: students.reduce((n, s) => n + s.overdue, 0), totalDue: students.reduce((n, s) => n + s.due, 0) };
    });
    return { today, classes };
  });

  route('GET', '/api/teacher/notifications', STAFF, ({ user }) => {
    const t = now();
    const classIds = teacherClassIds(user);
    const items = [];

    if (classIds.length) {
      const ph = classIds.map(() => '?').join(',');
      const openAppeals = db.all(
        `SELECT ap.id, ap.created_at, ap.reason, u.display_name student_name, a.id assignment_id, a.title assignment_title, a.class_id, c.name class_name
         FROM score_appeals ap
         JOIN attempts att ON att.id = ap.attempt_id
         JOIN assignments a ON a.id = att.assignment_id
         JOIN classes c ON c.id = a.class_id
         JOIN users u ON u.id = ap.student_id
         WHERE a.class_id IN (${ph}) AND ap.status = 'open'
         ORDER BY ap.created_at DESC LIMIT 12`,
        ...classIds,
      );
      for (const ap of openAppeals) {
        items.push({
          id: `appeal-${ap.id}`,
          kind: 'appeal',
          priority: 'high',
          title: `Khiếu nại điểm: ${ap.student_name}`,
          subtitle: `${ap.class_name} · ${ap.assignment_title}`,
          detail: String(ap.reason || '').slice(0, 90),
          at: ap.created_at,
          href: `/lop/${ap.class_id}/ket-qua?view=appeals`,
        });
      }

      const lateRows = db.all(
        `SELECT att.id attempt_id, att.late_json, u.display_name student_name, a.id assignment_id, a.title assignment_title, a.class_id, c.name class_name
         FROM attempts att
         JOIN assignments a ON a.id = att.assignment_id
         JOIN classes c ON c.id = a.class_id
         JOIN users u ON u.id = att.student_id
         WHERE a.class_id IN (${ph}) AND att.late_json IS NOT NULL
         ORDER BY att.id DESC LIMIT 20`,
        ...classIds,
      );
      for (const lr of lateRows) {
        if (!lr.late || lr.late.accepted) continue;
        items.push({
          id: `late-${lr.attempt_id}`,
          kind: 'late',
          priority: 'high',
          title: `Bài nộp muộn chờ duyệt: ${lr.student_name}`,
          subtitle: `${lr.class_name} · ${lr.assignment_title}`,
          detail: 'Chờ giáo viên quyết định nhận bản gửi muộn',
          at: lr.late.at || t,
          href: `/lop/${lr.class_id}/ket-qua/${lr.assignment_id}`,
        });
      }

      const closingSoon = db.all(
        `SELECT a.id, a.title, a.class_id, a.close_at, a.mode, c.name class_name,
                (SELECT COUNT(*) FROM attempts att WHERE att.assignment_id = a.id AND att.status != 'in_progress') submitted,
                (SELECT COUNT(*) FROM users s WHERE s.class_id = a.class_id AND s.role = 'student' AND s.active = 1) students
         FROM assignments a
         JOIN classes c ON c.id = a.class_id
         WHERE a.class_id IN (${ph}) AND a.open_at <= ? AND a.close_at > ? AND a.close_at <= ?
         ORDER BY a.close_at ASC LIMIT 8`,
        ...classIds,
        t,
        t,
        t + 86400000,
      );
      for (const cs of closingSoon) {
        items.push({
          id: `closing-${cs.id}`,
          kind: 'closing',
          priority: 'normal',
          title: `Sắp hết hạn: ${cs.title}`,
          subtitle: `${cs.class_name} · Đã nộp ${cs.submitted}/${cs.students}`,
          detail: cs.mode === 'exam' ? 'Ca kiểm tra sắp đóng trong 24 giờ tới' : 'Bài tập sắp hết hạn nộp',
          at: cs.close_at,
          href: `/lop/${cs.class_id}/ket-qua/${cs.id}`,
        });
      }
    }

    try {
      const jobs = importJobs.list(user).filter((j) => j.state === 'completed' && !j.savedIds);
      for (const j of jobs.slice(0, 6)) {
        items.push({
          id: `import-${j.id}`,
          kind: 'import',
          priority: 'medium',
          title: `Nhập đề hoàn tất: ${j.name}`,
          subtitle: 'Đang chờ duyệt và lưu vào ngân hàng',
          detail: 'Bấm để rà soát và đưa câu hỏi vào kho',
          at: j.updatedAt || j.createdAt || t,
          href: `/nhap-de?jobId=${j.id}`,
        });
      }
    } catch {
      // ignore if import jobs unavailable
    }

    const order = { high: 0, medium: 1, normal: 2 };
    items.sort((a, b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2) || b.at - a.at);

    return {
      unreadCount: items.filter((i) => i.priority !== 'normal').length || items.length,
      totalCount: items.length,
      counts: {
        appeals: items.filter((i) => i.kind === 'appeal').length,
        late: items.filter((i) => i.kind === 'late').length,
        imports: items.filter((i) => i.kind === 'import').length,
        closing: items.filter((i) => i.kind === 'closing').length,
      },
      notifications: items,
    };
  });

  route('POST', '/api/teacher/classes/:id/remind-review', STAFF, ({ user, params, body, ip }) => {
    const classId = Number(params.id);
    if (!teacherClassIds(user).includes(classId)) fail(403, 'Bạn không phụ trách lớp này.');
    const cls = db.get('SELECT * FROM classes WHERE id = ?', classId);
    if (!cls) fail(404, 'Không tìm thấy lớp.');
    const t = now();
    const today = dayKey(t);
    const mode = body.mode === 'assign' ? 'assign' : 'announce';
    const students = db.all("SELECT id, display_name FROM users WHERE class_id = ? AND school_id = ? AND role = 'student' AND active = 1", classId, user.school_id);
    const overdueStudents = [];
    const overdueQidCounts = {};
    for (const s of students) {
      const rows = db.all('SELECT qid, due_day FROM review_items WHERE student_id = ?', s.id);
      const due = rows.filter((r) => isDue(r, t));
      const overdue = rows.filter((r) => r.due_day < today);
      if (overdue.length > 0 || due.length > 0) {
        overdueStudents.push({ id: s.id, name: s.display_name, due: due.length, overdue: overdue.length });
        for (const r of (overdue.length ? overdue : due)) {
          overdueQidCounts[r.qid] = (overdueQidCounts[r.qid] ?? 0) + 1;
        }
      }
    }

    if (mode === 'assign') {
      const targetIds = Array.isArray(body.studentIds) && body.studentIds.length
        ? body.studentIds.map(Number).filter((sid) => students.some((s) => s.id === sid))
        : overdueStudents.map((s) => s.id);
      if (!targetIds.length) fail(400, 'Hiện chưa có học sinh nào có câu đến hạn hoặc quá hạn ôn tập.');
      const rankedQids = Object.entries(overdueQidCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([qid]) => Number(qid));
      const approvedRows = rankedQids.length
        ? db.all(
            `SELECT id, type FROM questions WHERE school_id = ? AND status = 'approved' AND id IN (${rankedQids.map(() => '?').join(',')})`,
            user.school_id,
            ...rankedQids,
          )
        : [];
      let picked = approvedRows.slice(0, 8);
      if (picked.length < 5) {
        const extra = db.all("SELECT id, type FROM questions WHERE school_id = ? AND status = 'approved' LIMIT 8", user.school_id);
        const seen = new Set(picked.map((x) => x.id));
        for (const q of extra) {
          if (!seen.has(q.id)) {
            picked.push(q);
            seen.add(q.id);
          }
          if (picked.length >= 6) break;
        }
      }
      if (!picked.length) fail(400, 'Ngân hàng chưa đủ câu hỏi đã duyệt để tạo phiếu ôn.');
      const title = `Phiếu ôn lỗ hổng định kỳ (${cls.name})`;
      const rExam = db.run(
        'INSERT INTO exams (school_id, title, blueprint_json, items_json, duration_min, variants_json, snapshot_json, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        user.school_id,
        title,
        JSON.stringify([]),
        JSON.stringify(picked.map((q) => ({ qid: q.id, type: q.type }))),
        20,
        JSON.stringify([{ code: '101' }]),
        JSON.stringify(questionsMap(user.school_id, picked.map((q) => q.id))),
        user.id,
        t,
      );
      const examId = Number(rExam.lastInsertRowid);
      const rAsg = db.run(
        'INSERT INTO assignments (school_id, exam_id, class_id, mode, title, open_at, close_at, duration_min, show_result, created_by, created_at, variant_mode, variant_map_json, target_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        user.school_id,
        examId,
        classId,
        'homework',
        title,
        t,
        t + 5 * 86400000,
        20,
        'after_submit',
        user.id,
        t,
        'random',
        '{}',
        JSON.stringify(targetIds),
      );
      audit(user, 'review_remedial_assign', `Lớp ${cls.name}: ${targetIds.length} HS`, ip, { target: `class:${classId}` });
      return { ok: true, mode: 'assign', assignmentId: Number(rAsg.lastInsertRowid), targetCount: targetIds.length, questionCount: picked.length, title };
    }

    const totalDue = overdueStudents.reduce((s, x) => s + x.due, 0);
    const annTitle = 'Nhắc lịch ôn tập Sổ tay lỗi sai';
    const annBody = overdueStudents.length
      ? `Hiện có ${overdueStudents.length} bạn đang có tổng cộng ${totalDue} câu đến hạn ôn lại. Các em mở mục "Ôn tập / Sổ tay lỗi sai" để hoàn thành trong hôm nay nhé.`
      : 'Các em nhớ kiểm tra mục "Ôn tập / Sổ tay lỗi sai" hằng ngày để giữ mạch ghi nhớ kiến thức nhé.';
    const ann = db.run(
      'INSERT INTO class_announcements (school_id, class_id, title, body, pinned, created_by, created_at) VALUES (?,?,?,?,?,?,?)',
      user.school_id,
      classId,
      annTitle,
      annBody,
      1,
      user.id,
      t,
    );
    audit(user, 'review_remind_announce', `Lớp ${cls.name}`, ip, { target: `class:${classId}` });
    return { ok: true, mode: 'announce', announcementId: Number(ann.lastInsertRowid), remindedCount: overdueStudents.length };
  });

  // ---- luyện tập thích ứng ----
  route('POST', '/api/practice/start', ['student'], ({ user, body, ip }) => {
    const mode = body.mode ?? 'weak';
    const count = Math.min(20, Math.max(3, Number(body.count) || 8));
    const pool = db.all("SELECT id, type, topic, level, status FROM questions WHERE school_id = ? AND status = 'approved'", user.school_id);
    const mastery = studentMastery(user.id);
    const hist = {};
    for (const e of db.all('SELECT qid, correct, at FROM evidence WHERE student_id = ? ORDER BY at', user.id)) hist[e.qid] = { lastCorrect: !!e.correct, lastAt: e.at };
    const dueRows = db.all('SELECT qid FROM review_items WHERE student_id = ? AND due_day <= ?', user.id, dayKey(now()));
    const due = new Set(dueRows.map((r) => r.qid));
    let topics;
    let title;
    if (mode === 'speed_drill') {
      const mcqs = pool.filter((q) => q.type === 'mcq');
      const candidates = mcqs.length >= count ? mcqs : pool;
      topics = [...new Set(candidates.map((q) => q.topic))];
      title = `Luyện phản xạ tốc độ 15 phút (${count} câu)`;
    } else if (mode === 'review') {
      if (!due.size) fail(400, 'Chưa có câu nào đến hạn ôn. Quay lại sau nhé.');
      const dueQs = pool.filter((q) => due.has(q.id));
      topics = [...new Set(dueQs.map((q) => q.topic))];
      title = 'Ôn lại câu từng sai';
    } else if (mode === 'topic') {
      topics = (Array.isArray(body.topics) ? body.topics : []).filter((t) => TOPIC_BY_CODE[t]);
      if (!topics.length) fail(400, 'Chọn ít nhất một chuyên đề.');
      title = topics.length === 1 ? `Luyện: ${TOPIC_BY_CODE[topics[0]].name}` : `Luyện ${topics.length} chuyên đề`;
    } else {
      const recs = recommend(mastery, {}, 2);
      topics = recs.map((r) => r.topic);
      if (!topics.length) {
        // Chưa có dữ liệu: lấy chuyên đề có nhiều câu nhất của khối.
        const grade = db.get('SELECT grade FROM classes WHERE id = ?', user.class_id)?.grade ?? 12;
        const cnt = {};
        for (const q of pool) if (TOPIC_BY_CODE[q.topic]?.grade === grade) cnt[q.topic] = (cnt[q.topic] ?? 0) + 1;
        topics = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
      }
      title = 'Luyện chuyên đề cần cải thiện';
    }
    if (mode === 'mock') {
      // Thi thử đúng cấu trúc đề tốt nghiệp: 12 trắc nghiệm, 4 đúng/sai, 6 trả lời ngắn, 90 phút, không xem đáp án giữa chừng.
      const g = generateExam(pool, { ...OFFICIAL_BLUEPRINT, seed: `mock-${user.id}-${now()}` });
      const need = OFFICIAL_BLUEPRINT.counts;
      const got = { mcq: 0, tf: 0, short: 0 };
      for (const it of g.items) got[it.type]++;
      if (got.mcq < need.mcq || got.tf < need.tf || got.short < need.short) {
        fail(400, `Ngân hàng chưa đủ câu đã duyệt để ghép đề thi thử (cần ${need.mcq} trắc nghiệm, ${need.tf} đúng/sai, ${need.short} trả lời ngắn). Báo giáo viên bổ sung.`);
      }
      const byId = Object.fromEntries(pool.map((q) => [q.id, q]));
      const mockLayout = makeVariant(g.items.map((it) => ({ qid: it.qid, type: it.type, fixedOptions: imageOptions(byId[it.qid] ?? it) })), `mock-${user.id}-${now()}`);
      const mr = db.run(
        "INSERT INTO attempts (school_id, student_id, kind, title, layout_json, started_at, deadline_at, mode) VALUES (?,?,?,?,?,?,?,'mock')",
        user.school_id, user.id, 'practice', 'Thi thử tốt nghiệp THPT (mô phỏng)', JSON.stringify(mockLayout), now(), now() + OFFICIAL_BLUEPRINT.durationMin * 60000,
      );
      audit(user, 'practice_start', 'mock: thi thử THPT', ip);
      return attemptView(getAttempt(Number(mr.lastInsertRowid)));
    }
    let picked = selectPractice({ pool, topics, mastery, history: hist, due, count, seed: `${user.id}-${now()}`, now: now() });
    if (mode === 'speed_drill') {
      const mcqs = pool.filter((q) => q.type === 'mcq');
      picked = shuffleArray(mcqs.length >= count ? mcqs : pool).slice(0, count);
    } else if (mode === 'review') {
      picked = pool.filter((q) => due.has(q.id)).slice(0, count);
    }
    if (!picked.length) fail(400, 'Ngân hàng chưa có câu đã duyệt cho chuyên đề này. Báo giáo viên bổ sung.');
    const layout = makeVariant(picked.map((q) => ({ qid: q.id, type: q.type, fixedOptions: imageOptions(q) })), `p-${user.id}-${now()}`);
    const deadline = mode === 'speed_drill' ? now() + 15 * 60000 : null;
    const r = db.run('INSERT INTO attempts (school_id, student_id, kind, title, layout_json, started_at, deadline_at) VALUES (?,?,?,?,?,?,?)', user.school_id, user.id, 'practice', title, JSON.stringify(layout), now(), deadline);
    audit(user, 'practice_start', `${mode}: ${topics.join(',')}`, ip);
    return attemptView(getAttempt(Number(r.lastInsertRowid)));
  });
  // ---- MỤC TIÊU ĐIỂM, DỰ BÁO ĐIỂM & KẾ HOẠCH HÔM NAY (không dùng AI: thống kê trên bài đã chấm) ----
  function goalPlan(user) {
    const t = now();
    const target = db.get('SELECT target_score FROM users WHERE id = ?', user.id)?.target_score ?? null;

    // Dự báo: các bài đã nộp, đã công bố điểm, đủ dài (≥ 10 câu); bài gần đây nặng hơn.
    const rows = db.all(
      "SELECT id FROM attempts WHERE student_id = ? AND status != 'in_progress' AND score10 IS NOT NULL ORDER BY COALESCE(submitted_at, started_at) DESC LIMIT 12",
      user.id,
    );
    const graded = [];
    for (const { id } of rows) {
      const att = getAttempt(id);
      if (!att || !visibilityFor(att).scoreVisible) continue;
      const n = Array.isArray(att.layout) ? att.layout.length : 0;
      if (n < 10) continue;
      // Bài bỏ trống quá nửa (nộp vội, bỏ dở) không phản ánh năng lực: không tính vào dự báo
      const resp = att.responses ?? {};
      const answered = att.layout.filter((it) => {
        const v = resp[it.qid];
        return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.every((x) => x === null || x === undefined));
      }).length;
      if (answered < n / 2) continue;
      graded.push({ score: Number(att.score10), at: att.submitted_at ?? att.started_at, layout: att.layout });
      if (graded.length >= 6) break;
    }
    let forecast = null;
    if (graded.length >= 2) {
      let ws = 0, s = 0;
      graded.forEach((g, i) => { const w = Math.pow(0.8, i); ws += w; s += w * g.score; });
      const mean = s / ws;
      const sd = Math.sqrt(graded.reduce((acc, g) => acc + (g.score - mean) ** 2, 0) / graded.length);
      const spread = Math.max(0.5, Math.min(1.5, sd));
      const round = (x) => Math.round(Math.max(0, Math.min(10, x)) * 4) / 4;
      forecast = { score: round(mean), low: round(mean - spread), high: round(mean + spread), basis: graded.length };
    }

    // Tỉ trọng chuyên đề trong đề: lấy từ các bài đã làm; chưa có thì chia đều các chuyên đề lớp 12.
    const share = {};
    let total = 0;
    for (const g of graded) for (const it of g.layout) {
      const q = db.get('SELECT topic FROM questions WHERE id = ?', it.qid);
      if (q?.topic) { share[q.topic] = (share[q.topic] ?? 0) + 1; total++; }
    }
    if (!total) {
      const g12 = TOPICS.filter((x) => x.grade === 12);
      for (const x of g12) share[x.code] = 1;
      total = g12.length;
    }
    const mastery = studentMastery(user.id);
    const gainTopics = Object.values(mastery)
      .filter((m) => m.value < 0.75 && share[m.topic])
      .map((m) => {
        const sh = share[m.topic] / total;
        return { topic: m.topic, name: m.name, mastery: m.value, share: Math.round(sh * 1000) / 1000, gain: Math.round(sh * 10 * (0.85 - m.value) * 100) / 100 };
      })
      .filter((x) => x.gain > 0.05)
      .sort((x, y) => y.gain - x.gain)
      .slice(0, 3);

    // Kế hoạch hôm nay: ôn câu đến hạn → luyện chuyên đề gỡ điểm → giữ chỉ tiêu câu mỗi ngày.
    const dueCount = db.get('SELECT COUNT(*) n FROM review_items WHERE student_id = ? AND due_day <= ?', user.id, dayKey(t)).n;
    const today = db.get('SELECT questions FROM activity WHERE student_id = ? AND day = ?', user.id, dayKey(t))?.questions ?? 0;
    const dailyGoal = 10;
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const day = dayKey(t - i * 86400000);
      week.push({ day, questions: db.get('SELECT questions FROM activity WHERE student_id = ? AND day = ?', user.id, day)?.questions ?? 0 });
    }
    const plan = [];
    if (dueCount > 0) plan.push({ kind: 'review', label: `Ôn ${dueCount} câu sai đến hạn`, count: Math.min(10, dueCount) });
    if (gainTopics[0]) plan.push({ kind: 'topic', label: `Luyện 8 câu: ${gainTopics[0].name}`, topic: gainTopics[0].topic, count: 8 });
    plan.push({ kind: 'daily', label: `Làm đủ ${dailyGoal} câu hôm nay`, done: today >= dailyGoal, progress: Math.min(today, dailyGoal), goal: dailyGoal });

    return { target, forecast, gainTopics, plan, week, dailyGoal };
  }
  route('GET', '/api/student/goal', ['student'], ({ user }) => goalPlan(user));
  route('PUT', '/api/student/goal', ['student'], ({ user, body }) => {
    const v = body?.target === null ? null : Number(body?.target);
    if (v !== null && !(Number.isFinite(v) && v >= 1 && v <= 10)) fail(400, 'Mục tiêu điểm phải từ 1 đến 10.');
    db.run('UPDATE users SET target_score = ? WHERE id = ?', v === null ? null : Math.round(v * 4) / 4, user.id);
    return goalPlan(user);
  });

  route('POST', '/api/practice/:id/check', ['student'], ({ user, params, body }) => {
    const att = ownAttempt(user, params.id);
    if (att.kind !== 'practice') fail(400, 'Chỉ bài luyện tập mới xem đáp án từng câu.');
    if (att.status !== 'in_progress') fail(400, 'Bài luyện đã kết thúc.');
    if (att.mode === 'mock') fail(400, 'Bài thi thử không xem đáp án giữa chừng. Nộp bài để xem kết quả.');
    const qid = Number(body.qid);
    const it = att.layout.find((x) => x.qid === qid);
    if (!it) fail(400, 'Câu không thuộc bài này.');
    const q = attemptQuestions(att)[qid];
    let checked = att.checked ?? {};
    if (!checked[qid]) {
      const resp = toOriginalResponse(it, body.response);
      const res = db.tx(() => {
        const { g, d } = recordEvidence(att, q, resp, Number(body.seconds) || undefined);
        bumpActivity(user.id, 1, g.correct ? 1 : 0, g.correct ? 10 : 2);
        return { g, d };
      });
      checked = { ...checked, [qid]: { points: res.g.points, max: res.g.max, correct: res.g.correct, parts: res.g.parts ?? null, diagnosis: res.d } };
      const responses = { ...att.responses, [qid]: body.response };
      db.run('UPDATE attempts SET checked_json = ?, responses_json = ? WHERE id = ?', JSON.stringify(checked), JSON.stringify(responses), att.id);
    }
    const correctAnswer = q.type === 'mcq' ? (it.perm ?? [0, 1, 2, 3]).indexOf(q.answer) : q.answer;
    return { ...checked[qid], correctAnswer, explanation: q.explanation, source: q.source };
  });
  route('POST', '/api/practice/:id/finish', ['student'], ({ user, params, body }) => {
    const att = ownAttempt(user, params.id);
    if (att.kind !== 'practice') fail(400, 'Không phải bài luyện tập.');
    if (att.status !== 'in_progress') return attemptView(att);
    const done = db.tx(() => finalize(att, { ...att.responses, ...(body.responses ?? {}) }, body.times ?? att.times, 'submitted'));
    saveFlaggedToNotebook(user, att, body.flagged);
    return attemptView(done);
  });

  // ---- DÒNG LUYỆN TẬP VÔ HẠN (ENDLESS STREAM) & BẢN ĐỒ TRI THỨC VÔ CỰC ----
  route('POST', '/api/student/infinite-stream/next', ['student'], ({ user, body }) => {
    const mode = body.mode ?? 'adaptive';
    const grade = body.grade ? Number(body.grade) : null;
    const topic = body.topic ? String(body.topic) : null;
    const excludeIds = new Set((Array.isArray(body.excludeIds) ? body.excludeIds : []).map(Number));

    const allApproved = db.all(
      "SELECT id, type, topic, level, status, stem, options_json, answer_json, explanation, source FROM questions WHERE school_id = ? AND status = 'approved'",
      user.school_id
    ).map(toQuestion);

    if (!allApproved.length) fail(404, 'Ngân hàng trường chưa có câu hỏi nào được duyệt.');

    let candidates = allApproved.filter((q) => !excludeIds.has(q.id));
    if (!candidates.length) candidates = allApproved; // đã làm hết thì lặp lại

    if (grade) {
      candidates = candidates.filter((q) => TOPIC_BY_CODE[q.topic]?.grade === grade);
    }
    if (topic && topic !== 'all') {
      candidates = candidates.filter((q) => q.topic === topic);
    }
    if (mode === 'weak') {
      const mastery = studentMastery(user.id);
      const weakTopics = new Set(Object.values(mastery).filter((m) => m.value < 0.6).map((m) => m.topic));
      const weakQs = candidates.filter((q) => weakTopics.has(q.topic));
      if (weakQs.length) candidates = weakQs;
    }

    if (!candidates.length) candidates = allApproved;
    // Chọn ngẫu nhiên một câu
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    if (!chosen) fail(404, 'Không tìm thấy câu hỏi phù hợp với bộ lọc.');

    return {
      question: {
        id: chosen.id,
        type: chosen.type,
        stem: chosen.stem,
        options: chosen.type !== 'short' ? chosen.options : [],
        topic: chosen.topic,
        topicName: TOPIC_BY_CODE[chosen.topic]?.name || chosen.topic || 'Toán THPT',
        level: chosen.level,
        grade: TOPIC_BY_CODE[chosen.topic]?.grade || 12,
      },
    };
  });

  route('POST', '/api/student/infinite-stream/check', ['student'], ({ user, body }) => {
    const qid = posInt(body.qid);
    const row = qid ? db.get("SELECT * FROM questions WHERE id = ? AND school_id = ? AND status = 'approved'", qid, user.school_id) : null;
    if (!row) fail(404, 'Không tìm thấy câu hỏi.');
    const q = toQuestion(row);
    const resp = body.response;
    const seconds = Number(body.seconds) || 15;

    const g = gradeQuestion(q, resp);
    const d = diagnoseItem(q, resp, seconds);

    db.tx(() => {
      db.run(
        'INSERT INTO evidence (school_id, student_id, qid, topic, level, score, correct, error_type, at) VALUES (?,?,?,?,?,?,?,?,?)',
        user.school_id,
        user.id,
        q.id,
        q.topic ?? null,
        q.level,
        g.points / (g.max || 1),
        g.correct ? 1 : 0,
        d?.error ?? null,
        now(),
      );
      bumpActivity(user.id, 1, g.correct ? 1 : 0, g.correct ? 15 : 3);
    });

    const freshUser = db.get('SELECT xp, streak, last_active_day FROM users WHERE id = ?', user.id);
    const today = db.get('SELECT questions, correct FROM activity WHERE student_id = ? AND day = ?', user.id, dayKey(now())) ?? { questions: 0, correct: 0 };

    return {
      correct: g.correct,
      points: g.points,
      max: g.max,
      parts: g.parts ?? null,
      correctAnswer: q.answer,
      explanation: q.explanation,
      diagnosis: d,
      stats: {
        xp: freshUser.xp,
        streak: freshUser.streak,
        todayQuestions: today.questions,
        todayCorrect: today.correct,
      },
    };
  });

  route('GET', '/api/student/knowledge-map', ['student'], ({ user }) => {
    const masteryMap = studentMastery(user.id);
    const qCounts = db.all(
      "SELECT topic, COUNT(*) count FROM questions WHERE school_id = ? AND status = 'approved' GROUP BY topic",
      user.school_id
    );
    const countsByTopic = Object.fromEntries(qCounts.map((r) => [r.topic, r.count]));

    const nodes = TOPICS.map((t) => {
      const m = masteryMap[t.code];
      const val = m ? Math.round(m.value * 100) : null;
      let status = 'unattempted';
      if (val !== null) {
        if (val >= 80) status = 'mastered';
        else if (val >= 50) status = 'learning';
        else status = 'weak';
      }
      return {
        code: t.code,
        name: t.name,
        grade: t.grade,
        questionCount: countsByTopic[t.code] || 0,
        mastery: val,
        status,
        lastAt: m?.lastAt || null,
      };
    });

    const edges = [
      { from: 'T10.HAMBAC2', to: 'T11.DAOHAM' },
      { from: 'T11.DAOHAM', to: 'T12.KHAOSAT' },
      { from: 'T12.KHAOSAT', to: 'T12.NGUYENHAM' },
      { from: 'T10.VECTO', to: 'T11.SONGSONG' },
      { from: 'T11.SONGSONG', to: 'T11.VUONGGOC' },
      { from: 'T11.VUONGGOC', to: 'T12.VECTOKG' },
      { from: 'T12.VECTOKG', to: 'T12.OXYZ' },
      { from: 'T10.TOHOP', to: 'T11.XACSUAT' },
      { from: 'T11.XACSUAT', to: 'T12.XSDK' },
      { from: 'T10.THONGKE', to: 'T11.GHEPNHOM' },
      { from: 'T11.GHEPNHOM', to: 'T12.PHANTAN' },
      { from: 'T10.MENHDE', to: 'T10.TOHOP' },
      { from: 'T10.TOADOOXY', to: 'T12.OXYZ' },
      { from: 'T11.GIOIHAN', to: 'T11.DAOHAM' },
      { from: 'T11.DAYSO', to: 'T11.GIOIHAN' },
    ];

    return { nodes, edges };
  });

  // ---- quản lý trường ----
  route('GET', '/api/admin/overview', ['admin'], ({ user }) => {
    const sid = user.school_id;
    sweepExpired('AND school_id = ?', sid);
    const since = now() - 90 * 86400000;
    const classes = db.all(
      `SELECT c.id, c.name, c.grade, u.display_name teacher, c.teacher_id,
        (SELECT COUNT(*) FROM users s WHERE s.class_id = c.id AND s.role = 'student' AND s.active = 1) students,
        (SELECT COUNT(*) FROM assignments a WHERE a.class_id = c.id AND a.open_at > ?) assignments,
        (SELECT COUNT(*) FROM attempts t JOIN assignments a ON a.id = t.assignment_id WHERE a.class_id = c.id AND t.status != 'in_progress' AND a.open_at > ?) submitted,
        (SELECT AVG(t.score10) FROM attempts t JOIN assignments a ON a.id = t.assignment_id WHERE a.class_id = c.id AND t.status != 'in_progress' AND a.open_at > ?) avg
       FROM classes c LEFT JOIN users u ON u.id = c.teacher_id WHERE c.school_id = ? ORDER BY c.grade DESC, c.name`,
      since,
      since,
      since,
      sid,
    ).map((c) => ({ ...c, participation: c.students && c.assignments ? c.submitted / (c.students * c.assignments) : null }));
    const grades = {};
    for (const c of classes) {
      const g = (grades[c.grade] ??= { grade: c.grade, classes: 0, students: 0, sum: 0, n: 0 });
      g.classes++;
      g.students += c.students;
      if (c.avg !== null) {
        g.sum += c.avg * c.submitted;
        g.n += c.submitted;
      }
    }
    const teachers = db.all(
      `SELECT u.id, u.display_name name,
        (SELECT COUNT(*) FROM questions q WHERE q.approved_by = u.id) approved,
        (SELECT COUNT(*) FROM exams e WHERE e.created_by = u.id) exams,
        (SELECT COUNT(*) FROM assignments a WHERE a.created_by = u.id) assignments
       FROM users u WHERE u.school_id = ? AND u.role = 'teacher' AND u.active = 1 ORDER BY u.display_name`,
      sid,
    ).map((t) => {
      const cs = classes.filter((c) => c.teacher_id === t.id && c.avg !== null);
      const n = cs.reduce((s, c) => s + c.submitted, 0);
      return { ...t, classes: classes.filter((c) => c.teacher_id === t.id).map((c) => c.name), avg: n ? cs.reduce((s, c) => s + c.avg * c.submitted, 0) / n : null };
    });
    const bank = db.all("SELECT source, status, COUNT(*) n FROM questions WHERE school_id = ? AND status != 'archived' GROUP BY source, status", sid);
    const weakTopics = Object.values(
      computeMastery(db.all('SELECT topic, level, score, at FROM evidence WHERE school_id = ? AND topic IS NOT NULL AND at > ?', sid, since), now()),
    ).sort((a, b) => a.value - b.value).slice(0, 5);
    return { classes, grades: Object.values(grades).sort((a, b) => b.grade - a.grade).map((g) => ({ ...g, avg: g.n ? g.sum / g.n : null })), teachers, bank, weakTopics };
  });
  route('GET', '/api/admin/users', ['admin'], ({ user }) => ({
    users: db.all('SELECT u.id, u.role, u.username, u.display_name, u.class_id, c.name class_name, u.active, u.created_at FROM users u LEFT JOIN classes c ON c.id = u.class_id WHERE u.school_id = ? ORDER BY u.role, c.name, u.display_name', user.school_id),
    classes: db.all('SELECT c.id, c.name, c.grade, c.teacher_id, u.display_name teacher FROM classes c LEFT JOIN users u ON u.id = c.teacher_id WHERE c.school_id = ? ORDER BY c.grade DESC, c.name', user.school_id),
  }));
  route('POST', '/api/admin/users', ['admin'], ({ user, body, ip }) => {
    const role = body.role;
    if (!['teacher', 'student', 'admin'].includes(role)) fail(400, 'Chọn vai trò.');
    const displayName = String(body.displayName ?? '').trim();
    if (!displayName) fail(400, 'Nhập tên hiển thị.');
    const username = String(body.username ?? '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) fail(400, 'Tên đăng nhập 3–32 ký tự: chữ không dấu, số, dấu chấm, gạch.');
    if (db.get('SELECT id FROM users WHERE username = ?', username)) fail(400, 'Tên đăng nhập đã có người dùng. Chọn tên khác.');
    let classId = null;
    if (role === 'student') {
      classId = Number(body.classId);
      if (!db.get('SELECT id FROM classes WHERE id = ? AND school_id = ?', classId, user.school_id)) fail(400, 'Chọn lớp cho học sinh.');
    }
    const pw = tempPassword();
    const r = db.run('INSERT INTO users (school_id, role, username, display_name, pass_hash, class_id, created_at) VALUES (?,?,?,?,?,?,?)', user.school_id, role, username, displayName, hashPassword(pw), classId, now());
    audit(user, 'user_create', `${role} ${username}`, ip);
    return { id: Number(r.lastInsertRowid), tempPassword: pw };
  });
  route('POST', '/api/admin/users/:id/reset-password', ['admin'], ({ user, params, body, ip }) => {
    const u = db.get('SELECT id, username FROM users WHERE id = ? AND school_id = ?', params.id, user.school_id);
    if (!u) fail(404, 'Không tìm thấy người dùng.');
    const pw = tempPassword();
    db.run('UPDATE users SET pass_hash = ? WHERE id = ?', hashPassword(pw), u.id);
    db.run('DELETE FROM sessions WHERE user_id = ?', u.id);
    audit(user, 'password_reset', u.username, ip, { target: `user:${u.id}`, reason: body?.reason });
    return { tempPassword: pw };
  });
  route('POST', '/api/admin/classes', ['admin'], ({ user, body, ip }) => {
    const name = String(body.name ?? '').trim();
    const grade = Number(body.grade);
    if (!name || ![10, 11, 12].includes(grade)) fail(400, 'Nhập tên lớp và chọn khối 10, 11 hoặc 12.');
    let teacherId = body.teacherId ? Number(body.teacherId) : null;
    if (teacherId && !db.get("SELECT id FROM users WHERE id = ? AND school_id = ? AND role = 'teacher'", teacherId, user.school_id)) fail(400, 'Giáo viên không thuộc trường.');
    const r = db.run('INSERT INTO classes (school_id, name, grade, teacher_id) VALUES (?,?,?,?)', user.school_id, name, grade, teacherId);
    audit(user, 'class_create', name, ip);
    return { id: Number(r.lastInsertRowid) };
  });
  route('PUT', '/api/admin/classes/:id', ['admin'], ({ user, params, body, ip }) => {
    const c = db.get('SELECT * FROM classes WHERE id = ? AND school_id = ?', params.id, user.school_id);
    if (!c) fail(404, 'Không tìm thấy lớp.');
    const teacherId = body.teacherId ? Number(body.teacherId) : null;
    if (teacherId && !db.get("SELECT id FROM users WHERE id = ? AND school_id = ? AND role = 'teacher'", teacherId, user.school_id)) fail(400, 'Giáo viên không thuộc trường.');
    db.run('UPDATE classes SET teacher_id = ? WHERE id = ?', teacherId, c.id);
    audit(user, 'class_assign_teacher', `${c.name} → #${teacherId}`, ip);
    return { ok: true };
  });
  route('GET', '/api/admin/audit', ['admin'], ({ user, query }) => {
    const where = ['l.school_id = ?'];
    const p = [user.school_id];
    if (query.action) (where.push('l.action = ?'), p.push(query.action));
    if (query.outcome) (where.push('l.outcome = ?'), p.push(query.outcome));
    if (query.beforeId) (where.push('l.id < ?'), p.push(Number(query.beforeId)));
    return {
      entries: db.all(
        `SELECT l.id, l.action, l.detail, l.ip, l.at, l.target, l.old_json, l.new_json, l.reason, l.outcome, l.user_id, u.display_name, u.role FROM audit_log l LEFT JOIN users u ON u.id = l.user_id WHERE ${where.join(' AND ')} ORDER BY l.id DESC LIMIT ?`,
        ...p,
        Math.min(500, Number(query.limit) || 200),
      ),
    };
  });

  // ---- nhập học sinh hàng loạt ----
  function makeUsername(name, prefix) {
    const parts = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
    const base = `${prefix}.${parts.length ? parts[parts.length - 1] + (parts.length > 1 ? '.' + parts.slice(0, -1).map((p) => p[0]).join('') : '') : 'user'}`.slice(0, 28);
    let u = base;
    for (let i = 2; db.get('SELECT id FROM users WHERE username = ?', u); i++) u = `${base}${i}`;
    return u;
  }
  route('POST', '/api/admin/users/bulk', ['admin'], ({ user, body, ip }) => {
    // rows: [{ name, className, role? }] — lớp chưa có thì tạo, khối lấy từ tên lớp (10/11/12).
    const rows = (Array.isArray(body.rows) ? body.rows : []).map((r) => ({ name: String(r.name ?? '').trim(), className: String(r.className ?? '').trim().toUpperCase(), role: r.role === 'teacher' ? 'teacher' : 'student' })).filter((r) => r.name);
    if (!rows.length) fail(400, 'Danh sách trống. Dán mỗi dòng một tên, có thể kèm lớp sau dấu phẩy hoặc tab.');
    if (rows.length > 2000) fail(400, 'Mỗi lần nhập tối đa 2000 người.');
    for (const r of rows) {
      if (r.role === 'student' && !r.className && !body.classId) fail(400, `Chưa có lớp cho "${r.name}". Chọn lớp chung hoặc ghi lớp sau tên.`);
      if (r.className && !/^(10|11|12)/.test(r.className)) fail(400, `Lớp "${r.className}" phải bắt đầu bằng khối 10, 11 hoặc 12 (ví dụ 12A1).`);
    }
    const created = db.tx(() =>
      rows.map((r) => {
        let classId = null;
        let className = null;
        if (r.role === 'student') {
          if (r.className) {
            let c = db.get('SELECT id, name FROM classes WHERE school_id = ? AND upper(name) = ?', user.school_id, r.className);
            if (!c) c = { id: Number(db.run('INSERT INTO classes (school_id, name, grade) VALUES (?,?,?)', user.school_id, r.className, Number(r.className.slice(0, 2))).lastInsertRowid), name: r.className };
            classId = c.id;
            className = c.name;
          } else {
            const c = db.get('SELECT id, name FROM classes WHERE id = ? AND school_id = ?', Number(body.classId), user.school_id);
            if (!c) fail(400, 'Lớp đã chọn không thuộc trường.');
            classId = c.id;
            className = c.name;
          }
        }
        const username = makeUsername(r.name, r.role === 'teacher' ? 'gv' : 'hs');
        const pw = tempPassword();
        db.run('INSERT INTO users (school_id, role, username, display_name, pass_hash, class_id, created_at) VALUES (?,?,?,?,?,?,?)', user.school_id, r.role, username, r.name, hashPassword(pw), classId, now());
        return { name: r.name, role: r.role, className, username, tempPassword: pw };
      }),
    );
    audit(user, 'user_bulk_create', `${created.length} tài khoản`, ip);
    return { created };
  });

  // ---- sao lưu ----
  function backupNow(reason = 'auto') {
    if (!config.backupDir) throw new HttpError(400, 'Chưa cấu hình thư mục sao lưu.');
    fs.mkdirSync(config.backupDir, { recursive: true });
    const stamp = new Date(now() + 7 * 3600000).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
    const file = path.join(config.backupDir, `smartexam-${stamp}-${reason}.db`);
    if (fs.existsSync(file)) fs.rmSync(file);
    db.raw.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const all = fs.readdirSync(config.backupDir).filter((f) => /^smartexam-.*\.db$/.test(f)).sort();
    for (const old of all.slice(0, Math.max(0, all.length - (config.keepBackups ?? 14)))) fs.rmSync(path.join(config.backupDir, old));
    return file;
  }
  route('GET', '/api/admin/backups', ['admin'], () => {
    if (!config.backupDir || !fs.existsSync(config.backupDir)) return { backups: [], dir: config.backupDir ?? null };
    return {
      dir: config.backupDir,
      backups: fs
        .readdirSync(config.backupDir)
        .filter((f) => /^smartexam-.*\.db$/.test(f))
        .sort()
        .reverse()
        .map((f) => ({ name: f, size: fs.statSync(path.join(config.backupDir, f)).size, at: fs.statSync(path.join(config.backupDir, f)).mtimeMs })),
    };
  });
  route('POST', '/api/admin/backups', ['admin'], ({ user, ip }) => {
    const file = backupNow('tay');
    audit(user, 'backup', path.basename(file), ip);
    return { name: path.basename(file) };
  });

  // ---- thiết lập lần đầu ----
  // Trang đăng nhập chỉ hiện tài khoản mẫu khi máy đang chạy trường mẫu.
  route('GET', '/api/demo', null, () => {
    const isSample = !!db.get("SELECT id FROM users WHERE username = 'hs.an.nm' AND school_id IN (SELECT id FROM schools WHERE sample = 1)");
    return {
      sample: isSample,
      accounts: isSample
        ? [
            { u: 'hs.an.nm', role: 'student', who: 'Nguyễn Minh An — Lớp 12A1' },
            { u: 'gv.lan', role: 'teacher', who: 'Cô Nguyễn Thị Lan — GV Toán 12A1' },
            { u: 'quanly', role: 'admin', who: 'Ban Giám hiệu — Quản lý trường' },
          ]
        : [],
    };
  });
  route('GET', '/api/setup', null, () => ({ needsSetup: !db.get('SELECT id FROM schools LIMIT 1') }));
  route('POST', '/api/setup', null, ({ req, body, ip, setCookie }) => {
    if (db.get('SELECT id FROM schools LIMIT 1')) fail(409, 'Trường đã được thiết lập. Đăng nhập bằng tài khoản quản lý.');
    let adminId;
    if (body.mode === 'sample') {
      seedSample({ db, now, internals: { finalize, getAttempt, withClock: (fn, b) => { const prev = clockFn; clockFn = fn; try { return b(); } finally { clockFn = prev; } } } });
      adminId = db.get("SELECT id FROM users WHERE username = 'quanly'").id;
    } else {
      const schoolName = String(body.schoolName ?? '').trim();
      const adminName = String(body.adminName ?? '').trim();
      const username = String(body.username ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      if (!schoolName || !adminName) fail(400, 'Nhập tên trường và tên người quản lý.');
      if (!/^[a-z0-9._-]{3,32}$/.test(username)) fail(400, 'Tên đăng nhập 3–32 ký tự: chữ không dấu, số, dấu chấm, gạch.');
      if (password.length < 8) fail(400, 'Mật khẩu quản lý cần ít nhất 8 ký tự.');
      adminId = db.tx(() => {
        const school = Number(db.run('INSERT INTO schools (name, sample) VALUES (?, 0)', schoolName).lastInsertRowid);
        const id = Number(db.run('INSERT INTO users (school_id, role, username, display_name, pass_hash, created_at) VALUES (?,?,?,?,?,?)', school, 'admin', username, adminName, hashPassword(password), now()).lastInsertRowid);
        if (body.withSampleBank) {
          const t = now();
          for (const q of SAMPLE_QUESTIONS) {
            db.run(
              `INSERT INTO questions (school_id, type, stem, options_json, answer_json, explanation, topic, level, source, status, distractors_json, origin, created_by, approved_by, created_at, updated_at, sample, tag_confidence)
               VALUES (?,?,?,?,?,?,?,?, 'teacher', 'approved', ?, 'Ngân hàng mẫu SmartExam', ?, ?, ?, ?, 1, 1)`,
              school, q.type, q.stem, JSON.stringify(q.options), JSON.stringify(q.answer), q.explanation, q.topic, q.level, JSON.stringify(q.distractors ?? {}), id, id, t, t,
            );
          }
        }
        return id;
      });
    }
    const u = db.get('SELECT * FROM users WHERE id = ?', adminId);
    const token = newToken();
    db.run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)', token, u.id, now(), now() + SESSION_MS);
    setCookie(sessionCookie(token, SESSION_MS / 1000, req));
    audit(u, 'setup', body.mode === 'sample' ? 'Trường mẫu' : 'Trường thật', ip);
    return { user: publicUser(u) };
  });

  // ---------------- xử lý http ----------------
  function authUser(req, cookies) {
    const auth = req.headers['authorization'];
    const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
    const token = bearer || cookies.se_session;
    if (!token) return { token: null, user: null };
    const s = db.get('SELECT * FROM sessions WHERE token = ?', token);
    if (!s || s.expires_at < now()) return { token, user: null };
    const user = db.get('SELECT * FROM users WHERE id = ? AND active = 1', s.user_id);
    return { token, user };
  }

  async function readBody(req, limit) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > limit) throw new HttpError(413, `File quá lớn (tối đa ${Math.round(limit / 1e6)} MB).`);
      chunks.push(c);
    }
    return Buffer.concat(chunks);
  }

  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

  function serveStatic(req, res, pathname) {
    if (!distDir) return false;
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return false;
    }
    const rootDir = path.resolve(distDir);
    let file = path.resolve(rootDir, '.' + (decoded.startsWith('/') ? decoded : `/${decoded}`));
    if (file !== rootDir && !file.startsWith(rootDir + path.sep)) return false;
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(rootDir, 'index.html');
    if (!fs.existsSync(file)) return false;
    const immutable = /[\\/]assets[\\/].+-[\w-]+\.[\w]+$/.test(file);
    res.writeHead(200, { 'x-content-type-options': 'nosniff', 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' });
    fs.createReadStream(file).pipe(res);
    return true;
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const headers = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'x-permitted-cross-domain-policies': 'none' };
    if (!url.pathname.startsWith('/api/')) {
      if (serveStatic(req, res, url.pathname)) return;
      res.writeHead(404, headers);
      res.end('Not found');
      return;
    }
    const send = (status, obj) => {
      res.writeHead(status, { ...headers, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(obj));
    };
    try {
      const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
      if (!r) fail(404, 'Không có API này.');
      // Chống CSRF: yêu cầu ghi phải là JSON hoặc có header riêng (form từ trang khác không đặt được).
      if (req.method !== 'GET' && !(req.headers['content-type'] ?? '').includes('application/json') && !req.headers['x-smartexam']) fail(400, 'Yêu cầu không hợp lệ.');
      const m = url.pathname.match(r.re);
      let params;
      try {
        params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      } catch {
        fail(400, 'Đường dẫn không hợp lệ.');
      }
      const cookies = parseCookies(req.headers.cookie);
      const { token, user } = authUser(req, cookies);
      if (r.roles && !user) fail(401, 'Phiên đăng nhập đã hết. Đăng nhập lại.');
      if (r.roles && !r.roles.includes(user.role)) {
        audit(user, 'denied', `${req.method} ${r.pattern}`, req.socket?.remoteAddress, { target: url.pathname, outcome: 'denied' });
        fail(403, 'Bạn không có quyền làm việc này.');
      }
      let raw = null;
      let body = {};
      if (req.method !== 'GET') {
        const bodyLimit =
          url.pathname === '/api/import' || url.pathname === '/api/import/answers' || url.pathname === '/api/import/jobs'
            ? 26 * 1024 * 1024
            : url.pathname === '/api/images' || url.pathname === '/api/omr/scan'
              ? 8 * 1024 * 1024
              : 3 * 1024 * 1024;
        raw = await readBody(req, bodyLimit);
        if ((req.headers['content-type'] ?? '').includes('application/json') && raw.length) {
          try {
            body = JSON.parse(raw.toString('utf8'));
          } catch {
            fail(400, 'Dữ liệu gửi lên không phải JSON hợp lệ.');
          }
        }
      }
      const cookieOut = [];
      const result = await r.handler({
        req,
        user,
        token,
        cookies,
        params,
        query: Object.fromEntries(url.searchParams),
        body,
        raw,
        ip: req.socket?.remoteAddress,
        setCookie: (c) => cookieOut.push(c),
      });
      if (cookieOut.length) res.setHeader('set-cookie', cookieOut);
      if (result?.__file) {
        const f = result.__file;
        const isHtml = (f.type ?? '').includes('html');
        const safeName = sanitizeFilename(f.name);
        res.writeHead(200, f.inline ? { ...headers, 'content-type': f.type, 'content-disposition': 'inline', 'cache-control': 'private, max-age=86400', ...(isHtml ? {} : { 'content-security-policy': "default-src 'none'; sandbox" }) } : { ...headers, 'content-type': f.type, 'content-disposition': `attachment; filename="${safeName}"`, 'cache-control': 'no-store' });
        res.end(f.data);
        return;
      }
      send(200, result ?? {});
    } catch (e) {
      const status = e.status ?? 500;
      if (!e.status) console.error(e);
      send(status, { error: status >= 500 && !(e instanceof HttpError) && !e.status ? 'Lỗi máy chủ. Thử lại; nếu vẫn lỗi, báo quản trị kèm giờ xảy ra.' : e.message, ...(e.extra ?? {}) });
    }
  }

  return {
    handle,
    db,
    ai,
    now,
    backupNow,
    importJobs,
    materializeDueReports: reports.materializeDueReports,
    internals: {
      finalize,
      getAttempt,
      makeVariant,
      withClock(fn, body) {
        const prev = clockFn;
        clockFn = fn;
        try {
          return body();
        } finally {
          clockFn = prev;
        }
      },
    },
  };
}
