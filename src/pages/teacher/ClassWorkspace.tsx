import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Copy,
  Layers,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react';
import { get, post } from '../../api';
import { ErrorBox, fmtDateTime, fmtScore, go, Loading, scoreColor, topicName, useApp, useAsync, useRoute } from '../../ui/kit';
import { ClassView } from './ClassView';
import { Assignments, Report } from './Report';
import { Appeals } from './Appeals';
import { PeriodicReports } from './PeriodicReports';
import { ClassroomHeaderAndTabs } from '../classroom/ClassroomHeaderAndTabs';
import { ModuleTimeline } from '../classroom/ModuleTimeline';
import { AssessmentTab } from '../classroom/AssessmentTab';
import { AnnouncementsView, ClassInfoView, MembersView } from '../classroom/ClassExtraViews';
import { formatDeadlineShort } from '../classroom/classroomState';
import type { ClassroomSummary, ClassroomTab, TeacherClassPayload } from '../classroom/types';

type LegacyTab = ClassroomTab | 'students' | 'work' | 'results' | 'settings';

function normalizeTab(tab?: LegacyTab): ClassroomTab {
  if (!tab || tab === 'students') return 'overview';
  if (tab === 'work') return 'quizzes';
  if (tab === 'results') return 'grades';
  if (tab === 'settings') return 'info';
  return tab;
}

export function ClassWorkspace({
  id,
  tab = 'overview',
  assignmentId,
}: {
  id: number;
  tab?: LegacyTab;
  assignmentId?: number;
}) {
  const { meta, user, toast } = useApp();
  const { query } = useRoute();

  const [activeTab, setActiveTab] = useState<ClassroomTab>(() => normalizeTab(tab));
  const [busyAction, setBusyAction] = useState(false);

  const initialView = query.get('view');
  const [resultTab, setResultTab] = useState<string>(
    initialView && ['scores', 'analysis', 'period', 'appeals'].includes(initialView) ? initialView : 'scores',
  );

  useEffect(() => {
    setActiveTab(normalizeTab(tab));
  }, [tab, id]);

  useEffect(() => {
    const v = query.get('view');
    if (v && ['scores', 'analysis', 'period', 'appeals'].includes(v)) {
      setResultTab(v);
    }
  }, [query]);

  const { data, error, loading, reload } = useAsync(() => get<TeacherClassPayload>(`/api/classes/${id}`), [id]);
  const { data: listData } = useAsync(() => get<{ classes: ClassroomSummary[] }>('/api/classes?limit=50'), []);
  const { data: weakData, reload: reloadWeak } = useAsync(
    () => get<{ weakGroups: { topic: string; topicName: string; count: number; avgMastery: number }[] }>(`/api/classes/${id}/weak-groups`).catch(() => ({ weakGroups: [] })),
    [id],
  );
  const { data: reviewData, reload: reloadReview } = useAsync(
    () =>
      get<{
        classes: {
          id: number;
          name: string;
          studentsWithOverdue: number;
          totalOverdue: number;
          totalDue: number;
          students: { id: number; name: string; total: number; due: number; overdue: number; maxOverdueDays: number }[];
        }[];
      }>(`/api/teacher/review-stats?classId=${id}`).catch(() => ({ classes: [] })),
    [id],
  );

  const cls = data?.class ?? null;
  const students = data?.students ?? [];
  const assignments = data?.assignments ?? [];
  const modules = data?.modules ?? [];
  const announcements = data?.announcements ?? [];
  const weakGroups = weakData?.weakGroups ?? [];
  const reviewSummary = reviewData?.classes?.[0] ?? null;
  const [showAllOverdue, setShowAllOverdue] = useState(false);
  const overdueStudents = useMemo(
    () =>
      (reviewSummary?.students ?? [])
        .filter((s) => s.overdue > 0 || s.due > 0)
        .sort((a, b) => b.overdue - a.overdue || b.due - a.due),
    [reviewSummary],
  );
  const allClasses = listData?.classes ?? [];

  const stats = useMemo(() => {
    const now = Date.now();
    const openExams = assignments.filter((a) => a.mode === 'exam' && a.open_at <= now && a.close_at >= now);
    const openHw = assignments.filter((a) => a.mode === 'homework' && a.open_at <= now && a.close_at >= now);
    const openAll = assignments.filter((a) => a.open_at <= now && a.close_at >= now);

    const totalPossibleSubs = assignments.length * Math.max(1, students.length);
    const totalSubs = assignments.reduce((s, a) => s + Number(a.submitted || 0), 0);
    const submitRate = assignments.length > 0 && students.length > 0
      ? Math.round((totalSubs / totalPossibleSubs) * 100)
      : null;

    const scored = assignments.filter((a) => a.avg !== null && a.avg !== undefined);
    const avgClassScore = scored.length
      ? scored.reduce((s, a) => s + Number(a.avg || 0), 0) / scored.length
      : null;

    return {
      openExamsCount: openExams.length,
      openHwCount: openHw.length,
      openAll,
      submitRate,
      avgClassScore,
    };
  }, [assignments, students.length]);

  if (loading && !data) return <Loading text="Đang mở không gian lớp học…" />;
  if (error || !cls) return <ErrorBox error={error ?? 'Không mở được lớp học.'} onRetry={reload} />;

  const copyClassCode = async () => {
    try {
      await navigator.clipboard?.writeText(cls.code);
      toast(`Đã sao chép mã lớp ${cls.code}`);
    } catch {
      toast('Chưa sao chép được mã lớp.');
    }
  };

  const assignRemedial5Q = async (topicCode?: string) => {
    setBusyAction(true);
    try {
      await post(`/api/teacher/classes/${id}/remedial`, topicCode ? { topic: topicCode } : {});
      toast('Đã giao bài củng cố 5 câu cho lớp!');
      reload();
      reloadWeak();
    } catch (err: any) {
      toast(err.message || 'Không thể tạo bài củng cố.');
    } finally {
      setBusyAction(false);
    }
  };

  const assignWeakPractice = async (topicCode: string) => {
    setBusyAction(true);
    try {
      await post(`/api/teacher/classes/${id}/practice-assignment`, { topic: topicCode });
      toast(`Đã giao phiếu luyện ${topicName(meta, topicCode)} cho nhóm cần củng cố!`);
      reload();
      reloadWeak();
    } catch (err: any) {
      toast(err.message || 'Không thể giao phiếu luyện.');
    } finally {
      setBusyAction(false);
    }
  };

  const remindReview = async (mode: 'announce' | 'assign', targetIds?: number[]) => {
    setBusyAction(true);
    try {
      const res = await post<any>(`/api/teacher/classes/${id}/remind-review`, {
        mode,
        ...(targetIds?.length ? { studentIds: targetIds } : {}),
      });
      if (mode === 'assign') {
        toast(`Đã giao "${res.title}" (${res.questionCount} câu) cho ${res.targetCount} học sinh đang nợ ôn!`);
      } else {
        toast(`Đã ghim thông báo nhắc ôn tập cho lớp (${res.remindedCount} bạn có câu đến hạn).`);
      }
      reload();
      reloadReview();
    } catch (err: any) {
      toast(err.message || 'Không thể thực hiện thao tác nhắc ôn tập.');
    } finally {
      setBusyAction(false);
    }
  };

  return (
    <div className="cls-scope cls-workspace">
      <ClassroomHeaderAndTabs
        cls={cls}
        role={user.role}
        activeTab={activeTab}
        onSelectTab={(nextTab) => {
          setActiveTab(nextTab);
        }}
        onBackToDirectory={() => go('/lop-hoc')}
        onCopyCode={copyClassCode}
        allClasses={allClasses}
        onSwitchClass={(cid) => go(`/lop/${cid}`)}
        counts={{
          modules: modules.length,
          openQuizzes: stats.openExamsCount,
          openHomework: stats.openHwCount,
          announcements: announcements.length,
          members: students.length,
          appeals: data?.appealsCount ?? 0,
        }}
        primaryAction={{
          label: 'Giao đề cho lớp',
          onClick: () => go(`/thu-vien?classId=${id}`),
        }}
      />

      {/* OVERVIEW TAB (Synchronized 1 Main Workspace + 1 Smart Rail) */}
      {activeTab === 'overview' && (
        <div className="cls-overview-grid">
          <div className="cls-overview-main">
            {/* Số liệu gọn trên một dòng */}
            <div className="su-stats" aria-label="Số liệu lớp">
              <span className="su-stat">Sĩ số <b>{students.length}</b></span>
              <span className={`su-stat ${stats.openAll.length ? 'is-warn' : ''}`}>Bài đang mở <b>{stats.openAll.length}</b></span>
              <span className="su-stat">Tỉ lệ nộp <b>{stats.submitRate !== null ? `${stats.submitRate}%` : '—'}</b></span>
              <span className="su-stat">
                Điểm TB{' '}
                <b style={{ color: stats.avgClassScore !== null ? scoreColor(stats.avgClassScore) : undefined }}>
                  {stats.avgClassScore !== null ? fmtScore(stats.avgClassScore) : '—'}
                </b>
              </span>
              {(data?.appealsCount ?? 0) > 0 && (
                <button type="button" className="su-stat is-warn" style={{ cursor: 'pointer' }} onClick={() => { setResultTab('appeals'); setActiveTab('grades'); }}>
                  Khiếu nại <b>{data?.appealsCount}</b>
                </button>
              )}
              {weakGroups.length > 0 && <span className="su-stat is-warn">Chuyên đề yếu <b>{weakGroups.length}</b></span>}
              {overdueStudents.length > 0 && <span className="su-stat is-warn">Quá hạn ôn <b>{overdueStudents.length}</b> em</span>}
            </div>

            {/* Weak Topics & Action Recommendations */}
            {(weakGroups.length > 0 || (data?.actions?.length ?? 0) > 0) && (
              <section className="cls-surface-card">
                <div className="cls-card-head">
                  <h2>Nhóm chuyên đề cần hỗ trợ</h2>
                  <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                    {weakGroups.length > 0 && (
                      <button
                        type="button"
                        className="cls-btn cls-btn-sm cls-btn-primary"
                        disabled={busyAction}
                        onClick={() => assignRemedial5Q(weakGroups[0]?.topic)}
                      >
                        <Plus size={13} /> Giao củng cố 5 câu
                      </button>
                    )}
                    {weakGroups.length > 0 && (
                      <a
                        className="cls-btn cls-btn-sm cls-btn-ghost"
                        href={`#/ra-de?classId=${id}&topics=${encodeURIComponent(weakGroups.slice(0, 3).map((w) => w.topic).join(','))}&title=${encodeURIComponent(`Đề ôn tập củng cố - ${cls.name}`)}`}
                      >
                        Soạn đề ôn
                      </a>
                    )}
                    <button
                      type="button"
                      className="cls-text-link"
                      onClick={() => {
                        setResultTab('analysis');
                        setActiveTab('grades');
                      }}
                    >
                      Xem Heatmap lớp <ArrowRight size={14} />
                    </button>
                  </div>
                </div>

                <div className="cls-todo-list">
                  {weakGroups.slice(0, 3).map((wg) => (
                    <div key={wg.topic} className="cls-todo-row">
                      <div className="cls-todo-left">
                        <div className="cls-todo-title">{wg.topicName}</div>
                        <div className="cls-todo-meta">
                          <span>{wg.count} học sinh cần ôn</span>
                          <span aria-hidden="true">·</span>
                          <span>Mức nắm vững TB: {Math.round(wg.avgMastery * 100)}%</span>
                        </div>
                      </div>
                      <div className="cls-todo-right">
                        <a
                          className="cls-btn cls-btn-sm cls-btn-ghost"
                          href={`#/ra-de?classId=${id}&topics=${encodeURIComponent(wg.topic)}&title=${encodeURIComponent(`Đề ôn ${wg.topicName} - ${cls.name}`)}`}
                        >
                          Soạn đề chuyên đề
                        </a>
                        <button
                          type="button"
                          className="cls-btn cls-btn-sm cls-btn-ghost"
                          disabled={busyAction}
                          onClick={() => assignWeakPractice(wg.topic)}
                        >
                          Giao phiếu luyện nhóm yếu
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Spaced-Repetition / Mistake Notebook Compliance */}
            <section className="cls-surface-card" aria-label="Theo dõi Sổ tay lỗi sai và nợ ôn tập">
              <div className="cls-card-head">
                <div>
                  <h2 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BookOpenCheck size={17} /> Sổ tay lỗi sai &amp; Nợ ôn tập
                  </h2>
                  <div className="cls-muted-text" style={{ marginTop: 2 }}>
                    {reviewSummary && (reviewSummary.totalDue > 0 || reviewSummary.totalOverdue > 0) ? (
                      <span className="tabular-nums">
                        {reviewSummary.studentsWithOverdue} học sinh quá hạn · {reviewSummary.totalOverdue} câu quá hạn · {reviewSummary.totalDue} câu đến hạn hôm nay
                      </span>
                    ) : (
                      'Theo dõi mức độ hoàn thành ôn lại các câu từng làm sai của học sinh trong lớp.'
                    )}
                  </div>
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="cls-btn cls-btn-sm cls-btn-ghost"
                    disabled={busyAction}
                    onClick={() => remindReview('announce')}
                  >
                    <Bell size={14} /> Nhắc ôn cả lớp
                  </button>
                  {overdueStudents.length > 0 && (
                    <button
                      type="button"
                      className="cls-btn cls-btn-sm cls-btn-primary"
                      disabled={busyAction}
                      onClick={() => remindReview('assign', overdueStudents.map((s) => s.id))}
                    >
                      <Plus size={14} /> Giao luyện bù ({overdueStudents.length} HS)
                    </button>
                  )}
                </div>
              </div>

              {overdueStudents.length === 0 ? (
                <div className="cls-muted-text">
                  Hiện chưa có học sinh nào quá hạn hoặc đến hạn ôn tập Sổ tay lỗi sai.
                </div>
              ) : (
                <div className="cls-todo-list">
                  {overdueStudents.slice(0, showAllOverdue ? overdueStudents.length : 3).map((st) => (
                    <div key={st.id} className="cls-todo-row">
                      <div className="cls-todo-left">
                        <div className="cls-todo-title">
                          <a href={`#/hoc-sinh/${st.id}`}>{st.name}</a>
                        </div>
                        <div className="cls-todo-meta tabular-nums">
                          <span>{st.overdue > 0 ? `${st.overdue} câu quá hạn` : `${st.due} câu đến hạn`}</span>
                          <span aria-hidden="true">·</span>
                          <span>Tổng sổ tay: {st.total} câu</span>
                          {st.maxOverdueDays > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="cls-text-warn">Trễ {st.maxOverdueDays} ngày</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="cls-todo-right">
                        <a className="cls-btn cls-btn-sm cls-btn-ghost" href={`#/hoc-sinh/${st.id}`}>
                          Xem hồ sơ
                        </a>
                      </div>
                    </div>
                  ))}
                  {overdueStudents.length > 3 && (
                    <button type="button" className="cls-text-link" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={() => setShowAllOverdue((v) => !v)}>
                      {showAllOverdue ? 'Thu gọn' : `Xem thêm ${overdueStudents.length - 3} em`}
                    </button>
                  )}
                </div>
              )}
            </section>

            {/* Recent / Active Assignments Summary */}
            <section className="cls-surface-card">
              <div className="cls-card-head">
                <h2>Bài kiểm tra & Bài tập gần đây</h2>
                <button type="button" className="cls-text-link" onClick={() => setActiveTab('quizzes')}>
                  Quản lý bài giao <ArrowRight size={14} />
                </button>
              </div>

              {assignments.length === 0 ? (
                <div className="cls-muted-text">
                  Chưa có bài kiểm tra hoặc bài tập nào được giao cho lớp {cls.name}.
                </div>
              ) : (
                <div className="cls-todo-list">
                  {assignments.slice(0, 5).map((a) => {
                    const dl = formatDeadlineShort(a.close_at);
                    const isOpen = a.open_at <= Date.now() && a.close_at >= Date.now();
                    return (
                      <div key={a.id} className="cls-todo-row">
                        <div className="cls-todo-left">
                          <div className="cls-todo-title">{a.title}</div>
                          <div className="cls-todo-meta">
                            <span>{a.mode === 'exam' ? 'Kiểm tra' : 'Bài tập'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              {a.submitted ?? 0}/{students.length} đã nộp
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className={dl.urgent ? 'cls-text-warn' : ''}>{dl.label}</span>
                          </div>
                        </div>

                        <div className="cls-todo-right">
                          <span className={`cls-status-tag ${isOpen ? 'is-good' : 'is-muted'}`}>
                            {isOpen ? 'Đang mở' : 'Đã đóng'}
                          </span>
                          {a.avg !== null && a.avg !== undefined && (
                            <strong className="cls-score-inline tabular-nums">{fmtScore(a.avg)} đ</strong>
                          )}
                          <a className="cls-btn cls-btn-sm cls-btn-ghost" href={`#/lop/${id}/ket-qua/${a.id}`}>
                            Báo cáo
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Right Context Rail (Overview only) */}
          <aside className="cls-overview-rail" aria-label="Thông tin nhanh lớp học">
            <section className="cls-surface-card">
              <div className="cls-card-head">
                <h3>Mã tham gia lớp</h3>
              </div>
              <div className="cls-code-copy-box" style={{ margin: 0 }}>
                <code>{cls.code}</code>
                <button type="button" className="cls-btn cls-btn-sm cls-btn-ghost" onClick={copyClassCode}>
                  <Copy size={14} /> Sao chép
                </button>
              </div>
              <p className="cls-muted-text" style={{ marginTop: 10, marginBottom: 0 }}>
                Gửi mã này để học sinh tự tham gia vào lớp {cls.name}.
              </p>
            </section>

            <section className="cls-surface-card">
              <div className="cls-card-head">
                <h3>Hạn nộp đang mở</h3>
                <button type="button" className="cls-text-link" onClick={() => setActiveTab('quizzes')}>
                  Xem hết
                </button>
              </div>
              {stats.openAll.length === 0 ? (
                <div className="cls-muted-text">Hiện không có bài nào đang trong thời gian mở.</div>
              ) : (
                <div className="cls-rail-ann-list">
                  {stats.openAll.slice(0, 4).map((a) => (
                    <div key={a.id} className="cls-rail-ann-item">
                      <strong>{a.title}</strong>
                      <small className="tabular-nums">
                        Đóng {fmtDateTime(a.close_at)} · {a.submitted ?? 0}/{students.length} bài
                      </small>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="cls-surface-card">
              <div className="cls-card-head">
                <h3>Truy cập nhanh</h3>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                <a className="cls-btn cls-btn-ghost" href={`#/thu-vien?classId=${id}`} style={{ justifyContent: 'flex-start' }}>
                  <ClipboardCheck size={15} /> Giao đề từ Kho đề
                </a>
                <button
                  type="button"
                  className="cls-btn cls-btn-ghost"
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() => {
                    setResultTab('analysis');
                    setActiveTab('grades');
                  }}
                >
                  <BarChart3 size={15} /> Phân tích năng lực lớp
                </button>
                <button
                  type="button"
                  className="cls-btn cls-btn-ghost"
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() => setActiveTab('announcements')}
                >
                  <Plus size={15} /> Đăng thông báo mới
                </button>
              </div>
            </section>
          </aside>
        </div>
      )}

      {/* MODULES TAB (Full Teacher CRUD) */}
      {activeTab === 'modules' && (
        <ModuleTimeline
          classId={id}
          role={user.role}
          modules={modules}
          assignments={assignments}
          onReload={reload}
        />
      )}

      {/* QUIZZES TAB */}
      {activeTab === 'quizzes' && (
        <AssessmentTab
          mode="exam"
          role={user.role}
          classId={id}
          totalStudents={students.length}
          assignments={assignments}
          modules={modules}
        />
      )}

      {/* HOMEWORK TAB */}
      {activeTab === 'assignments' && (
        <AssessmentTab
          mode="homework"
          role={user.role}
          classId={id}
          totalStudents={students.length}
          assignments={assignments}
          modules={modules}
        />
      )}

      {/* GRADES & ANALYTICS TAB */}
      {activeTab === 'grades' &&
        (assignmentId ? (
          <Report id={assignmentId} classId={id} />
        ) : (
          <div className="cls-grades-wrap">
            <div className="cls-modules-toolbar">
              <div className="cls-segmented" role="group" aria-label="Loại thống kê điểm">
                {[
                  ['scores', 'Bảng điểm'],
                  ['analysis', 'Phân tích (Heatmap)'],
                  ['period', 'Báo cáo định kỳ'],
                  ['appeals', `Khiếu nại${(data?.appealsCount ?? 0) > 0 ? ` (${data?.appealsCount})` : ''}`],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={resultTab === value ? 'is-active' : ''}
                    aria-pressed={resultTab === value}
                    onClick={() => setResultTab(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="cls-surface-card">
              {resultTab === 'scores' && <Assignments classId={id} />}
              {resultTab === 'analysis' && <ClassView id={id} embedded />}
              {resultTab === 'period' && <PeriodicReports classId={id} />}
              {resultTab === 'appeals' && <Appeals classId={id} />}
            </div>
          </div>
        ))}

      {/* ANNOUNCEMENTS TAB */}
      {activeTab === 'announcements' && (
        <AnnouncementsView classId={id} role={user.role} announcements={announcements} onReload={reload} />
      )}

      {/* PEOPLE TAB */}
      {activeTab === 'people' && (
        <MembersView
          cls={cls}
          role={user.role}
          members={students}
          currentUsername={user.username}
          onCopyCode={copyClassCode}
        />
      )}

      {/* CLASS INFO TAB */}
      {activeTab === 'info' && (
        <ClassInfoView cls={cls} role={user.role} onCopyCode={copyClassCode} />
      )}
    </div>
  );
}

export default ClassWorkspace;
