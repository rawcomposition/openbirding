import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";

// Tool links removed for now — tools are linked from elsewhere. Logo left,
// Download App right; single 4rem line at every width so full-page map tools
// can size themselves against it.
const Header2 = () => {
  return (
    <header className="bg-white/90 backdrop-blur border-b border-slate-200 sticky top-0 z-50">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-2">
            <Logo className="h-8 w-8" />
            <span className="text-xl font-bold text-slate-900">OpenBirding</span>
          </Link>
          <Button asChild variant="ghost" className="text-slate-700 hover:text-emerald-700 hover:bg-emerald-50">
            <a href="https://apps.apple.com/us/app/openbirding/id6755897167">Download App</a>
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header2;
