import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Header from "./components/Header";
import Home from "./pages/Home";
import Map from "./pages/Map";
import Region from "./pages/Region";
import Place from "./pages/Place";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import HotspotDetails from "./components/HotspotDetails";
import { useModalActions } from "./lib/modalStore";
import { get } from "./lib/utils";

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
  const { clickOutside } = useModalActions();
  const location = useLocation();

  const isAuthPage = ["/login", "/signup"].includes(location.pathname);

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-white"
      onClick={clickOutside}
    >
      {!isAuthPage && <Header />}
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/map" element={<Map />} />
          <Route path="/region/:regionCode" element={<Region />} />
          <Route path="/place/:placeName/:coordinates" element={<Place />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AppContent />
        <HotspotDetails />
        <Toaster position="top-right" />
      </Router>
    </QueryClientProvider>
  );
}

export default App;
