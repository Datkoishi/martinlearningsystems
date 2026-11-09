import { lazy, Suspense, useEffect, useState } from 'react';
import { csrfHeaders } from './auth.js';
import { LoginPage, RegisterPage } from './portal/AuthPages.jsx';
import Brand from './portal/Brand.jsx';
import { dashboardComponents } from './portal/Dashboards.jsx';
import DemoPage from './portal/DemoPage.jsx';
import Icon from './portal/Icon.jsx';
import LandingPage from './portal/LandingPage.jsx';
import { availableRoles, defaultDashboard, roleMenus, workspaceLabels } from './portal/routes.js';

const PublishedCatalog = lazy(() => import('./PublishedCatalog.jsx'));
const ImportPanel = lazy(() => import('./ImportPanel.jsx'));
const AssemblyLab = lazy(() => import('./AssemblyLab.jsx'));
const AssessmentWorkspace = lazy(() => import('./AssessmentWorkspace.jsx'));
const ManualScoringWorkspace = lazy(() => import('./ManualScoringWorkspace.jsx'));

const workspaceComponents = { catalog: PublishedCatalog, imports: ImportPanel, assembly: AssemblyLab, assessment: AssessmentWorkspace, grading: ManualScoringWorkspace };
const legacyHashes = { '#exam': '/demo', '#catalog': '/workspace/catalog', '#imports': '/workspace/imports', '#assembly': '/workspace/assembly', '#assessment': '/workspace/assessment', '#grading': '/workspace/grading' };
const initialPath = () => legacyHashes[window.location.hash] || window.location.pathname;
const initials = (name) => String(name || 'E').trim().split(/\s+/).slice(-2).map((part) => part[0]?.toLocaleUpperCase('vi')).join('');

function PortalShell({ user, role, path, navigate, onLogout, notice, children, dashboard }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const authorized = availableRoles(user);
  const menu = roleMenus[role?.slug] || [];
  const go = (target) => { setMenuOpen(false); navigate(target); };
  return <div className="portal-app"><button type="button" className="portal-skip" onClick={() => document.getElementById('portal-main')?.focus()}>Đi tới nội dung chính</button><div className="portal-app-frame">
    <aside className={`portal-sidebar ${menuOpen ? 'is-open' : ''}`}><Brand onClick={() => go('/')} /><nav aria-label="Điều hướng ứng dụng"><span className="portal-nav-label">Không gian của tôi</span><button type="button" className={dashboard ? 'active' : ''} onClick={() => go(`/dashboard/${role?.slug || 'editor'}`)}><Icon name="grid" size={20} />Tổng quan</button><span className="portal-nav-label">Công việc</span>{menu.map((item) => <button type="button" key={item.path} className={path === item.path ? 'active' : ''} onClick={() => go(item.path)}><Icon name={item.icon} size={20} />{item.label}</button>)}</nav><div className="portal-sidebar-foot"><button type="button" onClick={() => go('/register')}><Icon name="info" size={20} />Trợ giúp truy cập</button><div className="portal-mascot-card"><img src="/assets/illustrations/mascot-rocket.webp" width="1312" height="1199" alt="" loading="lazy" /><strong>Một bước nhỏ cũng là tiến bộ.</strong><p>Mở đúng công việc của bạn trong EduAssess.</p></div></div></aside>
    {menuOpen && <button className="portal-sidebar-scrim" type="button" aria-label="Đóng menu" onClick={() => setMenuOpen(false)} />}
    <div className="portal-app-content"><header className="portal-app-header"><div className="portal-header-title"><button type="button" className="portal-icon-button portal-mobile-menu" aria-label="Mở menu" onClick={() => setMenuOpen(true)}><Icon name="menu" /></button><div><span>{role?.label || 'EduAssess'}</span><h1>{dashboard ? role?.title || 'Không gian làm việc' : workspaceLabels[path.split('/')[2]] || 'Không gian làm việc'}</h1></div></div><div className="portal-header-actions">{authorized.length > 1 && <label className="portal-role-select"><span className="sr-only">Chuyển vai trò</span><select value={role?.slug || authorized[0]?.slug} onChange={(event) => go(`/dashboard/${event.target.value}`)}>{authorized.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select></label>}<span className="portal-header-avatar" aria-label={`Tài khoản ${user.displayName}`}>{initials(user.displayName)}</span><button type="button" className="portal-icon-button" onClick={onLogout} aria-label="Đăng xuất" title="Đăng xuất"><Icon name="logout" size={19} /></button></div></header>
      {notice && <p className="portal-global-notice" role="alert">{notice}</p>}
      <div className={`portal-app-grid ${dashboard ? '' : 'portal-app-grid-wide'}`}><main id="portal-main" tabIndex="-1" className={dashboard ? 'portal-main' : 'portal-main portal-workspace'}>{children}</main>{dashboard && <aside className="portal-context-rail" aria-label="Thông tin tài khoản"><section className="portal-profile-card"><div className="portal-section-header"><h2>Hồ sơ của tôi</h2><Icon name="user" size={20} /></div><span className="portal-profile-avatar">{initials(user.displayName)}</span><strong>{user.displayName}</strong><p>{role?.label}</p></section><section className="portal-next-card"><h2>Đi tiếp từ đây</h2>{menu.slice(0, 3).map((item) => <button type="button" key={item.path} onClick={() => go(item.path)}><span><Icon name={item.icon} size={19} /></span><strong>{item.label}</strong><Icon name="chevron" size={17} /></button>)}</section><section className="portal-rail-note"><Icon name="shield" size={23} /><p>Thông tin hiển thị theo quyền của phiên đăng nhập hiện tại.</p></section></aside>}</div>
    </div>
  </div></div>;
}

export default function App() {
  const [path, setPath] = useState(initialPath);
  const [user, setUser] = useState(undefined);
  const [notice, setNotice] = useState('');
  useEffect(() => { const controller = new AbortController(); fetch('/api/auth/me', { signal: controller.signal, credentials: 'same-origin' }).then((response) => response.ok ? response.json() : null).then((body) => setUser(body?.user || null)).catch((error) => { if (error.name !== 'AbortError') setUser(null); }); return () => controller.abort(); }, []);
  useEffect(() => { const sync = () => setPath(initialPath()); window.addEventListener('popstate', sync); window.addEventListener('hashchange', sync); return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); }; }, []);
  useEffect(() => { document.title = path === '/' ? 'EduAssess | Đánh giá học tập có bằng chứng' : `${path.startsWith('/dashboard') ? 'Dashboard' : path === '/login' ? 'Đăng nhập' : path === '/register' ? 'Truy cập tài khoản' : path === '/demo' ? 'Bài DEMO' : 'Không gian làm việc'} | EduAssess`; }, [path]);
  useEffect(() => { if (path === '/dashboard' && user) { const target = defaultDashboard(user); if (target !== '/dashboard') { window.history.replaceState(null, '', target); setPath(target); } } }, [path, user]);
  const navigate = (target) => { if (target !== path) { window.history.pushState(null, '', target); setPath(target); } window.scrollTo({ top: 0, behavior: 'instant' }); };
  const logout = async () => { setNotice(''); try { const response = await fetch('/api/auth/logout', { method: 'POST', headers: csrfHeaders(), credentials: 'same-origin' }); if (!response.ok && response.status !== 401) throw new Error('Không thể thu hồi phiên đăng nhập. Hãy thử lại.'); setUser(null); navigate('/'); } catch (error) { setNotice(error.message || 'Không thể đăng xuất.'); } };

  if (path === '/') return <div className="portal-root"><LandingPage user={user} navigate={navigate} /></div>;
  if (path === '/login') return <div className="portal-root"><LoginPage navigate={navigate} onLogin={setUser} /></div>;
  if (path === '/register') return <div className="portal-root"><RegisterPage navigate={navigate} /></div>;
  if (path === '/demo') return <div className="portal-root"><DemoPage navigate={navigate} /></div>;
  if (user === undefined) return <div className="portal-root portal-auth-loading" role="status"><span className="portal-spinner" />Đang xác minh phiên…</div>;
  if (path === '/workspace/catalog' && !user) return <div className="portal-root"><header className="portal-public-catalog-header"><Brand onClick={() => navigate('/')} /><button type="button" className="portal-button portal-button-primary" onClick={() => navigate('/login')}>Đăng nhập</button></header><main className="portal-workspace"><Suspense fallback={<div className="portal-panel-state" role="status"><span className="portal-spinner" />Đang mở kho đề…</div>}><PublishedCatalog authUser={null} onLogin={setUser} /></Suspense></main></div>;
  if (!user) return <div className="portal-root"><LoginPage navigate={navigate} onLogin={setUser} /></div>;

  const slug = path.startsWith('/dashboard/') ? path.split('/')[2] : null;
  const authorized = availableRoles(user);
  const role = slug ? authorized.find((item) => item.slug === slug) : authorized[0];
  if (!role) return <div className="portal-root portal-auth-loading"><p>Tài khoản chưa có vai trò dashboard phù hợp.</p><button type="button" className="portal-button portal-button-outline" onClick={logout}>Đăng xuất</button></div>;
  if (path.startsWith('/dashboard')) { const Dashboard = dashboardComponents[role.slug]; return <div className="portal-root"><PortalShell user={user} role={role} path={path} navigate={navigate} onLogout={logout} notice={notice} dashboard><Dashboard navigate={navigate} /></PortalShell></div>; }

  const workspace = path.startsWith('/workspace/') ? path.split('/')[2] : null;
  const Workspace = workspaceComponents[workspace];
  if (Workspace) {
    const allowed = workspace === 'catalog' || (workspace === 'imports' && (user.roles.includes('CONTENT_EDITOR') || user.roles.includes('ACADEMIC_REVIEWER') || user.roles.includes('SUPER_ADMIN'))) || (workspace === 'assembly' && (user.roles.includes('CONTENT_EDITOR') || user.roles.includes('ACADEMIC_REVIEWER') || user.roles.includes('SUPER_ADMIN'))) || (workspace === 'assessment' && (user.roles.includes('STUDENT') || user.roles.includes('ASSESSMENT_SPECIALIST') || user.roles.includes('ACADEMIC_REVIEWER') || user.roles.includes('SUPER_ADMIN'))) || (workspace === 'grading' && (user.roles.includes('MANUAL_GRADER') || user.roles.includes('SUPER_ADMIN')));
    return <div className="portal-root"><PortalShell user={user} role={role} path={path} navigate={navigate} onLogout={logout} notice={notice}><Suspense fallback={<div className="portal-panel-state" role="status"><span className="portal-spinner" />Đang mở không gian làm việc…</div>}>{allowed ? <Workspace authUser={user} onLogin={setUser} /> : <section className="portal-denied"><Icon name="shield" size={38} /><h2>Không gian này chưa được cấp cho bạn</h2><p>Hãy chọn một mục trong menu vai trò của mình.</p><button type="button" className="portal-button portal-button-primary" onClick={() => navigate(`/dashboard/${role.slug}`)}>Về dashboard</button></section>}</Suspense></PortalShell></div>;
  }
  return <div className="portal-root portal-not-found"><Icon name="search" size={42} /><h1>Không tìm thấy trang</h1><p>Đường dẫn này chưa có trong EduAssess.</p><button type="button" className="portal-button portal-button-primary" onClick={() => navigate('/')}>Về trang chủ</button></div>;
}
