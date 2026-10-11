import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { formatRole, getInitials } from '../utils/format.js';
import {
  AuditIcon,
  BellIcon,
  CalendarIcon,
  CompareIcon,
  DashboardIcon,
  ExposureIcon,
  LogoMark,
  LogoutIcon,
  MonitorIcon,
  SettingsIcon,
  UsersIcon,
} from './Icons.jsx';

const practitionerSections = [
  {
    title: 'Clinical Workspace',
    links: [
      { to: '/dashboard', label: 'Dashboard', Icon: DashboardIcon },
      { to: '/exposure-index', label: 'Exposure Index', Icon: ExposureIcon },
      { to: '/compare-scans', label: 'Compare Scans', Icon: CompareIcon },
    ],
  },
];

const adminSections = [
  {
    title: 'Department',
    links: [
      { to: '/admin/dashboard', label: 'Admin Dashboard', Icon: DashboardIcon },
      { to: '/admin/schedule', label: 'Imaging Schedule', Icon: CalendarIcon },
      { to: '/admin/alerts', label: 'Alerts', Icon: BellIcon },
      { to: '/admin/modalities', label: 'Modality Monitoring', Icon: MonitorIcon },
    ],
  },
  {
    title: 'Administration',
    links: [
      { to: '/admin/users', label: 'User Management', Icon: UsersIcon },
      { to: '/admin/audit-logs', label: 'Audit Logs', Icon: AuditIcon },
      { to: '/admin/system', label: 'System Administration', Icon: SettingsIcon },
    ],
  },
];

function NavItem({ to, label, Icon }) {
  return (
    <NavLink to={to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
      <Icon size={18} />
      <span>{label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  const { logout, user } = useAuth();
  const isAdmin = user?.role === 'administrator';
  const sections = isAdmin ? adminSections : practitionerSections;

  const userBlock = user ? (
    <>
      <span className="avatar" aria-hidden="true">
        {getInitials(user.username)}
      </span>
      <div className="sidebar-user-text">
        <strong title={user.username}>{user.username}</strong>
        <span>{formatRole(user.role)}</span>
      </div>
    </>
  ) : null;

  return (
    <aside className="sidebar">
      <div className="brand">
        <LogoMark />
        <div>
          <h1>OrthoView+</h1>
          <p>{isAdmin ? 'Department Administration' : 'Imaging Workstation'}</p>
        </div>
      </div>

      <nav className="nav" aria-label="Primary">
        {sections.map((section) => (
          <div key={section.title} className="nav-group">
            <p className="nav-section">{section.title}</p>
            {section.links.map((link) => (
              <NavItem key={link.to} {...link} />
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        {user && isAdmin ? (
          <Link to="/admin/profile" className="sidebar-user sidebar-user-link" title="View administrator profile">
            {userBlock}
          </Link>
        ) : null}
        {user && !isAdmin ? <div className="sidebar-user">{userBlock}</div> : null}
        <button type="button" className="logout-button" onClick={logout}>
          <LogoutIcon size={16} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
