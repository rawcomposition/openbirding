import { Bird } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Header = () => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="bg-slate-900/95 border-b border-slate-700/50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-2">
            <Bird className="h-8 w-8 text-emerald-400" />
            <span className="text-xl font-bold text-white">OpenBirding</span>
          </Link>

          <nav className="flex items-center space-x-4">
            <Link to="/">
              <Button
                variant={isActive("/") ? "default" : "ghost"}
                className={
                  isActive("/")
                    ? "bg-slate-700/50 hover:bg-slate-600/50 text-white border-slate-600"
                    : "text-slate-100 hover:text-white hover:bg-slate-800/50"
                }
              >
                Home
              </Button>
            </Link>
            <Link to="/hotspots">
              <Button
                variant={isActive("/hotspots") ? "default" : "ghost"}
                className={
                  isActive("/hotspots")
                    ? "bg-slate-700/50 hover:bg-slate-600/50 text-white border-slate-600"
                    : "text-slate-100 hover:text-white hover:bg-slate-800/50"
                }
              >
                Hotspots
              </Button>
            </Link>
            <Link to="/map">
              <Button
                variant={isActive("/map") ? "default" : "ghost"}
                className={
                  isActive("/map")
                    ? "bg-slate-700/50 hover:bg-slate-600/50 text-white border-slate-600"
                    : "text-slate-100 hover:text-white hover:bg-slate-800/50"
                }
              >
                Map
              </Button>
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
