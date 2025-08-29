import { Bird, LogOut, User } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMutation } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/authStore";
import { mutate } from "@/lib/utils";
import toast from "react-hot-toast";

const Header = () => {
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const logoutMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      await mutate("POST", "/auth/logout");
    },
    onSuccess: () => {
      logout();
      toast.success("Logged out successfully");
    },
    onError: (error: Error) => {
      console.error("Logout error:", error);
      logout();
    },
  });

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <header className="bg-slate-900/95 border-b border-slate-700/50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-2">
            <Bird className="h-8 w-8 text-emerald-400" />
            <span className="text-xl font-bold text-white">Open Birding</span>
          </Link>

          <div className="flex items-center space-x-4">
            <nav className="hidden md:flex items-center space-x-4">
              <Button
                asChild
                variant={isActive("/") ? "default" : "ghost"}
                className={
                  isActive("/")
                    ? "bg-slate-700/50 hover:bg-slate-600/50 text-white border-slate-600"
                    : "text-slate-100 hover:text-white hover:bg-slate-800/50"
                }
              >
                <Link to="/">Home</Link>
              </Button>
              <Button
                asChild
                variant={isActive("/map") ? "default" : "ghost"}
                className={
                  isActive("/map")
                    ? "bg-slate-700/50 hover:bg-slate-600/50 text-white border-slate-600"
                    : "text-slate-100 hover:text-white hover:bg-slate-800/50"
                }
              >
                <Link to="/map">Map</Link>
              </Button>
            </nav>

            <div className="flex items-center space-x-2">
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-10 w-10 rounded-full p-0 hover:bg-slate-800/50">
                      <User className="h-5 w-5 text-slate-300" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-slate-800 border-slate-700">
                    <div className="flex items-center px-2 py-1.5 text-sm text-slate-300">
                      <User className="h-4 w-4 mr-2" />
                      {user.email}
                    </div>
                    <DropdownMenuSeparator className="bg-slate-700" />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      disabled={logoutMutation.isPending}
                      className="text-slate-300 hover:text-white hover:bg-slate-700 focus:bg-slate-700 focus:text-white"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      {logoutMutation.isPending ? "Logging out..." : "Logout"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button asChild className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Link to="/login">Login</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
