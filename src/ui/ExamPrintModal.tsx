import React, { useState } from 'react';
import { Modal } from './kit';
import { MathText } from './MathText';

interface ExamPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  examTitle: string;
  items: any[];
  questions: Record<number, any>;
  durationMin?: number;
}

export function ExamPrintModal({
  isOpen,
  onClose,
  examTitle,
  items,
  questions,
  durationMin = 90,
}: ExamPrintModalProps) {
  const [department, setDepartment] = useState('SỞ GIÁO DỤC VÀ ĐÀO TẠO');
  const [school, setSchool] = useState('TRƯỜNG THPT CHUYÊN TOÁN');
  const [examName, setExamName] = useState('KỲ THI KHẢO SÁT CHẤT LƯỢNG LỚP 12');
  const [examCode, setExamCode] = useState('101');
  const [twoColumn, setTwoColumn] = useState(true);
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);
  const [includeMatrix, setIncludeMatrix] = useState(false);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  // Group items
  const part1 = items.filter((x) => x.type === 'mcq');
  const part2 = items.filter((x) => x.type === 'tf');
  const part3 = items.filter((x) => x.type === 'short');

  return (
    <Modal title="Xuất bản in & PDF Chuẩn Bộ GD&ĐT" onClose={onClose} width={1000}>
      <div className="exam-print-modal-body">
        {/* Configuration Bar */}
        <div className="print-config-panel no-print card">
          <div className="config-grid">
            <div className="config-field">
              <label className="text-xs font-semibold muted">Sở / Đơn vị:</label>
              <input
                className="input input-sm"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>
            <div className="config-field">
              <label className="text-xs font-semibold muted">Trường THPT:</label>
              <input
                className="input input-sm"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
              />
            </div>
            <div className="config-field">
              <label className="text-xs font-semibold muted">Tên kỳ thi:</label>
              <input
                className="input input-sm"
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
              />
            </div>
            <div className="config-field">
              <label className="text-xs font-semibold muted">Mã đề:</label>
              <input
                className="input input-sm"
                style={{ width: 80 }}
                value={examCode}
                onChange={(e) => setExamCode(e.target.value)}
              />
            </div>
          </div>

          <div className="config-toggles-row">
            <label className="toggle-check-label">
              <input
                type="checkbox"
                checked={twoColumn}
                onChange={(e) => setTwoColumn(e.target.checked)}
              />
              <span>Dàn trang 2 cột (tiết kiệm giấy in photo)</span>
            </label>
            <label className="toggle-check-label">
              <input
                type="checkbox"
                checked={includeAnswerKey}
                onChange={(e) => setIncludeAnswerKey(e.target.checked)}
              />
              <span>Kèm bảng đáp án trang cuối</span>
            </label>
            <label className="toggle-check-label">
              <input
                type="checkbox"
                checked={includeMatrix}
                onChange={(e) => setIncludeMatrix(e.target.checked)}
              />
              <span>Kèm ma trận đề thi</span>
            </label>

            <button
              type="button"
              className="btn primary print-trigger-btn"
              onClick={handlePrint}
            >
              🖨️ In đề / Xuất PDF (Ctrl + P)
            </button>
          </div>
        </div>

        {/* Live A4 Print Paper Preview Container */}
        <div className="print-preview-viewport">
          <div className={`printable-exam-paper ${twoColumn ? 'layout-two-column' : 'layout-one-column'}`}>
            {/* Standard Ministry Header */}
            <div className="print-header-grid">
              <div className="print-header-left">
                <div className="print-dept-name">{department}</div>
                <div className="print-school-name">{school}</div>
                <div className="print-line-sep" />
                <div className="print-draft-status">ĐỀ THI CHÍNH THỨC</div>
                <div className="print-page-note">(Đề thi có {items.length} câu)</div>
              </div>

              <div className="print-header-right">
                <div className="print-exam-name">{examName}</div>
                <div className="print-subject-name">BÀI THI: MÔN TOÁN</div>
                <div className="print-time-allowance">
                  Thời gian làm bài: <strong>{durationMin} phút</strong>, không kể thời gian phát đề
                </div>
                <div className="print-code-box">
                  MÃ ĐỀ THI: <strong>{examCode}</strong>
                </div>
              </div>
            </div>

            {/* Candidate Info Box */}
            <div className="print-candidate-box">
              <div className="candidate-field">
                Họ và tên thí sinh: ............................................................................................
              </div>
              <div className="candidate-field">
                Số báo danh: ................................................. Phòng thi: ....................
              </div>
            </div>

            {/* Part I: MCQ */}
            {part1.length > 0 && (
              <div className="print-exam-section">
                <div className="print-section-heading">
                  <strong>PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.</strong> Thí sinh trả lời từ câu 1 đến câu {part1.length}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.
                </div>
                <div className="print-questions-flow">
                  {part1.map((item, idx) => {
                    const q = questions[item.qid] || item;
                    return (
                      <div key={item.qid || idx} className="print-q-item">
                        <div className="print-q-stem">
                          <strong>Câu {idx + 1}:</strong> <MathText text={q.stem} />
                        </div>
                        {q.options && (
                          <div className="print-mcq-options-grid">
                            {q.options.map((opt: string, optIdx: number) => (
                              <div key={optIdx} className="print-opt-item">
                                <strong>{'ABCD'[optIdx]}.</strong> <MathText text={opt} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Part II: True/False */}
            {part2.length > 0 && (
              <div className="print-exam-section">
                <div className="print-section-heading">
                  <strong>PHẦN II. Câu trắc nghiệm đúng sai.</strong> Thí sinh trả lời từ câu 1 đến câu {part2.length}. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.
                </div>
                <div className="print-questions-flow">
                  {part2.map((item, idx) => {
                    const q = questions[item.qid] || item;
                    return (
                      <div key={item.qid || idx} className="print-q-item">
                        <div className="print-q-stem">
                          <strong>Câu {idx + 1}:</strong> <MathText text={q.stem} />
                        </div>
                        {q.options && (
                          <div className="print-tf-options-list">
                            {q.options.map((opt: string, optIdx: number) => (
                              <div key={optIdx} className="print-tf-item">
                                <strong>{'abcd'[optIdx]})</strong> <MathText text={opt} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Part III: Short Answer */}
            {part3.length > 0 && (
              <div className="print-exam-section">
                <div className="print-section-heading">
                  <strong>PHẦN III. Câu trắc nghiệm trả lời ngắn.</strong> Thí sinh trả lời từ câu 1 đến câu {part3.length}.
                </div>
                <div className="print-questions-flow">
                  {part3.map((item, idx) => {
                    const q = questions[item.qid] || item;
                    return (
                      <div key={item.qid || idx} className="print-q-item">
                        <div className="print-q-stem">
                          <strong>Câu {idx + 1}:</strong> <MathText text={q.stem} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="print-exam-footer-center">
              -------------- HẾT --------------
              <div className="sub-note">Cán bộ coi thi không giải thích gì thêm.</div>
            </div>

            {/* Optional Appendix: Answer Key */}
            {includeAnswerKey && (
              <div className="print-appendix-section print-page-break">
                <div className="appendix-heading">
                  ĐÁP ÁN ĐỀ THI - MÃ ĐỀ: {examCode}
                </div>

                {/* Part 1 Answers */}
                {part1.length > 0 && (
                  <div className="answer-key-block">
                    <div className="key-block-title">PHẦN I: (Mỗi câu đúng 0,25 điểm)</div>
                    <div className="answers-compact-grid">
                      {part1.map((item, idx) => {
                        const q = questions[item.qid] || item;
                        const ansLetter = typeof q.correctAnswer === 'number' ? 'ABCD'[q.correctAnswer] : (q.correctAnswer ?? '-');
                        return (
                          <div key={idx} className="answer-cell">
                            <span className="q-num">{idx + 1}</span>
                            <span className="q-ans">{ansLetter}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Part 2 Answers */}
                {part2.length > 0 && (
                  <div className="answer-key-block">
                    <div className="key-block-title">PHẦN II: (Quy tắc tính điểm chuẩn Bộ GD&ĐT)</div>
                    <div className="answers-compact-grid">
                      {part2.map((item, idx) => {
                        const q = questions[item.qid] || item;
                        const parts = Array.isArray(q.correctAnswer) ? q.correctAnswer.map((x: boolean) => (x ? 'Đ' : 'S')).join('·') : '-';
                        return (
                          <div key={idx} className="answer-cell wide">
                            <span className="q-num">C{idx + 1}</span>
                            <span className="q-ans">{parts}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Part 3 Answers */}
                {part3.length > 0 && (
                  <div className="answer-key-block">
                    <div className="key-block-title">PHẦN III: (Mỗi câu đúng 0,5 điểm)</div>
                    <div className="answers-compact-grid">
                      {part3.map((item, idx) => {
                        const q = questions[item.qid] || item;
                        return (
                          <div key={idx} className="answer-cell wide">
                            <span className="q-num">C{idx + 1}</span>
                            <span className="q-ans">{String(q.correctAnswer ?? '-').split(';')[0]}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
