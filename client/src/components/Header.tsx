import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import Logo from "@/components/Logo";

type NavItem = {
  label: string;
  description?: string;
} & ({ to: string } | { href: string });

type NavSection = {
  label: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    label: "Tools",
    items: [
      { label: "Best Hotspots", to: "/best-hotspots", description: "Find top birding spots near you" },
      { label: "Bird Finder", to: "/bird-finder", description: "Track down a specific species" },
    ],
  },
  {
    label: "Apps",
    items: [
      {
        label: "Mobile Hotspot Explorer",
        href: "https://apps.apple.com/us/app/openbirding/id6755897167",
        description: "Explore hotspots on the go",
      },
      { label: "Trip Planner", href: "https://birdplan.app", description: "Plan your next birding trip" },
    ],
  },
  {
    label: "Develop",
    items: [
      { label: "Avicommons", href: "https://avicommons.org/", description: "Curated bird thumbnails for your apps" },
    ],
  },
];

const NavItemLink = ({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) => {
  const className = "flex flex-col gap-0.5 rounded-sm px-3 py-1.5 hover:bg-emerald-50 transition-colors";
  const content = (
    <>
      <span className="font-medium text-slate-900">{item.label}</span>
      {item.description && <span className="text-xs text-slate-500">{item.description}</span>}
    </>
  );

  return "to" in item ? (
    <Link to={item.to} onClick={onNavigate} className={className}>
      {content}
    </Link>
  ) : (
    <a href={item.href} target="_blank" rel="noreferrer" onClick={onNavigate} className={className}>
      {content}
    </a>
  );
};

const NavDropdown = ({ section }: { section: NavSection }) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "text-slate-700 hover:text-emerald-700 hover:bg-emerald-50",
            open && "text-emerald-700 bg-emerald-50"
          )}
        >
          {section.label}
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        {section.items.map((item) => (
          <NavItemLink key={item.label} item={item} onNavigate={() => setOpen(false)} />
        ))}
      </PopoverContent>
    </Popover>
  );
};

const MobileMenu = () => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Menu"
          className="text-slate-700 hover:text-emerald-700 hover:bg-emerald-50"
        >
          {open ? <X /> : <Menu />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 px-1.5 py-2.5">
        {sections.map((section, i) => (
          <div
            key={section.label}
            className={cn(i === 0 ? "pt-1.5" : "mt-1 border-t border-slate-200 pt-3")}
          >
            <div className="px-3 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
              {section.label}
            </div>
            {section.items.map((item) => (
              <NavItemLink key={item.label} item={item} onNavigate={() => setOpen(false)} />
            ))}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
};

const Header = () => {
  return (
    <header className="bg-white/90 backdrop-blur border-b border-slate-200 sticky top-0 z-50">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center space-x-2">
              <Logo className="h-8 w-8" />
              <span className="text-xl font-bold text-slate-900">OpenBirding</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {sections.map((section) => (
                <NavDropdown key={section.label} section={section} />
              ))}
            </nav>
          </div>
          <div className="md:hidden">
            <MobileMenu />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
