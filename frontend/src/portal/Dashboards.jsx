import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';

function useRemote(url) {
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState({ loading: Boolean(url), data: null, error: '' });
  useEffect(() => {
    if (!url) return undefined;
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: '' }));
    fetch(url, { signal: controller.signal, credentials: 'same-origin' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || 'Không tải được dữ liệu.');
        return body;
      })
      .then((data) => setState({ loading: false, data, error: '' }))
      .catch((error) => { if (error.name !== 'AbortError') setState({ loading: false, data: null, error: error.message }); });
    return () => controller.abort();
  }, [url, refresh]);
  return { ...state, retry: () => setRefresh((value) => value + 1) };
}

function PanelState({ state, empty, retry }) {
  if (state.loading) return <div className="portal-panel-state" role="status"><span className="portal-spinner" /> Đang tải dữ liệu…</div>;
  if (state.error) return <div className="portal-panel-state is-error" role="alert"><p>{state.error}</p><button type="button" onClick={retry}>Thử lại</button></div>;
  return <div className="portal-panel-state"><Icon name="spark" size={25} /><p>{empty}</p></div>;
}

function DashboardHero({ tone = 'dark', kicker, title, copy, button, onAction, image, children }) {
  return <section className={`portal-dashboard-hero hero-${tone}`}><div className="portal-dashboard-hero-copy"><span>{kicker}</span><h2>{title}</h2><p>{copy}</p><button type="button" className="portal-button portal-button-light" onClick={onAction}>{button}<Icon name="arrow" size={17} /></button></div>{image ? <img src={image} width="1536" height="1024" alt="" /> : <div className="portal-hero-decoration" aria-hidden="true">{children}</div>}</section>;
}

function MetricCard({ icon, value, label, tone }) {
  return <article className={`portal-metric-card tone-${tone}`}><span className="portal-metric-icon"><Icon name={icon} size={25} /></span><div><strong>{value}</strong><span>{label}</span></div></article>;
}

function SectionHeader({ title, action, onAction, note }) {
  return <div className="portal-section-header"><div><h2>{title}</h2>{note && <p>{note}</p>}</div>{action && <button type="button" onClick={onAction}>{action}<Icon name="arrow" size={16} /></button>}</div>;
}

function SearchBox({ value, onChange, placeholder }) {
  return <label className="portal-search"><Icon name="search" size={19} /><span className="sr-only">{placeholder}</span><input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

export function StudentDashboard({ navigate }) {
  const catalog = useRemote('/api/catalog/exams');
  const [query, setQuery] = useState('');
  const exams = catalog.data?.exams || [];
  const filtered = useMemo(() => exams.filter((item) => `${item.title} ${item.subject} ${item.mode}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))), [exams, query]);
  const modes = new Set(exams.map((item) => item.mode)).size;
  const subjects = new Set(exams.map((item) => item.subject)).size;
  return <div className="portal-dashboard-body">
    <DashboardHero kicker="HỌC TẬP THEO NHỊP CỦA BẠN" title="Một câu hỏi mới, một điều hiểu rõ hơn." copy="Chọn đề đã xuất bản để bắt đầu. Bài làm được lưu theo từng lần xác nhận của server." button="Khám phá kho đề" onAction={() => navigate('/workspace/catalog')} image="/assets/illustrations/dashboard-learner.webp" />
    <div className="portal-metric-grid"><MetricCard icon="book" value={catalog.loading || catalog.error ? '—' : exams.length} label="Đề trong catalog" tone="butter" /><MetricCard icon="layers" value={catalog.loading || catalog.error ? '—' : modes} label="Chế độ đề hiện có" tone="sage" /><MetricCard icon="spark" value={catalog.loading || catalog.error ? '—' : subjects} label="Môn học trong catalog" tone="sky" /></div>
    <section className="portal-content-section"><SectionHeader title="Đề để bắt đầu" note="Chỉ hiển thị phiên bản đã xuất bản" action="Xem kho đề" onAction={() => navigate('/workspace/catalog')} /><SearchBox value={query} onChange={setQuery} placeholder="Tìm tên đề hoặc môn học" />
      {filtered.length ? <div className="portal-row-list">{filtered.slice(0, 5).map((exam) => <button type="button" className="portal-data-row" key={exam.id} onClick={() => navigate('/workspace/catalog')}><span className="portal-row-icon tone-butter"><Icon name="book" /></span><span className="portal-row-main"><strong>{exam.title}</strong><small>{exam.subject} · Lớp {exam.grade} · {exam.durationMinutes} phút</small></span><span className="portal-status-pill">{exam.mode}</span><Icon name="chevron" size={18} /></button>)}</div> : <PanelState state={catalog} retry={catalog.retry} empty={query ? 'Không tìm thấy đề phù hợp. Hãy thử từ khóa khác.' : 'Chưa có đề nào được xuất bản. Bạn có thể xem bài DEMO.'} />}
    </section>
    <section className="portal-dashboard-callout"><div><span className="portal-kicker">Đánh giá từ bằng chứng</span><h2>Điểm bài làm là một phần của bức tranh.</h2><p>Chỉ framework đã duyệt và đủ độ phủ mới tạo diễn giải năng lực; khi thiếu, kết quả sẽ nêu rõ “Chưa đủ bằng chứng”.</p></div><button type="button" className="portal-button portal-button-outline" onClick={() => navigate('/workspace/assessment')}>Mở đánh giá<Icon name="arrow" size={17} /></button></section>
  </div>;
}

export function EditorDashboard({ navigate }) {
  const runs = useRemote('/api/assemblies?limit=20');
  const [query, setQuery] = useState('');
  const items = runs.data?.items || [];
  const filtered = items.filter((item) => `${item.title} ${item.subject} ${item.approvalStatus}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
  return <div className="portal-dashboard-body">
    <DashboardHero tone="sage" kicker="XƯỞNG NỘI DUNG" title="Đưa ý tưởng thành đề có thể kiểm chứng." copy="Nhập nguồn, kiểm tra report và tạo blueprint từ pool đã được cấp quyền." button="Nhập gói đề" onAction={() => navigate('/workspace/imports')}><Icon name="upload" size={126} /><span className="hero-decor-dot" /></DashboardHero>
    <div className="portal-metric-grid"><MetricCard icon="layers" value={runs.loading || runs.error ? '—' : runs.data?.total ?? items.length} label="Assembly run của tôi" tone="butter" /><MetricCard icon="clock" value={runs.loading || runs.error ? '—' : items.filter((item) => item.approvalStatus === 'NEEDS_REVIEW').length} label="Đang chờ review trong danh sách" tone="sage" /><MetricCard icon="check" value={runs.loading || runs.error ? '—' : items.filter((item) => item.approvalStatus === 'PUBLISHED').length} label="Đã xuất bản trong danh sách" tone="sky" /></div>
    <div className="portal-action-grid"><button type="button" onClick={() => navigate('/workspace/imports')}><span className="tone-blush"><Icon name="upload" size={24} /></span><strong>Nhập gói đề</strong><small>ZIP, kiểm tra nguồn và báo cáo</small><Icon name="arrow" size={17} /></button><button type="button" onClick={() => navigate('/workspace/assembly')}><span className="tone-sage"><Icon name="layers" size={24} /></span><strong>Tạo blueprint</strong><small>Lắp đề với quota và seed rõ ràng</small><Icon name="arrow" size={17} /></button></div>
    <section className="portal-content-section"><SectionHeader title="Blueprint gần đây" note="Chỉ những run do bạn tạo" action="Mở Assembly Lab" onAction={() => navigate('/workspace/assembly')} /><SearchBox value={query} onChange={setQuery} placeholder="Tìm blueprint của tôi" />{filtered.length ? <div className="portal-row-list">{filtered.slice(0, 6).map((item) => <button type="button" className="portal-data-row" key={item.id} onClick={() => navigate('/workspace/assembly')}><span className="portal-row-icon tone-sage"><Icon name="layers" /></span><span className="portal-row-main"><strong>{item.title}</strong><small>Lớp {item.grade} · {item.subject} · phiên bản {item.blueprintVersion}</small></span><span className="portal-status-pill">{item.approvalStatus}</span><Icon name="chevron" size={18} /></button>)}</div> : <PanelState state={runs} retry={runs.retry} empty={query ? 'Không có blueprint khớp từ khóa.' : 'Bạn chưa có assembly run. Hãy tạo blueprint đầu tiên.'} />}</section>
  </div>;
}

export function ReviewerDashboard({ navigate }) {
  const assembly = useRemote('/api/assembly-review-queue?status=NEEDS_REVIEW&limit=20');
  const framework = useRemote('/api/assessment-frameworks/review-queue');
  const assemblyItems = assembly.data?.items || [];
  const frameworkItems = framework.data?.items || [];
  return <div className="portal-dashboard-body">
    <DashboardHero tone="violet" kicker="BÀN DUYỆT HỌC THUẬT" title="Mỗi quyết định gắn với đúng phiên bản." copy="Xem nguồn và snapshot trước khi ghi quyết định bất biến; người tạo không tự duyệt nội dung của mình." button="Mở hàng chờ duyệt" onAction={() => navigate('/workspace/assembly')}><Icon name="shield" size={132} /><span className="hero-decor-ring" /></DashboardHero>
    <div className="portal-metric-grid"><MetricCard icon="layers" value={assembly.loading || assembly.error ? '—' : assembly.data?.total ?? assemblyItems.length} label="Blueprint chờ duyệt" tone="butter" /><MetricCard icon="chart" value={framework.loading || framework.error ? '—' : frameworkItems.length} label="Framework chờ duyệt" tone="sage" /><MetricCard icon="shield" value="2" label="Loại quyết định cần kiểm tra" tone="sky" /></div>
    <div className="portal-queue-columns"><section className="portal-content-section"><SectionHeader title="Blueprint cần xem" action="Xem tất cả" onAction={() => navigate('/workspace/assembly')} />{assemblyItems.length ? <div className="portal-row-list">{assemblyItems.slice(0, 4).map((item) => <button type="button" className="portal-data-row" key={item.id} onClick={() => navigate('/workspace/assembly')}><span className="portal-row-icon tone-butter"><Icon name="layers" /></span><span className="portal-row-main"><strong>{item.title}</strong><small>{item.creator?.displayName} · Lớp {item.grade}</small></span><Icon name="chevron" size={18} /></button>)}</div> : <PanelState state={assembly} retry={assembly.retry} empty="Không có blueprint nào đang chờ bạn duyệt." />}</section><section className="portal-content-section"><SectionHeader title="Framework cần xem" action="Mở đánh giá" onAction={() => navigate('/workspace/assessment')} />{frameworkItems.length ? <div className="portal-row-list">{frameworkItems.slice(0, 4).map((item) => <button type="button" className="portal-data-row" key={item.id} onClick={() => navigate('/workspace/assessment')}><span className="portal-row-icon tone-sky"><Icon name="chart" /></span><span className="portal-row-main"><strong>{item.title}</strong><small>Lớp {item.grade} · {item.subject}</small></span><Icon name="chevron" size={18} /></button>)}</div> : <PanelState state={framework} retry={framework.retry} empty="Không có framework nào đang chờ bạn duyệt." />}</section></div>
    <div className="portal-review-note"><Icon name="info" size={20} /><p>Gói đề nhập từ ZIP hiện được tra cứu theo mã job trong khu vực Nhập và duyệt gói đề.</p><button type="button" onClick={() => navigate('/workspace/imports')}>Mở khu vực này</button></div>
  </div>;
}

export function SpecialistDashboard({ navigate }) {
  return <div className="portal-dashboard-body">
    <DashboardHero tone="blush" kicker="THIẾT KẾ ĐÁNH GIÁ" title="Đặt chuẩn bằng chứng trước khi diễn giải." copy="Framework giữ threshold, độ phủ và hướng dẫn trong một phiên bản cần reviewer độc lập duyệt." button="Soạn framework" onAction={() => navigate('/workspace/assessment')}><Icon name="chart" size={140} /><span className="hero-decor-dot" /></DashboardHero>
    <section className="portal-content-section portal-specialist-flow"><SectionHeader title="Một framework đáng tin cậy cần gì?" note="Các điều kiện nằm trong bản cấu hình có version" /><div className="portal-flow-grid"><article><span>01</span><Icon name="layers" size={26} /><h3>Xác định nguồn</h3><p>Chọn lớp, môn, mục đích đề và scoring version được phép dùng làm bằng chứng.</p></article><article><span>02</span><Icon name="grid" size={26} /><h3>Đặt độ phủ</h3><p>Quy định số bài, số câu, độ khó và loại nhiệm vụ tối thiểu cho từng chỉ báo.</p></article><article><span>03</span><Icon name="chart" size={26} /><h3>Viết diễn giải</h3><p>Bốn mức, ngưỡng và hướng dẫn cần được định nghĩa trong config.</p></article><article><span>04</span><Icon name="shield" size={26} /><h3>Gửi duyệt độc lập</h3><p>Reviewer khác người tạo kiểm tra toàn bộ rule và hash trước khi Student dùng.</p></article></div></section>
    <section className="portal-dashboard-callout specialist-callout"><div><span className="portal-kicker">Nguyên tắc học thuật</span><h2>Khi chưa đủ, hãy nói “Chưa đủ bằng chứng”.</h2><p>Hệ thống không suy diễn năng lực từ một tỷ lệ điểm đơn lẻ. Framework mẫu trong workspace chỉ là dữ liệu DEMO.</p></div><button type="button" className="portal-button portal-button-outline" onClick={() => navigate('/workspace/assessment')}>Mở workspace<Icon name="arrow" size={17} /></button></section>
  </div>;
}

export function GraderDashboard({ navigate }) {
  const [status, setStatus] = useState('OPEN');
  const [query, setQuery] = useState('');
  const queue = useRemote(`/api/manual-scoring/assignments?status=${status}`);
  const items = queue.data?.items || [];
  const filtered = items.filter((item) => `${item.examTitle || ''} ${item.assignmentType} ${item.id}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
  return <div className="portal-dashboard-body">
    <DashboardHero tone="butter" kicker="BÀN CHẤM TỰ LUẬN" title="Tập trung vào bài được giao." copy="Mỗi lần chấm gắn với một assignment và revision cụ thể. Phản hồi cho học sinh đi qua chính sách công bố kết quả." button="Vào bàn chấm" onAction={() => navigate('/workspace/grading')}><Icon name="pen" size={133} /><span className="hero-decor-ring" /></DashboardHero>
    <div className="portal-grader-toolbar"><div className="portal-tab-list" role="group" aria-label="Trạng thái assignment"><button className={status === 'OPEN' ? 'active' : ''} type="button" onClick={() => setStatus('OPEN')}>Đang chờ chấm</button><button className={status === 'COMPLETED' ? 'active' : ''} type="button" onClick={() => setStatus('COMPLETED')}>Đã hoàn thành</button></div><SearchBox value={query} onChange={setQuery} placeholder="Tìm bài được giao" /></div>
    <section className="portal-content-section"><SectionHeader title={status === 'OPEN' ? 'Bài đang chờ bạn' : 'Bài đã hoàn thành'} note="Danh sách chỉ gồm assignment gắn với tài khoản của bạn" action="Mở bàn chấm" onAction={() => navigate('/workspace/grading')} />{filtered.length ? <div className="portal-row-list">{filtered.map((item) => <button className="portal-data-row" type="button" key={item.id} onClick={() => navigate('/workspace/grading')}><span className="portal-row-icon tone-blush"><Icon name="pen" /></span><span className="portal-row-main"><strong>{item.examTitle || 'Bài tự luận được giao'}</strong><small>{item.assignmentType === 'REGRADE' ? 'Chấm lại' : 'Chấm lần đầu'} · revision {item.sourceScoreRevision}</small></span><span className="portal-status-pill">{status === 'OPEN' ? 'Cần chấm' : 'Hoàn tất'}</span><Icon name="chevron" size={18} /></button>)}</div> : <PanelState state={queue} retry={queue.retry} empty={query ? 'Không có assignment khớp từ khóa.' : `Không có assignment ${status === 'OPEN' ? 'đang mở' : 'đã hoàn thành'}.`} />}</section>
    <div className="portal-review-note"><Icon name="shield" size={20} /><p>Preview chỉ hiển thị câu tự luận và rubric cần chấm. Điểm câu tự động và danh tính học sinh không nằm trong hàng chờ này.</p></div>
  </div>;
}

export const dashboardComponents = {
  student: StudentDashboard,
  editor: EditorDashboard,
  reviewer: ReviewerDashboard,
  specialist: SpecialistDashboard,
  grader: GraderDashboard
};
