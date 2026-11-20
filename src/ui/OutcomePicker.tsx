import { get } from '../api';
import { MathText } from './MathText';
import { useAsync } from './kit';

export type CurriculumOutcome = { code: string; grade: number; topic: string; strand: string | null; content: string; text: string; competencies: string[] };
type CurriculumData = { curriculum: { id: number; name: string } | null; outcomes: CurriculumOutcome[] };

/** YCCĐ của chương trình đang công bố (một chuyên đề hoặc tất cả). */
export function useCurriculum(topic?: string | null) {
  return useAsync(
    () => get<CurriculumData>(`/api/curriculum${topic ? `?topic=${encodeURIComponent(topic)}` : ''}`).catch(() => ({ curriculum: null, outcomes: [] }) as CurriculumData),
    [topic ?? ''],
  );
}

/** Chọn YCCĐ mà câu hỏi kiểm tra (trong chương trình đang công bố, theo chuyên đề của câu). */
export function OutcomePicker({ topic, value, onChange }: { topic: string | null | undefined; value: string[]; onChange: (codes: string[]) => void }) {
  const { data, loading } = useCurriculum(topic || null);
  if (!topic || loading || !data?.curriculum) return null;
  const list = data.outcomes;
  const known = new Set(list.map((o) => o.code));
  const other = value.filter((c) => !known.has(c));
  const toggle = (code: string) => onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  return (
    <fieldset className="field mt cur-pick">
      <legend>Yêu cầu cần đạt câu này kiểm tra</legend>
      {list.length === 0 ? (
        <p className="tiny muted">Chương trình chưa có YCCĐ cho chuyên đề này.</p>
      ) : (
        list.map((o) => (
          <label key={o.code} className="cur-pick-row">
            <input type="checkbox" checked={value.includes(o.code)} onChange={() => toggle(o.code)} />
            <code className="cur-code">{o.code}</code>
            <MathText text={o.text} />
          </label>
        ))
      )}
      {other.length > 0 && (
        <p className="tiny muted">
          Mã thuộc chuyên đề khác hoặc đã bỏ khỏi chương trình: {other.join(', ')}{' '}
          <button type="button" className="btn ghost sm" onClick={() => onChange(value.filter((c) => known.has(c)))}>
            Bỏ
          </button>
        </p>
      )}
    </fieldset>
  );
}
