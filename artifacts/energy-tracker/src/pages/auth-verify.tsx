import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/auth";

const API = "/api";
const PENDING_REDIRECT_KEY = "afrienergy_pending_redirect";

export default function AuthVerify() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setStatus("error");
      setMessage("No token provided. This link may be invalid.");
      return;
    }

    fetch(`${API}/auth/verify?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: { success?: boolean; sessionToken?: string; email?: string; error?: string }) => {
        if (data.success && data.sessionToken && data.email) {
          login(data.email, data.sessionToken);
          setStatus("success");
          setMessage(`Welcome, ${data.email}!`);

          const redirect = localStorage.getItem(PENDING_REDIRECT_KEY) ?? "/dashboard";
          localStorage.removeItem(PENDING_REDIRECT_KEY);

          setTimeout(() => navigate(redirect), 1200);
        } else {
          setStatus("error");
          setMessage(data.error ?? "This link is invalid or has expired. Please request a new one.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Network error. Please try again.");
      });
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="bg-popover border border-border rounded-2xl p-10 w-full max-w-sm text-center shadow-2xl">
        {status === "loading" && (
          <>
            <Loader2 className="w-12 h-12 text-[#00e676] animate-spin mx-auto mb-5" />
            <h2 className="text-xl font-bold mb-2">Verifying your link…</h2>
            <p className="text-muted-foreground/70 text-sm">Please wait a moment.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-[#00e676]/15 border border-[#00e676]/30 mb-5 mx-auto">
              <CheckCircle2 className="w-7 h-7 text-[#00e676]" />
            </div>
            <h2 className="text-xl font-bold mb-2">You're signed in!</h2>
            <p className="text-muted-foreground/70 text-sm mb-1">{message}</p>
            <p className="text-muted-foreground/50 text-xs">Redirecting you now…</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-red-500/10 border border-red-500/20 mb-5 mx-auto">
              <XCircle className="w-7 h-7 text-red-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">Link invalid</h2>
            <p className="text-muted-foreground text-sm mb-6">{message}</p>
            <button
              onClick={() => navigate("/")}
              className="inline-flex items-center gap-2 bg-[#00e676] text-[#0b0f1a] font-semibold px-5 py-2.5 rounded-xl hover:bg-[#00c864] transition-colors text-sm"
            >
              Back to Home
            </button>
          </>
        )}
      </div>
    </div>
  );
}
