
import { useState, useEffect, useCallback } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { formatRole, getInitials } from '../utils/format.js';
import Sidebar from './Sidebar.jsx';
import useTheme from '../hooks/useTheme.js';

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
  '/admin/settings': {
    title: 'My Profile & Settings',
    description: 'Manage your administrator profile, password and preferences.',
  },

  // Radiologist workspace pages.
  '/scans': { title: 'Scans & Imaging', description: '' },
  '/ai-tools': { title: 'AI Imaging Tools', description: '' },
  '/ai-tools/restore': { title: 'Image Restoration', description: '' },
  '/ai-tools/completeness': { title: 'Completeness Assessment', description: '' },
  '/ai-tools/compare': { title: 'Longitudinal Comparison', description: '' },
  '/ai-tools/reconstruct': { title: 'Image Reconstruction', description: '' },
  '/ai-tools/segment3d': { title: '3D Visualization', description: '' },
  '/ai-tools/synthetic': { title: 'Synthetic Generation', description: '' },
  '/ai-tools/complementary': { title: 'Complementary-View Synthesis', description: '' },
  '/scan-comparisons': { title: 'Scan Comparisons', description: '' },
  '/imaging-requests': { title: 'Imaging Requests', description: '' },
  '/drafts': { title: 'Saved Drafts', description: '' },
  '/profile': { title: 'My Profile', description: '' },
  '/settings': { title: 'Account Settings', description: '' },
};

function sectionFor(pathname) {
  if (
    [
      '/admin/dashboard',
      '/admin/schedule',
      '/admin/alerts',
      '/admin/modalities',
    ].includes(pathname)
  ) {
    return 'Department';
  }

  if (
    [
      '/admin/users',
      '/admin/audit-logs',
      '/admin/system',
    ].includes(pathname)
  ) {
    return 'Administration';
  }

  if (pathname === '/admin/profile' || pathname === '/admin/settings') {
    return 'Account';
  }

  return 'Clinical Workspace';
}

const todayLabel = () =>
  new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

export default function Layout() {
  const { pathname } = useLocation();
  const { user } = useAuth();

  // Initialize and expose the shared theme state.
  const { theme, setTheme } = useTheme();

  const meta = pageMeta[pathname] ?? {
    title: 'OrthoView+',
    description: '',
  };

  const UserArea = user?.role === 'administrator' ? Link : 'div';


  return (
    <div className="app-shell">
      <Sidebar />

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <span className="topbar-crumb">
              {sectionFor(pathname)}
            </span>

            <h2>{meta.title}</h2>

            {meta.description && user?.role !== 'radiologist' ? (
              <p>{meta.description}</p>
            ) : null}
          </div>

          <div className="topbar-meta">
            <span className="topbar-date">
              {todayLabel()}
            </span>

            {user ? (
              <UserArea
                {...(
                  user.role === 'administrator'
                    ? {
                        to: '/admin/settings',
                        title: 'View administrator profile',
                      }
                    : {}
                )}
                className="topbar-user"
              >
                <div className="topbar-user-text">
                  <strong>{user.username}</strong>
                  <span>{formatRole(user.role)}</span>
                </div>

                <span
                  className="avatar avatar-light"
                  aria-hidden="true"
                >
                  {getInitials(user.username)}
                </span>
              </UserArea>
            ) : null}

            {/* Theme toggle for administrator workspace. */}
            {user?.role === 'administrator' && (
              <button
                type="button"
                className="topbar-theme-toggle"
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                aria-pressed={theme === 'dark'}
                onClick={() =>
                  setTheme(theme === 'light' ? 'dark' : 'light')
                }
              >
                <svg
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  stroke="currentColor"
                  className="theme-sun"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>

                <svg
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="theme-moon"
                  aria-hidden="true"
                  style={{
                    display: theme === 'dark' ? 'none' : 'block',
                  }}
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              </button>
            )}
          </div>
        </header>

        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

