import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

interface BreadcrumbItem {
  name: string;
  id: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

const Breadcrumb = ({ items }: BreadcrumbProps) => {
  return (
    <nav className="flex items-center space-x-2 text-sm text-slate-500 mb-4">
      <Link to="/region/world" className="flex items-center hover:text-emerald-600 transition-colors">
        World
      </Link>

      {[...items].reverse().map((item) => (
        <div key={item.id} className="flex items-center space-x-2">
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <Link to={`/region/${item.id}`} className="hover:text-emerald-600 transition-colors">
            {item.name}
          </Link>
        </div>
      ))}
    </nav>
  );
};

export default Breadcrumb;
