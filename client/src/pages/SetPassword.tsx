import { useSearchParams, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/Form";
import { FormInput } from "@/components/FormInput";
import { AuthWrapper } from "@/components/AuthWrapper";
import { mutate } from "@/lib/utils";
import toast from "react-hot-toast";

type SetPasswordFormData = {
  password: string;
  confirmPassword: string;
};

const SetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const form = useForm<SetPasswordFormData>({
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const setPasswordMutation = useMutation({
    mutationFn: async (data: { token: string; password: string }) => {
      return mutate("POST", "/auth/reset-password", data);
    },
    onSuccess: (data) => {
      navigate("/login", {
        state: {
          message: "Password reset successfully! You can now log in with your new password.",
          email: typeof data.email === "string" ? data.email : undefined,
        },
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to reset password");
    },
  });

  const onSubmit = (data: SetPasswordFormData) => {
    const token = searchParams.get("token");

    if (!token) {
      toast.error("No reset token provided.");
      return;
    }

    if (data.password !== data.confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    if (data.password.length < 8) {
      toast.error("Password must be at least 8 characters long.");
      return;
    }

    setPasswordMutation.mutate({ token, password: data.password });
  };

  const token = searchParams.get("token");
  if (!token) {
    return (
      <AuthWrapper title="Invalid Reset Link" description="The reset link is invalid or has expired" hideHeader>
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <Lock className="h-16 w-16 text-red-500" />
          </div>
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900">Invalid Reset Link</h2>
            <p className="text-slate-700">
              The password reset link is invalid or has expired. Please request a new reset link.
            </p>
            <Button
              onClick={() => navigate("/forgot-password")}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Request New Reset Link
            </Button>
          </div>
        </div>
      </AuthWrapper>
    );
  }

  return (
    <AuthWrapper title="Reset Password" description="Enter your new password">
      <Form form={form} onSubmit={onSubmit} className="space-y-4">
        <FormInput
          name="password"
          type="password"
          placeholder="Enter new password"
          icon={<Lock className="h-4 w-4" />}
          className="bg-white border-slate-300 text-slate-900 placeholder:text-slate-500"
          required
          autoFocus
        />

        <FormInput
          name="confirmPassword"
          type="password"
          placeholder="Confirm new password"
          icon={<Lock className="h-4 w-4" />}
          className="bg-white border-slate-300 text-slate-900 placeholder:text-slate-500"
          required
        />

        <Button
          type="submit"
          disabled={setPasswordMutation.isPending}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {setPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
        </Button>
      </Form>
    </AuthWrapper>
  );
};

export default SetPassword;
