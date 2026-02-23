import axios from "axios";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Dashboard } from "./Dashboard";
import { TransactionsPage } from "./TransactionsPage";
import "./dashboard.css";
import "./styles.css";

export function App() {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
  const api = useMemo(() => axios.create({ baseURL: apiBaseUrl }), [apiBaseUrl]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState(() => localStorage.getItem("cashlab_token") || "");
  const [page, setPage] = useState<"dashboard" | "transactions">(
    () => (window.location.hash === "#/transactions" ? "transactions" : "dashboard")
  );

  useEffect(() => {
    function onHashChange() {
      setPage(window.location.hash === "#/transactions" ? "transactions" : "dashboard");
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  async function login(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      const res = await api.post("/auth/login", { email, password });
      const accessToken = res.data.access_token as string;
      localStorage.setItem("cashlab_token", accessToken);
      setToken(accessToken);
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Invalid credentials.");
    }
  }

  function logout() {
    localStorage.removeItem("cashlab_token");
    setToken("");
    window.location.hash = "#/";
    setPage("dashboard");
  }

  async function registerFromButton() {
    setMessage("");
    try {
      await api.post("/auth/register", { email, password });
      setMessage("User registered. You can login now.");
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Could not register user.");
    }
  }

  if (!token) {
    return (
      <main className="layout">
        <section className="card">
          <h1>CashLabs</h1>
          <p>Login or create your account to access the dashboard.</p>
          {message ? <p>{message}</p> : null}
          <form className="row" onSubmit={login}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
            <button type="submit">Login</button>
            <button type="button" onClick={() => void registerFromButton()}>
              Register
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (page === "transactions") {
    return (
      <TransactionsPage
        token={token}
        apiBaseUrl={apiBaseUrl}
        onLogout={logout}
        onBack={() => {
          window.location.hash = "#/";
          setPage("dashboard");
        }}
      />
    );
  }

  return (
    <Dashboard
      token={token}
      apiBaseUrl={apiBaseUrl}
      onLogout={logout}
      onViewAllTransactions={() => {
        window.location.hash = "#/transactions";
        setPage("transactions");
      }}
    />
  );
}
