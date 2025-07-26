import { Bird } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Header = () => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="bg-white/10 backdrop-blur-sm border-b border-white/20 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-2">
            <Bird className="h-8 w-8 text-blue-400" />
            <span className="text-xl font-bold text-white">OpenBirding</span>
          </Link>

          <nav className="flex items-center space-x-4">
            <Link to="/">
              <Button variant={isActive("/") ? "default" : "ghost"} className="text-white hover:text-white">
                Home
              </Button>
            </Link>
            <Link to="/birds">
              <Button variant={isActive("/birds") ? "default" : "ghost"} className="text-white hover:text-white">
                Birds
              </Button>
            </Link>
            <Link to="/map">
              <Button variant={isActive("/map") ? "default" : "ghost"} className="text-white hover:text-white">
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
