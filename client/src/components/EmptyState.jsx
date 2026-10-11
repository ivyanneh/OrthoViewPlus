import { InboxIcon } from './Icons.jsx';

export default function EmptyState({ title, message, compact = false }) {
  return (
    <div className={`empty-state${compact ? ' compact' : ''}`}>
      <InboxIcon size={22} />
      <div>
        {title ? <strong>{title}</strong> : null}
        {message ? <p>{message}</p> : null}
      </div>
    </div>
  );
}
