import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminAuthProvider, useAdminAuth } from "@/contexts/admin-auth";
import { AuthProvider, useAuth } from "@/contexts/auth";
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
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
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
  );
}

export default App;
