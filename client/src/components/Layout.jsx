import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { formatRole, getInitials } from '../utils/format.js';
import Sidebar from './Sidebar.jsx';

const pageMeta = {
  '/dashboard': {
    title: 'Dashboard',
    description: 'PACS connectivity, archive volume and recent workstation activity.',
  },
  '/clinical-workspace': {
    title: 'Patients & Requests',
    description: 'Patient records in your workflow, imaging requests and appointment scheduling.',
  },
  '/exposure-index': {
    title: 'Exposure Index',
    description: 'Dose-related acquisition indicators (EI, EIT, DI) retrieved from Orthanc.',
  },
  '/compare-scans': {
    title: 'Compare Scans',
    description: 'Side-by-side comparison of study and acquisition metadata.',
  },
  '/audit-log': {
    title: 'Audit Log',
    description: 'System activity trail. Administrator access only.',
  },
  '/admin/dashboard': {
    title: 'Admin Dashboard',
    description: 'Imaging department operations, accounts and system activity at a glance.',
  },
  '/admin/users': {
    title: 'User Management',
    description: 'Create and maintain accounts, roles, status and sign-in restrictions.',
  },
  '/admin/schedule': {
    title: 'Imaging Schedule',
    description: 'Operational scheduling and status tracking for imaging examinations.',
  },
  '/admin/alerts': {
    title: 'Alerts',
    description: 'Operational, scheduling and account/access alerts requiring administrative review.',
  },
  '/admin/audit-logs': {
    title: 'Audit Logs',
    description: 'Read-only accountability record of all application activity.',
  },
  '/admin/modalities': {
    title: 'Modality Monitoring',
    description: 'Schedule-derived operational activity per imaging modality.',
  },
  '/admin/system': {
    title: 'System Administration',
    description: 'Access policy, application, database and imaging system status.',
  },
  '/admin/profile': {
    title: 'Administrator Profile',
    description: 'Your account information.',
  },
};

function sectionFor(pathname) {
  if (['/admin/dashboard', '/admin/schedule', '/admin/alerts', '/admin/modalities'].includes(pathname)) return 'Department';
  if (['/admin/users', '/admin/audit-logs', '/admin/system'].includes(pathname)) return 'Administration';
  if (pathname === '/admin/profile') return 'Account';
  return 'Clinical Workspace';
}

const todayLabel = () =>
  new Date().toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

export default function Layout() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const meta = pageMeta[pathname] ?? { title: 'OrthoView+', description: '' };
  const UserArea = user?.role === 'administrator' ? Link : 'div';
  // The Admin Profile page intentionally keeps its original light presentation.
  const legacyLight = pathname === '/admin/profile';

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <span className="topbar-crumb">{sectionFor(pathname)}</span>
            <h2>{meta.title}</h2>
            {meta.description ? <p>{meta.description}</p> : null}
          </div>
          <div className="topbar-meta">
            <span className="topbar-date">{todayLabel()}</span>
            {user ? (
              <UserArea {...(user.role === 'administrator' ? { to: '/admin/profile', title: 'View administrator profile' } : {})} className="topbar-user">
                <div className="topbar-user-text">
                  <strong>{user.username}</strong>
                  <span>{formatRole(user.role)}</span>
                </div>
                <span className="avatar avatar-light" aria-hidden="true">
                  {getInitials(user.username)}
                </span>
              </UserArea>
            ) : null}
          </div>
        </header>
        <main className={legacyLight ? 'main legacy-light' : 'main'}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
