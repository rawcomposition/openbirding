import { Bird } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Header2 = () => {
  return (
    <header className="bg-slate-900/95 border-b border-slate-700/50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-2">
            <Bird className="h-8 w-8 text-emerald-400" />
            <span className="text-xl font-bold text-white">OpenBirding</span>
          </Link>

          <div className="flex items-center">
            <Button asChild variant="ghost" className="text-slate-100 hover:text-white hover:bg-slate-800/50">
              <a href="https://apps.apple.com/us/app/openbirding/id6755897167">Download App</a>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header2;
