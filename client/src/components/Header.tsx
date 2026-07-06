import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { cn } from "@/lib/utils";

const Header2 = () => {
  // Full-page map tools get an uncontained header: logo hard left, links hard right.
  const fullBleed = useLocation().pathname === "/best-hotspots";
  return (
    <header className="bg-white/90 backdrop-blur border-b border-slate-200 sticky top-0 z-50">
      <div className={cn("px-4 sm:px-6 lg:px-8", !fullBleed && "max-w-7xl mx-auto")}>
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-2">
            <Logo className="h-8 w-8" />
            <span className="text-xl font-bold text-slate-900">OpenBirding</span>
          </Link>

          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" className="text-slate-700 hover:text-emerald-700 hover:bg-emerald-50">
              <Link to="/bird-finder">Bird Finder</Link>
            </Button>
            <Button asChild variant="ghost" className="text-slate-700 hover:text-emerald-700 hover:bg-emerald-50">
              <Link to="/best-hotspots">Best Hotspots</Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              className="hidden sm:inline-flex text-slate-700 hover:text-emerald-700 hover:bg-emerald-50"
            >
              <a href="https://apps.apple.com/us/app/openbirding/id6755897167">Download App</a>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header2;
