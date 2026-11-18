import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Calculator,
  CheckCircle2,
  Compass,
  TrendingUp,
} from 'lucide-react';

export type StudyStatusKey = 'mastered' | 'learning' | 'weak' | 'unattempted';

export interface StudyStatusMeta {
  key: StudyStatusKey;
  label: string;
  actionLabel: string;
  priority: number;
  className: string;
}

export function getStudyStatusMeta(pctVal: number | null): StudyStatusMeta {
  if (pctVal === null) {
    return {
      key: 'unattempted',
      label: 'Chưa học',
      actionLabel: 'Bắt đầu học',
      priority: 2,
      className: 'ss-status-unattempted',
    };
  }
  if (pctVal >= 75) {
    return {
      key: 'mastered',
      label: 'Đã thành thạo',
      actionLabel: 'Ôn lại',
      priority: 3,
      className: 'ss-status-mastered',
    };
  }
  if (pctVal >= 50) {
    return {
      key: 'learning',
      label: 'Đang học',
      actionLabel: 'Tiếp tục học',
      priority: 1,
      className: 'ss-status-learning',
    };
  }
  return {
    key: 'weak',
    label: 'Cần củng cố',
    actionLabel: 'Tiếp tục học',
    priority: 0,
    className: 'ss-status-weak',
  };
}

export function StudyStatusIcon({ status, size = 14 }: { status: StudyStatusKey; size?: number }) {
  switch (status) {
    case 'mastered':
      return <CheckCircle2 size={size} aria-hidden="true" />;
    case 'learning':
      return <TrendingUp size={size} aria-hidden="true" />;
    case 'weak':
      return <AlertTriangle size={size} aria-hidden="true" />;
    default:
      return <BookOpen size={size} aria-hidden="true" />;
  }
}

export function TopicGlyph({
  subjectId,
  domain,
  size = 18,
}: {
  subjectId: string;
  domain?: 'algebra' | 'geometry' | 'statistics';
  size?: number;
}) {
  if (domain === 'geometry') return <Compass size={size} aria-hidden="true" />;
  if (domain === 'statistics') return <BarChart3 size={size} aria-hidden="true" />;
  return <Calculator size={size} aria-hidden="true" />;
}

/**
 * Tách phần tiêu đề mở đầu trước dấu hai chấm, chỉ tách nếu dấu ':' nằm trước khối LaTeX '$'
 * để tránh cắt nhầm bên trong biểu thức tỉ lệ hoặc điều kiện toán học.
 */
export function splitFormulaParts(raw: string): { lead: string; body: string } | null {
  const dollarIdx = raw.indexOf('$');
  const colonIdx = raw.indexOf(':');
  if (colonIdx > 0 && colonIdx < 56 && (dollarIdx === -1 || colonIdx < dollarIdx)) {
    const body = raw.slice(colonIdx + 1).trim();
    if (body) {
      return {
        lead: raw.slice(0, colonIdx).trim(),
        body,
      };
    }
  }
  return null;
}

export type LastStudiedTopic = {
  code: string;
  name: string;
  subjectId: string;
  grade: number;
  openedAt: number;
};

const LAST_TOPIC_PREFIX = 'smartexam_last_selfstudy_';

export function readLastStudiedTopic(userId: number): LastStudiedTopic | null {
  try {
    const raw = localStorage.getItem(`${LAST_TOPIC_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.code === 'string' && typeof parsed.name === 'string') {
      return parsed;
    }
  } catch {}
  return null;
}

export function saveLastStudiedTopic(userId: number, entry: LastStudiedTopic) {
  try {
    localStorage.setItem(`${LAST_TOPIC_PREFIX}${userId}`, JSON.stringify(entry));
  } catch {}
}
