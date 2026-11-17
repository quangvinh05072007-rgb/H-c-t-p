export type ClassroomTab =
  | 'overview'
  | 'modules'
  | 'quizzes'
  | 'assignments'
  | 'grades'
  | 'announcements'
  | 'people'
  | 'info';

export interface ClassroomSummary {
  id: number;
  name: string;
  grade: number;
  code: string;
  teacher: string | null;
  students: number;
  module_count?: number;
  assignment_count?: number;
  total_assignments?: number;
  active_assignments?: number;
  upcoming_assignments?: number;
  completed_assignments?: number;
  done_count?: number;
  pending_count?: number;
  material_count?: number;
  viewed_count?: number;
  totalTasks?: number;
  doneTasks?: number;
  progressPct?: number;
  next_deadline?: number | null;
  nextUrgent?: {
    assignmentId: number;
    title: string;
    closeAt: number;
    attemptId?: number | null;
  } | null;
  avg_score?: number | null;
  enrolled?: boolean;
  mine?: boolean;
  status?: 'active' | 'ended';
  academicYear?: string;
  subject?: string;
}

export interface ClassInfo {
  id: number;
  name: string;
  grade: number;
  code: string;
  teacher: string | null;
  teacher_id?: number | null;
  students: number;
  academicYear?: string;
  subject?: string;
}

export interface ClassMaterial {
  id: number;
  module_id: number;
  kind: 'doc' | 'video' | 'link' | 'note';
  title: string;
  summary: string;
  content: string;
  topic_code: string | null;
  sort_order: number;
  created_at: number;
  viewed?: boolean;
  viewed_at?: number | null;
}

export interface ClassModule {
  id: number;
  week_no: number;
  title: string;
  description: string;
  sort_order: number;
  locked: boolean;
  created_at?: number;
  materials: ClassMaterial[];
}

export interface ClassAssignment {
  id: number;
  title: string;
  mode: 'exam' | 'homework';
  open_at: number;
  close_at: number;
  duration_min: number;
  show_result?: string;
  module_id: number | null;
  exam_id?: number;
  question_count?: number | null;
  // Student fields
  attempt_id?: number | null;
  status?: string | null;
  score10?: number | null;
  resultVisible?: boolean;
  deadline_at?: number | null;
  started_at?: number | null;
  submitted_at?: number | null;
  teacher_feedback?: string | null;
  teacher_stamp?: string | null;
  feedback_at?: number | null;
  state?: 'done' | 'doing' | 'upcoming' | 'missed' | 'open';
  // Teacher fields
  submitted?: number;
  doing?: number;
  avg?: number | null;
}

export interface ClassAnnouncement {
  id: number;
  title: string;
  body: string;
  pinned: boolean | number;
  created_at: number;
  author_name: string | null;
}

export interface ClassMember {
  id: number;
  display_name: string;
  username: string;
  xp?: number;
  streak: number;
  last_active_day?: string | null;
}

export interface StudentClassPayload {
  class: ClassInfo | null;
  assignments: ClassAssignment[];
  allClasses: ClassroomSummary[];
  classmates: ClassMember[];
  modules: ClassModule[];
  announcements: ClassAnnouncement[];
  activeClassId: number | null;
  lastStudyAt: number | null;
  appealsCount: number;
}

export interface TeacherClassPayload {
  class: ClassInfo;
  students: ClassMember[];
  heat: Record<number, Record<string, { value: number; band: string; n: number }>>;
  classMastery: { topic: string; name: string; value: number; band: string; n: number }[];
  errors: Record<string, number>;
  assignments: ClassAssignment[];
  actions: { kind: string; topic?: string; students?: number[]; text: string }[];
  modules: ClassModule[];
  announcements: ClassAnnouncement[];
  appealsCount: number;
}

export interface FocusRecommendation {
  kind: 'assignment' | 'material';
  actionLabel: string;
  badgeLabel: string;
  title: string;
  subtitle: string;
  assignment?: ClassAssignment;
  material?: ClassMaterial;
  moduleTitle?: string;
}
