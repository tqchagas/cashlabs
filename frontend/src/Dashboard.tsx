import axios from "axios";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Transaction = {
  id: number;
  date: string;
  description: string;
  amount_cents: number;
  category_id: number | null;
  account_id: number | null;
  source: string;
};

type MonthlySummary = {
  year: number;
  month: number;
  total_expenses_cents: number;
  total_income_cents: number;
  balance_cents: number;
};

type CategoryTotal = {
  category: string;
  total_cents: number;
};

type DashboardProps = {
  token: string;
  apiBaseUrl: string;
  onLogout?: () => void;
};

const colors = ["#0f766e", "#0ea5e9", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16"];

function centsToCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
}

function percent(part: number, total: number): string {
  if (total <= 0) return "0.00%";
  return `${((Math.abs(part) / total) * 100).toFixed(2)}%`;
}

export function Dashboard({ token, apiBaseUrl, onLogout }: DashboardProps) {
  const api = useMemo(() => axios.create({ baseURL: apiBaseUrl }), [apiBaseUrl]);
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [categoryTotals, setCategoryTotals] = useState<CategoryTotal[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const [showImport, setShowImport] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePassword, setFilePassword] = useState("");

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  async function loadDashboardData() {
    setLoading(true);
    setMessage("");
    try {
      const [summaryRes, categoriesRes, transactionsRes] = await Promise.all([
        api.get<MonthlySummary>(`/reports/monthly?year=${year}&month=${month}`, { headers: authHeaders }),
        api.get<CategoryTotal[]>(`/reports/by-category?year=${year}&month=${month}`, { headers: authHeaders }),
        api.get<Transaction[]>("/transactions", { headers: authHeaders }),
      ]);
      setSummary(summaryRes.data);
      setCategoryTotals(categoriesRes.data);
      setTransactions(transactionsRes.data.slice(0, 8));
    } catch (error: any) {
      if (error?.response?.status === 401 && onLogout) {
        onLogout();
        return;
      }
      setMessage(error?.response?.data?.detail || "Could not load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboardData();
  }, []);

  async function uploadImport(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setMessage("Select a file first.");
      return;
    }

    const form = new FormData();
    form.append("file", file);
    if (filePassword.trim()) form.append("password", filePassword.trim());

    try {
      const res = await api.post("/imports/tabular", form, {
        headers: { ...authHeaders, "Content-Type": "multipart/form-data" },
      });
      setMessage(
        `Import complete: ${res.data.inserted} inserted, ${res.data.duplicates} duplicates, ${res.data.pending} pending.`
      );
      setFile(null);
      setFilePassword("");
      setShowImport(false);
      await loadDashboardData();
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Import failed.");
    }
  }

  const totalExpenseAbs = Math.abs(summary?.total_expenses_cents || 0);
  const cards = [
    {
      label: "Balance",
      value: centsToCurrency(summary?.balance_cents || 0),
      badge: summary && summary.balance_cents >= 0 ? "Positive" : "Negative",
      tone: summary && summary.balance_cents >= 0 ? "positive" : "negative",
    },
    {
      label: "Incomes",
      value: centsToCurrency(summary?.total_income_cents || 0),
      badge: "Month total",
      tone: "neutral",
    },
    {
      label: "Expenses",
      value: centsToCurrency(summary?.total_expenses_cents || 0),
      badge: "Month total",
      tone: "negative",
    },
  ];

  return (
    <div className="financy-page">
      <header className="financy-header">
        <div className="financy-brand">
          <div className="brand-dot">F</div>
          <div>
            <p className="brand-name">CashLabs</p>
            <p className="brand-sub">Personal finances dashboard</p>
          </div>
        </div>
        <nav className="financy-menu">
          <a className="active">Dashboard</a>
        </nav>
        <div className="financy-actions">
          <button className="ghost" onClick={() => void loadDashboardData()}>
            Refresh
          </button>
          <button className="ghost" onClick={onLogout}>
            Logout
          </button>
          <div className="avatar">TC</div>
        </div>
      </header>

      <main className="financy-main">
        <section className="financy-page-head">
          <h1>Welcome back. Here is your financial overview for this month.</h1>
          <div className="head-controls">
            <button className="primary" onClick={() => setShowImport((v) => !v)}>
              {showImport ? "Close import" : "Import CSV/XLSX"}
            </button>
          </div>
        </section>

        {showImport ? (
          <section className="import-box">
            <form className="row" onSubmit={uploadImport}>
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <input
                type="password"
                placeholder="XLSX password (optional)"
                value={filePassword}
                onChange={(e) => setFilePassword(e.target.value)}
              />
              <button type="submit">Send import</button>
            </form>
          </section>
        ) : null}

        {message ? <p className="notice">{message}</p> : null}
        {loading ? <p className="notice">Loading dashboard data...</p> : null}

        <section className="summary-grid">
          {cards.map((item) => (
            <article key={item.label} className="summary-card">
              <p>{item.label}</p>
              <div>
                <h2>{item.value}</h2>
                <span className={`badge ${item.tone}`}>{item.badge}</span>
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
              {categoryTotals.length === 0 ? <li>No expense categories yet.</li> : null}
              {categoryTotals.map((c, idx) => (
                <li key={`${c.category}-${idx}`}>
                  <span className="legend-dot" style={{ backgroundColor: colors[idx % colors.length] }} />
                  <span>{c.category}</span>
                  <strong>{percent(c.total_cents, totalExpenseAbs)}</strong>
                </li>
              ))}
            </ul>
          </article>

          <article className="panel wide">
            <div className="panel-head">
              <h3>Last transactions</h3>
              <p>Most recent records from your account.</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No transactions yet.</td>
                  </tr>
                ) : null}
                {transactions.map((row) => (
                  <tr key={row.id}>
                    <td>{row.description}</td>
                    <td>{row.date}</td>
                    <td>{centsToCurrency(row.amount_cents)}</td>
                    <td>{row.source}</td>
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
