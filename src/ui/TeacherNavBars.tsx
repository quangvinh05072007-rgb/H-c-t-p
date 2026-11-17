import { Database, FilePlus2, FolderOpen, Shuffle, Upload } from 'lucide-react';
import { useRoute } from './kit';

export function CreateExamActionBar({
  active,
  classSuffix = '',
}: {
  active: 'build' | 'import' | 'shuffle';
  classSuffix?: string;
}) {
  const items = [
    {
      key: 'build' as const,
      href: `#/ra-de${classSuffix}`,
      title: 'Tạo đề mới',
      desc: 'Soạn đề theo ma trận & xuất bản in A4',
      icon: FilePlus2,
      featured: true,
    },
    {
      key: 'import' as const,
      href: `#/nhap-de${classSuffix}`,
      title: 'Nhập đề',
      desc: 'Tách câu hỏi từ Word, PDF hoặc văn bản',
      icon: Upload,
      featured: false,
    },
    {
      key: 'shuffle' as const,
      href: `#/dao-de${classSuffix}`,
      title: 'Đảo đề',
      desc: 'Trộn nhiều mã đề & bảng đáp án chéo',
      icon: Shuffle,
      featured: false,
    },
  ];

  return (
    <nav className="nav-subcards" aria-label="Công cụ tạo đề">
      {items.map((item) => {
        const IconComp = item.icon;
        const isActive = active === item.key;
        return (
          <a
            key={item.key}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={`nav-subcard ${isActive ? 'is-active' : ''} ${item.featured ? 'is-featured' : ''}`}
          >
            <span className="nav-subcard-icon" aria-hidden="true">
              <IconComp size={18} />
            </span>
            <span className="nav-subcard-body">
              <span className="nav-subcard-title-row">
                <strong>{item.title}</strong>
                {item.featured && <span className="nav-subcard-tag">Chính</span>}
              </span>
              <span className="nav-subcard-desc">{item.desc}</span>
            </span>
          </a>
        );
      })}
    </nav>
  );
}

export function LibrarySubNavBar({ active }: { active: 'exams' | 'bank' }) {
  const { query } = useRoute();
  const classId = query.get('classId');
  const suffix = classId && /^\d+$/.test(classId) ? `?classId=${classId}` : '';

  return (
    <nav className="nav-inline-tabs" aria-label="Phân mục Kho đề">
      <a
        href={`#/thu-vien${suffix}`}
        aria-current={active === 'exams' ? 'page' : undefined}
        className={`nav-inline-tab ${active === 'exams' ? 'is-active' : ''}`}
      >
        <FolderOpen size={16} />
        <span>Kho đề thi</span>
      </a>
      <a
        href={`#/ngan-hang${suffix}`}
        aria-current={active === 'bank' ? 'page' : undefined}
        className={`nav-inline-tab ${active === 'bank' ? 'is-active' : ''}`}
      >
        <Database size={16} />
        <span>Ngân hàng câu hỏi</span>
      </a>
    </nav>
  );
}
