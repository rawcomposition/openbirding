import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Header from "./components/Header";
import Home from "./pages/Home";
import Hotspots from "./pages/Hotspots";
import Map from "./pages/Map";
import AddHotspot from "./pages/AddHotspot";
import { get } from "./lib/utils";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      gcTime: 24 * 24 * 60 * 60 * 1000,
      staleTime: 0,
      queryFn: async ({ queryKey }) => {
        const url = queryKey[0] as string;
        const fullUrl = url.startsWith("/") ? `${import.meta.env.VITE_API_URL || "http://localhost:3000"}${url}` : url;
        return get(fullUrl, (queryKey[1] || {}) as Record<string, string | number | boolean>);
      },
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-white">
          <Header />
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/hotspots" element={<Hotspots />} />
              <Route path="/map" element={<Map />} />
              <Route path="/add-hotspot" element={<AddHotspot />} />
            </Routes>
          </main>
        </div>
        <Toaster position="top-right" />
      </Router>
    </QueryClientProvider>
  );
}

export default App;
