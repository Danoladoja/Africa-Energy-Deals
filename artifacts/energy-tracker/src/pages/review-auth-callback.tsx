import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, CheckCircle2, XCircle, Mail } from "lucide-react";
import { useReviewerAuth } from "@/contexts/reviewer-auth";

type Status = "loading" | "success" | "error";

export default function ReviewAuthCallback() {
  const [, navigate] = useLocation();
  const { refresh } = useReviewerAuth();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [requestEmail, setRequestEmail] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setStatus("error");
      setErrorMessage("No token found in the link. Please request a new sign-in link.");
      return;
    }

    fetch("/api/reviewer-auth/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then(async (data) => {
        if (data.success) {
          await refresh();
          setStatus("success");
          setTimeout(() => navigate("/review"), 1500);
        } else {
          setStatus("error");
          setErrorMessage(data.error ?? "Authentication failed. The link may have expired or already been used.");
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMessage("Network error. Please try again.");
      });
  }, []);

  const handleRequestNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestEmail) return;
    await fetch("/api/reviewer-auth/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: requestEmail }),
    });
    setRequestSent(true);
  };

  return (
    <div className="min-h-screen bg-[#0b0f1a] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-[#00e676] font-bold text-lg mb-1">
            <span className="w-2 h-2 rounded-full bg-[#00e676]" />
            AfriEnergy
          </div>
          <p className="text-slate-400 text-sm">Review Portal</p>
        </div>

        <div className="bg-[#141924] rounded-2xl border border-white/5 p-8 text-center">
          {status === "loading" && (
            <>
              <Loader2 className="w-12 h-12 text-[#00e676] animate-spin mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-white mb-2">Signing you in…</h1>
              <p className="text-slate-400 text-sm">Verifying your sign-in link, please wait.</p>
            </>
          )}

          {status === "success" && (
            <>
              <CheckCircle2 className="w-12 h-12 text-[#00e676] mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-white mb-2">Signed in successfully</h1>
              <p className="text-slate-400 text-sm">Redirecting you to the review portal…</p>
            </>
          )}

          {status === "error" && (
            <>
              <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-white mb-2">Link invalid or expired</h1>
              <p className="text-slate-400 text-sm mb-6">{errorMessage}</p>

              {requestSent ? (
                <div className="flex items-center justify-center gap-2 text-[#00e676] text-sm">
                  <Mail className="w-4 h-4" />
                  Check your inbox for a new sign-in link.
                </div>
              ) : (
                <form onSubmit={handleRequestNew} className="space-y-3">
                  <p className="text-slate-300 text-sm font-medium">Request a new sign-in link</p>
                  <input
                    type="email"
                    value={requestEmail}
                    onChange={(e) => setRequestEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    className="w-full px-4 py-2.5 bg-[#0b0f1a] border border-white/10 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#00e676]/50"
                  />
                  <button
                    type="submit"
                    className="w-full px-4 py-2.5 bg-[#00e676] hover:bg-[#00c45a] text-[#0b0f1a] rounded-xl font-semibold text-sm transition-colors"
                  >
                    Send new link
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
