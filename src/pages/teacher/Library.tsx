import { ReactNode } from 'react';
import { Icon, useRoute } from '../../ui/kit';
import { Exams } from './Exams';

export function Library({ children }: { children?: ReactNode }) {
  const { path, query } = useRoute();
  const classId = query.get('classId');
  const suffix = classId && /^\d+$/.test(classId) ? `?classId=${classId}` : '';
  const tabs = [
    ['/thu-vien', 'Kho đề', 'exam'],
    ['/ngan-hang', 'Ngân hàng', 'bank'],
    ['/nhap-de', 'Nhập đề', 'upload'],
    ['/ra-de', 'Tạo đề', 'plus'],
  ];

  return (
    <div className="stack" style={{ gap: 14 }}>
      <nav
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: 'var(--surface)',
          padding: 4,
          borderRadius: 8,
          border: '1px solid var(--line)',
          boxShadow: 'var(--shadow-sm)',
          width: 'fit-content',
          flexWrap: 'wrap',
        }}
        aria-label="Phân hệ đề thi"
      >
        {tabs.map(([href, label, icon]) => {
          const active = href === '/thu-vien' ? (path === '/thu-vien' || path.startsWith('/de-thi')) : path === href;
          return (
            <a
              key={href}
              href={`#${href}${suffix}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 14px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: active ? 700 : 550,
                color: active ? '#ffffff' : 'var(--ink-2)',
                background: active ? 'var(--primary)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.15s ease',
              }}
              aria-current={active ? 'page' : undefined}
            >
              <Icon name={icon} />
              <span>{label}</span>
            </a>
          );
        })}
      </nav>

      {suffix && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 6,
            background: 'var(--primary-soft)',
            color: 'var(--primary)',
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          <span>🎯 Đang chọn đề để giao cho lớp</span>
          <a
            href={`#/lop/${classId}/bai-giao`}
            style={{
              marginLeft: 'auto',
              color: 'var(--primary)',
              textDecoration: 'underline',
              fontSize: 12,
            }}
          >
            Quay lại bài đã giao
          </a>
        </div>
      )}

      {children ?? <Exams />}
    </div>
  );
}
