import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/exposure-index', label: 'Exposure Index' },
  { to: '/compare-scans', label: 'Compare Scans' },
  { to: '/audit-log', label: 'Audit Log' },
];

export default function Sidebar() {
  const { logout, user } = useAuth();
  const visibleLinks = user?.role === 'administrator' ? links : links.filter((link) => link.to !== '/audit-log');

  return (
    <aside className="sidebar">
      <div className="brand">
        <h1>OrthoView+</h1>
        <p>{user?.username ?? 'Clinical workstation'}</p>
        <span className="brand-role">{user?.role === 'administrator' ? 'Administrator' : 'Practitioner'}</span>
      </div>
      <nav className="nav" aria-label="Primary">
        {visibleLinks.map((link) => (
          <NavLink key={link.to} to={link.to} className={({ isActive }) => (isActive ? 'active' : undefined)}>
            {link.label}
          </NavLink>
        ))}
      </nav>
      <button type="button" className="logout-button" onClick={logout}>
        Logout
      </button>
    </aside>
  );
}
