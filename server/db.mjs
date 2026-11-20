// CSDL SQLite có sẵn trong Node (node:sqlite). Cột *_json lưu JSON.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { vnDay } from '../shared/spaced.mjs';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schools (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, sample INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id),
  role TEXT NOT NULL CHECK (role IN ('admin','teacher','student')),
  username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, pass_hash TEXT NOT NULL,
  class_id INTEGER, xp INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0, last_active_day TEXT,
  active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id), name TEXT NOT NULL,
  grade INTEGER NOT NULL, teacher_id INTEGER REFERENCES users(id), code TEXT
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id),
  type TEXT NOT NULL CHECK (type IN ('mcq','tf','short')), stem TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]', answer_json TEXT, explanation TEXT NOT NULL DEFAULT '',
  topic TEXT, level INTEGER NOT NULL DEFAULT 2,
  source TEXT NOT NULL CHECK (source IN ('official','teacher','imported','ai_generated','ai_modified')),
  status TEXT NOT NULL CHECK (status IN ('draft','approved','archived')) DEFAULT 'draft',
  distractors_json TEXT NOT NULL DEFAULT '{}', origin TEXT, parent_id INTEGER, tag_confidence REAL,
  created_by INTEGER, approved_by INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, sample INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS q_school ON questions(school_id, status, type, topic);
CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, title TEXT NOT NULL, blueprint_json TEXT NOT NULL,
  items_json TEXT NOT NULL, duration_min INTEGER NOT NULL, variants_json TEXT NOT NULL, snapshot_json TEXT NOT NULL,
  created_by INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, exam_id INTEGER NOT NULL REFERENCES exams(id),
  class_id INTEGER NOT NULL REFERENCES classes(id), mode TEXT NOT NULL CHECK (mode IN ('exam','homework')),
  title TEXT NOT NULL, open_at INTEGER NOT NULL, close_at INTEGER NOT NULL, duration_min INTEGER NOT NULL,
  show_result TEXT NOT NULL DEFAULT 'after_submit', created_by INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, assignment_id INTEGER, student_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('assignment','practice')), title TEXT,
  layout_json TEXT NOT NULL, started_at INTEGER NOT NULL, deadline_at INTEGER, submitted_at INTEGER,
  responses_json TEXT NOT NULL DEFAULT '{}', times_json TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 0,
  saved_at INTEGER, late_json TEXT, status TEXT NOT NULL DEFAULT 'in_progress',
  score10 REAL, points REAL, max_points REAL, result_json TEXT, diagnosis_json TEXT,
  events_json TEXT NOT NULL DEFAULT '[]', client_id TEXT, checked_json TEXT NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX IF NOT EXISTS att_one ON attempts(assignment_id, student_id) WHERE assignment_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, student_id INTEGER NOT NULL, qid INTEGER NOT NULL,
  topic TEXT, level INTEGER, score REAL NOT NULL, correct INTEGER NOT NULL, error_type TEXT, attempt_id INTEGER, at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ev_student ON evidence(student_id, at);
CREATE TABLE IF NOT EXISTS review_items (
  student_id INTEGER NOT NULL, qid INTEGER NOT NULL, school_id INTEGER NOT NULL,
  box INTEGER NOT NULL, due_at INTEGER NOT NULL, lapses INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (student_id, qid)
);
CREATE TABLE IF NOT EXISTS activity (
  student_id INTEGER NOT NULL, day TEXT NOT NULL, questions INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (student_id, day)
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, sha TEXT NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL,
  cx INTEGER NOT NULL DEFAULT 0, cy INTEGER NOT NULL DEFAULT 0, created_by INTEGER, created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS img_sha ON images(school_id, sha);
CREATE TABLE IF NOT EXISTS blueprint_templates (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, owner_id INTEGER NOT NULL, name TEXT NOT NULL,
  blueprint_json TEXT NOT NULL, shared INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS question_versions (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, qid INTEGER NOT NULL, version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL, changed_by INTEGER, reason TEXT, at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS qv_q ON question_versions(qid, version);
CREATE TABLE IF NOT EXISTS bulk_ops (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, user_id INTEGER NOT NULL, action TEXT NOT NULL, value TEXT,
  before_json TEXT NOT NULL, at INTEGER NOT NULL, undone_at INTEGER
);
CREATE TABLE IF NOT EXISTS score_appeals (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, attempt_id INTEGER NOT NULL, student_id INTEGER NOT NULL, qid INTEGER,
  reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','rejected')),
  note TEXT, resolution_json TEXT, resolved_by INTEGER, created_at INTEGER NOT NULL, resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS appeal_att ON score_appeals(attempt_id, status);
CREATE TABLE IF NOT EXISTS exam_ratings (
  exam_id INTEGER NOT NULL, user_id INTEGER NOT NULL, stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5), comment TEXT, at INTEGER NOT NULL,
  PRIMARY KEY (exam_id, user_id)
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, target_type TEXT NOT NULL CHECK (target_type IN ('question','exam')), target_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL, body TEXT NOT NULL, at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cm_target ON comments(target_type, target_id);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY, school_id INTEGER, user_id INTEGER, action TEXT NOT NULL, detail TEXT, ip TEXT, at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS student_notes (
  student_id INTEGER NOT NULL, qid INTEGER NOT NULL, school_id INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '', tag TEXT NOT NULL DEFAULT 'important', updated_at INTEGER NOT NULL,
  PRIMARY KEY (student_id, qid)
);
CREATE TABLE IF NOT EXISTS lessons (
  school_id INTEGER NOT NULL, topic TEXT NOT NULL, data_json TEXT NOT NULL,
  source TEXT, updated_by INTEGER, updated_at INTEGER NOT NULL,
  PRIMARY KEY (school_id, topic)
);
CREATE TABLE IF NOT EXISTS class_modules (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, class_id INTEGER NOT NULL REFERENCES classes(id),
  week_no INTEGER NOT NULL DEFAULT 1, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0, locked INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cm_class ON class_modules(class_id, sort_order, id);
CREATE TABLE IF NOT EXISTS class_materials (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, class_id INTEGER NOT NULL REFERENCES classes(id),
  module_id INTEGER NOT NULL REFERENCES class_modules(id),
  kind TEXT NOT NULL DEFAULT 'doc' CHECK (kind IN ('doc','pdf','link','video')),
  title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '', topic_code TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cmat_mod ON class_materials(module_id, sort_order, id);
CREATE TABLE IF NOT EXISTS student_material_views (
  student_id INTEGER NOT NULL, material_id INTEGER NOT NULL, viewed_at INTEGER NOT NULL,
  PRIMARY KEY (student_id, material_id)
);
CREATE TABLE IF NOT EXISTS class_announcements (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, class_id INTEGER NOT NULL REFERENCES classes(id),
  title TEXT NOT NULL, body TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cann_class ON class_announcements(class_id, pinned DESC, created_at DESC);
`;

/** Cột thêm sau bản đầu: thêm vào CSDL cũ mà không mất dữ liệu (chạy lại nhiều lần vẫn an toàn). */
const ADDED_COLUMNS = [
  ['questions', 'ocr_text', 'TEXT'],
  ['questions', 'source_stem', 'TEXT'],
  ['questions', 'group_id', 'TEXT'],
  ['attempts', 'variant_code', 'TEXT'],
  ['assignments', 'variant_mode', "TEXT NOT NULL DEFAULT 'random'"],
  ['assignments', 'variant_map_json', 'TEXT'],
  ['review_items', 'due_day', 'TEXT'],
  ['review_items', 'last_day', 'TEXT'],
  ['assignments', 'target_json', 'TEXT'],
  ['exams', 'visibility', "TEXT NOT NULL DEFAULT 'school'"],
  ['exams', 'dept', 'TEXT'],
  ['exams', 'parent_id', 'INTEGER'],
  ['questions', 'approvals_json', 'TEXT'],
  ['schools', 'review_policy', "TEXT NOT NULL DEFAULT 'single'"],
  ['questions', 'explanation_draft', 'TEXT'],
  ['questions', 'draft_check_json', 'TEXT'],
  ['audit_log', 'target', 'TEXT'],
  ['audit_log', 'old_json', 'TEXT'],
  ['audit_log', 'new_json', 'TEXT'],
  ['audit_log', 'reason', 'TEXT'],
  ['audit_log', 'outcome', "TEXT NOT NULL DEFAULT 'ok'"],
  ['classes', 'code', 'TEXT'],
  ['attempts', 'teacher_feedback', 'TEXT'],
  ['attempts', 'teacher_stamp', 'TEXT'],
  ['attempts', 'feedback_at', 'INTEGER'],
  ['assignments', 'module_id', 'INTEGER'],
  ['users', 'target_score', 'REAL'],
  ['attempts', 'mode', 'TEXT'],
  ['attempts', 'flagged_json', 'TEXT'],
  ['questions', 'form', 'TEXT'],
  ['exams', 'category', 'TEXT'],
  ['attempts', 'exam_id', 'INTEGER'],
  // Vòng đời đề: khóa khi đã dùng; sửa đề đã khóa tạo phiên bản mới (root_id = đề gốc, superseded_by = bản thay thế)
  ['exams', 'locked_at', 'INTEGER'],
  ['exams', 'version', 'INTEGER NOT NULL DEFAULT 1'],
  ['exams', 'root_id', 'INTEGER'],
  ['exams', 'superseded_by', 'INTEGER'],
  // Đề chính thức của chủ web: chỉ đề này hiện ở mục Đề thi của học sinh
  ['exams', 'official', 'INTEGER NOT NULL DEFAULT 0'],
  // Bài tự luyện chụp lại câu hỏi lúc làm, sửa câu sau đó không đổi bài cũ
  ['attempts', 'snapshot_json', 'TEXT'],
  // Kho câu: NULL = câu cũ (dùng chung như trước), 'common' = kho chung của chủ web, 'private' = kho riêng của người tạo
  ['questions', 'scope', 'TEXT'],
  ['questions', 'proposed_at', 'INTEGER'],
  ['questions', 'review_note', 'TEXT'],
  // Thông tin tổ chức đề
  ['exams', 'school_year', 'TEXT'],
  ['exams', 'grade', 'INTEGER'],
  ['exams', 'term', 'TEXT'],
  ['exams', 'session', 'TEXT'],
  ['exams', 'source', 'TEXT'],
  ['exams', 'exam_date', 'TEXT'],
  ['exams', 'tags_json', 'TEXT'],
  // Vị trí câu trong đề gốc (vd "Phần II – Câu 1")
  ['questions', 'source_no', 'TEXT'],
  // File đề gốc (Word/PDF) mà đề / câu được nhập từ đó
  ['exams', 'document_id', 'INTEGER'],
  ['questions', 'document_id', 'INTEGER'],
];

export function migrate(db) {
  const added = new Set();
  for (const [table, col, def] of ADDED_COLUMNS) {
    const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
    if (!has) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      added.add(`${table}.${col}`);
    }
  }
  // Lưu trữ đề kiểu "ngân hàng là lõi":
  //  - question_contents: mỗi nội dung câu (đúng như lúc ra đề) lưu MỘT lần, nhận diện bằng mã băm;
  //  - exam_items: đề gồm những câu nào, thứ tự, phần, trỏ tới đúng nội dung câu lúc ra đề;
  //  - exam_variants: các mã đề;
  //  - documents: file đề gốc.
  // exams.snapshot_json chỉ còn dấu "@exam:<id>"; khi đọc, app dựng lại nội dung từ hai bảng trên.
  db.exec(`CREATE TABLE IF NOT EXISTS question_contents (
      id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, qid INTEGER NOT NULL, hash TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL,
      UNIQUE (qid, hash));
    CREATE TABLE IF NOT EXISTS exam_items (
      exam_id INTEGER NOT NULL, pos INTEGER NOT NULL, part TEXT, qid INTEGER NOT NULL, content_id INTEGER,
      type TEXT, topic TEXT, level INTEGER, grp TEXT, fixed_options INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (exam_id, pos));
    CREATE INDEX IF NOT EXISTS ei_qid ON exam_items(qid);
    CREATE TABLE IF NOT EXISTS exam_variants (
      exam_id INTEGER NOT NULL, code TEXT NOT NULL, seed TEXT, PRIMARY KEY (exam_id, code));
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, sha TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
      data BLOB NOT NULL, uploaded_by INTEGER, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS doc_sha ON documents(school_id, sha);
    CREATE TRIGGER IF NOT EXISTS exam_cleanup AFTER DELETE ON exams BEGIN
      DELETE FROM exam_items WHERE exam_id = OLD.id; DELETE FROM exam_variants WHERE exam_id = OLD.id; END;`);
  // Thư mục riêng của từng giáo viên để xếp đề (một đề có thể nằm trong nhiều thư mục của nhiều người)
  // Lịch sử bài tự học: mỗi lần chủ web nhập lại / khôi phục / về mặc định, bản đang dùng được cất vào đây
  db.exec(`CREATE TABLE IF NOT EXISTS lesson_versions (
      id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, topic TEXT NOT NULL, data_json TEXT NOT NULL,
      source TEXT, updated_by INTEGER, updated_at INTEGER NOT NULL, replaced_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS lv_topic ON lesson_versions(school_id, topic);`);
  db.exec(`CREATE TABLE IF NOT EXISTS exam_folders (
      id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, owner_id INTEGER NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS exam_folder_items (
      folder_id INTEGER NOT NULL, exam_id INTEGER NOT NULL, added_at INTEGER NOT NULL, PRIMARY KEY (folder_id, exam_id));
    CREATE INDEX IF NOT EXISTS ef_owner ON exam_folders(owner_id);`);
  // Lần đầu có "đề chính thức": giữ nguyên những gì học sinh đang thấy (đề dùng chung của trường)
  if (added.has('exams.official')) db.exec("UPDATE exams SET official = 1 WHERE visibility = 'school'");
  // Đề đã giao hoặc đã có người làm thì khóa ngay
  if (added.has('exams.locked_at')) {
    db.exec(`UPDATE exams SET locked_at = created_at WHERE id IN (SELECT exam_id FROM assignments)
             OR id IN (SELECT exam_id FROM attempts WHERE exam_id IS NOT NULL)`);
  }
  // Nhật ký chỉ thêm: CSDL từ chối sửa/xóa dù là qua API hay câu lệnh trực tiếp.
  db.exec(`CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'Nhật ký chỉ được thêm, không được sửa'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'Nhật ký chỉ được thêm, không được xóa'); END;`);
  // Mục ôn cũ chỉ có due_at (ms): suy ra ngày đến hạn theo lịch Việt Nam.
  const upd = db.prepare('UPDATE review_items SET due_day = ? WHERE student_id = ? AND qid = ?');
  for (const r of db.prepare('SELECT student_id, qid, due_at FROM review_items WHERE due_day IS NULL').all()) upd.run(vnDay(r.due_at), r.student_id, r.qid);
  // Lớp cũ chưa có mã tham gia: tự sinh mã dễ nhớ (VD: 12A1-8842).
  const missingCode = db.prepare("SELECT id, name FROM classes WHERE code IS NULL OR code = ''").all();
  const updCode = db.prepare('UPDATE classes SET code = ? WHERE id = ?');
  for (const c of missingCode) {
    const prefix = String(c.name || 'LOP').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'LOP';
    updCode.run(`${prefix}-${1000 + (c.id * 137) % 9000}`, c.id);
  }
}

const PART_OF = { mcq: 'I', tf: 'II', short: 'III' };
const REF_PREFIX = '@exam:';

/**
 * Tách nội dung đề sang các bảng chuẩn: nội dung câu (không trùng lặp), đề–câu, mã đề.
 * Chạy sau mọi lệnh ghi đề có kèm nội dung; đề đã chuẩn hóa thì bỏ qua.
 */
export function normalizeExams(db) {
  const pending = db.prepare(`SELECT id, school_id, items_json, variants_json, snapshot_json FROM exams WHERE snapshot_json NOT LIKE '"${REF_PREFIX}%'`).all();
  if (!pending.length) return 0;
  const findContent = db.prepare('SELECT id FROM question_contents WHERE qid = ? AND hash = ?');
  const addContent = db.prepare('INSERT INTO question_contents (school_id, qid, hash, body, created_at) VALUES (?,?,?,?,?)');
  const delItems = db.prepare('DELETE FROM exam_items WHERE exam_id = ?');
  const addItem = db.prepare('INSERT INTO exam_items (exam_id, pos, part, qid, content_id, type, topic, level, grp, fixed_options) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const delVariants = db.prepare('DELETE FROM exam_variants WHERE exam_id = ?');
  const addVariant = db.prepare('INSERT OR IGNORE INTO exam_variants (exam_id, code, seed) VALUES (?,?,?)');
  const mark = db.prepare('UPDATE exams SET snapshot_json = ? WHERE id = ?');
  const t = Date.now();
  for (const e of pending) {
    const items = JSON.parse(e.items_json || '[]');
    const snapshot = JSON.parse(e.snapshot_json || '{}') || {};
    const variants = JSON.parse(e.variants_json || '[]');
    const contentOf = {};
    for (const [qid, body] of Object.entries(snapshot)) {
      const text = JSON.stringify(body);
      const hash = crypto.createHash('sha256').update(text).digest('hex');
      const found = findContent.get(Number(qid), hash);
      contentOf[qid] = found ? found.id : Number(addContent.run(e.school_id, Number(qid), hash, text, t).lastInsertRowid);
    }
    delItems.run(e.id);
    items.forEach((it, pos) => {
      addItem.run(e.id, pos, PART_OF[it.type] ?? null, Number(it.qid), contentOf[it.qid] ?? null, it.type ?? null, it.topic ?? null, it.level ?? null, it.group ?? null, it.fixedOptions ? 1 : 0);
    });
    delVariants.run(e.id);
    for (const v of Array.isArray(variants) ? variants : []) if (v?.code) addVariant.run(e.id, String(v.code), v.seed ?? null);
    mark.run(JSON.stringify(`${REF_PREFIX}${e.id}`), e.id);
  }
  return pending.length;
}

/** Đề đã chuẩn hóa mà chỉ đổi danh sách câu / mã đề (không đổi nội dung): đồng bộ lại hai bảng, giữ nội dung đã trỏ. */
export function resyncExamLists(db, examId) {
  const e = db.prepare('SELECT id, items_json, variants_json FROM exams WHERE id = ?').get(examId);
  if (!e) return;
  const contentByQid = Object.fromEntries(db.prepare('SELECT qid, content_id FROM exam_items WHERE exam_id = ?').all(examId).map((r) => [r.qid, r.content_id]));
  const items = JSON.parse(e.items_json || '[]');
  db.prepare('DELETE FROM exam_items WHERE exam_id = ?').run(examId);
  const addItem = db.prepare('INSERT INTO exam_items (exam_id, pos, part, qid, content_id, type, topic, level, grp, fixed_options) VALUES (?,?,?,?,?,?,?,?,?,?)');
  items.forEach((it, pos) => addItem.run(examId, pos, PART_OF[it.type] ?? null, Number(it.qid), contentByQid[it.qid] ?? null, it.type ?? null, it.topic ?? null, it.level ?? null, it.group ?? null, it.fixedOptions ? 1 : 0));
  db.prepare('DELETE FROM exam_variants WHERE exam_id = ?').run(examId);
  const addVariant = db.prepare('INSERT OR IGNORE INTO exam_variants (exam_id, code, seed) VALUES (?,?,?)');
  for (const v of JSON.parse(e.variants_json || '[]') ?? []) if (v?.code) addVariant.run(examId, String(v.code), v.seed ?? null);
}

const EXAM_WRITE_RE = /^\s*(INSERT\s+INTO\s+exams\b|UPDATE\s+exams\s+SET\b[\s\S]*\b(snapshot_json|items_json|variants_json)\b)/i;

const JSON_COLS = /_json$/;

/** Đổi hàng có cột *_json thành đối tượng (bỏ hậu tố _json). */
export function hydrate(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (JSON_COLS.test(k)) out[k.replace(JSON_COLS, '')] = v == null ? null : JSON.parse(v);
    else out[k] = v;
  }
  return out;
}

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  migrate(db);
  // Dữ liệu cũ: đề còn chép nguyên nội dung câu → chuyển sang bảng chuẩn ngay khi mở CSDL
  normalizeExams(db);
  const contentStmt = db.prepare('SELECT i.qid, c.body FROM exam_items i JOIN question_contents c ON c.id = i.content_id WHERE i.exam_id = ?');
  /** Dấu "@exam:<id>" trong cột snapshot → dựng lại nội dung câu của đề từ bảng chuẩn. */
  const resolve = (row) => {
    if (row && typeof row.snapshot === 'string' && row.snapshot.startsWith(REF_PREFIX)) {
      const out = {};
      for (const r of contentStmt.all(Number(row.snapshot.slice(REF_PREFIX.length)))) out[r.qid] = JSON.parse(r.body);
      row.snapshot = out;
    }
    return row;
  };
  const api = {
    raw: db,
    all(sql, ...p) {
      return db.prepare(sql).all(...p).map((r) => resolve(hydrate(r)));
    },
    get(sql, ...p) {
      return resolve(hydrate(db.prepare(sql).get(...p)));
    },
    run(sql, ...p) {
      const r = db.prepare(sql).run(...p);
      // Ghi đề kèm nội dung (tạo, sửa, đổi đáp án sau thi…) → tách ngay sang bảng chuẩn
      if (EXAM_WRITE_RE.test(sql)) {
        // Đổi riêng danh sách câu / mã đề của đề đã chuẩn hóa (lệnh kết thúc bằng "WHERE id = ?")
        if (/^\s*UPDATE/i.test(sql) && !/snapshot_json/i.test(sql) && /WHERE\s+id\s*=\s*\?\s*$/i.test(sql)) resyncExamLists(db, Number(p[p.length - 1]));
        normalizeExams(db);
      }
      return r;
    },
    tx(fn) {
      db.exec('BEGIN');
      try {
        const r = fn();
        db.exec('COMMIT');
        return r;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    close() {
      db.close();
    },
  };
  return api;
}

/** Câu hỏi dạng dùng trong shared/* */
export function toQuestion(row) {
  if (!row) return null;
  const r = hydrate(row.options_json !== undefined ? row : row);
  return {
    id: r.id,
    type: r.type,
    stem: r.stem,
    ocrText: r.ocr_text ?? '',
    sourceStem: r.source_stem ?? '',
    options: r.options ?? [],
    answer: r.answer,
    explanation: r.explanation,
    topic: r.topic,
    level: r.level,
    source: r.source,
    status: r.status,
    distractors: r.distractors ?? {},
    origin: r.origin,
    parent_id: r.parent_id,
    tag_confidence: r.tag_confidence,
    created_by: r.created_by,
    scope: r.scope ?? null,
    proposedAt: r.proposed_at ?? null,
    reviewNote: r.review_note ?? null,
    approved_by: r.approved_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
    sample: r.sample,
    group_id: r.group_id ?? null,
    form: r.form ?? null,
  };
}
