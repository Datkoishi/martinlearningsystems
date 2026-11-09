import { useState } from 'react';
import Brand from './Brand.jsx';
import Icon from './Icon.jsx';

const features = [
  { icon: 'book', title: 'Đề đã được xuất bản', copy: 'Học sinh mở đúng phiên bản đề đã duyệt, với bố cục và dữ kiện được giữ nguyên.', tone: 'butter' },
  { icon: 'layers', title: 'Lắp đề theo blueprint', copy: 'Câu hỏi được chọn theo quota, nguồn và quyền sử dụng rồi đóng băng thành snapshot.', tone: 'sage' },
  { icon: 'shield', title: 'Duyệt độc lập', copy: 'Nội dung đi qua kiểm tra kỹ thuật và học thuật trước khi xuất bản.', tone: 'sky' },
  { icon: 'chart', title: 'Đánh giá có bằng chứng', copy: 'Hệ thống chỉ diễn giải mức độ khi đủ bài làm và độ phủ theo framework đã duyệt.', tone: 'blush' }
];

const steps = [
  { title: 'Chuẩn bị nội dung', copy: 'Biên tập viên nhập gói đề hoặc tạo blueprint từ ngân hàng câu hỏi có quyền sử dụng.' },
  { title: 'Kiểm tra và duyệt', copy: 'Reviewer xem bản preview, đáp án và nguồn trước khi đưa phiên bản vào catalog.' },
  { title: 'Học và nhìn lại', copy: 'Học sinh làm bài, lưu đáp án và xem kết quả theo chính sách công bố của từng loại đề.' }
];

export default function LandingPage({ user, navigate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const go = (path) => { setMenuOpen(false); navigate(path); };
  return <div className="portal-landing">
    <header className="landing-nav">
      <div className="landing-nav-inner">
        <Brand onClick={() => go('/')} />
        <nav className={menuOpen ? 'landing-links is-open' : 'landing-links'} aria-label="Điều hướng trang chủ">
          <a href="#features" onClick={() => setMenuOpen(false)}>Tính năng</a>
          <a href="#workflow" onClick={() => setMenuOpen(false)}>Cách hoạt động</a>
          <a href="#roles" onClick={() => setMenuOpen(false)}>Dành cho ai</a>
          <button type="button" className="landing-text-link" onClick={() => go(user ? '/dashboard' : '/login')}>{user ? 'Vào dashboard' : 'Đăng nhập'}</button>
        </nav>
        <button type="button" className="portal-button portal-button-primary landing-nav-cta" onClick={() => go(user ? '/dashboard' : '/demo')}>{user ? 'Mở không gian của tôi' : 'Xem bài DEMO'}<Icon name="arrow" size={17} /></button>
        <button className="portal-icon-button landing-menu-button" type="button" aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Icon name={menuOpen ? 'close' : 'menu'} /></button>
      </div>
    </header>

    <main>
      <section className="landing-hero portal-container">
        <div className="landing-hero-copy">
          <span className="portal-kicker">Nền tảng đánh giá học tập · bản DEMO kỹ thuật</span>
          <h1>Hiểu hành trình học qua từng bằng chứng nhỏ.</h1>
          <p>EduAssess kết nối đề đã duyệt, bài làm của học sinh và framework đánh giá trong một trải nghiệm rõ ràng cho từng vai trò.</p>
          <div className="landing-hero-actions">
            <button type="button" className="portal-button portal-button-primary" onClick={() => go('/demo')}>Khám phá bài DEMO<Icon name="arrow" size={18} /></button>
            <button type="button" className="portal-button portal-button-outline" onClick={() => go(user ? '/dashboard' : '/login')}>{user ? 'Mở dashboard' : 'Đăng nhập'}</button>
          </div>
          <p className="landing-hero-note"><Icon name="info" size={17} /> Nội dung DEMO minh họa kỹ thuật, chưa phải kết luận học thuật chính thức.</p>
        </div>
        <div className="landing-hero-art" aria-hidden="true">
          <div className="landing-art-orbit orbit-one" /><div className="landing-art-orbit orbit-two" />
          <img src="/assets/illustrations/landing-learners.webp" width="1752" height="897" alt="" fetchPriority="high" />
          <div className="landing-floating-card floating-check"><Icon name="check" size={21} /><span>Đã lưu bản trả lời</span></div>
          <div className="landing-floating-card floating-evidence"><Icon name="spark" size={21} /><span>Bằng chứng trước kết luận</span></div>
        </div>
      </section>

      <section className="landing-proof portal-container" aria-label="Năng lực sản phẩm hiện có">
        <div><strong>2</strong><span>chế độ đề FIXED và ASSEMBLED</span></div>
        <div><strong>5</strong><span>không gian làm việc chuyên môn</span></div>
        <div><strong>1</strong><span>luồng bài làm và chấm điểm nhất quán</span></div>
      </section>

      <section className="landing-section portal-container" id="features">
        <div className="landing-section-heading"><span className="portal-kicker">Sản phẩm</span><h2>Mọi bước đều có ngữ cảnh rõ ràng.</h2><p>Từ nội dung được duyệt đến kết quả được diễn giải, mỗi màn hình tập trung vào một quyết định thật.</p></div>
        <div className="landing-feature-grid">
          {features.map((feature, index) => <article className={`landing-feature tone-${feature.tone} ${index === 0 ? 'feature-large' : ''}`} key={feature.title}>
            <span className="landing-feature-icon"><Icon name={feature.icon} size={25} /></span>
            <div><h3>{feature.title}</h3><p>{feature.copy}</p></div>
            {index === 0 && <div className="feature-mini-paper" aria-hidden="true"><span /><span /><span /><i /></div>}
          </article>)}
        </div>
      </section>

      <section className="landing-showcase portal-container" id="showcase">
        <div className="landing-showcase-copy"><span className="portal-kicker">Một nơi cho từng vai trò</span><h2>Mở đúng việc cần làm, đúng lúc.</h2><p>Dashboard học sinh ưu tiên đề đã xuất bản. Biên tập viên, reviewer, chuyên gia đánh giá và người chấm có khu vực riêng với dữ liệu và hành động phù hợp quyền.</p><button type="button" className="portal-button portal-button-dark" onClick={() => go(user ? '/dashboard' : '/login')}>{user ? 'Xem dashboard của tôi' : 'Đăng nhập để tiếp tục'}<Icon name="arrow" size={17} /></button></div>
        <div className="landing-showcase-preview" aria-label="Minh họa giao diện EduAssess">
          <div className="showcase-side"><span className="showcase-logo"><Icon name="spark" /></span><span className="active"><Icon name="grid" /></span><span><Icon name="book" /></span><span><Icon name="chart" /></span></div>
          <div className="showcase-content"><div className="showcase-heading"><span>Chào mừng trở lại</span><i /></div><div className="showcase-banner"><div><small>KHÔNG GIAN HỌC TẬP</small><strong>Bắt đầu với một đề phù hợp.</strong></div><img src="/assets/illustrations/dashboard-learner.webp" width="1536" height="1024" alt="" loading="lazy" /></div><div className="showcase-metrics"><span /><span /><span /></div><div className="showcase-list"><i /><i /><i /></div></div>
        </div>
      </section>

      <section className="landing-section portal-container" id="workflow">
        <div className="landing-section-heading"><span className="portal-kicker">Quy trình</span><h2>Từ câu hỏi đến hiểu biết.</h2></div>
        <div className="landing-steps">{steps.map((step, index) => <article key={step.title}><span className="step-number">0{index + 1}</span><h3>{step.title}</h3><p>{step.copy}</p></article>)}</div>
      </section>

      <section className="landing-roles portal-container" id="roles"><div><span className="portal-kicker">Dành cho ai</span><h2>Năm vai trò, năm góc nhìn.</h2><p>Học sinh, biên tập viên, reviewer học thuật, chuyên gia đánh giá và người chấm tự luận cùng làm việc trong một hệ thống nhưng chỉ thấy đúng phần việc của mình.</p></div><div className="landing-role-pills"><span>Học sinh</span><span>Biên tập</span><span>Duyệt học thuật</span><span>Chuyên gia đánh giá</span><span>Chấm tự luận</span></div></section>

      <section className="landing-faq portal-container" aria-labelledby="faq-title"><div><span className="portal-kicker">Giải đáp</span><h2 id="faq-title">Trước khi bắt đầu</h2></div><div>
        <details><summary>Đề DEMO có phải nội dung học thuật chính thức không?</summary><p>Không. Bài DEMO dùng để minh họa cách hiển thị nội dung và tương tác. Nội dung học thuật dùng thật cần quy trình duyệt riêng.</p></details>
        <details><summary>Tôi có thể tự tạo tài khoản không?</summary><p>Hiện tài khoản được quản trị viên cấp qua quy trình bảo mật. Hệ thống chưa có tự đăng ký.</p></details>
        <details><summary>Kết quả bài làm có đồng nghĩa mức năng lực không?</summary><p>Không. Đánh giá năng lực dùng framework đã duyệt và chỉ diễn giải khi đủ bằng chứng. Khi thiếu, hệ thống hiển thị “Chưa đủ bằng chứng”.</p></details>
      </div></section>

      <section className="landing-final portal-container"><div><span className="portal-kicker">Sẵn sàng khám phá?</span><h2>Bắt đầu bằng một bài DEMO.</h2><p>Trải nghiệm cách EduAssess trình bày đề, dữ kiện chung và câu hỏi tương tác.</p><button type="button" className="portal-button portal-button-light" onClick={() => go('/demo')}>Mở bài DEMO<Icon name="arrow" size={17} /></button></div><img src="/assets/illustrations/mascot-rocket.webp" width="1312" height="1199" alt="" loading="lazy" /></section>
    </main>
    <footer className="landing-footer portal-container"><Brand onClick={() => go('/')} compact /><p>EduAssess · Bản DEMO kỹ thuật của Martin Learning Systems.</p><div><button type="button" onClick={() => go('/demo')}>Bài DEMO</button><button type="button" onClick={() => go('/register')}>Truy cập tài khoản</button><button type="button" onClick={() => go('/login')}>Đăng nhập</button></div></footer>
  </div>;
}
