import { get } from '../../api';
import { ErrorBox, fmtScore, Loading, scoreColor, useAsync } from '../../ui/kit';
import { Progress } from './Progress';
import { MyAppeals } from './MyAppeals';

const TABS: [string, string, string][] = [
  ['results', 'Hồ sơ', '/ho-so'],
  ['progress', 'Câu cần ôn', '/tien-bo'],
  ['appeals', 'Khiếu nại', '/khieu-nai'],
];

export function StudentResults({ initial = 'results' }: { initial?: string }) {
  return (
    <div className="su-page">
      <header className="su-head">
        <div>
          <h1>{initial === 'appeals' ? 'Khiếu nại' : 'Câu cần ôn'}</h1>
          <p className="su-sub">{initial === 'appeals' ? 'Khiếu nại điểm đã gửi và kết quả xử lý' : 'Tiến bộ theo chuyên đề và câu đến hạn ôn'}</p>
        </div>
        <nav className="seg" aria-label="Kết quả và tiến bộ">
          {TABS.map(([value, label, href]) => (
            <a
              key={value}
              href={`#${href}`}
              className={initial === value ? 'on' : ''}
              aria-current={initial === value ? 'page' : undefined}
              style={{ textDecoration: 'none' }}
            >
              {label}
            </a>
          ))}
        </nav>
      </header>
      {initial === 'results' ? <ResultsList /> : initial === 'progress' ? <Progress /> : <MyAppeals />}
    </div>
  );
}

function ResultsList() {
  const { data, error, loading, reload } = useAsync(() => get('/api/student/home'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const rows = (data?.assignments ?? []).filter((a: any) => a.state === 'done');
  const scores = rows.filter((a: any) => a.score10 !== null).map((a: any) => a.score10);
  const avg = scores.length ? scores.reduce((x: number, y: number) => x + y, 0) / scores.length : null;
  const max = scores.length ? Math.max(...scores) : null;

  return (
    <>
      <div className="su-stats">
        <span className="su-stat">Đã nộp <b>{rows.length}</b> bài</span>
        <span className="su-stat">Điểm TB <b style={{ color: scoreColor(avg) }}>{avg === null ? '—' : fmtScore(avg)}</b></span>
        <span className="su-stat">Cao nhất <b style={{ color: scoreColor(max) }}>{max === null ? '—' : fmtScore(max)}</b></span>
      </div>

      <section className="su-card" style={{ padding: '4px 16px' }} aria-label="Bài đã làm">
        {rows.length === 0 ? (
          <div className="su-empty">Chưa có bài nào đã nộp.</div>
        ) : (
          <div className="su-list">
            {rows.map((a: any) => {
              const score = a.score10;
              return (
                <div key={a.id} className="su-row">
                  <div className="su-score" style={{ fontSize: 20, minWidth: 48, color: scoreColor(score) }}>
                    {score !== null ? fmtScore(score) : '—'}
                  </div>
                  <div className="su-row-main">
                    <div className="su-row-title">{a.title}</div>
                    <div className="su-row-meta">
                      {a.mode === 'exam' ? 'Bài thi' : 'Bài tập'} · {a.subject || 'Toán học'}
                      {score === null && <span className="su-chip is-warn">Chờ công bố điểm</span>}
                    </div>
                  </div>
                  <a className="btn sm" href={`#/ket-qua/${a.attempt_id}`}>
                    {score !== null ? 'Xem bài làm' : 'Bài nộp'}
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
