import type {
  ClassAssignment,
  ClassModule,
  FocusRecommendation,
} from './types';

export interface DirectoryFilterState {
  search: string;
  statusFilter: 'all' | 'active' | 'ended';
  gradeFilter: 'all' | '10' | '11' | '12';
  scope: 'mine' | 'all';
  viewMode: 'grid' | 'table';
}

const DIR_STORAGE_KEY = 'smartexam_cls_dir_state_v1';

export function loadDirectoryState(defaultScope: 'mine' | 'all' = 'all'): DirectoryFilterState {
  try {
    const raw = sessionStorage.getItem(DIR_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        search: typeof parsed.search === 'string' ? parsed.search : '',
        statusFilter: ['all', 'active', 'ended'].includes(parsed.statusFilter) ? parsed.statusFilter : 'all',
        gradeFilter: ['all', '10', '11', '12'].includes(parsed.gradeFilter) ? parsed.gradeFilter : 'all',
        scope: ['mine', 'all'].includes(parsed.scope) ? parsed.scope : defaultScope,
        viewMode: ['grid', 'table'].includes(parsed.viewMode) ? parsed.viewMode : 'grid',
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    search: '',
    statusFilter: 'all',
    gradeFilter: 'all',
    scope: defaultScope,
    viewMode: 'grid',
  };
}

export function saveDirectoryState(state: DirectoryFilterState) {
  try {
    sessionStorage.setItem(DIR_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

export function loadExpandedModules(classId: number, modules: ClassModule[]): Record<number, boolean> {
  const key = `smartexam_cls_mod_exp_${classId}`;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // ignore
  }
  // Smart default: if <= 3 modules expand all unlocked; if > 3 collapse all except first unlocked incomplete module
  const result: Record<number, boolean> = {};
  if (modules.length <= 3) {
    for (const m of modules) result[m.id] = !m.locked;
    return result;
  }
  let openedFirst = false;
  for (const m of modules) {
    if (!m.locked && !openedFirst) {
      const hasIncomplete = m.materials.some((mat) => !mat.viewed);
      if (hasIncomplete) {
        result[m.id] = true;
        openedFirst = true;
        continue;
      }
    }
    result[m.id] = false;
  }
  if (!openedFirst && modules.length > 0) {
    const firstUnlocked = modules.find((m) => !m.locked) ?? modules[0];
    result[firstUnlocked.id] = true;
  }
  return result;
}

export function saveExpandedModules(classId: number, map: Record<number, boolean>) {
  try {
    sessionStorage.setItem(`smartexam_cls_mod_exp_${classId}`, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function padWeek(weekNo: number): string {
  return `TUẦN ${String(Math.max(1, weekNo)).padStart(2, '0')}`;
}

export function formatDeadlineShort(ms: number | null | undefined, nowMs = Date.now()): {
  label: string;
  urgent: boolean;
  expired: boolean;
} {
  if (!ms) return { label: 'Chưa có hạn', urgent: false, expired: false };
  const diff = ms - nowMs;
  if (diff <= 0) {
    return {
      label: `Đã đóng ${new Date(ms).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`,
      urgent: false,
      expired: true,
    };
  }
  const hours = Math.floor(diff / 3600000);
  if (hours < 2) {
    const mins = Math.max(1, Math.floor(diff / 60000));
    return { label: `Còn ${mins} phút`, urgent: true, expired: false };
  }
  if (hours < 24) {
    return { label: `Còn ${hours} giờ`, urgent: true, expired: false };
  }
  const days = Math.floor(hours / 24);
  const datePart = new Date(ms).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
  return {
    label: days <= 3 ? `Còn ${days} ngày (${datePart})` : `Hạn ${datePart}`,
    urgent: days <= 2,
    expired: false,
  };
}

export function formatLastStudy(ms: number | null | undefined): string {
  if (!ms) return 'Chưa có hoạt động';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'Vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Date(ms).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function getAssignmentStatusMeta(a: ClassAssignment, nowMs = Date.now()): {
  code: 'done' | 'graded' | 'doing' | 'open' | 'upcoming' | 'missed';
  label: string;
  tone: 'good' | 'warn' | 'primary' | 'muted' | 'bad';
} {
  const st = a.state ?? (a.status && a.status !== 'in_progress' ? 'done' : a.status === 'in_progress' ? 'doing' : nowMs < a.open_at ? 'upcoming' : nowMs > a.close_at ? 'missed' : 'open');
  if (st === 'done') {
    if (a.resultVisible && a.score10 !== null && a.score10 !== undefined) {
      return { code: 'graded', label: 'Đã chấm', tone: 'good' };
    }
    return { code: 'done', label: 'Đã nộp', tone: 'good' };
  }
  if (st === 'doing') return { code: 'doing', label: 'Đang thực hiện', tone: 'warn' };
  if (st === 'open') return { code: 'open', label: 'Chưa bắt đầu', tone: 'primary' };
  if (st === 'upcoming') return { code: 'upcoming', label: 'Sắp mở', tone: 'muted' };
  return { code: 'missed', label: 'Quá hạn', tone: 'bad' };
}

/**
 * Smart "Tiếp tục học" recommender for Student Class Overview:
 * 1. In-progress assignment (state === 'doing')
 * 2. Earliest-deadline open homework (state === 'open' && mode === 'homework')
 * 3. Earliest-deadline open quiz/exam (state === 'open' && mode === 'exam')
 * 4. Next unlocked, unviewed learning material
 * Never recommends locked modules or missed/expired/upcoming items.
 */
export function getNextFocusItem(
  modules: ClassModule[],
  assignments: ClassAssignment[],
): FocusRecommendation | null {
  const moduleMap = new Map(modules.map((m) => [m.id, m]));
  const isModuleLocked = (moduleId: number | null | undefined) =>
    moduleId ? Boolean(moduleMap.get(moduleId)?.locked) : false;

  const doing = assignments.find((a) => a.state === 'doing' && !isModuleLocked(a.module_id));
  if (doing) {
    const mod = doing.module_id ? moduleMap.get(doing.module_id) : undefined;
    return {
      kind: 'assignment',
      actionLabel: 'Tiếp tục làm bài',
      badgeLabel: 'Đang thực hiện',
      title: doing.title,
      subtitle: `${doing.mode === 'exam' ? `Kiểm tra · ${doing.duration_min} phút` : `Bài tập · ${doing.duration_min} phút`}${mod ? ` · ${padWeek(mod.week_no)}` : ''}`,
      assignment: doing,
      moduleTitle: mod?.title,
    };
  }

  const openHomeworks = assignments
    .filter((a) => a.state === 'open' && a.mode === 'homework' && !isModuleLocked(a.module_id))
    .sort((a, b) => a.close_at - b.close_at);
  if (openHomeworks.length > 0) {
    const hw = openHomeworks[0];
    const mod = hw.module_id ? moduleMap.get(hw.module_id) : undefined;
    const dl = formatDeadlineShort(hw.close_at);
    return {
      kind: 'assignment',
      actionLabel: 'Làm bài tập',
      badgeLabel: 'Ưu tiên tiếp theo',
      title: hw.title,
      subtitle: `${hw.question_count ? `${hw.question_count} câu · ` : ''}${hw.duration_min} phút · ${dl.label}`,
      assignment: hw,
      moduleTitle: mod?.title,
    };
  }

  const openExams = assignments
    .filter((a) => a.state === 'open' && a.mode === 'exam' && !isModuleLocked(a.module_id))
    .sort((a, b) => a.close_at - b.close_at);
  if (openExams.length > 0) {
    const ex = openExams[0];
    const mod = ex.module_id ? moduleMap.get(ex.module_id) : undefined;
    const dl = formatDeadlineShort(ex.close_at);
    return {
      kind: 'assignment',
      actionLabel: 'Vào làm bài',
      badgeLabel: 'Bài kiểm tra đang mở',
      title: ex.title,
      subtitle: `${ex.question_count ? `${ex.question_count} câu · ` : ''}${ex.duration_min} phút · ${dl.label}`,
      assignment: ex,
      moduleTitle: mod?.title,
    };
  }

  for (const mod of modules) {
    if (mod.locked) continue;
    const unread = mod.materials.find((mat) => !mat.viewed);
    if (unread) {
      return {
        kind: 'material',
        actionLabel: 'Đọc tài liệu',
        badgeLabel: padWeek(mod.week_no),
        title: unread.title,
        subtitle: unread.summary || mod.title,
        material: unread,
        moduleTitle: mod.title,
      };
    }
  }

  return null;
}

export function getModuleCompletionStats(
  mod: ClassModule,
  assignments: ClassAssignment[],
  role: 'student' | 'teacher' | 'admin',
): { total: number; done: number } {
  const modAsg = assignments.filter((a) => a.module_id === mod.id);
  const total = mod.materials.length + modAsg.length;
  if (role !== 'student') {
    return { total, done: total };
  }
  const doneMats = mod.materials.filter((m) => m.viewed).length;
  const doneAsg = modAsg.filter((a) => a.state === 'done').length;
  return { total, done: doneMats + doneAsg };
}
