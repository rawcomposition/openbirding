import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BirdList from "./components/BirdList";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 text-white">
        <header className="text-center py-8 px-4 bg-black/10 backdrop-blur-sm">
          <h1 className="text-4xl font-bold mb-2 drop-shadow-lg">OpenBirding</h1>
          <p className="text-xl opacity-90">Discover and track birds in your area</p>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8">
          <BirdList />
        </main>
      </div>
    </QueryClientProvider>
  );
}

export default App;
