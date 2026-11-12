export default function DashboardCard({
  title,
  value,
  hint,
  icon,
  tone = 'default',
  to
}) {
  const handleClick = () => {
    if (to) {
      window.location.href = to;
    }
  };

  return (
    <article
      className={`stat-card stat-${tone}`}
      onClick={to ? handleClick : undefined}
      style={{ cursor: to ? 'pointer' : 'default' }}
    >
      <div className="stat-card-top">
        <h3>{title}</h3>
        {icon ? <span className="stat-icon">{icon}</span> : null}
      </div>

      <div className="value">{value}</div>

      {hint ? <div className="hint">{hint}</div> : null}
    </article>
  );
}
