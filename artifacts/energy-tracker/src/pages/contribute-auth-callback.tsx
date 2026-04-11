import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Layout } from "@/components/layout";

const API = "/api";

export default function ContributeAuthCallbackPage() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setErrorMsg("No token provided. Please request a new sign-in link.");
      setStatus("error");
      return;
    }

    fetch(`${API}/contributor-auth/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setStatus("success");
          setTimeout(() => navigate("/contribute"), 1500);
        } else {
          setErrorMsg(data.error ?? "Authentication failed. Please request a new link.");
          setStatus("error");
        }
      })
      .catch(() => {
        setErrorMsg("Network error. Please try again.");
        setStatus("error");
      });
  }, []);

  return (
    <Layout>
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-sm">
          {status === "loading" && (
            <>
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-3" />
              <p className="text-muted-foreground">Signing you in…</p>
            </>
          )}
          {status === "success" && (
            <>
              <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
              <p className="text-foreground font-medium">Signed in! Redirecting…</p>
            </>
          )}
          {status === "error" && (
            <>
              <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
              <p className="text-red-400 font-medium mb-2">Sign-in failed</p>
              <p className="text-muted-foreground text-sm mb-4">{errorMsg}</p>
              <a href="/contribute" className="text-primary hover:underline text-sm">
                ← Back to contribute
              </a>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
