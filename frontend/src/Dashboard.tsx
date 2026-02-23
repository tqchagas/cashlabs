import axios from "axios";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArcElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { Doughnut, Line } from "react-chartjs-2";

type Transaction = {
  id: number;
  date: string;
  description: string;
  amount_cents: number;
  category_id: number | null;
  category_name?: string | null;
  account_id: number | null;
  source: string;
  installment_group_id?: number | null;
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

type Category = {
  id: number;
  name: string;
};

type Account = {
  id: number;
  name: string;
};

type DashboardProps = {
  token: string;
  apiBaseUrl: string;
  onLogout?: () => void;
  onViewAllTransactions?: () => void;
};

const colors = ["#0f766e", "#0ea5e9", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16"];

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Filler);

type LinePoint = {
  label: string;
  value: number;
};

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

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

function ExpensesLineChart({
  data,
  options,
}: {
  data: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      borderColor: string;
      backgroundColor: string;
      tension: number;
      fill: boolean;
      pointRadius: number;
      pointHoverRadius: number;
    }>;
  };
  options: ChartOptions<"line">;
}) {
  return (
    <article className="panel wide">
      <div className="panel-head">
        <h3>Expenses trend (-3 to +3 months)</h3>
      </div>
      <div className="chart-canvas-wrap line">
        <Line data={data} options={options} />
      </div>
    </article>
  );
}

function formatIsoDate(isoDate: string): string {
  if (!isoDate || isoDate.length < 10) return isoDate;
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}

export function Dashboard({ token, apiBaseUrl, onLogout, onViewAllTransactions }: DashboardProps) {
  const api = useMemo(() => axios.create({ baseURL: apiBaseUrl }), [apiBaseUrl]);
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [editingTxId, setEditingTxId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAmountCents, setEditAmountCents] = useState("");
  const [editCategoryId, setEditCategoryId] = useState<string>("");
  const [newEditCategoryName, setNewEditCategoryName] = useState("");
  const [pendingItems, setPendingItems] = useState<PendingReviewItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [showManual, setShowManual] = useState(false);
  const [manualMode, setManualMode] = useState<"single" | "installments">("single");
  const [manualDate, setManualDate] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualCategoryId, setManualCategoryId] = useState<string>("");
  const [manualAccountId, setManualAccountId] = useState<string>("");
  const [installmentsCount, setInstallmentsCount] = useState("2");
  const [intervalMonths, setIntervalMonths] = useState("1");
  const [installmentAmountMode, setInstallmentAmountMode] = useState<"total" | "per">("total");
  const [totalAmount, setTotalAmount] = useState("");
  const [amountPerInstallment, setAmountPerInstallment] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [reviewDescription, setReviewDescription] = useState("");
  const [reviewAmountCents, setReviewAmountCents] = useState("");
  const [selectedPendingId, setSelectedPendingId] = useState<number | null>(null);

  const [showImport, setShowImport] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePassword, setFilePassword] = useState("");
  const [expenseScope, setExpenseScope] = useState<"this_month" | "next_month" | "total">("this_month");
  const [categoryChartScope, setCategoryChartScope] = useState<"previous" | "current" | "next">("current");

  const categoryPieData = useMemo(() => {
    const today = new Date();
    const current = startOfMonth(today);
    const targetStart =
      categoryChartScope === "previous"
        ? addMonths(current, -1)
        : categoryChartScope === "next"
          ? addMonths(current, 1)
          : current;
    const targetEnd = addMonths(targetStart, 1);

    const byCategory = new Map<string, number>();
    for (const tx of transactions) {
      const d = new Date(`${tx.date}T00:00:00`);
      if (d < targetStart || d >= targetEnd) continue;
      const name = tx.category_name || "Sem categoria";
      byCategory.set(name, (byCategory.get(name) || 0) + tx.amount_cents);
    }

    const labels = Array.from(byCategory.keys());
    const values = labels.map((label) => byCategory.get(label) || 0);
    return {
      labels,
      values,
      total: values.reduce((acc, value) => acc + value, 0),
    };
  }, [transactions, categoryChartScope]);

  const categoryChartData = useMemo(
    () => ({
      labels: categoryPieData.labels,
      datasets: [
        {
          data: categoryPieData.values,
          backgroundColor: categoryPieData.labels.map((_, idx) => colors[idx % colors.length]),
          borderWidth: 1,
          borderColor: "#fff",
        },
      ],
    }),
    [categoryPieData]
  );

  const categoryChartOptions = useMemo<ChartOptions<"doughnut">>(
    () => ({
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const value = Number(ctx.raw || 0);
              const total = categoryPieData.total || 1;
              const pct = ((value / total) * 100).toFixed(2);
              return `${ctx.label}: ${centsToCurrency(value)} (${pct}%)`;
            },
          },
        },
      },
      cutout: "58%",
      maintainAspectRatio: false,
    }),
    [categoryPieData.total]
  );

  const linePoints = useMemo<LinePoint[]>(() => {
    const today = new Date();
    const current = startOfMonth(today);
    return [-3, -2, -1, 0, 1, 2, 3].map((offset) => {
      const start = addMonths(current, offset);
      const end = addMonths(start, 1);
      const value = transactions
        .filter((tx) => {
          const d = new Date(`${tx.date}T00:00:00`);
          return d >= start && d < end;
        })
        .reduce((acc, tx) => acc + tx.amount_cents, 0);
      return {
        label: start.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        value,
      };
    });
  }, [transactions]);

  const lineData = useMemo(
    () => ({
      labels: linePoints.map((point) => point.label),
      datasets: [
        {
          label: "Expenses",
          data: linePoints.map((point) => point.value),
          borderColor: "#0f766e",
          backgroundColor: "rgba(15,118,110,0.12)",
          tension: 0.35,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    }),
    [linePoints]
  );

  const lineOptions = useMemo<ChartOptions<"line">>(
    () => ({
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => centsToCurrency(Number(ctx.raw || 0)),
          },
        },
      },
      scales: {
        y: {
          ticks: {
            callback: (value) => centsToCurrency(Number(value)),
          },
        },
      },
      maintainAspectRatio: false,
    }),
    []
  );

  const categoryNameById = useMemo(
    () =>
      new Map<number, string>(
        categories.map((category) => [category.id, category.name])
      ),
    [categories]
  );

  const latestTransactions = useMemo(() => transactions.slice(0, 20), [transactions]);
  const scopedExpensesCents = useMemo(() => {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const afterNextMonthStart = new Date(today.getFullYear(), today.getMonth() + 2, 1);
    return transactions
      .filter((tx) => {
        const d = new Date(`${tx.date}T00:00:00`);
        if (expenseScope === "this_month") return d >= monthStart && d < nextMonthStart;
        if (expenseScope === "next_month") return d >= nextMonthStart && d < afterNextMonthStart;
        return d >= monthStart;
      })
      .reduce((acc, tx) => acc + tx.amount_cents, 0);
  }, [transactions, expenseScope]);

  async function loadDashboardData() {
    setLoading(true);
    setMessage("");
    try {
      const [transactionsRes, pendingRes, categoryListRes, accountsRes] = await Promise.all([
        api.get<Transaction[]>("/transactions", { headers: authHeaders }),
        api.get<PendingReviewItem[]>("/imports/pending", { headers: authHeaders }),
        api.get<Category[]>("/categories", { headers: authHeaders }),
        api.get<Account[]>("/accounts", { headers: authHeaders }),
      ]);
      setTransactions(transactionsRes.data);
      setPendingItems(pendingRes.data);
      setCategories(categoryListRes.data);
      setAccounts(accountsRes.data);
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

    setImporting(true);
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
    } finally {
      setImporting(false);
    }
  }

  function resetManualForm() {
    setManualMode("single");
    setManualDate("");
    setManualDescription("");
    setManualAmount("");
    setManualCategoryId("");
    setManualAccountId("");
    setInstallmentsCount("2");
    setIntervalMonths("1");
    setInstallmentAmountMode("total");
    setTotalAmount("");
    setAmountPerInstallment("");
  }

  async function submitManualTransaction(e: FormEvent) {
    e.preventDefault();
    setMessage("");

    if (!manualDate || !manualDescription) {
      setMessage("Fill date and description.");
      return;
    }

    const categoryId = manualCategoryId ? Number(manualCategoryId) : null;
    const accountId = manualAccountId ? Number(manualAccountId) : null;

    try {
      if (manualMode === "single") {
        if (!manualAmount) {
          setMessage("Fill amount.");
          return;
        }
        const amountCents = amountInputToCents(manualAmount);
        if (amountCents === null) {
          setMessage("Invalid amount.");
          return;
        }
        const absAmount = Math.abs(amountCents);
        if (absAmount <= 0) {
          setMessage("Invalid amount.");
          return;
        }
        await api.post(
          "/transactions",
          {
            date: manualDate,
            description: manualDescription,
            amount_cents: absAmount,
            category_id: categoryId,
            account_id: accountId,
          },
          { headers: authHeaders }
        );
      } else {
        const installments = Number(installmentsCount);
        const interval = Number(intervalMonths);
        if (!Number.isInteger(installments) || installments <= 1) {
          setMessage("Installments must be at least 2.");
          return;
        }
        if (!Number.isInteger(interval) || interval <= 0) {
          setMessage("Interval in months must be greater than 0.");
          return;
        }

        const payload: Record<string, unknown> = {
          start_date: manualDate,
          base_description: manualDescription,
          installments,
          interval_months: interval,
          category_id: categoryId,
          account_id: accountId,
        };

        if (installmentAmountMode === "total") {
          const totalCents = amountInputToCents(totalAmount);
          if (totalCents === null) {
            setMessage("Invalid total amount.");
            return;
          }
          const absTotal = Math.abs(totalCents);
          if (absTotal <= 0) {
            setMessage("Invalid total amount.");
            return;
          }
          payload.total_cents = absTotal;
        } else {
          const eachCents = amountInputToCents(amountPerInstallment);
          if (eachCents === null) {
            setMessage("Invalid amount per installment.");
            return;
          }
          const absEach = Math.abs(eachCents);
          if (absEach <= 0) {
            setMessage("Invalid amount per installment.");
            return;
          }
          payload.amount_per_installment_cents = absEach;
        }

        await api.post("/installments/groups", payload, { headers: authHeaders });
      }

      setMessage("Transaction created.");
      resetManualForm();
      setShowManual(false);
      await loadDashboardData();
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Could not create transaction.");
    }
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
      setMessage("Fill date, description and amount to update transaction.");
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
          account_id: currentTx.account_id,
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

  const cards = [
    {
      label: "Expenses",
      value: centsToCurrency(scopedExpensesCents),
      badge: expenseScope === "this_month" ? "Este mês" : expenseScope === "next_month" ? "Próximo" : "Total",
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
          <button className="ghost action-neutral" onClick={() => void loadDashboardData()}>
            Refresh
          </button>
          <button className="ghost action-neutral" onClick={onLogout}>
            Logout
          </button>
          <div className="avatar">TC</div>
        </div>
      </header>

      <main className="financy-main">
        <section className="financy-page-head">
          <h1>Welcome back. Here is your financial overview for this month.</h1>
          <div className="head-controls">
            <button className="soft" onClick={() => setShowManual((v) => !v)}>
              {showManual ? "Close manual entry" : "Add transaction"}
            </button>
            <button className="primary" onClick={() => setShowImport((v) => !v)}>
              {showImport ? "Close import" : "Import CSV/XLSX"}
            </button>
          </div>
        </section>

        {showManual ? (
          <section className="manual-box">
            <div className="panel-head">
              <h3>Add transaction</h3>
              <p>Create a single transaction or a new installment group.</p>
            </div>
            <form className="manual-form" onSubmit={submitManualTransaction}>
              <select value={manualMode} onChange={(e) => setManualMode(e.target.value as "single" | "installments")}>
                <option value="single">Single transaction</option>
                <option value="installments">Installments</option>
              </select>

              <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} required />
              <input
                placeholder={manualMode === "single" ? "Description" : "Base description"}
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                required
              />

              {manualMode === "single" ? (
                <>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Expense amount"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    required
                  />
                </>
              ) : (
                <>
                  <input
                    type="number"
                    min={2}
                    placeholder="Installments"
                    value={installmentsCount}
                    onChange={(e) => setInstallmentsCount(e.target.value)}
                    required
                  />
                  <input
                    type="number"
                    min={1}
                    placeholder="Interval (months)"
                    value={intervalMonths}
                    onChange={(e) => setIntervalMonths(e.target.value)}
                    required
                  />
                  <select
                    value={installmentAmountMode}
                    onChange={(e) => setInstallmentAmountMode(e.target.value as "total" | "per")}
                  >
                    <option value="total">Use total amount</option>
                    <option value="per">Use amount per installment</option>
                  </select>
                  {installmentAmountMode === "total" ? (
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Total amount"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value)}
                      required
                    />
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Amount per installment"
                      value={amountPerInstallment}
                      onChange={(e) => setAmountPerInstallment(e.target.value)}
                      required
                    />
                  )}
                </>
              )}

              <select value={manualCategoryId} onChange={(e) => setManualCategoryId(e.target.value)}>
                <option value="">No category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>

              <select value={manualAccountId} onChange={(e) => setManualAccountId(e.target.value)}>
                <option value="">No account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>

              <button className="primary" type="submit">
                Save transaction
              </button>
            </form>
          </section>
        ) : null}

        {showImport ? (
          <section className="import-box">
            <form className="row" onSubmit={uploadImport}>
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={importing} />
              <input
                type="password"
                placeholder="XLSX password (optional)"
                value={filePassword}
                onChange={(e) => setFilePassword(e.target.value)}
                disabled={importing}
              />
              <button type="submit" disabled={importing}>
                {importing ? "Importing..." : "Send import"}
              </button>
            </form>
            {importing ? (
              <div className="loading-inline">
                <span className="spinner" />
                <span>Processing file...</span>
              </div>
            ) : null}
          </section>
        ) : null}

        {message ? <p className="notice">{message}</p> : null}
        {loading ? (
          <div className="loading-inline notice">
            <span className="spinner" />
            <span>Loading dashboard data...</span>
          </div>
        ) : null}

        <section className="summary-grid">
          {cards.map((item) => (
            <article key={item.label} className="summary-card">
              <p>{item.label}</p>
              <div>
                <h2>{item.value}</h2>
                <span className={`badge ${item.tone}`}>{item.badge}</span>
              </div>
              <div className="summary-select-wrap">
                <select value={expenseScope} onChange={(e) => setExpenseScope(e.target.value as "this_month" | "next_month" | "total")}>
                  <option value="this_month">Este mês</option>
                  <option value="next_month">Próximo</option>
                  <option value="total">Total</option>
                </select>
              </div>
            </article>
          ))}
        </section>

        <section className="charts-grid">
          <article className="panel">
            <div className="panel-head">
              <h3>Expenses by category</h3>
              <select
                value={categoryChartScope}
                onChange={(e) => setCategoryChartScope(e.target.value as "previous" | "current" | "next")}
              >
                <option value="previous">Mês anterior</option>
                <option value="current">Este mês</option>
                <option value="next">Próximo mês</option>
              </select>
            </div>
            <div className="chart-canvas-wrap">
              <Doughnut data={categoryChartData} options={categoryChartOptions} />
            </div>
          </article>
          <ExpensesLineChart data={lineData} options={lineOptions} />
        </section>

        <section className="content-grid">
          <article className="panel wide">
            <div className="panel-head">
              <h3>All transactions</h3>
              <p>Latest 20 transactions. Use View all to open the full list.</p>
              <button className="soft" type="button" onClick={onViewAllTransactions}>
                View all
              </button>
            </div>
            <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Source</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {latestTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No transactions yet.</td>
                  </tr>
                ) : null}
                {latestTransactions.map((row) => (
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
                        row.category_name || (row.category_id ? categoryNameById.get(row.category_id) || "-" : "-")
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
                          <button className="ghost action-delete" type="button" onClick={() => void deleteTransaction(row.id)}>
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
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
