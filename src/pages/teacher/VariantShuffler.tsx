import React, { useEffect, useState } from 'react';
import { download, get, post } from '../../api';
import { MathText } from '../../ui/MathText';
import { ErrorBox, Loading, useApp, useRoute, go, Icon } from '../../ui/kit';
import { CreateExamActionBar } from '../../ui/TeacherNavBars';
import { AssignExamDrawer } from '../../ui/AssignExamDrawer';

interface ExamSummary {
  id: number;
  title: string;
  dept: string | null;
  durationMin: number;
  counts: { mcq: number; tf: number; short: number };
}

interface LayoutItem {
  qid: number;
  type: 'mcq' | 'tf' | 'short';
  perm: number[] | null;
}

interface CrossCell {
  part: string;
  no: number;
  answer: string;
}

interface CrossMatrix {
  codes: string[];
  rows: {
    qid: number;
    type: string;
    cells: Record<string, CrossCell>;
  }[];
}

interface VariantPreviewResponse {
  exam: {
    id: number;
    title: string;
    durationMin: number;
    dept: string;
    variants: string[];
  };
  activeCode: string;
  layout: LayoutItem[];
  questions: Record<number, any>;
  keyMatrix: CrossMatrix;
}

export function VariantShuffler({
  initialExamId,
  embedded = false,
}: {
  initialExamId?: number;
  embedded?: boolean;
} = {}) {
  const { toast } = useApp();
  const { query } = useRoute();
  const requestedClass = query.get('classId');
  const classSuffix = requestedClass && /^\d+$/.test(requestedClass) ? `?classId=${requestedClass}` : '';
  const editSuffix = requestedClass && /^\d+$/.test(requestedClass) ? `&classId=${requestedClass}` : '';
  const defaultClassId = requestedClass && /^\d+$/.test(requestedClass) ? Number(requestedClass) : null;
  const effectiveExamId = initialExamId ?? (query.get('examId') ? Number(query.get('examId')) : undefined);
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number>(effectiveExamId ?? 0);
  const [variantCount, setVariantCount] = useState<number>(6);
  const [startCode, setStartCode] = useState<number>(101);
  const [activeCode, setActiveCode] = useState<string>('101');
  const [viewMode, setViewMode] = useState<'preview' | 'matrix'>('preview');
  const [showSolutions, setShowSolutions] = useState<boolean>(false);
  const [preview, setPreview] = useState<VariantPreviewResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [shuffling, setShuffling] = useState<boolean>(false);
  const [zipDownloading, setZipDownloading] = useState<boolean>(false);
  const [assignOpen, setAssignOpen] = useState<boolean>(false);

  const loadPreview = async (examId: number, code?: string) => {
    if (!examId) return;
    try {
      const q = code ? `?code=${encodeURIComponent(code)}` : '';
      const res = await get<VariantPreviewResponse>(`/api/exams/${examId}/variant-preview${q}`);
      setPreview(res);
      if (res.activeCode) {
        setActiveCode(res.activeCode);
      }
    } catch (e: any) {
      toast(e.message || 'Không tải được bản xem trước mã đề.');
    }
  };

  const loadExams = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await get<{ exams: ExamSummary[] }>('/api/exams');
      const list = res.exams || [];
      setExams(list);
      if (list.length > 0) {
        const targetId = effectiveExamId && list.some((x) => x.id === effectiveExamId)
          ? effectiveExamId
          : list[0].id;
        setSelectedExamId(targetId);
        await loadPreview(targetId);
      }
    } catch (e: any) {
      setError(e.message || 'Không tải được danh sách đề thi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExams();
  }, [effectiveExamId]);

  const handleSelectExam = (id: number) => {
    setSelectedExamId(id);
    loadPreview(id);
  };

  const handleSelectCode = (code: string) => {
    setActiveCode(code);
    if (selectedExamId) {
      loadPreview(selectedExamId, code);
    }
  };

  const handleRegenerateVariants = async () => {
    if (!selectedExamId) return;
    setShuffling(true);
    try {
      const res = await post<{ ok: boolean; variants: string[]; keyMatrix: CrossMatrix }>(
        `/api/exams/${selectedExamId}/regenerate-variants`,
        { count: variantCount, startCode }
      );
      const codes = res.variants || [];
      toast(
        `Đã tạo ${codes.length} mã đề (${codes[0]} → ${codes[codes.length - 1]}) với thứ tự câu hỏi và phương án đảo ngẫu nhiên!`
      );
      const firstNewCode = codes[0] || String(startCode);
      setActiveCode(firstNewCode);
      await loadPreview(selectedExamId, firstNewCode);
    } catch (e: any) {
      toast(e.message || 'Lỗi khi trộn mã đề.');
    } finally {
      setShuffling(false);
    }
  };

  const handleExportDocx = (withSol: boolean) => {
    if (!selectedExamId) return;
    download(
      `/api/exams/${selectedExamId}/docx${withSol ? '?solutions=1' : ''}`,
      `de-thi-${selectedExamId}-${activeCode}.docx`
    ).catch((e) => toast(e.message));
  };

  const handleExportPdf = (withSol: boolean) => {
    if (!selectedExamId) return;
    const params = new URLSearchParams();
    if (activeCode) params.set('code', activeCode);
    if (withSol) params.set('solutions', '1');
    download(
      `/api/exams/${selectedExamId}/pdf?${params.toString()}`,
      `de-thi-${selectedExamId}-ma-${activeCode}.pdf`
    ).catch((e) => toast(e.message));
  };

  const handleExportZip = async () => {
    if (!selectedExamId || zipDownloading) return;
    setZipDownloading(true);
    try {
      await download(
        `/api/exams/${selectedExamId}/variants-zip`,
        `goi-in-de-${selectedExamId}.zip`
      );
      toast('Đã tải gói in: các mã đề, đáp án, ma trận và bản đặc tả, phiếu trả lời.');
    } catch (e: any) {
      toast(e?.message || 'Chưa tải được gói ZIP mã đề.');
    } finally {
      setZipDownloading(false);
    }
  };

  if (loading && !preview) return <Loading text="Đang mở Bộ Trộn & Đảo Mã Đề…" />;
  if (error) return <ErrorBox error={error} onRetry={loadExams} />;

  const availableCodes = preview?.exam.variants || ['101'];
  const layout = preview?.layout || [];
  const questions = preview?.questions || {};
  const keyMatrix = preview?.keyMatrix;

  return (
    <div className="stack" style={{ gap: 14 }}>
      {!embedded && (
        <div className="no-print">
          <CreateExamActionBar active="shuffle" classSuffix={classSuffix} />
        </div>
      )}
      {/* 1. Header 1 dòng tối giản (chỉ khi mở độc lập) */}
      {!embedded && (
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
              Đảo mã đề
            </h1>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>
              Hoán vị câu hỏi và phương án A/B/C/D, xuất bảng đáp án chéo
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {selectedExamId > 0 && (
            <a className="btn sm ghost" href={`#/ra-de?examId=${selectedExamId}${editSuffix}`}>
              Sửa đề gốc
            </a>
          )}
          <button
            type="button"
            className="btn sm"
            disabled={!selectedExamId || zipDownloading}
            onClick={handleExportZip}
            title="Gói in: từng mã đề Word + PDF, đáp án và lời giải, bảng đáp án chéo, ma trận và bản đặc tả, phiếu trả lời"
          >
            {zipDownloading ? 'Đang đóng gói…' : 'Tải gói in (.zip)'}
          </button>
          <button
            type="button"
            className="btn sm"
            disabled={!selectedExamId}
            onClick={() => download(`/api/exams/${selectedExamId}/matrix.docx`, `ma-tran-dac-ta-${selectedExamId}.docx`).catch((e) => toast(e.message))}
            title="Ma trận đề kiểm tra và bản đặc tả (Word)"
          >
            Ma trận & đặc tả
          </button>
          <button
            type="button"
            className="btn sm"
            onClick={() => handleExportDocx(false)}
          >
            Tải Word (.docx)
          </button>
          <button
            type="button"
            className="btn sm"
            onClick={() => handleExportPdf(false)}
          >
            Tải PDF (Mã {activeCode})
          </button>
          <button
            type="button"
            className="btn sm"
            onClick={() => handleExportDocx(true)}
          >
            Kèm lời giải
          </button>
          <button
            type="button"
            className="btn sm"
            onClick={() => window.print()}
          >
            In trình duyệt
          </button>
          <button
            type="button"
            className="btn sm primary"
            disabled={!selectedExamId}
            onClick={() => setAssignOpen(true)}
          >
            <Icon name="plane" /> Giao lớp
          </button>
        </div>
      </div>
      )}

      {/* 2. Thanh điều khiển trộn đề tinh gọn */}
      <section
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius)',
          padding: '14px 16px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 10,
            alignItems: 'end',
          }}
        >
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
              Chọn đề gốc trong kho ({exams.length} đề):
            </label>
            <select
              className="select sm"
              value={selectedExamId}
              onChange={(e) => handleSelectExam(Number(e.target.value))}
              style={{ width: '100%', fontWeight: 600 }}
            >
              {exams.map((ex) => {
                const total = (ex.counts?.mcq || 0) + (ex.counts?.tf || 0) + (ex.counts?.short || 0);
                return (
                  <option key={ex.id} value={ex.id}>
                    [Đề #{ex.id}] {ex.title} ({total} câu · {ex.durationMin}p)
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
              Số lượng mã đề:
            </label>
            <select
              className="select sm tabular-nums"
              value={variantCount}
              onChange={(e) => setVariantCount(Number(e.target.value))}
              style={{ width: '100%', fontWeight: 600 }}
            >
              {[2, 4, 6, 8, 12, 16, 24].map((n) => (
                <option key={n} value={n}>
                  {n} mã đề
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
              Mã bắt đầu:
            </label>
            <select
              className="select sm tabular-nums"
              value={startCode}
              onChange={(e) => setStartCode(Number(e.target.value))}
              style={{ width: '100%', fontWeight: 600 }}
            >
              <option value={101}>101</option>
              <option value={201}>201</option>
              <option value={301}>301</option>
              <option value={401}>401</option>
            </select>
          </div>

          <div>
            <button
              type="button"
              className="btn sm primary"
              onClick={handleRegenerateVariants}
              disabled={shuffling || !selectedExamId}
              style={{ width: '100%', minHeight: 34 }}
            >
              {shuffling ? 'Đang trộn…' : `Trộn ${variantCount} mã đề`}
            </button>
          </div>
        </div>

        {/* Chuyển mã đề và chế độ xem */}
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: '1px solid var(--line-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--ink-3)', marginRight: 2 }}>Mã đề:</span>
            {availableCodes.map((code) => {
              const active = code === activeCode;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => handleSelectCode(code)}
                  className="tabular-nums"
                  style={{
                    padding: '4px 10px',
                    borderRadius: 5,
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    border: active ? '1px solid var(--primary)' : '1px solid var(--line)',
                    background: active ? 'var(--primary-soft)' : 'var(--surface)',
                    color: active ? 'var(--primary)' : 'var(--ink)',
                  }}
                >
                  {code}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="seg">
              <button
                type="button"
                className={viewMode === 'preview' ? 'on' : ''}
                onClick={() => setViewMode('preview')}
              >
                Bản in đề thi A4
              </button>
              <button
                type="button"
                className={viewMode === 'matrix' ? 'on' : ''}
                onClick={() => setViewMode('matrix')}
              >
                Bảng đáp án chéo
              </button>
            </div>

            {viewMode === 'preview' && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showSolutions}
                  onChange={(e) => setShowSolutions(e.target.checked)}
                />
                Hiện lời giải
              </label>
            )}
          </div>
        </div>
      </section>

      {/* 3. Hiển thị Bản in A4 hoặc Ma trận đáp án */}
      {viewMode === 'matrix' && keyMatrix ? (
        <section
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--surface-subtle)',
              borderBottom: '1px solid var(--line)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              Bảng đáp án chéo các mã đề — {preview?.exam.title}
            </div>
            <span className="tabular-nums" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {keyMatrix.rows.length} câu × {keyMatrix.codes.length} mã đề
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-subtle)', borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--ink-2)', borderRight: '1px solid var(--line)', width: 110 }}>
                    Câu gốc
                  </th>
                  {keyMatrix.codes.map((code) => (
                    <th
                      key={code}
                      className="tabular-nums"
                      style={{
                        padding: '8px 12px',
                        textAlign: 'center',
                        fontWeight: 700,
                        borderRight: '1px solid var(--line)',
                        color: code === activeCode ? 'var(--primary)' : 'var(--ink)',
                        background: code === activeCode ? 'var(--primary-soft)' : undefined,
                      }}
                    >
                      Mã {code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {keyMatrix.rows.map((row, idx) => (
                  <tr key={row.qid} style={{ borderBottom: '1px solid var(--line-subtle)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600, borderRight: '1px solid var(--line)', background: 'var(--surface-subtle)' }}>
                      Câu #{idx + 1}
                    </td>
                    {keyMatrix.codes.map((code) => {
                      const cell = row.cells[code];
                      return (
                        <td
                          key={code}
                          style={{
                            padding: '8px 12px',
                            textAlign: 'center',
                            borderRight: '1px solid var(--line-subtle)',
                            background: code === activeCode ? 'var(--primary-subtle)' : undefined,
                          }}
                        >
                          {cell ? (
                            <div>
                              <span style={{ fontSize: 11, color: 'var(--ink-3)', marginRight: 4 }}>
                                {cell.part}.{cell.no}:
                              </span>
                              <strong style={{ color: code === activeCode ? 'var(--primary)' : 'var(--ink)' }}>
                                {cell.answer}
                              </strong>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        /* Bản xem trước A4 dạng giấy in sạch sẽ */
        <section
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius)',
            padding: '28px 32px',
            maxWidth: 880,
            margin: '0 auto',
            width: '100%',
            boxShadow: 'var(--shadow)',
          }}
        >
          {/* Header tờ đề thi */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              paddingBottom: 16,
              marginBottom: 20,
              borderBottom: '2px solid var(--ink)',
              gap: 16,
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                HỆ THỐNG KHẢO THÍ CHUẨN BỘ GD&ĐT
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', textTransform: 'uppercase', marginTop: 2 }}>
                {preview?.exam.title}
              </div>
              <div className="tabular-nums" style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>
                Môn: {preview?.exam.dept || 'Toán'} · Thời gian làm bài: {preview?.exam.durationMin || 90} phút
              </div>
            </div>

            <div
              style={{
                border: '2px solid var(--ink)',
                padding: '4px 14px',
                borderRadius: 4,
                textAlign: 'center',
                background: 'var(--surface-subtle)',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)' }}>MÃ ĐỀ THI</div>
              <div className="tabular-nums" style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>
                {activeCode}
              </div>
            </div>
          </div>

          {/* Danh sách câu hỏi */}
          <div className="stack" style={{ gap: 16 }}>
            {(['mcq', 'tf', 'short'] as const).map((partType) => {
              const partItems = layout.filter((x) => x.type === partType);
              if (partItems.length === 0) return null;

              const partHeading = {
                mcq: `PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn (1 đến ${partItems.length}).`,
                tf: `PHẦN II. Câu trắc nghiệm Đúng / Sai (1 đến ${partItems.length}).`,
                short: `PHẦN III. Câu trắc nghiệm trả lời ngắn (1 đến ${partItems.length}).`,
              }[partType];

              return (
                <div key={partType} className="stack" style={{ gap: 12 }}>
                  <div
                    style={{
                      padding: '6px 10px',
                      background: 'var(--surface-subtle)',
                      borderLeft: '3px solid var(--primary)',
                      fontWeight: 700,
                      fontSize: 13,
                      color: 'var(--ink)',
                    }}
                  >
                    {partHeading}
                  </div>

                  {partItems.map((it, idx) => {
                    const q = questions[it.qid];
                    if (!q) return null;
                    const perm = it.perm || [0, 1, 2, 3];
                    const displayedCorrectIdx =
                      partType === 'mcq' ? perm.indexOf(Number(q.answer)) : -1;

                    return (
                      <div
                        key={`${it.qid}-${idx}`}
                        style={{
                          paddingBottom: 12,
                          borderBottom: '1px solid var(--line-subtle)',
                          fontSize: 14,
                          color: 'var(--ink)',
                          lineHeight: 1.55,
                        }}
                      >
                        <div style={{ marginBottom: 6 }}>
                          <strong className="tabular-nums">Câu {idx + 1}: </strong>
                          <MathText text={q.stem} />
                        </div>

                        {partType === 'mcq' && Array.isArray(q.options) && (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                              gap: 6,
                              paddingLeft: 8,
                            }}
                          >
                            {perm.map((origIdx, dispIdx) => {
                              const letter = 'ABCD'[dispIdx];
                              const optText = q.options[origIdx] ?? '';
                              const isCorrect = showSolutions && dispIdx === displayedCorrectIdx;
                              return (
                                <div
                                  key={dispIdx}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: 4,
                                    background: isCorrect ? 'var(--good-soft)' : 'transparent',
                                    color: isCorrect ? 'var(--good)' : 'var(--ink)',
                                    fontWeight: isCorrect ? 600 : 400,
                                  }}
                                >
                                  <strong>{letter}. </strong>
                                  <MathText text={optText} />
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {partType === 'tf' && Array.isArray(q.options) && (
                          <div className="stack" style={{ gap: 4, paddingLeft: 8 }}>
                            {q.options.map((optText: string, k: number) => {
                              const ansBool = Array.isArray(q.answer) ? q.answer[k] : false;
                              return (
                                <div
                                  key={k}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '4px 8px',
                                    background: 'var(--surface-subtle)',
                                    borderRadius: 4,
                                    fontSize: 13,
                                  }}
                                >
                                  <div>
                                    <strong>{'abcd'[k]}) </strong>
                                    <MathText text={optText} />
                                  </div>
                                  {showSolutions && (
                                    <strong style={{ color: ansBool ? 'var(--good)' : 'var(--bad)', marginLeft: 8 }}>
                                      {ansBool ? 'Đúng' : 'Sai'}
                                    </strong>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {partType === 'short' && (
                          <div style={{ paddingLeft: 8, marginTop: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                              Điền đáp số: .......................
                            </span>
                            {showSolutions && (
                              <strong className="tabular-nums" style={{ fontSize: 12.5, color: 'var(--good)' }}>
                                Đáp số: {String(q.answer ?? '')}
                              </strong>
                            )}
                          </div>
                        )}

                        {showSolutions && q.explanation && (
                          <div
                            style={{
                              marginTop: 8,
                              padding: '8px 12px',
                              borderRadius: 6,
                              background: 'var(--surface-subtle)',
                              borderLeft: '2px solid var(--accent)',
                              fontSize: 12.5,
                              color: 'var(--ink-2)',
                            }}
                          >
                            <strong>Lời giải: </strong>
                            <MathText text={q.explanation} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      )}
      <AssignExamDrawer
        isOpen={assignOpen}
        onClose={() => setAssignOpen(false)}
        examId={selectedExamId}
        examTitle={preview?.exam.title || ''}
        durationMin={preview?.exam.durationMin || 90}
        defaultClassId={defaultClassId}
      />
    </div>
  );
}
