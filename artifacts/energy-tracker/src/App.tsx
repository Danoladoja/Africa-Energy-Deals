import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminAuthProvider, useAdminAuth } from "@/contexts/admin-auth";
import { AuthProvider, useAuth } from "@/contexts/auth";
import { AdminLockScreen } from "@/components/admin-lock-screen";
import { Layout } from "@/components/layout";

import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import DealTracker from "@/pages/deal-tracker";
import MapPage from "@/pages/map";
import VizStudio from "@/pages/viz-studio";
import DiscoveryPage from "@/pages/discovery";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    }
  }
});

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
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

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
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/dashboard">
        {() => <AuthRoute component={Dashboard} />}
      </Route>
      <Route path="/deals">
        {() => <AuthRoute component={DealTracker} />}
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
      <Route component={NotFound} />
    </Switch>
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
