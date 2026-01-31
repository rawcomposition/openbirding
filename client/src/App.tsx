import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Header from "./components/Header";
import Home from "./pages/Home";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import NotFound from "./pages/NotFound";
import ErrorBoundary from "./components/ErrorBoundary";
import { get } from "./lib/utils";
import BirdFinder from "@/pages/BirdFinder";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      gcTime: 24 * 24 * 60 * 60 * 1000,
      staleTime: 0,
      queryFn: async ({ queryKey }) => {
        const url = queryKey[0] as string;
        return get(url, (queryKey[1] || {}) as Record<string, string | number | boolean>);
      },
    },
  },
});

function AppContent() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900">
      <Header />
      <main>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/bird-finder" element={<BirdFinder />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Router>
          <AppContent />
        </Router>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
