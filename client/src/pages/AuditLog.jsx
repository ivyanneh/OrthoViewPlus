import { useEffect, useMemo, useState } from 'react';
import api from '../api/client.js';
import EmptyState from '../components/EmptyState.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import { SearchIcon, ShieldIcon } from '../components/Icons.jsx';
import { useDebouncedValue } from '../hooks/useApiData.js';
import { formatActionLabel, formatDateTime, formatRole, formatValue, getInitials } from '../utils/format.js';

const PAGE_SIZE = 100;

const CATEGORIES = [
  ['authentication', 'Authentication (login / logout)'],
  ['user_management', 'User & account management'],
  ['study_access', 'Study / imaging access'],
  ['scheduling', 'Imaging schedule'],
  ['alerts', 'Alerts'],
  ['administration', 'Page access & administration'],
];

const EMPTY_FILTERS = { search: '', username: '', action: '', role: 'all', category: 'all', dateFrom: '', dateTo: '' };

export default function AuditLog() {
  const [data, setData] = useState({ total: 0, entries: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const debounced = useDebouncedValue(filters, 400);

  useEffect(() => {
    setPage(0);
  }, [debounced]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await api.get('/audit', {
          params: {
            search: debounced.search.trim() || undefined,
            username: debounced.username.trim() || undefined,
            action: debounced.action.trim() || undefined,
            role: debounced.role !== 'all' ? debounced.role : undefined,
            category: debounced.category !== 'all' ? debounced.category : undefined,
            dateFrom: debounced.dateFrom || undefined,
            dateTo: debounced.dateTo || undefined,
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
          },
        });

        if (!cancelled) {
          setData(response.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Unable to load audit entries.');
          setData({ total: 0, entries: [] });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [debounced, page]);

  function update(field) {
    return (event) => setFilters((current) => ({ ...current, [field]: event.target.value }));
  }

  const entries = useMemo(() => data.entries || [], [data.entries]);
  const total = Number(data.total || 0);
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const firstRow = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastRow = page * PAGE_SIZE + entries.length;

  return (
    <section className="page">
      <ErrorMessage message={error} />

      <section className="panel">
        <div className="toolbar toolbar-4">
          <div className="field inline-field span-2">
            <label htmlFor="audit-search">Search</label>
            <div className="input-icon">
              <SearchIcon size={16} />
              <input id="audit-search" value={filters.search} onChange={update('search')} placeholder="Search details, resource or action" />
            </div>
          </div>
          <div className="field inline-field">
            <label htmlFor="audit-username">User</label>
            <input id="audit-username" value={filters.username} onChange={update('username')} placeholder="Username" />
          </div>
          <div className="field inline-field">
            <label htmlFor="audit-role">Role</label>
            <select id="audit-role" value={filters.role} onChange={update('role')}>
              <option value="all">All roles</option>
              <option value="administrator">Administrator</option>
              <option value="practitioner">Healthcare Practitioner</option>
              <option value="system">System / unauthenticated</option>
            </select>
          </div>
          <div className="field inline-field">
            <label htmlFor="audit-category">Activity type</label>
            <select id="audit-category" value={filters.category} onChange={update('category')}>
              <option value="all">All activity</option>
              {CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field inline-field">
            <label htmlFor="audit-action">Action</label>
            <input id="audit-action" value={filters.action} onChange={update('action')} placeholder="e.g. user_create" />
          </div>
          <div className="field inline-field">
            <label htmlFor="audit-from">From</label>
            <input id="audit-from" type="date" value={filters.dateFrom} onChange={update('dateFrom')} />
          </div>
          <div className="field inline-field">
            <label htmlFor="audit-to">To</label>
            <input id="audit-to" type="date" value={filters.dateTo} onChange={update('dateTo')} />
          </div>
        </div>
        <div className="toolbar-footer">
          <span className="subtle-note">
            <ShieldIcon size={14} />
            Audit records are append-only and cannot be edited or deleted. Passwords and authentication secrets are never logged. Date
            filters use UTC record time.
          </span>
          <button type="button" className="secondary-button" onClick={() => setFilters(EMPTY_FILTERS)} disabled={!filtersActive}>
            Clear filters
          </button>
        </div>

        <div className="panel-subheader">
          <span>
            {loading ? (
              <LoadingState message="Loading audit entries..." />
            ) : (
              <>
                Showing <strong>{firstRow}</strong>–<strong>{lastRow}</strong> of <strong>{total}</strong> records
              </>
            )}
          </span>
          <span className="pager">
            <button type="button" className="secondary-button small" onClick={() => setPage((value) => value - 1)} disabled={page === 0 || loading}>
              Previous
            </button>
            <button
              type="button"
              className="secondary-button small"
              onClick={() => setPage((value) => value + 1)}
              disabled={lastRow >= total || loading}
            >
              Next
            </button>
          </span>
        </div>

        {entries.length > 0 ? (
          <div className="table-wrap flush">
            <table className="data-table audit-table">
              <thead>
                <tr>
                  <th>Date / time</th>
                  <th>User</th>
                  <th>Role</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="mono nowrap" title={`${entry.timestamp} UTC`}>
                      {formatDateTime(entry.timestamp)}
                    </td>
                    <td className="nowrap">
                      <span className="user-cell">
                        <span className="avatar avatar-xs" aria-hidden="true">
                          {getInitials(entry.username)}
                        </span>
                        {formatValue(entry.username, 'System')}
                      </span>
                    </td>
                    <td className="nowrap muted">{formatRole(entry.role)}</td>
                    <td className="nowrap">
                      <span className={`action-chip${/failed|blocked|deactivate|remove|restrict/.test(entry.action) ? ' warn' : ''}`} title={formatValue(entry.action)}>
                        {formatActionLabel(entry.action)}
                      </span>
                    </td>
                    <td className="mono muted">{formatValue(entry.target)}</td>
                    <td>{formatValue(entry.description)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel-body">
            <EmptyState title="No audit entries" message="No audit entries matched the current filters." />
          </div>
        )}
      </section>
    </section>
  );
}


