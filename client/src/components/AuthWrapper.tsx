import { Bird } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AuthWrapperProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

const AuthWrapper = ({ title, description, children }: AuthWrapperProps) => {
  return (
    <div className="min-h-screen flex items-start justify-center px-4 pt-4 sm:pt-24 md:pt-32">
      <div className="w-full max-w-md">
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Bird className="h-12 w-12 text-emerald-400" />
            </div>
            <CardTitle className="text-2xl font-bold text-white">{title}</CardTitle>
            <CardDescription className="text-slate-300">{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </div>
  );
};

export { AuthWrapper };
