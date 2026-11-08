import { useState } from 'react';

export default function AuthPanel({ onLogin, mode = 'content' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Không thể đăng nhập.');
      setPassword('');
      onLogin(body.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const studentMode = mode === 'student';
  const assessmentMode = mode === 'assessment';

  return (
    <section className="auth-panel">
      <div className="auth-copy">
        <p className="eyebrow">Khu vực được bảo vệ</p>
        <h1>{studentMode ? 'Đăng nhập để bắt đầu lượt làm bài' : assessmentMode ? 'Đăng nhập vào workspace đánh giá' : 'Đăng nhập để quản lý nội dung'}</h1>
        {studentMode ? (
          <>
            <p>Catalog có thể xem công khai, nhưng chỉ tài khoản Student mới được tạo attempt gắn với danh tính của mình.</p>
            <ul><li><strong>Student</strong> — chỉ nhận snapshot không chứa đáp án và lời giải.</li></ul>
          </>
        ) : assessmentMode ? (
          <>
            <p>Framework, review và báo cáo bằng chứng đều được bảo vệ bằng role phía server.</p>
            <ul>
              <li><strong>Student</strong> — chỉ xem kết quả của chính mình.</li>
              <li><strong>Assessment Specialist</strong> — cấu hình framework versioned.</li>
              <li><strong>Academic Reviewer</strong> — duyệt độc lập interpretation rules.</li>
            </ul>
          </>
        ) : (
          <>
            <p>Import, reviewer preview và Assembly Lab là khu vực bảo vệ. Hệ thống kiểm tra role ở backend, không chỉ ẩn nút trên giao diện.</p>
            <ul>
              <li><strong>Content Editor</strong> — tải/kiểm tra package và tạo assembly technical preview.</li>
              <li><strong>Academic Reviewer</strong> — xem answer payload, duyệt và publish assembly snapshot.</li>
            </ul>
          </>
        )}
      </div>
      <form onSubmit={submit} className="login-card">
        <div className="login-mark">E</div>
        <h2>Đăng nhập EduAssess</h2>
        <label>
          <span>Email</span>
          <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          <span>Mật khẩu</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Đang xác minh…' : 'Đăng nhập'}</button>
        <p className="login-note">Không có tài khoản tự đăng ký. User được bootstrap qua CLI bảo mật.</p>
      </form>
    </section>
  );
}
