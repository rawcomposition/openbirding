import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-screen px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-gray-400 mb-6">Page Not Found</h2>
        <p className="text-gray-300 mb-8 max-w-md">The page you're looking for doesn't exist or has been moved.</p>
        <Button asChild variant="default">
          <Link to="/">Go Home</Link>
        </Button>
      </div>
    </div>
  );
}
