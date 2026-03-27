import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";

const SESSION_KEY = "afrienergy_session_token";
const EMAIL_KEY = "afrienergy_user_email";

const API = "/api";

interface AuthContextType {
  email: string | null;
  sessionToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  role: string | null;
  isReviewer: boolean;
  login: (email: string, sessionToken: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  email: null,
  sessionToken: null,
  isAuthenticated: false,
  isLoading: true,
  role: null,
  isReviewer: false,
  login: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const verifiedRef = useRef(false);

  useEffect(() => {
    if (verifiedRef.current) return;
    verifiedRef.current = true;

    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) {
      setIsLoading(false);
      return;
    }

    fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then((r) => {
        if (!r.ok) {
          localStorage.removeItem(SESSION_KEY);
          localStorage.removeItem(EMAIL_KEY);
          return null;
        }
        return r.json() as Promise<{ authenticated: boolean; email?: string; role?: string }>;
      })
      .then((data) => {
        if (!data) return;
        if (data.authenticated && data.email) {
          setSessionToken(stored);
          setEmail(data.email);
          setRole(data.role ?? "user");
          localStorage.setItem(EMAIL_KEY, data.email);
        } else {
          localStorage.removeItem(SESSION_KEY);
          localStorage.removeItem(EMAIL_KEY);
        }
      })
      .catch(() => {
        console.warn("Auth check failed due to network/CORS — session token preserved.");
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = (newEmail: string, token: string) => {
    localStorage.setItem(SESSION_KEY, token);
    localStorage.setItem(EMAIL_KEY, newEmail);
    setEmail(newEmail);
    setSessionToken(token);
  };

  const logout = async () => {
    const token = sessionToken ?? localStorage.getItem(SESSION_KEY);
    if (token) {
      try {
        await fetch(`${API}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(EMAIL_KEY);
    setEmail(null);
    setSessionToken(null);
    setRole(null);
  };

  const isReviewer = role === "reviewer" || role === "admin-reviewer";

  return (
    <AuthContext.Provider
      value={{ email, sessionToken, isAuthenticated: !!sessionToken, isLoading, role, isReviewer, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = getSessionToken();
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
