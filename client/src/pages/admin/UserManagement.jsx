import { useMemo, useState } from 'react';
import api from '../../api/client.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import Modal from '../../components/Modal.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { PlusIcon, SearchIcon } from '../../components/Icons.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import useApiData from '../../hooks/useApiData.js';
import { formatDateTime, formatRole, formatValue, getApiError, getInitials } from '../../utils/format.js';

const MIN_PASSWORD = 8;
const STATUS_META = {
  active: { label: 'Active', tone: 'ok' },
  inactive: { label: 'Inactive', tone: 'neutral' },
  removed: { label: 'Removed', tone: 'danger' },
};

function UserForm({ user, onClose, onSaved, isSelf }) {
  const editing = Boolean(user);
  const [form, setForm] = useState({
    username: user?.username ?? '',
    fullName: user?.fullName ?? '',
    email: user?.email ?? '',
    department: user?.department ?? '',
    role: user?.role ?? 'practitioner',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!editing && !form.username.trim()) {
      setError('Username is required.');
      return;
    }
    if ((!editing || form.password) && form.password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const payload = {
      fullName: form.fullName,
      email: form.email,
      department: form.department,
      role: form.role,
      ...(form.password ? { password: form.password } : {}),
    };

    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/admin/users/${user.id}`, payload);
      } else {
        await api.post('/admin/users', { ...payload, username: form.username.trim() });
      }
      onSaved(editing ? `Account "${user.username}" updated.` : `Account "${form.username.trim()}" created.`);
    } catch (err) {
      setError(getApiError(err, 'The account could not be saved.'));
      setSaving(false);
    }
  }

  return (
    <Modal
      title={editing ? `Edit account: ${user.username}` : 'Add user'}
      subtitle={editing ? 'Update account details and role.' : 'Create a new OrthoView+ account.'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="user-form" className="primary-button" disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Create account'}
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={handleSubmit} noValidate>
        <ErrorMessage message={error} />
        <div className="form-grid">
          <div className="field">
            <label htmlFor="user-username">Username</label>
            <input id="user-username" value={form.username} onChange={update('username')} disabled={editing} autoComplete="off" />
            {!editing ? <span className="field-hint">3-40 characters: letters, numbers, dot, dash, underscore.</span> : null}
          </div>
          <div className="field">
            <label htmlFor="user-role">Role</label>
            <select id="user-role" value={form.role} onChange={update('role')} disabled={isSelf}>
              <option value="practitioner">Healthcare Practitioner</option>
              <option value="radiologist">Radiologist</option>
              <option value="administrator">Administrator</option>
            </select>
            {isSelf ? <span className="field-hint">You cannot change your own role.</span> : null}
          </div>
          <div className="field">
            <label htmlFor="user-fullname">Full name</label>
            <input id="user-fullname" value={form.fullName} onChange={update('fullName')} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="user-department">Department</label>
            <input id="user-department" value={form.department} onChange={update('department')} autoComplete="off" />
          </div>
          <div className="field span-2">
            <label htmlFor="user-email">Email</label>
            <input id="user-email" type="email" value={form.email} onChange={update('email')} autoComplete="off" />
          </div>
          {!isSelf ? (
            <>
              <div className="field">
                <label htmlFor="user-password">{editing ? 'New password (optional)' : 'Initial password'}</label>
                <input id="user-password" type="password" value={form.password} onChange={update('password')} autoComplete="new-password" />
                <span className="field-hint">Minimum {MIN_PASSWORD} characters. Never displayed after saving.</span>
              </div>
              <div className="field">
                <label htmlFor="user-password-confirm">Confirm password</label>
                <input
                  id="user-password-confirm"
                  type="password"
                  value={form.confirmPassword}
                  onChange={update('confirmPassword')}
                  autoComplete="new-password"
                />
              </div>
            </>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

function RestrictDialog({ user, onClose, onSaved }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!reason.trim()) {
      setError('Enter a reason for the restriction.');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/admin/users/${user.id}/restrict`, { reason: reason.trim() });
      onSaved(`Sign-in restricted for "${user.username}".`);
    } catch (err) {
      setError(getApiError(err, 'The restriction could not be applied.'));
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Restrict account: ${user.username}`}
      subtitle="A restricted account cannot sign in and any active session is ended on its next request."
      onClose={onClose}
      width={480}
      footer={
        <>
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="restrict-form" className="danger-button" disabled={saving}>
            {saving ? 'Applying...' : 'Apply restriction'}
          </button>
        </>
      }
    >
      <form id="restrict-form" onSubmit={handleSubmit} noValidate>
        <ErrorMessage message={error} />
        <div className="field">
          <label htmlFor="restrict-reason">Reason</label>
          <input
            id="restrict-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Suspected credential compromise"
            maxLength={240}
          />
          <span className="field-hint">Recorded in the audit log and shown to administrators.</span>
        </div>
      </form>
    </Modal>
  );
}

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const { data, loading, error, reload } = useApiData('/admin/users', null, 'Unable to load user accounts.');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('current');
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState('');

  const users = useMemo(() => data?.users ?? [], [data]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch =
        !needle ||
        [user.username, user.fullName, user.email, user.department].filter(Boolean).some((value) => value.toLowerCase().includes(needle));
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      let matchesStatus = true;
      if (statusFilter === 'current') matchesStatus = user.status !== 'removed';
      else if (statusFilter === 'restricted') matchesStatus = user.restricted && user.status !== 'removed';
      else if (statusFilter !== 'all') matchesStatus = user.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const counts = useMemo(
    () => ({
      active: users.filter((user) => user.status === 'active').length,
      inactive: users.filter((user) => user.status === 'inactive').length,
      restricted: users.filter((user) => user.restricted && user.status !== 'removed').length,
      removed: users.filter((user) => user.status === 'removed').length,
    }),
    [users],
  );

  function done(message) {
    setDialog(null);
    setNotice(message);
    reload();
  }

  function confirm(user, { title, message, confirmLabel, tone = 'danger', request, success }) {
    setNotice('');
    setDialog({
      type: 'confirm',
      props: {
        title,
        message,
        confirmLabel,
        tone,
        onConfirm: async () => {
          await request();
          setNotice(success);
          reload();
        },
      },
    });
  }

  return (
    <section className="page">
      {loading && !data ? <LoadingState message="Loading user accounts..." /> : null}
      <ErrorMessage message={error} />
      {notice ? (
        <div className="notice-banner" role="status">
          {notice}
        </div>
      ) : null}

      <div className="summary-strip">
        <div>
          <span>Active</span>
          <strong>{counts.active}</strong>
        </div>
        <div>
          <span>Inactive</span>
          <strong>{counts.inactive}</strong>
        </div>
        <div>
          <span>Restricted</span>
          <strong>{counts.restricted}</strong>
        </div>
        <div>
          <span>Removed</span>
          <strong>{counts.removed}</strong>
        </div>
      </div>

      <section className="panel">
        <div className="toolbar toolbar-actions">
          <div className="field inline-field grow">
            <label htmlFor="user-search">Search</label>
            <div className="input-icon">
              <SearchIcon size={16} />
              <input
                id="user-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Username, name, email or department"
              />
            </div>
          </div>
          <div className="field inline-field">
            <label htmlFor="user-role-filter">Role</label>
            <select id="user-role-filter" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="all">All roles</option>
              <option value="administrator">Administrator</option>
              <option value="practitioner">Healthcare Practitioner</option>
              <option value="radiologist">Radiologist</option>
            </select>
          </div>
          <div className="field inline-field">
            <label htmlFor="user-status-filter">Status</label>
            <select id="user-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="current">Current accounts</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="restricted">Restricted</option>
              <option value="removed">Removed</option>
              <option value="all">All, including removed</option>
            </select>
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setNotice('');
              setDialog({ type: 'form', user: null });
            }}
          >
            <PlusIcon size={16} />
            <span>Add user</span>
          </button>
        </div>

        <div className="panel-subheader">
          <span>
            Showing <strong>{filtered.length}</strong> of <strong>{users.length}</strong> accounts
          </span>
          <span className="subtle-note">Passwords are stored as one-way hashes and are never displayed.</span>
        </div>

        {filtered.length > 0 ? (
          <div className="table-wrap flush">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Last sign-in</th>
                  <th>Created</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => {
                  const isSelf = Number(user.id) === Number(currentUser?.id);
                  const removed = user.status === 'removed';
                  return (
                    <tr key={user.id} className={removed ? 'row-muted' : undefined}>
                      <td>
                        <span className="user-cell">
                          <span className="avatar avatar-xs" aria-hidden="true">
                            {getInitials(user.username)}
                          </span>
                          <span className="user-cell-text">
                            <strong>
                              {user.fullName || user.username}
                              {isSelf ? <span className="you-tag">You</span> : null}
                            </strong>
                            <span className="mono muted">{user.username}</span>
                          </span>
                        </span>
                      </td>
                      <td className="nowrap">{formatRole(user.role)}</td>
                      <td>{formatValue(user.department, '—')}</td>
                      <td className="truncate" title={user.email || ''}>
                        {formatValue(user.email, '—')}
                      </td>
                      <td>
                        <div className="badge-stack">
                          <StatusBadge tone={STATUS_META[user.status]?.tone}>{STATUS_META[user.status]?.label ?? user.status}</StatusBadge>
                          {user.restricted ? (
                            <span title={user.restrictionReason || ''}>
                              <StatusBadge tone="warn">Restricted</StatusBadge>
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="mono nowrap">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}</td>
                      <td className="mono nowrap">{formatDateTime(user.createdAt)}</td>
                      <td className="actions-col">
                        <div className="row-actions">
                          {removed ? (
                            <button
                              type="button"
                              className="link-button"
                              onClick={() =>
                                confirm(user, {
                                  title: 'Reinstate account',
                                  message: `Reinstate "${user.username}" as an active account? The user will be able to sign in again.`,
                                  confirmLabel: 'Reinstate',
                                  tone: 'primary',
                                  request: () => api.post(`/admin/users/${user.id}/activate`),
                                  success: `Account "${user.username}" reinstated.`,
                                })
                              }
                            >
                              Reinstate
                            </button>
                          ) : (
                            <>
                              <button type="button" className="link-button" onClick={() => setDialog({ type: 'form', user })}>
                                Edit
                              </button>
                              {user.status === 'active' ? (
                                <button
                                  type="button"
                                  className="link-button"
                                  disabled={isSelf}
                                  title={isSelf ? 'You cannot deactivate your own account' : undefined}
                                  onClick={() =>
                                    confirm(user, {
                                      title: 'Deactivate account',
                                      message: `Deactivate "${user.username}"? The user will no longer be able to sign in until the account is reactivated.`,
                                      confirmLabel: 'Deactivate',
                                      request: () => api.post(`/admin/users/${user.id}/deactivate`),
                                      success: `Account "${user.username}" deactivated.`,
                                    })
                                  }
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="link-button"
                                  onClick={() =>
                                    confirm(user, {
                                      title: 'Activate account',
                                      message: `Activate "${user.username}"? The user will be able to sign in again.`,
                                      confirmLabel: 'Activate',
                                      tone: 'primary',
                                      request: () => api.post(`/admin/users/${user.id}/activate`),
                                      success: `Account "${user.username}" activated.`,
                                    })
                                  }
                                >
                                  Activate
                                </button>
                              )}
                              {user.restricted ? (
                                <button
                                  type="button"
                                  className="link-button"
                                  onClick={() =>
                                    confirm(user, {
                                      title: 'Remove restriction',
                                      message: `Remove the sign-in restriction for "${user.username}"?${
                                        user.restrictionReason ? ` Current reason: ${user.restrictionReason}` : ''
                                      }`,
                                      confirmLabel: 'Remove restriction',
                                      tone: 'primary',
                                      request: () => api.post(`/admin/users/${user.id}/unrestrict`),
                                      success: `Restriction removed for "${user.username}".`,
                                    })
                                  }
                                >
                                  Lift restriction
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="link-button"
                                  disabled={isSelf}
                                  title={isSelf ? 'You cannot restrict your own account' : undefined}
                                  onClick={() => {
                                    setNotice('');
                                    setDialog({ type: 'restrict', user });
                                  }}
                                >
                                  Restrict
                                </button>
                              )}
                              <button
                                type="button"
                                className="link-button danger"
                                disabled={isSelf}
                                title={isSelf ? 'You cannot remove your own account' : undefined}
                                onClick={() =>
                                  confirm(user, {
                                    title: 'Remove account',
                                    message: `Remove "${user.username}"? The account will be archived and can no longer sign in. Audit history for this user is preserved.`,
                                    confirmLabel: 'Remove account',
                                    request: () => api.delete(`/admin/users/${user.id}`),
                                    success: `Account "${user.username}" removed.`,
                                  })
                                }
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel-body">
            <EmptyState title="No accounts found" message="No user accounts matched the current search and filters." />
          </div>
        )}
      </section>

      {dialog?.type === 'form' ? (
        <UserForm
          user={dialog.user}
          isSelf={Boolean(dialog.user) && Number(dialog.user.id) === Number(currentUser?.id)}
          onClose={() => setDialog(null)}
          onSaved={done}
        />
      ) : null}
      {dialog?.type === 'restrict' ? <RestrictDialog user={dialog.user} onClose={() => setDialog(null)} onSaved={done} /> : null}
      {dialog?.type === 'confirm' ? <ConfirmDialog {...dialog.props} onClose={() => setDialog(null)} /> : null}
    </section>
  );
}
