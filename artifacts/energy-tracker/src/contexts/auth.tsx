import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

const STORAGE_KEY = "afrienergy_user_email";

interface AuthContextType {
  email: string | null;
  isAuthenticated: boolean;
  login: (email: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  email: null,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const login = (newEmail: string) => {
    localStorage.setItem(STORAGE_KEY, newEmail);
    setEmail(newEmail);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setEmail(null);
  };

  return (
    <AuthContext.Provider value={{ email, isAuthenticated: !!email, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
