const summary = [
  { label: "Balance", value: "$32,481.00", badge: "+6.12%", tone: "neutral" },
  { label: "Incomes", value: "$12,840.00", badge: "+4.80%", tone: "positive" },
  { label: "Expenses", value: "$8,115.00", badge: "-2.10%", tone: "negative" },
];

const ctas = [
  { title: "Create transaction", subtitle: "Add an income or expense" },
  { title: "Manage categories", subtitle: "Organize and classify spending" },
  { title: "Track goals", subtitle: "Plan your monthly targets" },
];

const categories = [
  { name: "House", value: "41.35%", color: "#0f766e" },
  { name: "Credit card", value: "21.51%", color: "#0ea5e9" },
  { name: "Transportation", value: "13.47%", color: "#f59e0b" },
  { name: "Groceries", value: "9.97%", color: "#ef4444" },
  { name: "Shopping", value: "3.35%", color: "#8b5cf6" },
];

const transactions = [
  ["Adobe", "Subscription", "$43.12", "Today"],
  ["Netflix", "Entertainment", "$16.99", "Yesterday"],
  ["Spotify", "Entertainment", "$10.99", "Yesterday"],
  ["Uber", "Transportation", "$19.20", "2 days ago"],
  ["Amazon", "Shopping", "$84.50", "2 days ago"],
  ["Shopify", "Business", "$29.00", "3 days ago"],
];

type DashboardProps = {
  onLogout?: () => void;
};

export function Dashboard({ onLogout }: DashboardProps) {
  return (
    <div className="financy-page">
      <header className="financy-header">
        <div className="financy-brand">
          <div className="brand-dot">F</div>
          <div>
            <p className="brand-name">Financy</p>
            <p className="brand-sub">Personal finances dashboard</p>
          </div>
        </div>
        <nav className="financy-menu">
          <a className="active">Dashboard</a>
          <a>Transactions</a>
          <a>Analytics</a>
          <a>Budgets</a>
          <a>Cards</a>
        </nav>
        <div className="financy-actions">
          <button className="ghost">Search</button>
          <button className="ghost">Bell</button>
          <button className="ghost" onClick={onLogout}>
            Logout
          </button>
          <div className="avatar">TC</div>
        </div>
      </header>

      <main className="financy-main">
        <section className="financy-page-head">
          <h1>Welcome back, Thiago. Here is your financial overview.</h1>
          <div className="head-controls">
            <button className="soft">Today</button>
            <button className="soft">Week</button>
            <button className="soft">Month</button>
            <button className="soft">Year</button>
            <button className="primary">+ Add transaction</button>
          </div>
        </section>

        <section className="summary-grid">
          {summary.map((item) => (
            <article key={item.label} className="summary-card">
              <p>{item.label}</p>
              <div>
                <h2>{item.value}</h2>
                <span className={`badge ${item.tone}`}>{item.badge}</span>
              </div>
            </article>
          ))}
        </section>

        <section className="cta-grid">
          {ctas.map((cta) => (
            <article key={cta.title} className="cta-card">
              <div className="cta-icon">+</div>
              <div>
                <h3>{cta.title}</h3>
                <p>{cta.subtitle}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="content-grid">
          <article className="panel">
            <h3>Expenses by category</h3>
            <div className="pie-wrap">
              <div className="pie-chart" />
            </div>
            <ul className="legend-list">
              {categories.map((c) => (
                <li key={c.name}>
                  <span className="legend-dot" style={{ backgroundColor: c.color }} />
                  <span>{c.name}</span>
                  <strong>{c.value}</strong>
                </li>
              ))}
            </ul>
          </article>

          <article className="panel wide">
            <div className="panel-head">
              <h3>Last transactions</h3>
              <p>Review your most recent activity and subscriptions.</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((row) => (
                  <tr key={row[0]}>
                    <td>{row[0]}</td>
                    <td>{row[1]}</td>
                    <td>{row[2]}</td>
                    <td>{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        </section>
      </main>
    </div>
  );
}
