import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Edit3,
  Eye,
  FileText,
  FolderPlus,
  Link2,
  Lock,
  PlayCircle,
  Plus,
  Search,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { del, patch, post } from '../../api';
import { fmtDateTime, fmtScore, go, Modal, topicName, useApp } from '../../ui/kit';
import { MathText } from '../../ui/MathText';
import {
  formatDeadlineShort,
  getAssignmentStatusMeta,
  getModuleCompletionStats,
  loadExpandedModules,
  padWeek,
  saveExpandedModules,
} from './classroomState';
import type { ClassAssignment, ClassMaterial, ClassModule } from './types';

interface ModuleTimelineProps {
  classId: number;
  role: 'student' | 'teacher' | 'admin';
  modules: ClassModule[];
  assignments: ClassAssignment[];
  onReload: () => void;
  onStartExam?: (assignmentId: number) => void;
  busyExam?: boolean;
  externalMaterialOpen?: ClassMaterial | null;
  onExternalMaterialHandled?: () => void;
}

type ModuleTypeFilter = 'all' | 'incomplete' | 'material' | 'exam' | 'homework';

export function ModuleTimeline({
  classId,
  role,
  modules,
  assignments,
  onReload,
  onStartExam,
  busyExam,
  externalMaterialOpen,
  onExternalMaterialHandled,
}: ModuleTimelineProps) {
  const { meta, toast } = useApp();
  const [expanded, setExpanded] = useState<Record<number, boolean>>(() =>
    loadExpandedModules(classId, modules),
  );
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ModuleTypeFilter>('all');

  // Material Reader Modal
  const [viewingMaterial, setViewingMaterial] = useState<ClassMaterial | null>(null);
  const [viewedLocal, setViewedLocal] = useState<Record<number, boolean>>({});

  // Teacher Modals
  const [moduleModal, setModuleModal] = useState<{ mode: 'create' | 'edit'; mod?: ClassModule } | null>(null);
  const [modWeek, setModWeek] = useState(1);
  const [modTitle, setModTitle] = useState('');
  const [modDesc, setModDesc] = useState('');
  const [modLocked, setModLocked] = useState(false);

  const [materialModalModId, setMaterialModalModId] = useState<number | null>(null);
  const [matKind, setMatKind] = useState<'doc' | 'video' | 'link' | 'note'>('doc');
  const [matTitle, setMatTitle] = useState('');
  const [matSummary, setMatSummary] = useState('');
  const [matTopic, setMatTopic] = useState('');
  const [matContent, setMatContent] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: 'module'; id: number; label: string }
    | { kind: 'material'; id: number; label: string }
    | null
  >(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setExpanded(loadExpandedModules(classId, modules));
  }, [classId, modules.length]);

  useEffect(() => {
    saveExpandedModules(classId, expanded);
  }, [classId, expanded]);

  // Support opening a material directly from Overview Focus Card
  useEffect(() => {
    if (externalMaterialOpen) {
      openMaterialReader(externalMaterialOpen);
      onExternalMaterialHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalMaterialOpen]);

  const openMaterialReader = async (mat: ClassMaterial) => {
    setViewingMaterial(mat);
    if (role === 'student' && !mat.viewed && !viewedLocal[mat.id]) {
      setViewedLocal((prev) => ({ ...prev, [mat.id]: true }));
      try {
        await post(`/api/student/materials/${mat.id}/view`, {});
        onReload();
      } catch {
        // non-blocking
      }
    }
  };

  const toggleModule = (modId: number) => {
    setExpanded((prev) => ({ ...prev, [modId]: !prev[modId] }));
  };

  const expandAll = () => {
    const next: Record<number, boolean> = {};
    for (const m of modules) next[m.id] = true;
    setExpanded(next);
  };

  const collapseAll = () => {
    const next: Record<number, boolean> = {};
    for (const m of modules) next[m.id] = false;
    setExpanded(next);
  };

  const activeModuleId = useMemo(() => {
    const doingAsg = assignments.find((a) => a.state === 'doing' && a.module_id);
    if (doingAsg?.module_id) return doingAsg.module_id;
    for (const m of modules) {
      if (m.locked) continue;
      const stats = getModuleCompletionStats(m, assignments, role);
      if (role === 'student' ? stats.done < stats.total : stats.total > 0) return m.id;
    }
    return modules[0]?.id ?? null;
  }, [assignments, modules, role]);

  const isMatViewed = (m: ClassMaterial) => Boolean(m.viewed || viewedLocal[m.id]);

  const q = search.trim().toLowerCase();

  const matchesMaterial = (mat: ClassMaterial) => {
    if (typeFilter === 'exam' || typeFilter === 'homework') return false;
    if (typeFilter === 'incomplete' && isMatViewed(mat)) return false;
    if (q) {
      return `${mat.title} ${mat.summary}`.toLowerCase().includes(q);
    }
    return true;
  };

  const matchesAssignment = (a: ClassAssignment) => {
    if (typeFilter === 'material') return false;
    if (typeFilter === 'exam' && a.mode !== 'exam') return false;
    if (typeFilter === 'homework' && a.mode !== 'homework') return false;
    if (typeFilter === 'incomplete' && a.state === 'done') return false;
    if (q) {
      return a.title.toLowerCase().includes(q);
    }
    return true;
  };

  const unassignedAssignments = useMemo(() => {
    const modIds = new Set(modules.map((m) => m.id));
    return assignments.filter((a) => !a.module_id || !modIds.has(a.module_id)).filter(matchesAssignment);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, modules, q, typeFilter]);

  const openCreateModule = () => {
    const maxWeek = modules.reduce((mx, m) => Math.max(mx, m.week_no), 0);
    setModWeek(maxWeek + 1);
    setModTitle('');
    setModDesc('');
    setModLocked(false);
    setModuleModal({ mode: 'create' });
  };

  const openEditModule = (mod: ClassModule) => {
    setModWeek(mod.week_no);
    setModTitle(mod.title);
    setModDesc(mod.description);
    setModLocked(mod.locked);
    setModuleModal({ mode: 'edit', mod });
  };

  const saveModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moduleModal || !modTitle.trim()) return;
    setSaving(true);
    try {
      if (moduleModal.mode === 'create') {
        const created = await post<ClassModule>(`/api/classes/${classId}/modules`, {
          weekNo: modWeek,
          title: modTitle.trim(),
          description: modDesc.trim(),
          locked: modLocked,
        });
        toast(`Đã thêm ${padWeek(created.week_no)}`);
        setExpanded((p) => ({ ...p, [created.id]: true }));
      } else if (moduleModal.mod) {
        await patch(`/api/classes/${classId}/modules/${moduleModal.mod.id}`, {
          weekNo: modWeek,
          title: modTitle.trim(),
          description: modDesc.trim(),
          locked: modLocked,
        });
        toast('Đã cập nhật học phần');
      }
      setModuleModal(null);
      onReload();
    } catch (err: any) {
      toast(err.message || 'Không thể lưu học phần.');
    } finally {
      setSaving(false);
    }
  };

  const toggleLockModule = async (mod: ClassModule) => {
    try {
      await patch(`/api/classes/${classId}/modules/${mod.id}`, { locked: !mod.locked });
      toast(mod.locked ? `Đã mở khóa ${padWeek(mod.week_no)}` : `Đã khóa ${padWeek(mod.week_no)}`);
      onReload();
    } catch (err: any) {
      toast(err.message || 'Không thể cập nhật trạng thái khóa.');
    }
  };

  const openAddMaterial = (modId: number) => {
    setMaterialModalModId(modId);
    setMatKind('doc');
    setMatTitle('');
    setMatSummary('');
    setMatTopic('');
    setMatContent('');
    setShowPreview(false);
  };

  const saveMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!materialModalModId || !matTitle.trim()) return;
    setSaving(true);
    try {
      await post(`/api/classes/${classId}/materials`, {
        moduleId: materialModalModId,
        kind: matKind,
        title: matTitle.trim(),
        summary: matSummary.trim(),
        content: matContent.trim(),
        topicCode: matTopic || null,
      });
      toast('Đã thêm tài liệu vào học phần');
      setMaterialModalModId(null);
      onReload();
    } catch (err: any) {
      toast(err.message || 'Không thể thêm tài liệu.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      if (deleteTarget.kind === 'module') {
        await del(`/api/classes/${classId}/modules/${deleteTarget.id}`);
        toast('Đã xóa học phần');
      } else {
        await del(`/api/classes/${classId}/materials/${deleteTarget.id}`);
        toast('Đã xóa tài liệu');
      }
      setDeleteTarget(null);
      onReload();
    } catch (err: any) {
      toast(err.message || 'Không thể xóa mục này.');
    } finally {
      setSaving(false);
    }
  };

  const moveAssignmentToModule = async (assignmentId: number, moduleIdStr: string) => {
    const moduleId = moduleIdStr ? Number(moduleIdStr) : null;
    try {
      await patch(`/api/assignments/${assignmentId}/module`, { moduleId });
      toast('Đã cập nhật học phần cho bài giao');
      onReload();
    } catch (err: any) {
      toast(err.message || 'Không thể chuyển học phần.');
    }
  };

  const matIcon = (kind: ClassMaterial['kind']) => {
    if (kind === 'video') return <PlayCircle size={17} />;
    if (kind === 'link') return <Link2 size={17} />;
    return <FileText size={17} />;
  };

  const renderAssignmentRow = (a: ClassAssignment, modLocked: boolean) => {
    const st = getAssignmentStatusMeta(a);
    const dl = formatDeadlineShort(a.close_at);
    const isExam = a.mode === 'exam';

    return (
      <div key={a.id} className={`cls-module-item ${modLocked && role === 'student' ? 'is-locked' : ''}`}>
        <div className="cls-item-left">
          <div className={`cls-item-icon ${st.code === 'done' || st.code === 'graded' ? 'is-good' : isExam ? 'is-primary' : 'is-warn'}`}>
            {isExam ? <ClipboardCheck size={17} /> : <BookOpen size={17} />}
          </div>
          <div className="cls-item-body">
            <div className="cls-item-title">{a.title}</div>
            <div className="cls-item-meta">
              <span>{isExam ? 'Bài kiểm tra' : 'Bài tập'}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{a.duration_min} phút</span>
              {a.question_count ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{a.question_count} câu</span>
                </>
              ) : null}
              <span aria-hidden="true">·</span>
              <span className={dl.urgent && st.code !== 'done' && st.code !== 'graded' ? 'cls-text-warn' : ''}>
                {dl.label}
              </span>
            </div>
          </div>
        </div>

        <div className="cls-item-right">
          {role === 'student' ? (
            <>
              <span className={`cls-status-tag is-${st.tone}`}>
                {st.code === 'done' || st.code === 'graded' ? (
                  <CheckCircle2 size={13} />
                ) : st.code === 'doing' || st.code === 'open' ? (
                  <Clock size={13} />
                ) : null}
                <span>{st.label}</span>
              </span>

              {st.code === 'graded' && a.score10 !== null && a.score10 !== undefined && (
                <strong className="cls-score-inline tabular-nums">{fmtScore(a.score10)} đ</strong>
              )}

              {modLocked ? (
                <span className="cls-locked-note">
                  <Lock size={13} /> Chưa mở
                </span>
              ) : a.state === 'doing' && a.attempt_id ? (
                <button type="button" className="cls-btn cls-btn-sm cls-btn-primary" onClick={() => go(`/thi/${a.attempt_id}`)}>
                  Tiếp tục làm
                </button>
              ) : a.state === 'open' ? (
                <button
                  type="button"
                  className="cls-btn cls-btn-sm cls-btn-primary"
                  disabled={busyExam}
                  onClick={() => onStartExam?.(a.id)}
                >
                  Vào làm bài
                </button>
              ) : a.state === 'done' && a.attempt_id ? (
                <a className="cls-btn cls-btn-sm cls-btn-ghost" href={`#/ket-qua/${a.attempt_id}`}>
                  Xem lời giải
                </a>
              ) : null}
            </>
          ) : (
            <>
              <span className="cls-muted-text tabular-nums">
                Đã nộp: <strong>{a.submitted ?? 0}</strong>
              </span>
              {a.avg !== null && a.avg !== undefined && (
                <span className="cls-score-inline tabular-nums">TB {fmtScore(a.avg)}</span>
              )}
              {modules.length > 0 && (
                <select
                  aria-label={`Chuyển học phần cho ${a.title}`}
                  className="cls-select cls-select-xs"
                  value={a.module_id ?? ''}
                  onChange={(e) => moveAssignmentToModule(a.id, e.target.value)}
                >
                  <option value="">Chưa gắn tuần</option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {padWeek(m.week_no)}
                    </option>
                  ))}
                </select>
              )}
              <a className="cls-btn cls-btn-sm cls-btn-ghost" href={`#/lop/${classId}/ket-qua/${a.id}`}>
                Báo cáo <ArrowRight size={14} />
              </a>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="cls-modules-wrap">
      {/* Toolbar */}
      <div className="cls-modules-toolbar">
        <div className="cls-toolbar-group">
          <div className="cls-search-box cls-search-sm">
            <Search size={15} className="cls-search-icon" />
            <input
              type="search"
              placeholder="Tìm tài liệu, bài kiểm tra, bài tập…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="cls-search-clear" onClick={() => setSearch('')}>
                <X size={13} />
              </button>
            )}
          </div>

          <div className="cls-segmented" role="group" aria-label="Lọc nội dung học phần">
            {(
              [
                ['all', 'Tất cả'],
                ...(role === 'student' ? ([['incomplete', 'Chưa hoàn thành']] as const) : []),
                ['material', 'Tài liệu'],
                ['exam', 'Kiểm tra'],
                ['homework', 'Bài tập'],
              ] as [ModuleTypeFilter, string][]
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                className={typeFilter === k ? 'is-active' : ''}
                onClick={() => setTypeFilter(k)}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div className="cls-toolbar-group">
          {modules.length > 0 && (
            <>
              <button type="button" className="cls-btn cls-btn-sm cls-btn-ghost" onClick={expandAll}>
                Mở tất cả
              </button>
              <button type="button" className="cls-btn cls-btn-sm cls-btn-ghost" onClick={collapseAll}>
                Thu gọn
              </button>
            </>
          )}
          {role !== 'student' && (
            <button type="button" className="cls-btn cls-btn-sm cls-btn-primary" onClick={openCreateModule}>
              <FolderPlus size={15} /> Thêm học phần
            </button>
          )}
        </div>
      </div>

      {/* Empty Modules */}
      {modules.length === 0 && unassignedAssignments.length === 0 && (
        <div className="cls-empty-card">
          <div className="cls-empty-icon">
            <BookOpen size={22} />
          </div>
          <h2>Chưa có học phần theo tuần</h2>
          <p>
            {role === 'student'
              ? 'Giáo viên chưa đăng tải học phần cho lớp học này.'
              : 'Tạo học phần theo từng tuần để sắp xếp tài liệu, đề kiểm tra và bài tập cho học sinh.'}
          </p>
          {role !== 'student' && (
            <button type="button" className="cls-btn cls-btn-primary" onClick={openCreateModule}>
              <Plus size={16} /> Tạo học phần Tuần 01
            </button>
          )}
        </div>
      )}

      {/* Weekly Module Accordions */}
      <div className="cls-module-list">
        {modules.map((mod) => {
          const isOpen = !!expanded[mod.id];
          const modAssignments = assignments.filter((a) => a.module_id === mod.id);
          const filteredMats = mod.materials.filter(matchesMaterial);
          const filteredAsg = modAssignments.filter(matchesAssignment);
          const hasFilter = Boolean(q || typeFilter !== 'all');
          if (hasFilter && filteredMats.length === 0 && filteredAsg.length === 0) return null;

          const stats = getModuleCompletionStats(mod, assignments, role);
          const isActive = mod.id === activeModuleId && !mod.locked;
          const pctVal = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

          return (
            <section
              key={mod.id}
              className={`cls-module-card ${isActive ? 'is-current-week' : ''} ${mod.locked ? 'is-locked-mod' : ''}`}
            >
              <div
                className="cls-module-header"
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                onClick={() => toggleModule(mod.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleModule(mod.id);
                  }
                }}
              >
                <div className="cls-module-header-left">
                  <span className="cls-module-chevron" aria-hidden="true">
                    {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </span>
                  <div className="cls-module-title-block">
                    <div className="cls-module-kicker-row">
                      <span className="cls-week-code tabular-nums">{padWeek(mod.week_no)}</span>
                      {mod.locked && (
                        <span className="cls-status-tag is-muted">
                          <Lock size={12} /> Đang khóa
                        </span>
                      )}
                      {isActive && (
                        <span className="cls-status-tag is-primary">Đang học</span>
                      )}
                    </div>
                    <h3 className="cls-module-title">{mod.title}</h3>
                    {mod.description && <p className="cls-module-desc">{mod.description}</p>}
                  </div>
                </div>

                <div className="cls-module-header-right" onClick={(e) => e.stopPropagation()}>
                  <div className="cls-module-ratio tabular-nums">
                    {role === 'student'
                      ? `${stats.done}/${stats.total} nội dung đã hoàn thành`
                      : `${stats.total} nội dung`}
                  </div>
                  {role === 'student' && stats.total > 0 && (
                    <div className="cls-mini-progress" aria-hidden="true">
                      <div className="cls-mini-progress-fill" style={{ width: `${pctVal}%` }} />
                    </div>
                  )}

                  {role !== 'student' && (
                    <div className="cls-module-admin-btns">
                      <button
                        type="button"
                        className="cls-btn cls-btn-sm cls-btn-ghost"
                        onClick={() => openAddMaterial(mod.id)}
                        title="Thêm tài liệu học tập"
                      >
                        <Plus size={14} /> Tài liệu
                      </button>
                      <button
                        type="button"
                        className="cls-btn cls-btn-icon-sm"
                        onClick={() => toggleLockModule(mod)}
                        title={mod.locked ? 'Mở khóa học phần' : 'Khóa học phần'}
                      >
                        {mod.locked ? <Unlock size={15} /> : <Lock size={15} />}
                      </button>
                      <button
                        type="button"
                        className="cls-btn cls-btn-icon-sm"
                        onClick={() => openEditModule(mod)}
                        title="Sửa học phần"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        type="button"
                        className="cls-btn cls-btn-icon-sm is-danger"
                        onClick={() => setDeleteTarget({ kind: 'module', id: mod.id, label: `${padWeek(mod.week_no)} – ${mod.title}` })}
                        title="Xóa học phần"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {isOpen && (
                <div className="cls-module-items">
                  {filteredMats.length === 0 && filteredAsg.length === 0 ? (
                    <div className="cls-module-empty-row">
                      <span>Chưa có nội dung nào trong tuần này.</span>
                      {role !== 'student' && (
                        <button
                          type="button"
                          className="cls-btn cls-btn-sm cls-btn-ghost"
                          onClick={() => openAddMaterial(mod.id)}
                        >
                          <Plus size={14} /> Thêm tài liệu đầu tiên
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      {filteredMats.map((mat) => {
                        const viewed = isMatViewed(mat);
                        return (
                          <div
                            key={`mat-${mat.id}`}
                            className={`cls-module-item ${mod.locked && role === 'student' ? 'is-locked' : ''}`}
                          >
                            <div className="cls-item-left">
                              <div className={`cls-item-icon ${viewed && role === 'student' ? 'is-good' : 'is-soft'}`}>
                                {matIcon(mat.kind)}
                              </div>
                              <div className="cls-item-body">
                                <div className="cls-item-title">{mat.title}</div>
                                <div className="cls-item-meta">
                                  <span>Tài liệu học tập</span>
                                  {mat.topic_code && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span>{topicName(meta, mat.topic_code)}</span>
                                    </>
                                  )}
                                  {mat.summary && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="cls-item-summary">{mat.summary}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="cls-item-right">
                              {role === 'student' && (
                                <span className={`cls-status-tag ${viewed ? 'is-good' : 'is-muted'}`}>
                                  {viewed && <CheckCircle2 size={13} />}
                                  <span>{viewed ? 'Đã xem' : 'Chưa xem'}</span>
                                </span>
                              )}

                              {mod.locked && role === 'student' ? (
                                <span className="cls-locked-note">
                                  <Lock size={13} /> Đang khóa
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="cls-btn cls-btn-sm cls-btn-ghost"
                                  onClick={() => openMaterialReader(mat)}
                                >
                                  <Eye size={14} /> Xem tài liệu
                                </button>
                              )}

                              {role !== 'student' && (
                                <button
                                  type="button"
                                  className="cls-btn cls-btn-icon-sm is-danger"
                                  onClick={() => setDeleteTarget({ kind: 'material', id: mat.id, label: mat.title })}
                                  title="Xóa tài liệu"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {filteredAsg.map((a) => renderAssignmentRow(a, mod.locked))}
                    </>
                  )}
                </div>
              )}
            </section>
          );
        })}

        {/* Unassigned assignments */}
        {unassignedAssignments.length > 0 && (
          <section className="cls-module-card">
            <div className="cls-module-header is-static">
              <div className="cls-module-header-left">
                <div className="cls-module-title-block">
                  <div className="cls-module-kicker-row">
                    <span className="cls-week-code">BÀI GIAO CHUNG</span>
                  </div>
                  <h3 className="cls-module-title">Bài kiểm tra & Bài tập bổ sung</h3>
                </div>
              </div>
              <div className="cls-module-ratio tabular-nums">
                {unassignedAssignments.length} nội dung
              </div>
            </div>
            <div className="cls-module-items">
              {unassignedAssignments.map((a) => renderAssignmentRow(a, false))}
            </div>
          </section>
        )}
      </div>

      {/* Material Reader Modal (KaTeX + Self-Study link) */}
      {viewingMaterial && (
        <Modal
          title={viewingMaterial.title}
          onClose={() => setViewingMaterial(null)}
          width={720}
        >
          <div className="cls-reader-modal">
            <div className="cls-reader-meta">
              <span>Tài liệu học phần</span>
              {viewingMaterial.topic_code && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{topicName(meta, viewingMaterial.topic_code)}</span>
                </>
              )}
              {viewingMaterial.created_at && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Cập nhật {fmtDateTime(viewingMaterial.created_at)}</span>
                </>
              )}
            </div>

            {viewingMaterial.summary && (
              <p className="cls-reader-summary">{viewingMaterial.summary}</p>
            )}

            <div className="cls-reader-content">
              {viewingMaterial.content ? (
                <MathText text={viewingMaterial.content} as="div" />
              ) : (
                <p className="cls-muted-text">Tài liệu chưa có nội dung chi tiết.</p>
              )}
            </div>

            <div className="cls-reader-footer">
              {viewingMaterial.topic_code ? (
                <a
                  href={`#/tu-hoc?topic=${encodeURIComponent(viewingMaterial.topic_code)}`}
                  className="cls-btn cls-btn-ghost"
                  onClick={() => setViewingMaterial(null)}
                >
                  <BookOpen size={15} /> Mở chuyên đề Tự học liên quan
                </a>
              ) : (
                <span />
              )}
              <button
                type="button"
                className="cls-btn cls-btn-primary"
                onClick={() => setViewingMaterial(null)}
              >
                Đã đọc xong
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create / Edit Module Modal (Teacher) */}
      {moduleModal && (
        <Modal
          title={moduleModal.mode === 'create' ? 'Thêm học phần mới' : 'Chỉnh sửa học phần'}
          onClose={() => setModuleModal(null)}
          width={520}
        >
          <form onSubmit={saveModule} className="stack" style={{ gap: 14 }}>
            <div className="grid-2" style={{ gap: 12 }}>
              <label className="field">
                <span>Số tuần</span>
                <input
                  type="number"
                  min={1}
                  max={52}
                  className="input"
                  value={modWeek}
                  onChange={(e) => setModWeek(Number(e.target.value) || 1)}
                  required
                />
              </label>
              <label className="field">
                <span>Trạng thái mở</span>
                <select
                  className="select"
                  value={modLocked ? 'locked' : 'open'}
                  onChange={(e) => setModLocked(e.target.value === 'locked')}
                >
                  <option value="open">Đang mở cho học sinh</option>
                  <option value="locked">Khóa tạm thời</option>
                </select>
              </label>
            </div>

            <label className="field">
              <span>Tên học phần</span>
              <input
                className="input"
                placeholder="VD: Ứng dụng đạo hàm để khảo sát hàm số"
                value={modTitle}
                onChange={(e) => setModTitle(e.target.value)}
                autoFocus
                required
              />
            </label>

            <label className="field">
              <span>Mô tả ngắn</span>
              <textarea
                className="input"
                rows={2}
                placeholder="Mục tiêu và nội dung trọng tâm của tuần học…"
                value={modDesc}
                onChange={(e) => setModDesc(e.target.value)}
              />
            </label>

            <div className="row end" style={{ gap: 8 }}>
              <button type="button" className="cls-btn cls-btn-ghost" onClick={() => setModuleModal(null)}>
                Hủy
              </button>
              <button type="submit" className="cls-btn cls-btn-primary" disabled={saving}>
                {saving ? 'Đang lưu…' : moduleModal.mode === 'create' ? 'Tạo học phần' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Material Modal with Live KaTeX Preview */}
      {materialModalModId !== null && (
        <Modal title="Thêm tài liệu học tập" onClose={() => setMaterialModalModId(null)} width={680}>
          <form onSubmit={saveMaterial} className="stack" style={{ gap: 14 }}>
            <div className="grid-2" style={{ gap: 12 }}>
              <label className="field">
                <span>Loại tài liệu</span>
                <select className="select" value={matKind} onChange={(e) => setMatKind(e.target.value as any)}>
                  <option value="doc">Bài đọc / Đề cương</option>
                  <option value="note">Ghi chú trọng tâm</option>
                  <option value="video">Bài giảng video</option>
                  <option value="link">Liên kết tham khảo</option>
                </select>
              </label>
              <label className="field">
                <span>Gắn chuyên đề Tự học</span>
                <select className="select" value={matTopic} onChange={(e) => setMatTopic(e.target.value)}>
                  <option value="">Không gắn chuyên đề</option>
                  {meta.topics.map((t) => (
                    <option key={t.code} value={t.code}>
                      K{t.grade} · {t.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field">
              <span>Tiêu đề tài liệu</span>
              <input
                className="input"
                placeholder="VD: Đề cương & Công thức Nguyên hàm"
                value={matTitle}
                onChange={(e) => setMatTitle(e.target.value)}
                autoFocus
                required
              />
            </label>

            <label className="field">
              <span>Tóm tắt ngắn</span>
              <input
                className="input"
                placeholder="Mô tả 1 dòng giúp học sinh nắm nội dung chính…"
                value={matSummary}
                onChange={(e) => setMatSummary(e.target.value)}
              />
            </label>

            <div className="field">
              <div className="row between">
                <span>Nội dung (hỗ trợ công thức Toán KaTeX $…$ và $$…$$)</span>
                <button
                  type="button"
                  className="cls-btn cls-btn-sm cls-btn-ghost"
                  onClick={() => setShowPreview((v) => !v)}
                >
                  {showPreview ? 'Soạn thảo' : 'Xem trước công thức'}
                </button>
              </div>
              {showPreview ? (
                <div className="cls-preview-box">
                  {matContent.trim() ? <MathText text={matContent} as="div" /> : <span className="cls-muted-text">Chưa có nội dung để xem trước.</span>}
                </div>
              ) : (
                <textarea
                  className="input"
                  rows={6}
                  placeholder="Ví dụ: Công thức $\int x^n dx = \frac{x^{n+1}}{n+1} + C$"
                  value={matContent}
                  onChange={(e) => setMatContent(e.target.value)}
                />
              )}
            </div>

            <div className="row end" style={{ gap: 8 }}>
              <button type="button" className="cls-btn cls-btn-ghost" onClick={() => setMaterialModalModId(null)}>
                Hủy
              </button>
              <button type="submit" className="cls-btn cls-btn-primary" disabled={saving}>
                {saving ? 'Đang lưu…' : 'Thêm tài liệu'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Safe Delete Confirmation Modal */}
      {deleteTarget && (
        <Modal title="Xác nhận xóa" onClose={() => setDeleteTarget(null)} width={420}>
          <div className="stack" style={{ gap: 14 }}>
            <p className="cls-modal-desc">
              Bạn có chắc muốn xóa {deleteTarget.kind === 'module' ? 'học phần' : 'tài liệu'}{' '}
              <strong>{deleteTarget.label}</strong>? Thao tác này không thể hoàn tác.
            </p>
            <div className="row end" style={{ gap: 8 }}>
              <button type="button" className="cls-btn cls-btn-ghost" onClick={() => setDeleteTarget(null)} disabled={saving}>
                Hủy
              </button>
              <button type="button" className="cls-btn cls-btn-danger" onClick={confirmDelete} disabled={saving}>
                {saving ? 'Đang xóa…' : 'Xóa ngay'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
