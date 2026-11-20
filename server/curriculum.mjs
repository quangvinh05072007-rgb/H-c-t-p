// API kho chương trình chuẩn (YCCĐ). Tách khỏi app.mjs: app.mjs chỉ gọi registerCurriculum và các hàm trả về.
// Chủ web nhập chương trình bằng gói (mục "curriculum") → phiên bản nháp → xem, so sánh → công bố.
// Giáo viên, học sinh chỉ thấy bản đã công bố. Câu hỏi gắn YCCĐ theo mã (bảng question_outcomes).
import { buildCurriculumPrompt } from '../shared/aiPrompt.mjs';
import { cleanOutcomeCodes, COMPETENCIES, diffOutcomes, STRANDS } from '../shared/curriculum.mjs';
import { TOPICS } from '../shared/topics.mjs';

export function registerCurriculum({ route, db, now, fail, audit }) {
  const ALL = ['admin', 'teacher', 'student'];
  const view = (o) => ({ code: o.code, grade: o.grade, topic: o.topic, strand: o.strand ?? null, content: o.content ?? '', text: o.text, competencies: o.competencies ?? [] });
  const outcomesOf = (curriculumId, topic) =>
    (topic
      ? db.all('SELECT * FROM curriculum_outcomes WHERE curriculum_id = ? AND topic = ? ORDER BY pos', curriculumId, topic)
      : db.all('SELECT * FROM curriculum_outcomes WHERE curriculum_id = ? ORDER BY pos', curriculumId)
    ).map(view);
  const published = (schoolId) => db.get("SELECT * FROM curricula WHERE school_id = ? AND status = 'published'", schoolId) ?? null;
  const userName = (id) => (id ? db.get('SELECT display_name FROM users WHERE id = ?', id)?.display_name ?? null : null);
  const header = (c) => ({
    id: c.id, name: c.name, sourceDoc: c.source_doc ?? '', note: c.note ?? '', status: c.status, origin: c.origin ?? null,
    createdAt: c.created_at, createdBy: userName(c.created_by), publishedAt: c.published_at ?? null, publishedBy: userName(c.published_by),
    outcomes: db.get('SELECT COUNT(*) n FROM curriculum_outcomes WHERE curriculum_id = ?', c.id).n,
  });

  /** Mã YCCĐ có trong các chương trình còn dùng (công bố + nháp) của trường. */
  function knownCodes(schoolId) {
    return new Set(
      db.all("SELECT DISTINCT o.code FROM curriculum_outcomes o JOIN curricula c ON c.id = o.curriculum_id WHERE c.school_id = ? AND c.status != 'archived'", schoolId).map((r) => r.code),
    );
  }
  /** Mã YCCĐ của từng câu: { qid: [mã…] }. */
  function codesOfQuestions(qids) {
    const out = {};
    if (!qids.length) return out;
    for (let i = 0; i < qids.length; i += 500) {
      const part = qids.slice(i, i + 500);
      for (const r of db.all(`SELECT qid, code FROM question_outcomes WHERE qid IN (${part.map(() => '?').join(',')}) ORDER BY code`, ...part)) (out[r.qid] ??= []).push(r.code);
    }
    return out;
  }
  function setQuestionOutcomes(qid, codes) {
    db.run('DELETE FROM question_outcomes WHERE qid = ?', qid);
    for (const c of codes) db.run('INSERT OR IGNORE INTO question_outcomes (qid, code) VALUES (?, ?)', qid, c);
  }
  /** Kiểm tra mã YCCĐ người dùng gửi lên: mã lạ thì báo lỗi (trừ mã câu đã có từ trước — keep). */
  function checkCodes(schoolId, raw, keep = []) {
    const codes = cleanOutcomeCodes(raw);
    const known = knownCodes(schoolId);
    for (const c of keep) known.add(c);
    const unknown = codes.filter((c) => !known.has(c));
    if (unknown.length) fail(400, `Mã YCCĐ không có trong chương trình: ${unknown.join(', ')}.`);
    return codes;
  }
  /** Gói nhập: bỏ mã YCCĐ lạ khỏi câu hỏi (extra: mã của chương trình nhập cùng gói). Trả về cảnh báo. */
  function filterPackageOutcomes(schoolId, questions, extra = []) {
    const known = knownCodes(schoolId);
    for (const c of extra) known.add(c);
    const bad = new Set();
    let n = 0;
    for (const q of questions) {
      const before = q.outcomes?.length ?? 0;
      q.outcomes = (q.outcomes ?? []).filter((c) => (known.has(c) ? true : (bad.add(c), false)));
      if (q.outcomes.length < before) n++;
    }
    return bad.size ? [`${n} câu ghi mã YCCĐ không có trong chương trình, đã bỏ các mã: ${[...bad].slice(0, 12).join(', ')}${bad.size > 12 ? '…' : ''}.`] : [];
  }
  /** Lưu chương trình từ gói thành một phiên bản nháp. */
  function importCurriculum(user, c, origin) {
    const id = Number(db.run('INSERT INTO curricula (school_id, name, source_doc, note, status, origin, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)',
      user.school_id, c.name, c.sourceDoc || null, c.note || null, 'draft', origin, user.id, now()).lastInsertRowid);
    c.outcomes.forEach((o, pos) =>
      db.run('INSERT INTO curriculum_outcomes (curriculum_id, pos, code, grade, topic, strand, content, text, competencies_json) VALUES (?,?,?,?,?,?,?,?,?)',
        id, pos, o.code, o.grade, o.topic, o.strand, o.content || null, o.text, JSON.stringify(o.competencies ?? [])));
    return id;
  }
  /** YCCĐ đã công bố, gọn để đưa vào lời nhắc AI: { mã chuyên đề: [{code, text}] }. */
  function promptOutcomes(schoolId) {
    const c = published(schoolId);
    if (!c) return {};
    const out = {};
    for (const o of outcomesOf(c.id)) (out[o.topic] ??= []).push({ code: o.code, text: o.text });
    return out;
  }
  const own = (user, id) => {
    const c = db.get('SELECT * FROM curricula WHERE id = ? AND school_id = ?', Number(id), user.school_id);
    if (!c) fail(404, 'Không tìm thấy chương trình.');
    return c;
  };

  // ---- Đọc (mọi vai trò): chương trình đang công bố ----
  route('GET', '/api/curriculum', ALL, ({ user, query }) => {
    const c = published(user.school_id);
    const topic = query.topic ? String(query.topic) : null;
    return {
      curriculum: c ? { id: c.id, name: c.name, sourceDoc: c.source_doc ?? '' } : null,
      outcomes: c ? outcomesOf(c.id, topic) : [],
      strands: STRANDS,
      competencies: COMPETENCIES,
    };
  });

  // ---- Quản lý (chủ web) ----
  route('GET', '/api/curricula/ai-prompt', ['admin'], () => ({ text: buildCurriculumPrompt() }));
  route('GET', '/api/curricula', ['admin'], ({ user }) => ({
    versions: db.all("SELECT * FROM curricula WHERE school_id = ? ORDER BY status = 'published' DESC, created_at DESC, id DESC", user.school_id).map(header),
    strands: STRANDS,
    competencies: COMPETENCIES,
  }));
  route('GET', '/api/curricula/:id', ['admin'], ({ user, params }) => {
    const c = own(user, params.id);
    const outcomes = outcomesOf(c.id);
    // Số câu đã duyệt gắn với từng YCCĐ (độ phủ ngân hàng)
    const counts = Object.fromEntries(
      db.all(
        "SELECT qo.code, COUNT(*) n FROM question_outcomes qo JOIN questions q ON q.id = qo.qid WHERE q.school_id = ? AND q.status = 'approved' GROUP BY qo.code",
        user.school_id,
      ).map((r) => [r.code, r.n]),
    );
    const pub = published(user.school_id);
    const diff = pub && pub.id !== c.id ? { against: pub.name, ...diffOutcomes(outcomesOf(pub.id), outcomes) } : null;
    return {
      curriculum: header(c),
      outcomes: outcomes.map((o) => ({ ...o, questions: counts[o.code] ?? 0 })),
      topics: TOPICS.map(({ code, grade, name }) => ({ code, grade, name })),
      diff,
    };
  });
  route('POST', '/api/curricula/:id/publish', ['admin'], ({ user, params, ip }) => {
    const c = own(user, params.id);
    if (c.status === 'published') return { ok: true };
    db.tx(() => {
      db.run("UPDATE curricula SET status = 'archived' WHERE school_id = ? AND status = 'published'", user.school_id);
      db.run("UPDATE curricula SET status = 'published', published_by = ?, published_at = ? WHERE id = ?", user.id, now(), c.id);
    });
    audit(user, 'curriculum_publish', `${c.name} (#${c.id})`, ip);
    return { ok: true };
  });
  route('DELETE', '/api/curricula/:id', ['admin'], ({ user, params, ip }) => {
    const c = own(user, params.id);
    if (c.status === 'published') fail(409, 'Đang dùng bản này. Công bố bản khác trước rồi mới xóa được.');
    db.tx(() => {
      db.run('DELETE FROM curriculum_outcomes WHERE curriculum_id = ?', c.id);
      db.run('DELETE FROM curricula WHERE id = ?', c.id);
    });
    audit(user, 'curriculum_delete', `${c.name} (#${c.id})`, ip);
    return { ok: true };
  });

  return { knownCodes, codesOfQuestions, setQuestionOutcomes, checkCodes, filterPackageOutcomes, importCurriculum, promptOutcomes };
}
