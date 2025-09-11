import { Bird } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AuthWrapperProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  hideHeader?: boolean;
};

const AuthWrapper = ({ title, description, children, hideHeader = false }: AuthWrapperProps) => {
  return (
    <div className="min-h-screen flex items-start justify-center px-4 pt-4 sm:pt-24 md:pt-32 pb-4">
      <div className="w-full max-w-md">
        <Card className="bg-white border-slate-200">
          {!hideHeader && (
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <Bird className="h-12 w-12 text-emerald-600" />
              </div>
              <CardTitle className="text-2xl font-bold text-slate-900">{title}</CardTitle>
              <CardDescription className="text-slate-700">{description}</CardDescription>
            </CardHeader>
          )}
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </div>
  );
};

export { AuthWrapper };
