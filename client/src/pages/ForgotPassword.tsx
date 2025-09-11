import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/Form";
import { FormInput } from "@/components/FormInput";
import { AuthWrapper } from "@/components/AuthWrapper";
import { mutate } from "@/lib/utils";
import toast from "react-hot-toast";

type ForgotPasswordFormData = {
  email: string;
};

const ForgotPassword = () => {
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  const form = useForm<ForgotPasswordFormData>({
    defaultValues: {
      email: "",
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (data: { email: string }) => {
      return mutate("POST", "/auth/forgot-password", data);
    },
    onSuccess: () => {
      setShowSuccessMessage(true);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to send reset email");
    },
  });

  const onSubmit = (data: ForgotPasswordFormData) => {
    forgotPasswordMutation.mutate(data);
  };

  if (showSuccessMessage) {
    return (
      <AuthWrapper title="Check Your Email" description="We've sent you a password reset link" hideHeader>
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <Mail className="h-16 w-16 text-emerald-500" />
          </div>
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900">Reset Link Sent!</h2>
            <p className="text-slate-700">
              We've sent a password reset link to your email address. Please check your inbox and follow the
              instructions.
            </p>
            <div className="space-y-2">
              <Button
                onClick={() => setShowSuccessMessage(false)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Send Another Email
              </Button>
              <Link to="/login" className="block text-center text-emerald-600 hover:text-emerald-700 font-medium">
                Back to Login
              </Link>
            </div>
          </div>
        </div>
      </AuthWrapper>
    );
  }

  return (
    <AuthWrapper title="Forgot Password" description="Enter your email to receive a reset link">
      <Form form={form} onSubmit={onSubmit} className="space-y-4">
        <FormInput
          name="email"
          type="email"
          placeholder="Enter your email"
          icon={<Mail className="h-4 w-4" />}
          className="bg-white border-slate-300 text-slate-900 placeholder:text-slate-500"
          required
          autoFocus
        />

        <Button
          type="submit"
          disabled={forgotPasswordMutation.isPending}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {forgotPasswordMutation.isPending ? "Sending..." : "Send Reset Link"}
        </Button>
      </Form>

      <div className="mt-6 text-center">
        <p className="text-slate-600">
          Remember your password?{" "}
          <Link to="/login" className="text-emerald-600 hover:text-emerald-700 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </AuthWrapper>
  );
};

export default ForgotPassword;
