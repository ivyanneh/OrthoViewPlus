export default function DashboardCard({ title, value, hint }) {
  return (
    <article className="stat-card">
      <h3>{title}</h3>
      <div className="value">{value}</div>
      {hint ? <div className="hint">{hint}</div> : null}
    </article>
  );
}
