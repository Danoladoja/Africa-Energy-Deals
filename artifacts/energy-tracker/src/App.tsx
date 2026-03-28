import { lazy, Suspense, useEffect, Component, type ErrorInfo, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminAuthProvider, useAdminAuth } from "@/contexts/admin-auth";
import { AuthProvider, useAuth } from "@/contexts/auth";
import { ThemeProvider } from "@/contexts/theme";
import { AdminLockScreen } from "@/components/admin-lock-screen";
import { Layout } from "@/components/layout";

import Landing from "@/pages/landing";
import AuthVerify from "@/pages/auth-verify";
import NotFound from "@/pages/not-found";

const Dashboard        = lazy(() => import("@/pages/dashboard"));
const DealTracker      = lazy(() => import("@/pages/deal-tracker"));
const DealDetail       = lazy(() => import("@/pages/deal-detail"));
const CountriesIndex   = lazy(() => import("@/pages/countries"));
const CountryProfile   = lazy(() => import("@/pages/country-profile"));
const DevelopersIndex  = lazy(() => import("@/pages/developers"));
const DeveloperProfile = lazy(() => import("@/pages/developer-profile"));
const MapPage          = lazy(() => import("@/pages/map"));
const VizStudio        = lazy(() => import("@/pages/viz-studio"));
const DiscoveryPage    = lazy(() => import("@/pages/discovery"));
const WatchesPage      = lazy(() => import("@/pages/watches"));
const EmbedDeals       = lazy(() => import("@/pages/embed-deals"));
const EmbedChart       = lazy(() => import("@/pages/embed-chart"));
const ApiDocsPage      = lazy(() => import("@/pages/api-docs"));
const AdminScraperPage = lazy(() => import("@/pages/admin-scraper"));
const ComparePage      = lazy(() => import("@/pages/compare"));
const ReviewDashboard  = lazy(() => import("@/pages/review"));
const ReviewQueue      = lazy(() => import("@/pages/review-queue"));
const ReviewItem       = lazy(() => import("@/pages/review-item"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    }
  }
});

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0b0f1a]">
      <div className="w-8 h-8 border-2 border-[#00e676]/30 border-t-[#00e676] rounded-full animate-spin" />
    </div>
  );
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App Error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", background: "#0b0f1a", color: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px", padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: "48px" }}>⚠️</div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#f1f5f9" }}>Something went wrong</h1>
          <p style={{ color: "#94a3b8", maxWidth: "480px", fontSize: "14px" }}>{this.state.error?.message}</p>
          <button
            onClick={() => window.location.reload()}
            style={{ background: "#00e676", color: "#0b0f1a", border: "none", padding: "10px 28px", borderRadius: "8px", cursor: "pointer", fontWeight: 700, fontSize: "14px" }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function CompareRedirect() {
  const [, nav] = useLocation();
  useEffect(() => { nav("/countries?tab=compare"); }, []);
  return null;
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAdmin, isLoading } = useAdminAuth();
  if (isLoading) return null;
  if (!isAdmin) {
    return (
      <Layout>
        <AdminLockScreen />
      </Layout>
    );
  }
  return <Component />;
}

function ReviewerRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate("/");
  }, [isAuthenticated, isLoading, navigate]);
  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return null;
  return <Component />;
}

function AuthRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return null;
  return <Component />;
}

function GA4() {
  const measurementId = import.meta.env.VITE_GA4_MEASUREMENT_ID;
  useEffect(() => {
    if (!measurementId) return;

    const script1 = document.createElement("script");
    script1.async = true;
    script1.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script1);

    const script2 = document.createElement("script");
    script2.innerHTML = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${measurementId}');
    `;
    document.head.appendChild(script2);

    return () => {
      document.head.removeChild(script1);
      document.head.removeChild(script2);
    };
  }, [measurementId]);

  return null;
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/dashboard">
          {() => <AuthRoute component={Dashboard} />}
        </Route>
        <Route path="/deals">
          {() => <AuthRoute component={DealTracker} />}
        </Route>
        <Route path="/deals/:id">
          {() => <AuthRoute component={DealDetail} />}
        </Route>
        <Route path="/countries">
          {() => <AuthRoute component={CountriesIndex} />}
        </Route>
        <Route path="/countries/:countryName">
          {() => <AuthRoute component={CountryProfile} />}
        </Route>
        <Route path="/compare" component={CompareRedirect} />
        <Route path="/developers">
          {() => <AuthRoute component={DevelopersIndex} />}
        </Route>
        <Route path="/developers/:entityName">
          {() => <AuthRoute component={DeveloperProfile} />}
        </Route>
        <Route path="/map">
          {() => <AuthRoute component={MapPage} />}
        </Route>
        <Route path="/studio">
          {() => <AuthRoute component={VizStudio} />}
        </Route>
        <Route path="/discovery">
          {() => <AdminRoute component={DiscoveryPage} />}
        </Route>
        <Route path="/watches">
          {() => <AuthRoute component={WatchesPage} />}
        </Route>
        <Route path="/auth/verify" component={AuthVerify} />
        <Route path="/embed/deals">
          {() => (
            <Suspense fallback={null}>
              <EmbedDeals />
            </Suspense>
          )}
        </Route>
        <Route path="/embed/chart">
          {() => (
            <Suspense fallback={null}>
              <EmbedChart />
            </Suspense>
          )}
        </Route>
        <Route path="/api-docs" component={ApiDocsPage} />
        <Route path="/admin/scraper">
          {() => <AdminRoute component={AdminScraperPage} />}
        </Route>
        <Route path="/review">
          {() => <ReviewerRoute component={ReviewDashboard} />}
        </Route>
        <Route path="/review/queue/:id">
          {() => <ReviewerRoute component={ReviewItem} />}
        </Route>
        <Route path="/review/queue">
          {() => <ReviewerRoute component={ReviewQueue} />}
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <AdminAuthProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <GA4 />
                <Router />
              </WouterRouter>
            </AdminAuthProvider>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
