import { filterExamCatalog } from '../../../shared/exam-catalog.mjs';
import { useEffect, useState } from 'react';
import { download, get, post, printHtmlFromApi } from '../../api';
import { MathText } from '../../ui/MathText';
import { Comments } from '../../ui/Comments';
import { OmrModal } from '../../ui/OmrModal';
import { PageHeading, shareUrl, ErrorBox, fmtDate, go, LevelBadge, Icon, Loading, topicName, useApp, useAsync, useRoute } from '../../ui/kit';
import { VariantShuffler } from './VariantShuffler';
import { LibrarySubNavBar } from '../../ui/TeacherNavBars';
import { AssignExamDrawer } from '../../ui/AssignExamDrawer';

export function Exams() {
  const { query } = useRoute();
  const requestedClass = query.get('classId');
  const defaultClassId = requestedClass && /^\d+$/.test(requestedClass) ? Number(requestedClass) : null;
  const suffix = requestedClass && /^\d+$/.test(requestedClass) ? `?classId=${requestedClass}` : '';
  const editSuffix = requestedClass && /^\d+$/.test(requestedClass) ? `&classId=${requestedClass}` : '';
  const [scope, setScope] = useState('all');
  const [officialBusy, setOfficialBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [omrExam, setOmrExam] = useState<any>(null);
  const [assignTarget, setAssignTarget] = useState<any>(null);
  const { meta, toast } = useApp();
  const { data, error, loading, reload } = useAsync(() => get('/api/exams'), []);
  const allExams = data?.exams ?? [];
  const exams = filterExamCatalog(allExams, { scope, search, dept });
  const myCount = allExams.filter((e: any) => e.mine).length;
  const sharedCount = allExams.filter((e: any) => e.visibility === 'school').length;

  return (
    <div className="stack" style={{ gap: 14 }}>
      {/* 1. Header 1 dòng tối giản chuẩn IELTS */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          padding: '4px 0 10px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
            Kho đề
          </h1>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 3 }}>
            Tổng số: <strong style={{ color: 'var(--ink)' }}>{allExams.length} đề</strong> · Của bạn: <span style={{ color: 'var(--good)', fontWeight: 600 }}>{myCount}</span> · Chung trường: <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{sharedCount}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn sm"
            disabled={officialBusy}
            title="Tự ghép đề 12 trắc nghiệm, 4 đúng/sai, 6 trả lời ngắn, 90 phút từ câu đã duyệt"
            onClick={async () => {
              setOfficialBusy(true);
              try {
                const r = await post<{ id: number; title: string }>('/api/exams/official', {});
                toast(`Đã tạo "${r.title}".`);
                go(`/de-thi/${r.id}${suffix}`);
              } catch (e: any) {
                toast(e.message);
              } finally {
                setOfficialBusy(false);
              }
            }}
          >
            {officialBusy ? 'Đang ghép đề…' : 'Đề cấu trúc Bộ (1 nút)'}
          </button>
          <a className="btn sm primary" href={`#/ra-de${suffix}`}>
            <Icon name="plus" /> Soạn đề mới
          </a>
        </div>
      </div>

      <LibrarySubNavBar active="exams" />

      {/* 2. Thanh lọc chuẩn IELTS Online Tests */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          background: 'var(--surface)',
          padding: '8px 12px',
          borderRadius: 8,
          border: '1px solid var(--line)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {[
            ['all', `Tất cả (${allExams.length})`],
            ['mine', `Của tôi (${myCount})`],
            ['shared', `Dùng chung (${sharedCount})`],
            ['hot', 'Dùng nhiều'],
          ].map(([value, label]) => {
            const active = scope === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setScope(value)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 5,
                  fontSize: 12.5,
                  fontWeight: active ? 650 : 500,
                  cursor: 'pointer',
                  border: active ? '1px solid var(--primary)' : '1px solid transparent',
                  background: active ? 'var(--primary-soft)' : 'transparent',
                  color: active ? 'var(--primary)' : 'var(--ink-2)',
                  transition: 'all 0.12s ease',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 300px', maxWidth: 440, justifyContent: 'flex-end' }}>
          <input
            className="input"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên đề hoặc giáo viên…"
            style={{ width: '100%', maxWidth: 200, fontSize: 12.5, minHeight: 32, padding: '4px 10px' }}
          />

          {data && (
            <select
              className="input"
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              style={{ minHeight: 32, fontSize: 12.5, padding: '4px 8px', width: 'auto' }}
            >
              <option value="">Tất cả tổ</option>
              {[...new Set<string>((data?.exams ?? []).map((e: any) => e.dept).filter(Boolean))].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}

          {/* View Mode Toggle: Cards vs Table */}
          <div
            style={{
              display: 'inline-flex',
              border: '1px solid var(--line)',
              borderRadius: 6,
              overflow: 'hidden',
              background: 'var(--surface-subtle)',
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode('card')}
              style={{
                padding: '4px 8px',
                border: 'none',
                background: viewMode === 'card' ? 'var(--surface)' : 'transparent',
                color: viewMode === 'card' ? 'var(--primary)' : 'var(--ink-3)',
                fontWeight: viewMode === 'card' ? 700 : 500,
                fontSize: 12,
                cursor: 'pointer',
              }}
              title="Xem dạng thẻ gọn"
            >
              Thẻ
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                padding: '4px 8px',
                border: 'none',
                background: viewMode === 'table' ? 'var(--surface)' : 'transparent',
                color: viewMode === 'table' ? 'var(--primary)' : 'var(--ink-3)',
                fontWeight: viewMode === 'table' ? 700 : 500,
                fontSize: 12,
                cursor: 'pointer',
              }}
              title="Xem dạng bảng danh sách IELTS"
            >
              Bảng
            </button>
          </div>
        </div>
      </div>

      {loading && <Loading text="Đang tải kho đề thi…" />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {!loading && data && exams.length === 0 && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '36px 16px',
            textAlign: 'center',
            color: 'var(--ink-3)',
            fontSize: 13,
          }}
        >
          Không tìm thấy đề thi khớp bộ lọc. Vui lòng chọn tổ khác hoặc xóa từ khóa tìm kiếm.
        </div>
      )}

      {/* 3. Danh sách đề thi */}
      {data && exams.length > 0 && viewMode === 'table' ? (
        /* 3A. IELTS Table View */
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-subtle)', borderBottom: '1px solid var(--line)', color: 'var(--ink-3)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '8px 12px', width: 70 }}>Mã đề</th>
                <th style={{ padding: '8px 12px' }}>Tên đề thi</th>
                <th style={{ padding: '8px 12px', width: 110 }}>Tổ / Môn</th>
                <th style={{ padding: '8px 12px', width: 85 }}>Thời gian</th>
                <th style={{ padding: '8px 12px', width: 75 }}>Số câu</th>
                <th style={{ padding: '8px 12px', width: 140 }}>Tác giả / Quyền</th>
                <th style={{ padding: '8px 12px', width: 170, textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((e: any) => {
                const totalQ = (e.counts?.mcq ?? 0) + (e.counts?.tf ?? 0) + (e.counts?.short ?? 0);
                const testCode = `DE-${String(e.id).padStart(2, '0')}`;
                return (
                  <tr
                    key={e.id}
                    style={{ borderBottom: '1px solid var(--line-subtle)', transition: 'background 0.12s ease' }}
                    onMouseEnter={(ev) => (ev.currentTarget.style.background = 'var(--surface-subtle)')}
                    onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--ink-3)', fontSize: 12 }}>
                      {testCode}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <a href={`#/de-thi/${e.id}${suffix}`} style={{ fontWeight: 650, color: 'var(--ink)', textDecoration: 'none' }}>
                        {e.title}
                      </a>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: 'var(--primary)',
                          background: 'var(--primary-soft)',
                          padding: '2px 6px',
                          borderRadius: 4,
                        }}
                      >
                        {e.dept || 'Chung'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>
                      ⏱ {e.durationMin}p
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>
                      {totalQ} câu
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ink-3)' }}>
                      <div>{e.author}</div>
                      <div style={{ fontSize: 10.5, color: e.mine ? 'var(--good)' : 'var(--ink-3)', fontWeight: 550 }}>
                        {e.mine ? '● Đề của bạn' : e.visibility === 'school' ? 'Dùng chung trường' : 'Riêng tư'}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn sm primary"
                          onClick={() => setAssignTarget(e)}
                          style={{ minHeight: 28, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}
                        >
                          Giao lớp
                        </button>
                        <a
                          className="btn sm"
                          href={`#/ra-de?examId=${e.id}${editSuffix}`}
                          style={{ minHeight: 28, padding: '3px 8px', fontSize: 12 }}
                          title="Chỉnh sửa trực tiếp trên Xưởng A4"
                        >
                          Sửa đề
                        </a>
                        <a
                          className="btn sm ghost"
                          href={`#/dao-de?examId=${e.id}${editSuffix}`}
                          style={{ minHeight: 28, padding: '3px 8px', fontSize: 12 }}
                          title="Trộn đề thành các mã 101, 102, 103..."
                        >
                          <Icon name="refresh" /> Đảo đề
                        </a>
                        <a
                          className="btn sm ghost"
                          href={`#/de-thi/${e.id}${suffix}`}
                          style={{ minHeight: 28, padding: '3px 8px', fontSize: 12 }}
                        >
                          Chi tiết
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : data && exams.length > 0 ? (
        /* 3B. IELTS Card Grid */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 12,
          }}
        >
          {exams.map((e: any) => {
            const totalQ = (e.counts?.mcq ?? 0) + (e.counts?.tf ?? 0) + (e.counts?.short ?? 0);
            const deptName = e.dept || 'Toán';
            const testCode = `MÃ: DE-${String(e.id).padStart(2, '0')}`;

            return (
              <article
                key={e.id}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 10,
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'all 0.15s ease',
                }}
              >
                <div>
                  <div className="meta-inline-line" style={{ marginBottom: 6 }}>
                    <span className="tabular-nums" style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--ink-2)' }}>
                      {testCode}
                    </span>
                    <span>·</span>
                    <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{deptName}</span>
                    <span>·</span>
                    <span style={{ color: e.mine ? 'var(--good)' : 'var(--ink-3)', fontWeight: e.mine ? 600 : 400 }}>
                      {e.mine ? 'Của bạn' : e.visibility === 'school' ? 'Dùng chung' : 'Riêng tư'}
                    </span>
                  </div>

                  <h3
                    style={{
                      margin: '0 0 6px',
                      fontSize: 14,
                      fontWeight: 700,
                      color: 'var(--ink)',
                      lineHeight: 1.35,
                    }}
                  >
                    <a href={`#/de-thi/${e.id}${suffix}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {e.title}
                    </a>
                  </h3>

                  <div
                    className="tabular-nums"
                    style={{
                      fontSize: 11.5,
                      color: 'var(--ink-3)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 6,
                      alignItems: 'center',
                    }}
                  >
                    <span>⏱ {e.durationMin} phút</span>
                    <span>·</span>
                    <span>{totalQ} câu hỏi</span>
                    <span>·</span>
                    <span>GV: {e.author}</span>
                  </div>
                </div>

                <div
                  style={{
                    paddingTop: 8,
                    borderTop: '1px solid var(--line-subtle)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <button
                    type="button"
                    className="btn sm primary"
                    onClick={() => setAssignTarget(e)}
                    style={{ flex: 1, minHeight: 30, padding: '3px 10px', fontSize: 12, justifyContent: 'center' }}
                  >
                    <Icon name="plane" /> Giao bài
                  </button>
                  <a
                    className="btn sm"
                    href={`#/ra-de?examId=${e.id}${editSuffix}`}
                    style={{ minHeight: 30, padding: '3px 8px', fontSize: 12 }}
                    title="Chỉnh sửa trong Xưởng A4"
                  >
                    Sửa
                  </a>
                  <a
                    className="btn sm ghost"
                    href={`#/dao-de?examId=${e.id}${editSuffix}`}
                    style={{ minHeight: 30, padding: '3px 8px', fontSize: 12 }}
                    title="Trộn đề thành các mã 101, 102, 103..."
                  >
                    Đảo
                  </a>
                  <a
                    className="btn sm ghost"
                    href={`#/de-thi/${e.id}${suffix}`}
                    style={{ minHeight: 30, padding: '3px 8px', fontSize: 12 }}
                  >
                    Chi tiết
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {omrExam && <OmrModal exam={omrExam} onClose={() => setOmrExam(null)} onGraded={() => reload()} />}
      <AssignExamDrawer
        isOpen={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        examId={assignTarget?.id ?? 0}
        examTitle={assignTarget?.title ?? ''}
        durationMin={assignTarget?.durationMin ?? 90}
        defaultClassId={defaultClassId}
        onAssigned={() => reload()}
      />
    </div>
  );
}

const toLocal = (ms: number) => {
  const d = new Date(ms - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

export function ExamDetail({ id }: { id: number }) {
  const {query}=useRoute();
  const requestedClass=Number(query.get('classId'));
  const classSuffix=Number.isSafeInteger(requestedClass)&&requestedClass>0?`?classId=${requestedClass}`:'';
  const { meta, user, toast } = useApp();
  const { data, error, loading, reload } = useAsync(async () => {
    const [e, c] = await Promise.all([get(`/api/exams/${id}`), get('/api/classes')]);
    return { ...e, classes: c.classes };
  }, [id]);
  const [classIds, setClassIds] = useState<number[]>(Number.isSafeInteger(requestedClass)&&requestedClass>0?[requestedClass]:[]);
  const [mode, setMode] = useState<'exam' | 'homework'>('exam');
  const [openAt, setOpenAt] = useState(toLocal(Date.now()));
  const [closeAt, setCloseAt] = useState(toLocal(Date.now() + 7 * 86400000));
  const [duration, setDuration] = useState<number | null>(null);
  const [showResult, setShowResult] = useState<'score_only_until_close' | 'after_close' | 'after_submit'>('score_only_until_close');
  const [resultCustom, setResultCustom] = useState(false);
  const [busy, setBusy] = useState(false);

  const selectMode = (next: 'exam' | 'homework') => {
    setMode(next);
    if (!resultCustom) {
      setShowResult(next === 'exam' ? 'score_only_until_close' : 'after_submit');
    }
  };
  const [showOmr, setShowOmr] = useState(false);
  const [variantMode, setVariantMode] = useState('per_student');
  const [sharing, setSharing] = useState(false);
  const [deptDraft, setDeptDraft] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [variantList, setVariantList] = useState<Record<string,string>>({});
  const roster = useAsync(async () => variantMode === 'list' ? (await Promise.all(classIds.map(c => get(`/api/classes/${c}`)))).flatMap(r => r.students) : [], [variantMode,classIds.join(',')]);
  const tabParam = query.get('tab');
  const [activeTab, setActiveTab] = useState<'overview' | 'shuffler' | 'assign' | 'omr'>(
    tabParam === 'shuffler' || tabParam === 'assign' || tabParam === 'omr' ? tabParam : 'overview'
  );

  useEffect(() => {
    if (tabParam === 'shuffler' || tabParam === 'assign' || tabParam === 'omr' || tabParam === 'overview') {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const exam = data.exam;
  const selectedClasses=classIds.filter(cid=>data.classes.some((c:any)=>c.id===cid));
  const assign = async () => {
    setBusy(true);
    try {
      const list = Object.fromEntries((roster.data ?? []).filter((s: any) => variantList[s.id]).map((s: any) => [s.id,variantList[s.id]]));
      await post('/api/assignments', { examId: id, classIds:selectedClasses, mode, variantMode, variantList:variantMode === 'list' ? list : undefined, openAt: new Date(openAt).getTime(), closeAt: new Date(closeAt).getTime(), durationMin: duration ?? exam.durationMin, showResult });
      toast(`Đã giao đề cho ${selectedClasses.length} lớp.`);
      go(selectedClasses.length===1?`/lop/${selectedClasses[0]}/bai-giao`:'/lop-hoc');
    } catch (e: any) {
      toast(e.message);
      setBusy(false);
    }
  };
  const exportDocx = (solutions: boolean) => download(`/api/exams/${id}/docx${solutions ? '?solutions=1' : ''}`, 'de-thi.docx').catch((e) => toast(e.message));
  const exportPdf = (solutions: boolean) => download(`/api/exams/${id}/pdf${solutions ? '?solutions=1' : ''}`, 'de-thi.pdf').catch((e) => toast(e.message));
  return (
    <div className="stack" style={{ gap: 14 }}>
      {/* 1. Header chi tiết đề */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          padding: '6px 0 10px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => go(`/thu-vien${classSuffix}`)}
            title="Quay lại Kho đề"
          >
            ← Kho đề
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
              {exam.title}
            </h1>
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>
              {exam.items.length} câu hỏi · ⏱ {exam.durationMin} phút · Mã đề: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--ink)' }}>{exam.variants.join(', ')}</span> · GV: {exam.author}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <a
            className="btn sm"
            href={`#/ra-de?examId=${id}${classSuffix ? `&${classSuffix.slice(1)}` : ''}`}
          >
            <Icon name="edit" /> Sửa trong Xưởng A4
          </a>
          <button className="btn sm" type="button" onClick={() => exportDocx(false)}>
            <Icon name="download" /> Tải Word (.docx)
          </button>
          <button className="btn sm" type="button" onClick={() => exportPdf(false)}>
            <Icon name="download" /> Tải PDF (.pdf)
          </button>
          <button
            className="btn sm primary"
            type="button"
            onClick={() => setActiveTab('assign')}
          >
            <Icon name="plane" /> Giao bài cho lớp
          </button>
        </div>
      </div>

      {/* 2. Navigation Tab Bar */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '2px solid var(--line)',
          paddingBottom: 2,
          flexWrap: 'wrap',
        }}
        role="tablist"
        aria-label="Các phân hệ của đề thi"
      >
        {[
          ['overview', '📄 Đề gốc & Ma trận', 'exam'],
          ['shuffler', '🔄 Đảo mã đề & In A4', 'refresh'],
          ['assign', '🚀 Giao bài cho lớp', 'plane'],
          ['omr', '📸 Chấm phiếu OMR', 'scan'],
        ].map(([key, label, icon]) => {
          const isAct = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isAct}
              onClick={() => setActiveTab(key as any)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: '6px 6px 0 0',
                fontSize: 13,
                fontWeight: isAct ? 700 : 550,
                color: isAct ? 'var(--primary)' : 'var(--ink-2)',
                background: isAct ? 'var(--primary-soft)' : 'transparent',
                border: 'none',
                borderBottom: isAct ? '2px solid var(--primary)' : '2px solid transparent',
                marginBottom: -4,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon name={icon} />
              <span>{label}</span>
              {key === 'shuffler' && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: 3,
                    background: isAct ? 'var(--primary)' : 'var(--surface-subtle)',
                    color: isAct ? '#ffffff' : 'var(--ink-3)',
                  }}
                >
                  {exam.variants.length} mã
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 3. Tab Contents */}

      {/* TAB 1: ĐỀ GỐC & MA TRẬN */}
      {activeTab === 'overview' && (
        <div className="stack" style={{ gap: 14 }}>
          <div className="card">
            <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>Nội dung đề thi gốc</h2>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn sm ghost" onClick={() => exportDocx(true)}>
                  Tải kèm lời giải (.docx)
                </button>
                <button className="btn sm ghost" onClick={() => exportPdf(true)}>
                  Tải PDF kèm lời giải
                </button>
                <button
                  className="btn sm ghost"
                  onClick={() =>
                    post(`/api/exams/${id}/clone`, {})
                      .then((r) => {
                        toast('Đã nhân bản đề.');
                        go(`/de-thi/${r.id}${classSuffix}`);
                      })
                      .catch((e) => toast(e.message))
                  }
                >
                  Nhân bản đề
                </button>
                <button
                  className="btn sm"
                  title="Đề mới cùng ma trận (loại, chuyên đề, mức độ từng câu) nhưng khác câu: dùng cho học sinh vắng thi hoặc thi lại"
                  onClick={() =>
                    post<any>(`/api/exams/${id}/equivalent`, {})
                      .then((r) => {
                        toast(`Đã tạo đề tương đương: ${r.exact} câu khớp hoàn toàn${r.warnings?.length ? `. ${r.warnings.join(' ')}` : '.'}`);
                        go(`/de-thi/${r.id}${classSuffix}`);
                      })
                      .catch((e) => toast(e.message))
                  }
                >
                  Đề tương đương
                </button>
              </div>
            </div>
            <p className="tiny muted" style={{ marginTop: 4 }}>Câu hỏi gốc trước khi trộn mã đề. Bấm mở từng câu để kiểm tra phương án và đáp án chi tiết.</p>
            {exam.items.map((it: any, i: number) => {
              const q = data.questions[it.qid];
              if (!q) return null;
              return (
                <div key={it.qid} className="list-item" style={{ alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid var(--line-subtle)' }}>
                  <b className="small" style={{ color: 'var(--primary)', minWidth: 28 }}>{i + 1}.</b>
                  <div className="grow">
                    <MathText as="div" className="small" text={q.stem} />
                    <div className="row tiny" style={{ gap: 6, marginTop: 4 }}>
                      <LevelBadge level={q.level} />
                      <span className="muted">{topicName(meta, q.topic)}</span>
                    </div>
                    <details className="exam-preview-options" style={{ marginTop: 6 }}>
                      <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--ink-3)' }}>Xem phương án & đáp án</summary>
                      {q.type !== 'short' && (
                        <div className="grid-2 small mt">
                          {q.options.map((option: string, k: number) => (
                            <div key={k}>
                              <b>{q.type === 'mcq' ? 'ABCD'[k] + '.' : 'abcd'[k] + ')'}</b> <MathText text={option} />
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="small mt">
                        <b>Đáp án: </b>
                        {q.type === 'mcq'
                          ? 'ABCD'[q.answer]
                          : q.type === 'tf'
                          ? q.answer.map((v: boolean, k: number) => `${'abcd'[k]}) ${v ? 'Đúng' : 'Sai'}`).join(' · ')
                          : String(q.answer ?? '—')}
                      </div>
                    </details>
                  </div>
                </div>
              );
            })}
          </div>

          <details className="card exam-sharing">
            <summary>
              <span><Icon name="school" /> Chia sẻ & đánh giá</span>
              <span className={`badge ${exam.visibility === 'school' ? 'blue' : ''}`}>
                {exam.visibility === 'school' ? 'Đang dùng chung' : 'Đề riêng tư'}
              </span>
            </summary>
            <div className="stack mt">
              <p className="small muted">
                {exam.author} · {exam.ratingCount ? `${exam.ratingAvg}/5 từ ${exam.ratingCount} đánh giá` : 'Chưa có đánh giá'}
              </p>
              {(exam.mine || user.role === 'admin') && (
                <>
                  <label className="field">
                    Tổ chuyên môn
                    <input
                      className="input"
                      maxLength={80}
                      value={deptDraft ?? exam.dept ?? ''}
                      onChange={(e) => setDeptDraft(e.target.value)}
                      placeholder="Ví dụ: Tổ Toán"
                    />
                  </label>
                  <div className="row">
                    {[
                      ['private', 'Lưu riêng tư'],
                      ['school', 'Chia sẻ với trường'],
                    ].map(([visibility, label]) => (
                      <button
                        key={visibility}
                        disabled={sharing}
                        className={`btn ${visibility === 'school' ? 'primary' : ''}`}
                        onClick={async () => {
                          setSharing(true);
                          try {
                            await post(`/api/exams/${id}/share`, { visibility, dept: deptDraft ?? exam.dept ?? '' });
                            toast('Đã lưu chia sẻ đề.');
                            reload();
                          } catch (e: any) {
                            toast(e.message);
                          } finally {
                            setSharing(false);
                          }
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </details>

          <div className="card">
            <Comments kind="exam" id={id} />
          </div>
        </div>
      )}

      {/* TAB 2: ĐẢO MÃ ĐỀ & IN A4 */}
      {activeTab === 'shuffler' && (
        <div className="stack" style={{ gap: 14 }}>
          <VariantShuffler initialExamId={id} embedded={true} />
        </div>
      )}

      {/* TAB 3: GIAO BÀI CHO LỚP */}
      {activeTab === 'assign' && (
        <div className="card stack">
          <div className="row between">
            <h2>Giao bài cho lớp</h2>
            <span className="tiny muted">Chọn lớp, lịch làm bài và cách công bố điểm</span>
          </div>
          <div className="field">
            <label>Lớp</label>
            <div className="row">
              {data.classes.map((c: any) => (
                <label key={c.id} className="check badge" style={{ padding: '6px 12px', fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={classIds.includes(c.id)}
                    onChange={() => setClassIds((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))}
                  />
                  {c.name} ({c.students})
                </label>
              ))}
              {data.classes.length === 0 && <span className="small muted">Bạn chưa phụ trách lớp nào.</span>}
            </div>
          </div>
          <div className="seg">
            <button className={mode === 'exam' ? 'on' : ''} onClick={() => selectMode('exam')}>
              Thi online (tính giờ)
            </button>
            <button className={mode === 'homework' ? 'on' : ''} onClick={() => selectMode('homework')}>
              Bài tập về nhà
            </button>
          </div>
          <div className="grid-3">
            <div className="field">
              <label htmlFor="assign-open">Mở lúc</label>
              <input id="assign-open" className="input" type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="assign-close">Đóng lúc</label>
              <input id="assign-close" className="input" type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} />
            </div>
            {mode === 'exam' && (
              <div className="field">
                <label htmlFor="assign-duration">Thời gian làm (phút)</label>
                <input id="assign-duration" className="input" type="number" min={5} value={duration ?? exam.durationMin} onChange={(e) => setDuration(Number(e.target.value))} />
              </div>
            )}
          </div>
          <div className="field">
            <label htmlFor="assign-variants">Chia mã đề</label>
            <select id="assign-variants" className="input" value={variantMode} onChange={(e) => setVariantMode(e.target.value)}>
              <option value="per_student">Mỗi học sinh một thứ tự riêng</option>
              <option value="random">Chia ngẫu nhiên, đều các mã đã tạo</option>
              <option value="list">Chỉ định mã cho từng học sinh</option>
            </select>
          </div>
          {variantMode === 'list' && (
            <div className="stack">
              <p className="tiny muted">Chọn lớp trước. Những em để tự chia sẽ được phân đều vào các mã còn lại.</p>
              {roster.loading && <Loading />}
              {roster.error && <ErrorBox error={roster.error} onRetry={roster.reload} />}
              {roster.data?.map((s: any) => (
                <label className="row between small" key={s.id}>
                  {s.name ?? s.display_name}
                  <select
                    className="input"
                    style={{ width: 'auto' }}
                    value={variantList[s.id] ?? ''}
                    onChange={(e) => setVariantList({ ...variantList, [s.id]: e.target.value })}
                  >
                    <option value="">Tự chia</option>
                    {exam.variants.map((c: string) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
          <div className="field">
            <label htmlFor="assign-results">Công bố điểm và lời giải</label>
            <select
              id="assign-results"
              className="input"
              value={showResult}
              onChange={(e) => {
                setResultCustom(true);
                setShowResult(e.target.value as any);
              }}
            >
              <option value="score_only_until_close">Xem điểm ngay, ẩn đáp án tới khi đóng đề (Khuyên dùng)</option>
              <option value="after_close">Ẩn cả điểm & đáp án tới khi đóng đề</option>
              <option value="after_submit">Mở điểm & đáp án ngay sau khi nộp</option>
            </select>
          </div>
          <div>
            <button className="btn primary big" disabled={busy || !selectedClasses.length || (variantMode === 'list' && (roster.loading || !!roster.error))} onClick={assign}>
              Giao cho {selectedClasses.length || '…'} lớp
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: CHẤM PHIẾU OMR */}
      {activeTab === 'omr' && (
        <div className="card stack">
          <div className="card-head">
            <h2>Thi trên giấy & Chấm phiếu trắc nghiệm (OMR)</h2>
          </div>
          <p className="small muted">In phiếu trả lời trắc nghiệm chuẩn A4 theo định dạng 2025 có 4 điểm định vị. Quét và chấm bài tự động bằng camera hoặc máy scan.</p>
          <div className="row" style={{ gap: 10, marginTop: 10 }}>
            <button
              type="button"
              className="btn"
              onClick={() => printHtmlFromApi(`/api/omr/template?examId=${id}`).catch((e: any) => toast(e?.message || 'Không tải được phiếu in A4.'))}
            >
              <Icon name="print" /> In phiếu trả lời A4
            </button>
            {meta.omrAvailable && (
              <button className="btn primary" type="button" onClick={() => setShowOmr(true)}>
                <Icon name="scan" /> Quét & Chấm phiếu thi
              </button>
            )}
          </div>
        </div>
      )}

      {showOmr && <OmrModal exam={data} onClose={() => setShowOmr(false)} onGraded={() => toast('Đã chấm xong phiếu!')} />}
    </div>
  );
}
