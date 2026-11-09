import { useState } from 'react';
import Brand from './Brand.jsx';
import Icon from './Icon.jsx';
import { defaultDashboard } from './routes.js';

const visual = {
  login: { title: 'Mỗi vai trò có một nơi để bắt đầu.', copy: 'Tiếp tục công việc của bạn với dữ liệu, công cụ và quyền truy cập phù hợp.', image: '/assets/illustrations/login-mentor.webp', width: 1199, height: 1312 },
  register: { title: 'Một hành trình học tập có người đồng hành.', copy: 'Tài khoản được cấp có kiểm soát để bảo vệ nội dung và dữ liệu học sinh.', image: '/assets/illustrations/access-journey.webp', width: 1024, height: 1536 }
};

function AuthVisual({ mode, navigate }) {
  const content = visual[mode];
  return <aside className={`auth-visual auth-visual-${mode}`}><Brand onClick={() => navigate('/')} /><div className="auth-visual-copy"><span className="portal-kicker">EduAssess workspace</span><h2>{content.title}</h2><p>{content.copy}</p></div><img src={content.image} width={content.width} height={content.height} alt="" /><span className="auth-visual-footer">Nội dung đúng quyền. Quyết định có bằng chứng.</span></aside>;
}

export function LoginPage({ navigate, onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!email.trim() || !password) { setError('Nhập email và mật khẩu để đăng nhập.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Email chưa đúng định dạng.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ email: email.trim(), password }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Không thể đăng nhập. Hãy kiểm tra lại thông tin.');
      onLogin(body.user);
      setPassword('');
      navigate(defaultDashboard(body.user));
    } catch (requestError) { setError(requestError.message || 'Không thể kết nối tới hệ thống.'); }
    finally { setBusy(false); }
  };

  return <main className="portal-auth-layout"><AuthVisual mode="login" navigate={navigate} /><section className="auth-form-side"><div className="auth-top-link">Chưa có tài khoản? <button type="button" onClick={() => navigate('/register')}>Xem cách truy cập</button></div><div className="auth-form-wrap"><span className="portal-kicker">Chào mừng trở lại</span><h1>Đăng nhập EduAssess</h1><p>Tiếp tục từ không gian làm việc của bạn.</p><form onSubmit={submit} noValidate>
      <label htmlFor="login-email">Email</label><input id="login-email" name="email" type="email" inputMode="email" autoComplete="username" spellCheck={false} required maxLength={320} placeholder="ten@truonghoc.vn" value={email} onChange={(event) => setEmail(event.target.value)} />
      <label htmlFor="login-password">Mật khẩu</label><div className="auth-password-wrap"><input id="login-password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" required maxLength={256} placeholder="Nhập mật khẩu" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setVisible((value) => !value)}><Icon name="eye" size={19} /></button></div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="portal-button portal-button-primary auth-submit" disabled={busy} type="submit">{busy ? 'Đang xác minh…' : 'Đăng nhập'}<Icon name="arrow" size={18} /></button>
    </form><div className="auth-form-foot"><Icon name="shield" size={18} /><span>Phiên đăng nhập được bảo vệ bằng cookie và CSRF phía server.</span></div></div></section></main>;
}

export function RegisterPage({ navigate }) {
  return <main className="portal-auth-layout"><AuthVisual mode="register" navigate={navigate} /><section className="auth-form-side"><div className="auth-top-link">Đã có tài khoản? <button type="button" onClick={() => navigate('/login')}>Đăng nhập</button></div><div className="auth-form-wrap auth-access-wrap"><span className="portal-kicker">Truy cập tài khoản</span><h1>Tài khoản được cấp qua quản trị viên.</h1><p>EduAssess hiện chưa mở tự đăng ký. Điều này giúp trường và đội ngũ nội dung kiểm soát quyền truy cập vào đề, đáp án và dữ liệu học sinh.</p><div className="access-steps"><div><span>01</span><p>Liên hệ người quản trị EduAssess tại đơn vị của bạn để được cấp đúng vai trò.</p></div><div><span>02</span><p>Nhận thông tin đăng nhập qua kênh nội bộ bảo mật của đơn vị.</p></div><div><span>03</span><p>Đăng nhập và mở dashboard dành riêng cho vai trò được cấp.</p></div></div><button type="button" className="portal-button portal-button-primary auth-submit" onClick={() => navigate('/login')}>Tôi đã có tài khoản<Icon name="arrow" size={18} /></button><button type="button" className="auth-back-home" onClick={() => navigate('/')}>Quay về trang chủ</button></div></section></main>;
}
