import { Database, FilePlus2, FolderOpen, Grid3X3, ScanLine, Shuffle, Upload, Wrench } from 'lucide-react';
import { useRoute } from './kit';

type Tab = { key: string; path: string; label: string; icon: typeof FolderOpen };

/** Hậu tố ?classId=… khi đang chọn đề để giao cho một lớp. */
function useClassSuffix() {
  const { query } = useRoute();
  const classId = query.get('classId');
  return classId && /^\d+$/.test(classId) ? `?classId=${classId}` : '';
}

function SectionTabs({ label, tabs, active }: { label: string; tabs: Tab[]; active: string }) {
  const suffix = useClassSuffix();
  return (
    <nav className="su-section-tabs" aria-label={label}>
      {tabs.map((t) => {
        const IconComp = t.icon;
        const on = t.key === active;
        return (
          <a key={t.key} href={`#${t.path}${suffix}`} aria-current={on ? 'page' : undefined} className={on ? 'on' : ''}>
            <IconComp size={15} aria-hidden="true" />
            <span>{t.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

export const EXAM_TABS: Tab[] = [
  { key: 'exams', path: '/thu-vien', label: 'Kho đề', icon: FolderOpen },
  { key: 'build', path: '/ra-de', label: 'Soạn đề', icon: FilePlus2 },
  { key: 'shuffle', path: '/dao-de', label: 'Đảo đề & In', icon: Shuffle },
  { key: 'omr', path: '/cham-phieu', label: 'Chấm phiếu tô', icon: ScanLine },
];

export const BANK_TABS: Tab[] = [
  { key: 'bank', path: '/ngan-hang', label: 'Câu hỏi', icon: Database },
  { key: 'import', path: '/nhap-de', label: 'Nhập', icon: Upload },
  { key: 'coverage', path: '/do-phu', label: 'Độ phủ', icon: Grid3X3 },
  { key: 'quality', path: '/can-sua', label: 'Cần sửa', icon: Wrench },
];

/** Thanh tab mục Đề thi. */
export function ExamSectionTabs({ active }: { active: 'exams' | 'build' | 'shuffle' | 'omr' }) {
  return <SectionTabs label="Mục Đề thi" tabs={EXAM_TABS} active={active} />;
}

/** Thanh tab mục Ngân hàng. */
export function BankSectionTabs({ active }: { active: 'bank' | 'import' | 'coverage' | 'quality' }) {
  return <SectionTabs label="Mục Ngân hàng" tabs={BANK_TABS} active={active} />;
}

/** Giữ tên cũ cho các trang đang dùng. */
export function CreateExamActionBar({ active }: { active: 'build' | 'import' | 'shuffle'; classSuffix?: string }) {
  return active === 'import' ? <BankSectionTabs active="import" /> : <ExamSectionTabs active={active} />;
}

export function LibrarySubNavBar({ active }: { active: 'exams' | 'bank' }) {
  return active === 'bank' ? <BankSectionTabs active="bank" /> : <ExamSectionTabs active="exams" />;
}
