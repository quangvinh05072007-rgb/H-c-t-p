import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  Bell,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  KeyRound,
  Layers,
  Play,
  Sparkles,
} from 'lucide-react';
import { get, post } from '../../api';
import { ErrorBox, fmtDateTime, fmtScore, go, Loading, Modal, scoreColor, useApp, useAsync } from '../../ui/kit';
import { ClassDirectoryGrid } from '../classroom/ClassDirectoryGrid';
import { ClassroomHeaderAndTabs } from '../classroom/ClassroomHeaderAndTabs';
import { ModuleTimeline } from '../classroom/ModuleTimeline';
import { AssessmentTab } from '../classroom/AssessmentTab';
import { GradesTab } from '../classroom/GradesTab';
import { AnnouncementsView, ClassInfoView, MembersView } from '../classroom/ClassExtraViews';
import {
  formatDeadlineShort,
  formatLastStudy,
  getAssignmentStatusMeta,
  getNextFocusItem,
} from '../classroom/classroomState';
import type { ClassMaterial, ClassroomSummary, ClassroomTab, StudentClassPayload } from '../classroom/types';

export function StudentClass({
  initialClassId,
  initialView = 'directory',
  initialTab = 'overview',
}: {
  initialClassId?: number | string;
  initialView?: 'directory' | 'class' | 'all_classes';
  initialTab?: ClassroomTab;
}) {
  const { user, refreshUser, toast } = useApp();

  const parseSafeId = (val: unknown): number | null => {
    if (typeof val === 'number' && !isNaN(val) && val > 0) return val;
    if (typeof val === 'string' && /^\d+$/.test(val)) {
      const n = Number(val);
      if (!isNaN(n) && n > 0) return n;
    }
    return null;
  };

  const parsedInitialId = parseSafeId(initialClassId);
  const startInClass = parsedInitialId !== null || initialView === 'class';

  const [viewMode, setViewMode] = useState<'directory' | 'class'>(startInClass ? 'class' : 'directory');
  const [selectedClassId, setSelectedClassId] = useState<number | null>(parsedInitialId);
  const [activeTab, setActiveTab] = useState<ClassroomTab>(initialTab);
  const [externalMaterial, setExternalMaterial] = useState<ClassMaterial | null>(null);
  const [busyExam, setBusyExam] = useState(false);

  // Join / Leave Modals for inside empty/header state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busyModal, setBusyModal] = useState(false);

  useEffect(() => {
    const safe = parseSafeId(initialClassId);
    if (safe !== null) {
      setSelectedClassId(safe);
      setViewMode('class');
    } else if (initialView === 'directory' || initialView === 'all_classes') {
      setViewMode('directory');
    } else if (initialView === 'class') {
      setViewMode('class');
    }
  }, [initialClassId, initialView]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const fetchUrl = selectedClassId ? `/api/student/class?classId=${selectedClassId}` : '/api/student/class';
  const { data, error, loading, reload } = useAsync(() => get<StudentClassPayload>(fetchUrl), [fetchUrl]);

  const cls = data?.class ?? null;
  const assignments = data?.assignments ?? [];
  const allClasses = data?.allClasses ?? [];
  const classmates = data?.classmates ?? [];
  const modules = data?.modules ?? [];
  const announcements = data?.announcements ?? [];

  const counts = useMemo(() => {
    const openQuizzes = assignments.filter((a) => a.mode === 'exam' && (a.state === 'open' || a.state === 'doing')).length;
    const openHomework = assignments.filter((a) => a.mode === 'homework' && (a.state === 'open' || a.state === 'doing')).length;
    return {
      modules: modules.length,
      openQuizzes,
      openHomework,
      announcements: announcements.length,
      members: classmates.length,
      appeals: data?.appealsCount ?? 0,
    };
  }, [announcements.length, assignments, classmates.length, data?.appealsCount, modules.length]);

  const overviewStats = useMemo(() => {
    const totalMats = modules.reduce((s, m) => s + m.materials.length, 0);
    const viewedMats = modules.reduce((s, m) => s + m.materials.filter((mat) => mat.viewed).length, 0);
    const doneAsg = assignments.filter((a) => a.state === 'done').length;
    const totalTasks = totalMats + assignments.length;
    const doneTasks = viewedMats + doneAsg;
    const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const pendingAssignments = assignments
      .filter((a) => a.state === 'open' || a.state === 'doing')
      .sort((a, b) => a.close_at - b.close_at);

    const graded = assignments.filter(
      (a) => a.state === 'done' && a.resultVisible && a.score10 !== null && a.score10 !== undefined,
    );
    const avgScore = graded.length
      ? graded.reduce((s, a) => s + Number(a.score10 || 0), 0) / graded.length
      : null;

    const todoItems = assignments
      .filter((a) => a.state !== 'done')
      .sort((a, b) => {
        const rank = (s?: string) => (s === 'doing' ? 0 : s === 'open' ? 1 : s === 'upcoming' ? 2 : 3);
        const rDiff = rank(a.state) - rank(b.state);
        return rDiff !== 0 ? rDiff : a.close_at - b.close_at;
      });

    const focus = getNextFocusItem(modules, assignments);

    return {
      totalMats,
      viewedMats,
      doneAsg,
      totalTasks,
      doneTasks,
      progressPct,
      pendingCount: pendingAssignments.length,
      avgScore,
      gradedCount: graded.length,
      todoItems,
      focus,
    };
  }, [assignments, modules]);

  const modLockedMap = useMemo(
    () => new Map(modules.map((m) => [m.id, m.locked])),
    [modules],
  );

  const handleJoinByCode = async (codeToJoin: string) => {
    const code = codeToJoin.trim().toUpperCase();
    const res = await post<{ ok: boolean; class: { id: number; name: string } }>('/api/student/class/join', { code });
    refreshUser();
    toast(`Đã tham gia lớp ${res.class.name}!`);
    setSelectedClassId(res.class.id);
    setViewMode('class');
    setActiveTab('overview');
    go(`/lop/${res.class.id}`);
    reload();
  };

  const handleOpenClassFromDirectory = async (target: ClassroomSummary) => {
    if (!target.enrolled) {
      toast('Vui lòng nhập mã lớp do giáo viên cung cấp để tham gia lớp học này.');
      return;
    }
    setSelectedClassId(target.id);
    setViewMode('class');
    setActiveTab('overview');
    go(`/lop/${target.id}`);
  };

  const handleSwitchClass = async (targetClassId: number) => {
    if (cls?.id === targetClassId) return;
    const target = allClasses.find((c) => c.id === targetClassId);
    if (!target?.enrolled) {
      toast('Em chưa tham gia lớp học này. Hãy nhập mã lớp để tham gia.');
      return;
    }
    try {
      await post('/api/student/class/switch', { classId: targetClassId });
      refreshUser();
      setSelectedClassId(targetClassId);
      setActiveTab('overview');
      go(`/lop/${targetClassId}`);
      toast('Đã chuyển sang lớp học được chọn');
      reload();
    } catch (err: any) {
      toast(err.message || 'Không thể chuyển lớp.');
    }
  };

  const handleLeave = async () => {
    setBusyModal(true);
    try {
      await post('/api/student/class/leave');
      refreshUser();
      toast('Đã rời khỏi lớp học.');
      setConfirmLeave(false);
      setSelectedClassId(null);
      setViewMode('directory');
      go('/lop-hoc');
      reload();
    } catch (err: any) {
      toast(err.message || 'Không thể rời lớp.');
    } finally {
      setBusyModal(false);
    }
  };

  const startExam = async (assignmentId: number) => {
    setBusyExam(true);
    try {
      const att = await post<{ id: number }>('/api/attempts/start', { assignmentId });
      go(`/thi/${att.id}`);
    } catch (err: any) {
      toast(err.message || 'Không thể bắt đầu bài làm.');
      setBusyExam(false);
    }
  };

  const copyCode = async () => {
    if (!cls?.code) return;
    try {
      await navigator.clipboard?.writeText(cls.code);
      toast(`Đã sao chép mã lớp ${cls.code}`);
    } catch {
      toast('Không sao chép được mã lớp.');
    }
  };

  // 1. OUTER DIRECTORY VIEW ("Lớp học của tôi")
  if (viewMode === 'directory') {
    return (
      <ClassDirectoryGrid
        role="student"
        classes={allClasses}
        loading={loading && !data}
        error={error}
        onRetry={reload}
        onOpenClass={handleOpenClassFromDirectory}
        onJoinByCode={handleJoinByCode}
      />
    );
  }

  if (loading && !data) return <Loading text="Đang mở không gian lớp học…" />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  // 2. NO ACTIVE CLASS FALLBACK
  if (!cls) {
    return (
      <div className="cls-scope cls-workspace">
        <div className="cls-breadcrumb-row">
          <button
            type="button"
            className="cls-back-link"
            onClick={() => {
              setViewMode('directory');
              go('/lop-hoc');
            }}
          >
            ← Lớp học của tôi
          </button>
        </div>

        <div className="cls-empty-card">
          <div className="cls-empty-icon">
            <BookOpen size={24} />
          </div>
          <h2>Bạn chưa tham gia lớp học nào</h2>
          <p>
            Nhập mã lớp do giáo viên cung cấp hoặc chọn một lớp từ danh sách lớp học của trường để bắt đầu học.
          </p>
          <div className="cls-empty-actions">
            <button
              type="button"
              className="cls-btn cls-btn-primary"
              onClick={() => {
                setJoinError(null);
                setShowJoinModal(true);
              }}
            >
              <KeyRound size={16} /> Tham gia bằng mã
            </button>
            <button
              type="button"
              className="cls-btn cls-btn-ghost"
              onClick={() => {
                setViewMode('directory');
                go('/lop-hoc');
              }}
            >
              Xem danh sách lớp ({allClasses.length})
            </button>
          </div>
        </div>

        {showJoinModal && (
          <Modal title="Tham gia lớp bằng mã" onClose={() => setShowJoinModal(false)} width={440}>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!joinCode.trim()) {
                  setJoinError('Vui lòng nhập mã lớp.');
                  return;
                }
                setBusyModal(true);
                setJoinError(null);
                try {
                  await handleJoinByCode(joinCode);
                  setShowJoinModal(false);
                  setJoinCode('');
                } catch (err: any) {
                  setJoinError(err.message || 'Mã lớp không hợp lệ.');
                } finally {
                  setBusyModal(false);
                }
              }}
              className="stack"
              style={{ gap: 14 }}
            >
              {joinError && <div className="cls-alert is-bad">{joinError}</div>}
              <label className="field">
                <span>Mã tham gia lớp</span>
                <input
                  className="input"
                  placeholder="VD: 12A1-8842"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  autoFocus
                  required
                />
              </label>
              <div className="row end" style={{ gap: 8 }}>
                <button type="button" className="cls-btn cls-btn-ghost" onClick={() => setShowJoinModal(false)}>
                  Hủy
                </button>
                <button type="submit" className="cls-btn cls-btn-primary" disabled={busyModal}>
                  {busyModal ? 'Đang kiểm tra…' : 'Tham gia lớp'}
                </button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    );
  }

  // 3. INSIDE CLASS WORKSPACE (1 Main Workspace + Optional Rail on Overview)
  return (
    <div className="cls-scope cls-workspace">
      <ClassroomHeaderAndTabs
        cls={cls}
        role="student"
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onBackToDirectory={() => {
          setViewMode('directory');
          go('/lop-hoc');
        }}
        onCopyCode={copyCode}
        allClasses={allClasses}
        onSwitchClass={handleSwitchClass}
        onRequestLeave={() => setConfirmLeave(true)}
        counts={counts}
      />

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="cls-overview-grid">
          <div className="cls-overview-main">
            {/* 4 KPI Cards */}
            <div className="cls-kpi-grid">
              <div className="cls-kpi-card">
                <div className="cls-kpi-icon is-primary">
                  <Layers size={18} />
                </div>
                <div>
                  <div className="cls-kpi-label">Tiến độ hoàn thành</div>
                  <div className="cls-kpi-value tabular-nums">
                    {overviewStats.doneTasks}/{overviewStats.totalTasks}
                  </div>
                  <div className="cls-kpi-hint tabular-nums">{overviewStats.progressPct}% nội dung</div>
                </div>
              </div>

              <div className="cls-kpi-card">
                <div className="cls-kpi-icon is-warn">
                  <Clock size={18} />
                </div>
                <div>
                  <div className="cls-kpi-label">Bài cần làm</div>
                  <div className="cls-kpi-value tabular-nums">{overviewStats.pendingCount}</div>
                  <div className="cls-kpi-hint">
                    {overviewStats.pendingCount > 0 ? 'Đang mở trong lớp' : 'Đã hoàn thành hết'}
                  </div>
                </div>
              </div>

              <div className="cls-kpi-card">
                <div className="cls-kpi-icon is-good">
                  <Award size={18} />
                </div>
                <div>
                  <div className="cls-kpi-label">Điểm trung bình</div>
                  <div
                    className="cls-kpi-value tabular-nums"
                    style={{ color: overviewStats.avgScore !== null ? scoreColor(overviewStats.avgScore) : undefined }}
                  >
                    {overviewStats.avgScore !== null ? `${fmtScore(overviewStats.avgScore)} đ` : 'Chưa có'}
                  </div>
                  <div className="cls-kpi-hint">
                    {overviewStats.gradedCount > 0 ? `${overviewStats.gradedCount} bài đã chấm` : 'Chưa có bài chấm'}
                  </div>
                </div>
              </div>

              <div className="cls-kpi-card">
                <div className="cls-kpi-icon is-soft">
                  <Sparkles size={18} />
                </div>
                <div>
                  <div className="cls-kpi-label">Hoạt động tiếp theo</div>
                  <div className="cls-kpi-value cls-kpi-value-sm">
                    {overviewStats.focus ? overviewStats.focus.badgeLabel : 'Hoàn tất'}
                  </div>
                  <div className="cls-kpi-hint">
                    {overviewStats.focus ? overviewStats.focus.title : 'Không có bài tồn đọng'}
                  </div>
                </div>
              </div>
            </div>

            {/* Smart Focus Card ("Tiếp tục học") */}
            {overviewStats.focus ? (
              <section className="cls-focus-card" aria-label="Tiếp tục học">
                <div className="cls-focus-body">
                  <span className="cls-focus-kicker">
                    <Play size={13} /> Tiếp tục học · {overviewStats.focus.badgeLabel}
                  </span>
                  <h2 className="cls-focus-title">{overviewStats.focus.title}</h2>
                  <p className="cls-focus-sub">{overviewStats.focus.subtitle}</p>
                </div>

                {overviewStats.focus.kind === 'assignment' && overviewStats.focus.assignment ? (
                  overviewStats.focus.assignment.state === 'doing' && overviewStats.focus.assignment.attempt_id ? (
                    <button
                      type="button"
                      className="cls-btn cls-btn-primary"
                      onClick={() => go(`/thi/${overviewStats.focus!.assignment!.attempt_id}`)}
                    >
                      {overviewStats.focus.actionLabel} <ArrowRight size={16} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="cls-btn cls-btn-primary"
                      disabled={busyExam}
                      onClick={() => startExam(overviewStats.focus!.assignment!.id)}
                    >
                      {overviewStats.focus.actionLabel} <ArrowRight size={16} />
                    </button>
                  )
                ) : overviewStats.focus.material ? (
                  <button
                    type="button"
                    className="cls-btn cls-btn-primary"
                    onClick={() => {
                      setExternalMaterial(overviewStats.focus!.material!);
                      setActiveTab('modules');
                    }}
                  >
                    {overviewStats.focus.actionLabel} <ArrowRight size={16} />
                  </button>
                ) : null}
              </section>
            ) : (
              <section className="cls-surface-card">
                <div className="cls-card-head">
                  <h2>Tiến độ học phần rất tốt</h2>
                  <button type="button" className="cls-text-link" onClick={() => setActiveTab('modules')}>
                    Xem học phần <ArrowRight size={14} />
                  </button>
                </div>
                <p className="cls-muted-text" style={{ margin: 0 }}>
                  Bạn đã hoàn thành toàn bộ tài liệu và bài tập đang mở. Hãy ôn tập thêm ở Sổ tay lỗi sai hoặc xem lại điểm số.
                </p>
              </section>
            )}

            {/* To-Do List ("Việc cần làm") */}
            <section className="cls-surface-card">
              <div className="cls-card-head">
                <h2>Việc cần làm</h2>
                <button type="button" className="cls-text-link" onClick={() => setActiveTab('quizzes')}>
                  Tất cả bài kiểm tra <ArrowRight size={14} />
                </button>
              </div>

              {overviewStats.todoItems.length === 0 ? (
                <div className="cls-muted-text">
                  Không còn bài kiểm tra hay bài tập nào cần hoàn thành trong lớp.
                </div>
              ) : (
                <div className="cls-todo-list">
                  {overviewStats.todoItems.slice(0, 5).map((a) => {
                    const st = getAssignmentStatusMeta(a);
                    const dl = formatDeadlineShort(a.close_at);
                    const locked = a.module_id ? Boolean(modLockedMap.get(a.module_id)) : false;
                    return (
                      <div key={a.id} className="cls-todo-row">
                        <div className="cls-todo-left">
                          <div className="cls-todo-title">{a.title}</div>
                          <div className="cls-todo-meta">
                            <span>{a.mode === 'exam' ? 'Bài kiểm tra' : 'Bài tập'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{a.duration_min} phút</span>
                            <span aria-hidden="true">·</span>
                            <span className={dl.urgent ? 'cls-text-warn' : ''}>{dl.label}</span>
                          </div>
                        </div>

                        <div className="cls-todo-right">
                          <span className={`cls-status-tag is-${st.tone}`}>
                            {st.code === 'doing' || st.code === 'open' ? <Clock size={12} /> : null}
                            <span>{st.label}</span>
                          </span>

                          {!locked && a.state === 'doing' && a.attempt_id ? (
                            <button
                              type="button"
                              className="cls-btn cls-btn-sm cls-btn-primary"
                              onClick={() => go(`/thi/${a.attempt_id}`)}
                            >
                              Tiếp tục
                            </button>
                          ) : !locked && a.state === 'open' ? (
                            <button
                              type="button"
                              className="cls-btn cls-btn-sm cls-btn-primary"
                              disabled={busyExam}
                              onClick={() => startExam(a.id)}
                            >
                              Vào làm bài
                            </button>
                          ) : a.state === 'upcoming' ? (
                            <span className="cls-muted-text">Mở {fmtDateTime(a.open_at)}</span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Right Context Rail (Overview only) */}
          <aside className="cls-overview-rail" aria-label="Tiến độ và thông báo">
            <section className="cls-surface-card">
              <div className="cls-card-head">
                <h3>Tiến độ của tôi</h3>
                <span className="cls-muted-text tabular-nums">{overviewStats.progressPct}%</span>
              </div>

              <div className="cls-rail-stat-row">
                <strong className="cls-rail-big tabular-nums">
                  {overviewStats.doneTasks}/{overviewStats.totalTasks}
                </strong>
                <span className="cls-muted-text">nội dung đã xong</span>
              </div>

              <div className="cls-progress-track">
                <div className="cls-progress-fill" style={{ width: `${overviewStats.progressPct}%` }} />
              </div>

              <div className="cls-rail-detail-list">
                <div className="cls-rail-detail-row">
                  <span>Tài liệu đã xem</span>
                  <strong className="tabular-nums">
                    {overviewStats.viewedMats}/{overviewStats.totalMats}
                  </strong>
                </div>
                <div className="cls-rail-detail-row">
                  <span>Bài đã nộp</span>
                  <strong className="tabular-nums">
                    {overviewStats.doneAsg}/{assignments.length}
                  </strong>
                </div>
                <div className="cls-rail-detail-row">
                  <span>Học gần nhất</span>
                  <strong>{formatLastStudy(data?.lastStudyAt)}</strong>
                </div>
              </div>
            </section>

            <section className="cls-surface-card">
              <div className="cls-card-head">
                <h3>Thông báo mới</h3>
                <button type="button" className="cls-text-link" onClick={() => setActiveTab('announcements')}>
                  Xem hết
                </button>
              </div>

              {announcements.length === 0 ? (
                <div className="cls-muted-text">Chưa có thông báo mới từ giáo viên.</div>
              ) : (
                <div className="cls-rail-ann-list">
                  {announcements.slice(0, 3).map((ann) => (
                    <div key={ann.id} className="cls-rail-ann-item">
                      <strong>{ann.title}</strong>
                      <small className="tabular-nums">
                        <Bell size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />
                        {fmtDateTime(ann.created_at)}
                      </small>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      )}

      {/* MODULES TAB */}
      {activeTab === 'modules' && (
        <ModuleTimeline
          classId={cls.id}
          role="student"
          modules={modules}
          assignments={assignments}
          onReload={reload}
          onStartExam={startExam}
          busyExam={busyExam}
          externalMaterialOpen={externalMaterial}
          onExternalMaterialHandled={() => setExternalMaterial(null)}
        />
      )}

      {/* QUIZZES TAB */}
      {activeTab === 'quizzes' && (
        <AssessmentTab
          mode="exam"
          role="student"
          classId={cls.id}
          totalStudents={cls.students}
          assignments={assignments}
          modules={modules}
          onStartExam={startExam}
          busy={busyExam}
        />
      )}

      {/* HOMEWORK TAB */}
      {activeTab === 'assignments' && (
        <AssessmentTab
          mode="homework"
          role="student"
          classId={cls.id}
          totalStudents={cls.students}
          assignments={assignments}
          modules={modules}
          onStartExam={startExam}
          busy={busyExam}
        />
      )}

      {/* GRADES TAB */}
      {activeTab === 'grades' && (
        <GradesTab assignments={assignments} onStartExam={startExam} busy={busyExam} />
      )}

      {/* ANNOUNCEMENTS TAB */}
      {activeTab === 'announcements' && (
        <AnnouncementsView classId={cls.id} role="student" announcements={announcements} onReload={reload} />
      )}

      {/* PEOPLE TAB */}
      {activeTab === 'people' && (
        <MembersView
          cls={cls}
          role="student"
          members={classmates}
          currentUsername={user.username}
          onCopyCode={copyCode}
        />
      )}

      {/* CLASS INFO TAB */}
      {activeTab === 'info' && (
        <ClassInfoView cls={cls} role="student" onCopyCode={copyCode} onLeaveClass={handleLeave} />
      )}

      {/* Safe Leave Class Modal (from header more menu) */}
      {confirmLeave && (
        <Modal title={`Rời khỏi lớp ${cls.name}?`} onClose={() => setConfirmLeave(false)} width={420}>
          <div className="stack" style={{ gap: 14 }}>
            <p className="cls-modal-desc">
              Bạn sẽ rời khỏi lớp <strong>{cls.name}</strong>. Các kết quả kiểm tra đã làm vẫn được lưu. Bạn có thể tham gia lại bằng mã <strong>{cls.code}</strong>.
            </p>
            <div className="row end" style={{ gap: 8 }}>
              <button type="button" className="cls-btn cls-btn-ghost" onClick={() => setConfirmLeave(false)} disabled={busyModal}>
                Ở lại lớp
              </button>
              <button type="button" className="cls-btn cls-btn-danger" onClick={handleLeave} disabled={busyModal}>
                {busyModal ? 'Đang xử lý…' : 'Xác nhận rời lớp'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default StudentClass;
