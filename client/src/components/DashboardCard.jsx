export default function DashboardCard({ title, value, hint, icon, tone = 'default' }) {
  return (
    <article className={`stat-card stat-${tone}`}>
      <div className="stat-card-top">
        <h3>{title}</h3>
        {icon ? <span className="stat-icon">{icon}</span> : null}
      </div>
      <div className="value">{value}</div>
      {hint ? <div className="hint">{hint}</div> : null}
    </article>
  );
}
