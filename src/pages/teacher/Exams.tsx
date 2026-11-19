import { useEffect, useState } from 'react';
import { download, get, post, put, printHtmlFromApi } from '../../api';
import { EXAM_CATEGORIES } from '../../../shared/examCategory.mjs';
import { MathText } from '../../ui/MathText';
import { Comments } from '../../ui/Comments';
import { OmrModal } from '../../ui/OmrModal';
import { PageHeading, shareUrl, ErrorBox, fmtDate, go, LevelBadge, Icon, Loading, topicName, useApp, useAsync, useRoute } from '../../ui/kit';
import { VariantShuffler } from './VariantShuffler';
import { LibrarySubNavBar } from '../../ui/TeacherNavBars';
import { AssignExamDrawer } from '../../ui/AssignExamDrawer';
import { ExamLibrary, ExamMetaPanel } from './ExamLibrary';

/** Kho đề (danh sách): xem ExamLibrary. */
export function Exams() {
  return <ExamLibrary />;
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

      <section className="card" style={{ padding: '10px 14px' }} aria-label="Trạng thái và phiên bản">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="small">
            <b>Phiên bản v{exam.version ?? 1}</b>
            {exam.supersededBy ? (
              <span className="muted"> · bản cũ, đã có bản mới hơn</span>
            ) : exam.locked ? (
              <span className="muted"> · {exam.lockReason}: đã khóa. Sửa đề sẽ tạo phiên bản mới, lớp đã làm vẫn giữ bản này.</span>
            ) : (
              <span className="muted"> · chưa dùng, sửa thẳng được</span>
            )}
          </div>
          {user.role === 'admin' && !exam.supersededBy && (
            <label className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={Boolean(exam.official)}
                onChange={async (ev) => {
                  try {
                    await post(`/api/exams/${id}/official`, { official: ev.target.checked });
                    toast(ev.target.checked ? 'Đề đã hiện ở mục Đề thi của học sinh.' : 'Đã gỡ đề khỏi mục Đề thi của học sinh.');
                    reload();
                  } catch (err: any) {
                    toast(err.message);
                  }
                }}
              />
              Đề chính thức (hiện cho học sinh)
            </label>
          )}
        </div>
        {(exam.versions?.length ?? 0) > 1 && (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {exam.versions.map((v: any) => (
              <a key={v.id} href={`#/de-thi/${v.id}`} className={`badge ${v.id === exam.id ? 'blue' : ''}`} style={{ textDecoration: 'none' }}>
                v{v.version}{v.current ? ' (mới nhất)' : ''}{v.assigned ? ` · giao ${v.assigned} lần` : ''}
              </a>
            ))}
          </div>
        )}
        <ExamMetaPanel key={`${exam.id}-${exam.title}`} id={id} exam={exam} onSaved={reload} />
      </section>

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
                      ['school', 'Chia sẻ với giáo viên trong trường'],
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
