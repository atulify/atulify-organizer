import type { ViewType } from '../types';
import './Navigation.css';

interface NavigationProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  onMenuClick: () => void;
}

interface NavItem {
  id: ViewType;
  label: string;
}

const navItems: NavItem[] = [
  { id: 'today', label: 'Today' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'backlog', label: 'Backlog' },
  { id: 'prs', label: 'PR Reviews' },
  { id: 'my-prs', label: 'My PRs' },
  { id: 'notes', label: 'Notes' },
  { id: 'brag-doc', label: 'Brag' },
  { id: 'notifications', label: 'Alerts' },
  { id: 'settings', label: 'Settings' },
];

export function Navigation({
  activeView,
  onViewChange,
  onMenuClick,
}: NavigationProps) {
  return (
    <nav className="navigation">
      <div className="nav-tabs">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-tab ${activeView === item.id ? 'active' : ''}`}
            onClick={() => onViewChange(item.id)}
            aria-current={activeView === item.id ? 'page' : undefined}
          >
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </div>
      <button
        className="nav-menu-btn"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <span className="menu-dots">...</span>
      </button>
    </nav>
  );
}
