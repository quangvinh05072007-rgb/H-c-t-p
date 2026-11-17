import { FormEvent, useState } from 'react';
import { post, setSessionToken } from '../api';
import { User, Modal, Icon } from '../ui/kit';

interface DemoAccount {
  username: string;
  role: User['role'];
  name: string;
  code: string;
  unit: string;
  badge: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    username: 'hs.an.nm',
    role: 'student',
    name: 'Nguyễn Minh An',
    code: 'SBD: 2601737',
    unit: 'Lớp 12A1 · Ban Tự nhiên (KHTN)',
    badge: 'Học sinh',
  },
  {
    username: 'gv.lan',
    role: 'teacher',
    name: 'Cô Nguyễn Thị Lan',
    code: 'GV-10492',
    unit: 'Tổ Toán – Tin học THPT',
    badge: 'Giáo viên bộ môn',
  },
  {
    username: 'quanly',
    role: 'admin',
    name: 'Ban Giám Hiệu & Chuyên Môn',
    code: 'AD-001',
    unit: 'Hội đồng Khảo thí & Kiểm định',
    badge: 'Quản lý trường',
  },
];

export function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState('hs.an.nm');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);

  const doLogin = async (u: string, p: string, role?: User['role']) => {
    setBusy(true);
    setError(null);
    try {
      const payload: { username: string; password: string; role?: User['role'] } = {
        username: u.trim(),
        password: p,
      };
      if (role) payload.role = role;
      const res = await post('/api/login', payload);
      if (res.token) {
        setSessionToken(res.token);
      }
      onLogin(res.user);
    } catch (err: any) {
      setError(err?.message || 'Đăng nhập không thành công. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setBusy(false);
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    doLogin(username, password);
  };

  return (
    <div
      className="login-wrap"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        background: 'var(--paper-bg, #FAF7F2)',
        fontFamily: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Clean Warm Paper Login Card */}
      <div
        className="login-card"
        style={{
          maxWidth: 440,
          width: '100%',
          borderRadius: 16,
          padding: '36px 32px 34px',
          background: 'var(--paper-card, #FFFFFF)',
          boxShadow: '0 12px 36px -8px rgba(44, 40, 37, 0.08), 0 2px 6px rgba(44, 40, 37, 0.03)',
          border: '1px solid var(--paper-border, #E7E0D6)',
        }}
      >
        {/* Brand & Heading */}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #1E4D3B 0%, #2D6A4F 100%)',
              color: '#ffffff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              marginBottom: 14,
              boxShadow: '0 4px 12px rgba(30, 77, 59, 0.2)',
            }}
          >
            📐
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              lineHeight: 1.3,
              letterSpacing: '-0.02em',
              color: 'var(--ink, #1C1917)',
            }}
          >
            SmartExam AI
          </h1>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 13.5,
              color: 'var(--ink-muted, #78716C)',
              lineHeight: 1.45,
            }}
          >
            Hệ thống Khảo thí & Luyện thi THPT Quốc gia
          </p>
        </div>

        {/* Quick Demo Role Picker Button */}
        <button
          type="button"
          onClick={() => setShowRoleModal(true)}
          style={{
            width: '100%',
            background: '#F5EFEB',
            border: '1px dashed #D3C9BD',
            borderRadius: 10,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            marginBottom: 20,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#1E4D3B';
            e.currentTarget.style.background = '#EDE5DE';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#D3C9BD';
            e.currentTarget.style.background = '#F5EFEB';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1C1917' }}>Đăng nhập nhanh theo vai trò</div>
              <div style={{ fontSize: 11.5, color: '#78716C' }}>Học sinh 12A1 · Giáo viên · Quản lý</div>
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1E4D3B' }}>Chọn →</span>
        </button>

        {/* Divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            margin: '0 0 20px',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, height: 1, background: '#E7E0D6' }} />
          <span style={{ fontSize: 12, color: '#A8A29E', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            hoặc tài khoản cá nhân
          </span>
          <div style={{ flex: 1, height: 1, background: '#E7E0D6' }} />
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
          <label
            style={{
              display: 'block',
              fontSize: 13.5,
              fontWeight: 600,
              color: '#44403C',
              marginBottom: 5,
              textAlign: 'left',
            }}
          >
            Tên đăng nhập
          </label>
          <input
            className="input"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            placeholder="Nhập tên đăng nhập hoặc email"
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid #D6CECE',
              fontSize: 14,
              color: '#1C1917',
              background: '#FFFFFF',
              outline: 'none',
              marginBottom: 14,
              transition: 'border-color 0.15s ease',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#1E4D3B')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#D6CECE')}
          />

          <label
            style={{
              display: 'block',
              fontSize: 13.5,
              fontWeight: 600,
              color: '#44403C',
              marginBottom: 5,
              textAlign: 'left',
            }}
          >
            Mật khẩu
          </label>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Nhập mật khẩu"
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid #D6CECE',
              fontSize: 14,
              color: '#1C1917',
              background: '#FFFFFF',
              outline: 'none',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#1E4D3B')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#D6CECE')}
          />

          {error && (
            <div
              className="alert error"
              role="alert"
              style={{
                fontSize: 13,
                padding: '8px 12px',
                borderRadius: 6,
                marginTop: 14,
                color: '#B91C1C',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
              }}
            >
              {error}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={busy || !username || !password}
            style={{
              marginTop: 22,
              background: '#1E4D3B',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: 14.5,
              borderRadius: 8,
              padding: '11px 20px',
              border: 'none',
              cursor: busy ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s ease, transform 0.1s ease',
              boxShadow: '0 2px 8px rgba(30, 77, 59, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#15392B')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#1E4D3B')}
          >
            {busy ? 'Đang xác thực…' : 'Đăng nhập vào hệ thống →'}
          </button>
        </form>

        {/* Discreet footer */}
        <div
          style={{
            marginTop: 22,
            paddingTop: 14,
            borderTop: '1px solid #E7E0D6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
            color: '#78716C',
          }}
        >
          <a
            href="#/phu-huynh"
            style={{ color: '#1E4D3B', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Icon name="user" /> Tra cứu điểm phụ huynh
          </a>
          <span>Chuẩn GDPT 2018</span>
        </div>
      </div>

      {/* Role Picker Modal */}
      {showRoleModal && (
        <Modal title="Chọn tài khoản mẫu để trải nghiệm" onClose={() => setShowRoleModal(false)} width={460}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#57534E' }}>
              Hệ thống đã chuẩn bị sẵn dữ liệu bài tập, đề thi và lớp học cho các vai trò:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.username}
                  type="button"
                  onClick={() => {
                    setShowRoleModal(false);
                    doLogin(acc.username, 'demo1234', acc.role);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid #E7E0D6',
                    background: '#FAF7F2',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#1E4D3B';
                    e.currentTarget.style.background = '#F3ECE3';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#E7E0D6';
                    e.currentTarget.style.background = '#FAF7F2';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: acc.role === 'student' ? '#E8F5E9' : acc.role === 'teacher' ? '#E0F2FE' : '#FEF3C7',
                        color: acc.role === 'student' ? '#1E4D3B' : acc.role === 'teacher' ? '#0369A1' : '#B45309',
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 800,
                        fontSize: 13,
                      }}
                    >
                      {acc.role === 'student' ? 'HS' : acc.role === 'teacher' ? 'GV' : 'QL'}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1C1917' }}>{acc.name}</div>
                      <div style={{ fontSize: 12, color: '#78716C' }}>
                        {acc.code} · {acc.unit}
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#1E4D3B',
                      background: '#E8F5E9',
                      padding: '4px 10px',
                      borderRadius: 9999,
                    }}
                  >
                    Vào →
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
