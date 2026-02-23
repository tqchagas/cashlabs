import axios from "axios";
import { useEffect, useMemo, useState } from "react";

type Transaction = {
  id: number;
  date: string;
  description: string;
  amount_cents: number;
  category_id: number | null;
  category_name?: string | null;
  account_id?: number | null;
  source: string;
};

type TransactionsPageProps = {
  token: string;
  apiBaseUrl: string;
  onBack: () => void;
  onLogout?: () => void;
};

type Category = {
  id: number;
  name: string;
};

type TransactionSortBy = "date" | "description" | "amount_cents" | "source";
type SortOrder = "asc" | "desc";

function centsToCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}

function centsToAmountInput(value: number): string {
  return (value / 100).toFixed(2);
}

function amountInputToCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
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
  const [editingTxId, setEditingTxId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAmountCents, setEditAmountCents] = useState("");
  const [editCategoryId, setEditCategoryId] = useState<string>("");
  const [newEditCategoryName, setNewEditCategoryName] = useState("");
  const [deletingTxId, setDeletingTxId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<TransactionSortBy>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  async function loadData() {
    setLoading(true);
    setMessage("");
    try {
      const [txRes, categoriesRes] = await Promise.all([
        api.get<Transaction[]>("/transactions", {
          headers: authHeaders,
          params: { sort_by: sortBy, sort_order: sortOrder },
        }),
        api.get<Category[]>("/categories", { headers: authHeaders }),
      ]);
      setTransactions(txRes.data);
      setCategories(categoriesRes.data);
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
  }, [sortBy, sortOrder]);

  function handleSort(column: TransactionSortBy) {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(column);
    setSortOrder("asc");
  }

  function sortIndicator(column: TransactionSortBy): string {
    if (sortBy !== column) return "";
    return sortOrder === "asc" ? "▲" : "▼";
  }

  function startEditTransaction(tx: Transaction) {
    setEditingTxId(tx.id);
    setEditDate(tx.date);
    setEditDescription(tx.description);
    setEditAmountCents(centsToAmountInput(tx.amount_cents));
    setEditCategoryId(tx.category_id ? String(tx.category_id) : "");
    setNewEditCategoryName("");
  }

  function cancelEditTransaction() {
    setEditingTxId(null);
    setEditDate("");
    setEditDescription("");
    setEditAmountCents("");
    setEditCategoryId("");
    setNewEditCategoryName("");
  }

  async function createCategoryForEdit() {
    const name = newEditCategoryName.trim();
    if (!name) {
      setMessage("Type a category name.");
      return;
    }
    try {
      const res = await api.post<Category>("/categories", { name }, { headers: authHeaders });
      setCategories((prev) => {
        const exists = prev.some((cat) => cat.id === res.data.id);
        return exists ? prev : [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name));
      });
      setEditCategoryId(String(res.data.id));
      setNewEditCategoryName("");
      setMessage("Category created.");
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Could not create category.");
    }
  }

  async function saveTransactionEdit() {
    if (!editingTxId) return;
    if (!editDate || !editDescription || !editAmountCents) {
      setMessage("Fill date, description and amount.");
      return;
    }
    const amountCents = amountInputToCents(editAmountCents);
    if (amountCents === null) {
      setMessage("Invalid amount.");
      return;
    }

    const currentTx = transactions.find((item) => item.id === editingTxId);
    if (!currentTx) {
      setMessage("Transaction not found.");
      return;
    }

    try {
      await api.patch(
        `/transactions/${editingTxId}`,
        {
          date: editDate,
          description: editDescription,
          amount_cents: amountCents,
          category_id: editCategoryId ? Number(editCategoryId) : null,
          account_id: currentTx.account_id ?? null,
        },
        { headers: authHeaders }
      );
      setMessage("Transaction updated.");
      cancelEditTransaction();
      await loadData();
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Could not update transaction.");
    }
  }

  async function deleteTransaction(txId: number) {
    if (deletingTxId !== null) return;
    const confirmed = window.confirm("Delete this transaction?");
    if (!confirmed) return;

    setDeletingTxId(txId);
    try {
      await api.delete(`/transactions/${txId}`, { headers: authHeaders });
      setMessage("Transaction removed.");
      if (editingTxId === txId) cancelEditTransaction();
      await loadData();
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Could not remove transaction.");
    } finally {
      setDeletingTxId(null);
    }
  }

  return (
    <div className={`financy-page${deletingTxId !== null ? " page-busy" : ""}`}>
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
                <th>
                  <button className="sort-header" type="button" onClick={() => handleSort("description")}>
                    Description {sortIndicator("description")}
                  </button>
                </th>
                <th>Category</th>
                <th>
                  <button className="sort-header" type="button" onClick={() => handleSort("date")}>
                    Date {sortIndicator("date")}
                  </button>
                </th>
                <th>
                  <button className="sort-header" type="button" onClick={() => handleSort("amount_cents")}>
                    Amount {sortIndicator("amount_cents")}
                  </button>
                </th>
                <th>
                  <button className="sort-header" type="button" onClick={() => handleSort("source")}>
                    Source {sortIndicator("source")}
                  </button>
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={6}>No transactions yet.</td>
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
                      <div className="edit-category-row">
                        <select value={editCategoryId} onChange={(e) => setEditCategoryId(e.target.value)}>
                          <option value="">No category</option>
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                        <input
                          placeholder="New category"
                          value={newEditCategoryName}
                          onChange={(e) => setNewEditCategoryName(e.target.value)}
                        />
                        <button type="button" className="soft" onClick={() => void createCategoryForEdit()}>
                          Add
                        </button>
                      </div>
                    ) : (
                      row.category_name || "-"
                    )}
                  </td>
                  <td>
                    {editingTxId === row.id ? (
                      <input value={editDate} onChange={(e) => setEditDate(e.target.value)} placeholder="YYYY-MM-DD" />
                    ) : (
                      formatIsoDate(row.date)
                    )}
                  </td>
                  <td>
                    {editingTxId === row.id ? (
                      <input
                        value={editAmountCents}
                        onChange={(e) => setEditAmountCents(e.target.value)}
                        type="number"
                        step="0.01"
                        placeholder="Amount"
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
                        <button className="ghost action-edit" type="button" onClick={() => startEditTransaction(row)}>
                          Edit
                        </button>
                        <button
                          className="ghost action-delete"
                          type="button"
                          onClick={() => void deleteTransaction(row.id)}
                          disabled={deletingTxId !== null}
                        >
                          {deletingTxId === row.id ? "Deleting..." : "Delete"}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
      {deletingTxId !== null ? (
        <div className="page-lock-overlay" role="status" aria-live="polite" aria-label="Deleting transaction">
          <div className="page-lock-content">
            <span className="spinner" />
            <span>Deleting transaction...</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
