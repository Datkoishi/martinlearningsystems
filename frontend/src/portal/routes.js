export const roles = [
  { id: 'STUDENT', slug: 'student', label: 'Học sinh', icon: 'book', title: 'Không gian học tập' },
  { id: 'CONTENT_EDITOR', slug: 'editor', label: 'Biên tập nội dung', icon: 'pen', title: 'Xưởng nội dung' },
  { id: 'ACADEMIC_REVIEWER', slug: 'reviewer', label: 'Duyệt học thuật', icon: 'shield', title: 'Bàn duyệt học thuật' },
  { id: 'ASSESSMENT_SPECIALIST', slug: 'specialist', label: 'Chuyên gia đánh giá', icon: 'chart', title: 'Thiết kế đánh giá' },
  { id: 'MANUAL_GRADER', slug: 'grader', label: 'Chấm tự luận', icon: 'check', title: 'Bàn chấm tự luận' }
];

export const roleBySlug = Object.fromEntries(roles.map((role) => [role.slug, role]));

export const availableRoles = (user) => {
  const assigned = roles.filter((role) => user?.roles?.includes(role.id));
  return user?.roles?.includes('SUPER_ADMIN')
    ? roles.filter((role) => role.id !== 'STUDENT')
    : assigned;
};

export const defaultDashboard = (user) => {
  const preferred = availableRoles(user)[0];
  return preferred ? `/dashboard/${preferred.slug}` : '/dashboard';
};

export const workspaceLabels = {
  catalog: 'Kho đề đã xuất bản',
  imports: 'Nhập và duyệt gói đề',
  assembly: 'Assembly Lab',
  assessment: 'Đánh giá năng lực',
  grading: 'Chấm tự luận'
};

export const roleMenus = {
  student: [{ label: 'Kho đề', path: '/workspace/catalog', icon: 'book' }, { label: 'Đánh giá của tôi', path: '/workspace/assessment', icon: 'chart' }, { label: 'Bài DEMO', path: '/demo', icon: 'spark' }],
  editor: [{ label: 'Nhập gói đề', path: '/workspace/imports', icon: 'upload' }, { label: 'Tạo đề từ blueprint', path: '/workspace/assembly', icon: 'layers' }, { label: 'Kho đề', path: '/workspace/catalog', icon: 'book' }],
  reviewer: [{ label: 'Duyệt gói đề', path: '/workspace/imports', icon: 'shield' }, { label: 'Duyệt blueprint', path: '/workspace/assembly', icon: 'layers' }, { label: 'Duyệt framework', path: '/workspace/assessment', icon: 'chart' }],
  specialist: [{ label: 'Soạn framework', path: '/workspace/assessment', icon: 'pen' }, { label: 'Kho đề', path: '/workspace/catalog', icon: 'book' }],
  grader: [{ label: 'Assignment của tôi', path: '/workspace/grading', icon: 'list' }, { label: 'Kho đề', path: '/workspace/catalog', icon: 'book' }]
};
