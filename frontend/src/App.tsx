import { Component, useEffect, useState, type ReactNode } from "react";
import { TerraGuardProvider, useTerraGuard } from "@/hooks/useTerraGuard";
import { AlertProvider } from "@/context/AlertContext";
import { Shell, type PageKey, NAV } from "@/components/layout/Shell";
import { ToastStack } from "@/components/ui/primitives";
import { OverviewPage } from "@/pages/OverviewPage";
import { AnalyticsPage, LivePage } from "@/pages/LiveAndAnalyticsPages";
import { AcousticPage, AssessmentsPage, AssistantPage, CameraPage, EventsPage, SettingsPage } from "@/pages/OtherPages";
import { ReportsPage } from "@/pages/ReportsPage";
import { CriticalAlertOverlay } from "@/components/alerts/CriticalAlertOverlay";
import { AlertNotificationPopup } from "@/components/alerts/AlertNotificationPopup";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-bg p-6 text-fg">
          <div className="panel max-w-md p-6">
            <h1 className="text-lg font-semibold">TerraGuard encountered an error</h1>
            <p className="mt-2 text-xs text-fg-2">{this.state.error.message}</p>
            <button onClick={() => this.setState({ error: null })} className="mt-4 rounded-md border border-line-2 px-3 py-1.5 text-xs hover:bg-line">Try again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function pageFromHash(): PageKey {
  const h = window.location.hash.replace("#/", "").replace("#", "") as PageKey;
  return NAV.some((n) => n.key === h) ? h : "overview";
}

function Router() {
  const [page, setPage] = useState<PageKey>(pageFromHash);
  const { toasts, dismissToast } = useTerraGuard();

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (p: PageKey) => {
    window.location.hash = `/${p}`;
    setPage(p);
    window.scrollTo({ top: 0 });
  };

  const view = (() => {
    switch (page) {
      case "live": return <LivePage />;
      case "analytics": return <AnalyticsPage />;
      case "camera": return <CameraPage />;
      case "acoustic": return <AcousticPage />;
      case "assessments": return <AssessmentsPage />;
      case "events": return <EventsPage />;
      case "reports": return <ReportsPage onNavigate={navigate} />;
      case "assistant": return <AssistantPage />;
      case "settings": return <SettingsPage />;
      default: return <OverviewPage onNavigate={navigate} />;
    }
  })();

  return (
    <>
      <Shell page={page} onNavigate={navigate}>
        <div key={page} className="fade-up">{view}</div>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </Shell>
      <CriticalAlertOverlay onNavigate={navigate} />
      <AlertNotificationPopup onNavigate={navigate} />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <TerraGuardProvider>
        <AlertProvider>
          <Router />
        </AlertProvider>
      </TerraGuardProvider>
    </ErrorBoundary>
  );
}
