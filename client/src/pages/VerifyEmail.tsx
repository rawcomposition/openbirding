import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AuthWrapper } from "@/components/AuthWrapper";
import { CheckCircle, Mail } from "lucide-react";
import toast from "react-hot-toast";
import { useMutation } from "@tanstack/react-query";
import { mutate } from "@/lib/utils";

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const verifyEmailMutation = useMutation({
    mutationFn: async (token: string) => {
      return mutate("POST", "/auth/verify-email", { token });
    },
  });

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      toast.error("No verification token provided.");
      return;
    }

    verifyEmailMutation.mutate(token);
  }, [searchParams]);

  const handleLogin = () => {
    navigate("/login", {
      state: {
        email: verifyEmailMutation.data?.email,
      },
    });
  };

  if (verifyEmailMutation.isPending) {
    return (
      <AuthWrapper title="Verifying Email" description="Please wait while we verify your email address" hideHeader>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      </AuthWrapper>
    );
  }

  if (verifyEmailMutation.isSuccess) {
    return (
      <AuthWrapper title="Email Verification" description="Complete your account setup" hideHeader>
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <CheckCircle className="h-16 w-16 text-emerald-500" />
          </div>
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900">Email Verified!</h2>
            <p className="text-slate-700">
              {typeof verifyEmailMutation.data.message === "string"
                ? verifyEmailMutation.data.message
                : "You can now log in to your account."}
            </p>
            <Button onClick={handleLogin} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
              Continue to Login
            </Button>
          </div>
        </div>
      </AuthWrapper>
    );
  }

  if (verifyEmailMutation.isError) {
    return (
      <AuthWrapper title="Email Verification" description="Complete your account setup" hideHeader>
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <Mail className="h-16 w-16 text-red-500" />
          </div>
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900">Verification Failed</h2>
            <p className="text-slate-700">
              {verifyEmailMutation.error instanceof Error ? verifyEmailMutation.error.message : "Verification failed"}
            </p>
            <div className="space-y-2">
              <Button
                onClick={() => navigate("/login")}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Go to Login
              </Button>
              <Button onClick={() => navigate("/signup")} variant="outline" className="w-full">
                Create New Account
              </Button>
            </div>
          </div>
        </div>
      </AuthWrapper>
    );
  }

  return null;
};

export default VerifyEmail;
