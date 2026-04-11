import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface ReviewerInfo {
  id: number;
  email: string;
  displayName: string | null;
}

interface ReviewerAuthContextType {
  reviewer: ReviewerInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const ReviewerAuthContext = createContext<ReviewerAuthContextType>({
  reviewer: null,
  isAuthenticated: false,
  isLoading: true,
  refresh: async () => {},
  logout: async () => {},
});

async function fetchMe(): Promise<ReviewerInfo | null> {
  try {
    const r = await fetch("/api/reviewer-auth/me", { credentials: "include" });
    if (!r.ok) return null;
    const data = await r.json();
    if (data.authenticated && data.reviewer) return data.reviewer as ReviewerInfo;
    return null;
  } catch {
    return null;
  }
}

export function ReviewerAuthProvider({ children }: { children: ReactNode }) {
  const [reviewer, setReviewer] = useState<ReviewerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    const r = await fetchMe();
    setReviewer(r);
  };

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, []);

  const refresh = async () => {
    const r = await fetchMe();
    setReviewer(r);
  };

  const logout = async () => {
    try {
      await fetch("/api/reviewer-auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    setReviewer(null);
  };

  return (
    <ReviewerAuthContext.Provider value={{ reviewer, isAuthenticated: !!reviewer, isLoading, refresh, logout }}>
      {children}
    </ReviewerAuthContext.Provider>
  );
}

export function useReviewerAuth() {
  return useContext(ReviewerAuthContext);
}
