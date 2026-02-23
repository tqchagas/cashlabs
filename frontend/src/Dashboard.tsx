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

type PendingReviewItem = {
  id: number;
  import_id: number;
  row_number: number;
  raw_data: string;
  error: string;
  status: "pending" | "duplicate" | string;
  is_duplicate: boolean;
  suggested_account_id: number | null;
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
  const [editingTxId, setEditingTxId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAmountCents, setEditAmountCents] = useState("");
  const [pendingItems, setPendingItems] = useState<PendingReviewItem[]>([]);
  const [reviewDate, setReviewDate] = useState("");
  const [reviewDescription, setReviewDescription] = useState("");
  const [reviewAmountCents, setReviewAmountCents] = useState("");
  const [selectedPendingId, setSelectedPendingId] = useState<number | null>(null);

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
      const [summaryRes, categoriesRes, transactionsRes, pendingRes] = await Promise.all([
        api.get<MonthlySummary>(`/reports/monthly?year=${year}&month=${month}`, { headers: authHeaders }),
        api.get<CategoryTotal[]>(`/reports/by-category?year=${year}&month=${month}`, { headers: authHeaders }),
        api.get<Transaction[]>("/transactions", { headers: authHeaders }),
        api.get<PendingReviewItem[]>("/imports/pending", { headers: authHeaders }),
      ]);
      setSummary(summaryRes.data);
      setCategoryTotals(categoriesRes.data);
      setTransactions(transactionsRes.data);
      setPendingItems(pendingRes.data);
      if (pendingRes.data.length > 0 && selectedPendingId === null) {
        prefillFromPending(pendingRes.data[0]);
      }
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

  function prefillFromPending(item: PendingReviewItem) {
    setSelectedPendingId(item.id);
    try {
      const raw = JSON.parse(item.raw_data) as Record<string, string>;
      const dateCandidate =
        raw["Data"] ||
        raw["data"] ||
        raw["Data Lançamento"] ||
        raw["Data Lancamento"] ||
        raw["Date"] ||
        "";
      const descriptionCandidate =
        raw["Descricao"] ||
        raw["Descrição"] ||
        raw["Estabelecimento"] ||
        raw["description"] ||
        raw["Lançamento"] ||
        "";
      const valueCandidate = raw["Valor"] || raw["Valor (R$)"] || raw["amount"] || "";
      setReviewDate(String(dateCandidate).slice(0, 10));
      setReviewDescription(String(descriptionCandidate));
      setReviewAmountCents(
        String(valueCandidate).replace(/[^\d-]/g, "") || ""
      );
    } catch {
      setReviewDate("");
      setReviewDescription("");
      setReviewAmountCents("");
    }
  }

  async function confirmPendingItem() {
    if (!selectedPendingId) {
      setMessage("Select a pending line first.");
      return;
    }
    if (!reviewDate || !reviewDescription || !reviewAmountCents) {
      setMessage("Fill date, description and amount (cents) to confirm.");
      return;
    }
    try {
      const payload = {
        date: reviewDate,
        description: reviewDescription,
        amount_cents: Number(reviewAmountCents),
        category_id: null,
        account_id: null,
      };
      await api.patch(`/imports/pending/${selectedPendingId}/confirm`, payload, {
        headers: authHeaders,
      });
      setMessage("Pending row confirmed.");
      setSelectedPendingId(null);
      setReviewDate("");
      setReviewDescription("");
      setReviewAmountCents("");
      await loadDashboardData();
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Could not confirm pending row.");
    }
  }

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

  function startEditTransaction(tx: Transaction) {
    setEditingTxId(tx.id);
    setEditDate(tx.date);
    setEditDescription(tx.description);
    setEditAmountCents(String(tx.amount_cents));
  }

  function cancelEditTransaction() {
    setEditingTxId(null);
    setEditDate("");
    setEditDescription("");
    setEditAmountCents("");
  }

  async function saveTransactionEdit() {
    if (!editingTxId) return;
    if (!editDate || !editDescription || !editAmountCents) {
      setMessage("Fill date, description and amount to update transaction.");
      return;
    }
    try {
      await api.patch(
        `/transactions/${editingTxId}`,
        {
          date: editDate,
          description: editDescription,
          amount_cents: Number(editAmountCents),
          category_id: null,
          account_id: null,
        },
        { headers: authHeaders }
      );
      setMessage("Transaction updated.");
      cancelEditTransaction();
      await loadDashboardData();
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Could not update transaction.");
    }
  }

  async function deleteTransaction(txId: number) {
    try {
      await api.delete(`/transactions/${txId}`, { headers: authHeaders });
      setMessage("Transaction removed.");
      if (editingTxId === txId) cancelEditTransaction();
      await loadDashboardData();
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Could not remove transaction.");
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
              <h3>All transactions</h3>
              <p>Complete transaction list. You can edit or remove any row.</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Source</th>
                  <th>Actions</th>
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
                    <td>
                      {editingTxId === row.id ? (
                        <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                      ) : (
                        row.description
                      )}
                    </td>
                    <td>
                      {editingTxId === row.id ? (
                        <input value={editDate} onChange={(e) => setEditDate(e.target.value)} placeholder="YYYY-MM-DD" />
                      ) : (
                        row.date
                      )}
                    </td>
                    <td>
                      {editingTxId === row.id ? (
                        <input
                          value={editAmountCents}
                          onChange={(e) => setEditAmountCents(e.target.value)}
                          placeholder="Amount in cents"
                        />
                      ) : (
                        centsToCurrency(row.amount_cents)
                      )}
                    </td>
                    <td>{row.source}</td>
                    <td className="table-actions">
                      {editingTxId === row.id ? (
                        <>
                          <button className="primary" type="button" onClick={() => void saveTransactionEdit()}>
                            Save
                          </button>
                          <button className="ghost" type="button" onClick={cancelEditTransaction}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="ghost" type="button" onClick={() => startEditTransaction(row)}>
                            Edit
                          </button>
                          <button className="ghost" type="button" onClick={() => void deleteTransaction(row.id)}>
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>Pending review</h3>
            <p>Rows that could not be parsed during import.</p>
          </div>
          <div className="review-form row">
            <input
              placeholder="YYYY-MM-DD"
              value={reviewDate}
              onChange={(e) => setReviewDate(e.target.value)}
            />
            <input
              placeholder="Description"
              value={reviewDescription}
              onChange={(e) => setReviewDescription(e.target.value)}
            />
            <input
              placeholder="Amount in cents (e.g. -4590)"
              value={reviewAmountCents}
              onChange={(e) => setReviewAmountCents(e.target.value)}
            />
            <button className="primary" type="button" onClick={() => void confirmPendingItem()}>
              Confirm selected
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Import</th>
                <th>Row</th>
                <th>Error</th>
                <th>Status</th>
                <th>Raw</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingItems.length === 0 ? (
                <tr>
                  <td colSpan={6}>No pending rows.</td>
                </tr>
              ) : null}
              {pendingItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.import_id}</td>
                  <td>{item.row_number}</td>
                  <td>{item.error}</td>
                  <td>{item.status}</td>
                  <td className="raw-json">{item.raw_data}</td>
                  <td>
                    {item.status === "pending" ? (
                      <button className="ghost" type="button" onClick={() => prefillFromPending(item)}>
                        Select
                      </button>
                    ) : (
                      <span className="duplicate-flag">Duplicate</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
