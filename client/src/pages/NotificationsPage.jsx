import { useCallback, useEffect, useState } from 'react';
import api from '../api/client.js';
import EmptyState from '../components/EmptyState.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatDateTime, getApiError } from '../utils/format.js';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadNotifications = useCallback(async () => {
    setError('');
    try {
      const { data } = await api.get('/clinical/notifications', { params: { limit: 200 } });
      setNotifications(data.notifications || []);
      setUnread(Number(data.unread) || 0);
    } catch (requestError) {
      setError(getApiError(requestError, 'Unable to load your notifications.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  async function markRead(id) {
    setUpdating(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.post(`/clinical/notifications/${id}/read`);
      if (!data.notification) {
        setError('This notification is no longer available to your account.');
        return;
      }
      setNotifications((current) => current.map((item) => item.id === id ? data.notification : item));
      setUnread((current) => Math.max(0, current - 1));
    } catch (requestError) {
      setError(getApiError(requestError, 'Unable to mark the notification as read.'));
    } finally {
      setUpdating(false);
    }
  }

  async function markAllRead() {
    setUpdating(true);
    setError('');
    setNotice('');
    try {
      await api.post('/clinical/notifications/read-all');
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
      setUnread(0);
      setNotice('All notifications marked as read.');
    } catch (requestError) {
      setError(getApiError(requestError, 'Unable to mark notifications as read.'));
    } finally {
      setUpdating(false);
    }
  }

  if (loading) return <LoadingState message="Loading notifications..." />;

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="kicker">Inbox</p>
          <h2>Notifications</h2>
          <p>{unread} unread notification{unread === 1 ? '' : 's'}.</p>
        </div>
        <div className="button-row">
          <button type="button" className="secondary-button" onClick={loadNotifications} disabled={updating}>
            Refresh
          </button>
          <button type="button" className="primary-button" onClick={markAllRead} disabled={updating || unread === 0}>
            Mark all as read
          </button>
        </div>
      </div>
      {error ? <ErrorMessage message={error} /> : null}
      {notice ? <p className="success-message" role="status">{notice}</p> : null}

      {notifications.length === 0 ? (
        <EmptyState title="No notifications" message="New workflow and account notifications will appear here." />
      ) : (
        <div className="notification-list">
          {notifications.map((notification) => (
            <article key={notification.id} className={`panel notification-card${notification.readAt ? '' : ' notification-unread'}`}>
              <div className="panel-header">
                <div>
                  <h3>{notification.title}</h3>
                  <p>{formatDateTime(notification.createdAt)}</p>
                </div>
                <StatusBadge tone={notification.readAt ? 'neutral' : 'ok'}>
                  {notification.readAt ? 'Read' : 'Unread'}
                </StatusBadge>
              </div>
              <div className="panel-body">
                <p>{notification.message}</p>
                {!notification.readAt ? (
                  <button type="button" className="secondary-button" onClick={() => markRead(notification.id)} disabled={updating}>
                    Mark as read
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
