import { Link, NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { formatRole, getInitials } from '../utils/format.js';
import {
  AuditIcon,
  BellIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CompareIcon,
  DashboardIcon,
  ExposureIcon,
  ImageIcon,
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
      { to: '/practitioner/dashboard', label: 'Dashboard', Icon: DashboardIcon },
      { to: '/practitioner/scans', label: 'Scans & Patient Records', Icon: ImageIcon },
      { to: '/practitioner/requests', label: 'Imaging Schedule', Icon: CalendarIcon },
      { to: '/practitioner/profile', label: 'My Profile', Icon: AuditIcon },
      { to: '/practitioner/settings', label: 'Account Settings', Icon: SettingsIcon },
    ],
  },
];

const radiologistSections = [
  {
    title: 'Radiologist Workspace',
    links: [
      { to: '/dashboard', label: 'Dashboard', Icon: DashboardIcon },
      { to: '/scans', label: 'Scans & Imaging', Icon: ImageIcon },
      { 
        to: '/ai-tools', 
        label: 'AI Imaging Tools', 
        Icon: MonitorIcon,
        submenu: [
          { to: '/ai-tools/restore', label: 'Image Restoration' },
          { to: '/ai-tools/completeness', label: 'Completeness Assessment' },
          { to: '/ai-tools/compare', label: 'Longitudinal Comparison' },
          { to: '/ai-tools/reconstruct', label: 'Image Reconstruction' },
          { to: '/ai-tools/segment3d', label: '3D Visualization' },
          { to: '/ai-tools/synthetic', label: 'Synthetic Generation' },
          { to: '/ai-tools/complementary', label: 'Complementary-View Synthesis' },
        ]
      },
      { to: '/scan-comparisons', label: 'Scan Comparisons', Icon: CompareIcon },
      { to: '/imaging-requests', label: 'Imaging Requests', Icon: UsersIcon },
      { to: '/drafts', label: 'Saved Drafts', Icon: ExposureIcon },
      { to: '/notifications', label: 'Notifications', Icon: BellIcon },
      { to: '/profile', label: 'My Profile', Icon: AuditIcon },
      { to: '/settings', label: 'Account Settings', Icon: SettingsIcon },
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
      { to: '/admin/imaging-studies', label: 'Orthanc Study Linking', Icon: ImageIcon },
      { to: '/admin/patients', label: 'Patient Management', Icon: UsersIcon },
      { to: '/notifications', label: 'Notifications', Icon: BellIcon },
    ],
  },
  {
    title: 'Administration',
    links: [
      { to: '/admin/users', label: 'User Management', Icon: UsersIcon },
      { to: '/admin/audit-logs', label: 'Audit Logs', Icon: AuditIcon },
      { to: '/admin/system', label: 'System Administration', Icon: SettingsIcon },
      { to: '/admin/settings', label: 'My Profile & Settings', Icon: SettingsIcon },
    ],
  },
];

function NavItem({ to, label, Icon, submenu, expandedSubmenus, toggleSubmenu, pathname }) {
  const hasSubmenu = submenu && submenu.length > 0;
  const isExpanded = expandedSubmenus[to];
  const isActive = pathname === to || (hasSubmenu && submenu.some(item => pathname === item.to));

  if (hasSubmenu) {
    return (
      <div className="nav-group-item">
        <button
          type="button"
          className={`nav-link ${isActive ? 'active' : ''}`}
          onClick={() => toggleSubmenu(to)}
          aria-expanded={isExpanded}
        >
          <Icon size={18} />
          <span>{label}</span>
          {isExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
        </button>
        {isExpanded && (
          <div className="nav-submenu">
            {submenu.map((subItem) => (
              <NavLink
                key={subItem.to}
                to={subItem.to}
                className={({ isActive: subIsActive }) => 
                  `nav-submenu-link ${subIsActive ? 'active' : ''}`
                }
              >
                {subItem.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <NavLink to={to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
      <Icon size={18} />
      <span>{label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  const { logout, user } = useAuth();
  const { pathname } = useLocation();
  const isAdmin = user?.role === 'administrator';
  const isRadiologist = user?.role === 'radiologist';
  const sections = isAdmin ? adminSections : isRadiologist ? radiologistSections : practitionerSections;
  const [expandedSubmenus, setExpandedSubmenus] = useState({});

  // Auto-expand AI Imaging Tools submenu if on an AI tool page
  if (isRadiologist && pathname.startsWith('/ai-tools') && !expandedSubmenus['/ai-tools']) {
    setExpandedSubmenus({ '/ai-tools': true });
  }

  const toggleSubmenu = (to) => {
    setExpandedSubmenus((prev) => ({
      ...prev,
      [to]: !prev[to],
    }));
  };

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
              <NavItem 
                key={link.to} 
                {...link} 
                expandedSubmenus={expandedSubmenus}
                toggleSubmenu={toggleSubmenu}
                pathname={pathname}
              />
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
