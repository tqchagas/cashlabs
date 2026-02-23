import axios from "axios";
import { useEffect, useMemo, useState } from "react";

type Transaction = {
  id: number;
  date: string;
  description: string;
  amount_cents: number;
  category_id: number | null;
  source: string;
};

type Category = {
  id: number;
  name: string;
};

type TransactionsPageProps = {
  token: string;
  apiBaseUrl: string;
  onBack: () => void;
  onLogout?: () => void;
};

function centsToCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}

function formatIsoDate(isoDate: string): string {
  if (!isoDate || isoDate.length < 10) return isoDate;
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}

export function TransactionsPage({ token, apiBaseUrl, onBack, onLogout }: TransactionsPageProps) {
  const api = useMemo(() => axios.create({ baseURL: apiBaseUrl }), [apiBaseUrl]);
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const categoryNameById = useMemo(
    () =>
      new Map<number, string>(
        categories.map((category) => [category.id, category.name])
      ),
    [categories]
  );

  async function loadData() {
    setLoading(true);
    setMessage("");
    try {
      const [txRes, catRes] = await Promise.all([
        api.get<Transaction[]>("/transactions", { headers: authHeaders }),
        api.get<Category[]>("/categories", { headers: authHeaders }),
      ]);
      setTransactions(txRes.data);
      setCategories(catRes.data);
    } catch (error: any) {
      if (error?.response?.status === 401 && onLogout) {
        onLogout();
        return;
      }
      setMessage(error?.response?.data?.detail || "Could not load transactions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

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
        <div className="financy-actions">
          <button className="ghost action-neutral" onClick={() => void loadData()}>
            Refresh
          </button>
          <button className="soft" onClick={onBack}>
            Back to dashboard
          </button>
          <button className="ghost action-neutral" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="financy-main">
        <section className="panel wide">
          <div className="panel-head">
            <h3>All transactions</h3>
            <p>Complete list of your expenses.</p>
          </div>

          {message ? <p className="notice">{message}</p> : null}
          {loading ? (
            <div className="loading-inline notice">
              <span className="spinner" />
              <span>Loading transactions...</span>
            </div>
          ) : null}

          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Category</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={5}>No transactions yet.</td>
                </tr>
              ) : null}
              {transactions.map((row) => (
                <tr key={row.id}>
                  <td>{row.description}</td>
                  <td>{row.category_id ? categoryNameById.get(row.category_id) || "-" : "-"}</td>
                  <td>{formatIsoDate(row.date)}</td>
                  <td>{centsToCurrency(row.amount_cents)}</td>
                  <td>{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
