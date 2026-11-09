import Icon from './Icon.jsx';

export default function Brand({ onClick, compact = false }) {
  return <button className={`portal-brand ${compact ? 'portal-brand-compact' : ''}`} type="button" onClick={onClick} aria-label="EduAssess — về trang chủ">
    <span className="portal-brand-mark"><Icon name="spark" size={22} /></span>
    <span className="portal-brand-word"><strong>EduAssess</strong><small>Martin Learning Systems</small></span>
  </button>;
}
