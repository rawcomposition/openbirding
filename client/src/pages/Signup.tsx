import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { Mail, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/Form";
import { FormInput } from "@/components/FormInput";
import { AuthWrapper } from "@/components/AuthWrapper";
import { mutate } from "@/lib/utils";
import toast from "react-hot-toast";
import type { SignupData } from "@/lib/types";
import { useState } from "react";

type SignupFormData = {
  email: string;
  name: string;
  password: string;
  confirmPassword: string;
};

const Signup = () => {
  const [showVerificationMessage, setShowVerificationMessage] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");

  const signupMutation = useMutation({
    mutationFn: async (data: SignupData): Promise<{ message: string; email: string }> => {
      return mutate("POST", "/auth/signup", data) as Promise<{ message: string; email: string }>;
    },
    onSuccess: (data) => {
      setShowVerificationMessage(true);
      setSignupEmail(data.email);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Signup failed");
    },
  });

  const form = useForm<SignupFormData>();

  const resendMutation = useMutation({
    mutationFn: async (email: string) => {
      return mutate("POST", "/auth/resend-verification", { email });
    },
    onSuccess: (data: Record<string, unknown>) => {
      toast.success(data.message as string);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to resend verification email");
    },
  });

  const onSubmit = (data: SignupFormData) => {
    if (data.password.length < 8) {
      form.setError("password", { message: "Password must be at least 8 characters long" });
      return;
    }
    if (data.password !== data.confirmPassword) {
      form.setError("confirmPassword", { message: "Passwords do not match" });
      return;
    }

    signupMutation.mutate({
      email: data.email,
      name: data.name,
      password: data.password,
    });
  };

  const handleResendVerification = () => {
    if (signupEmail) {
      resendMutation.mutate(signupEmail);
    }
  };

  if (showVerificationMessage) {
    return (
      <AuthWrapper title="Check Your Email" description="We've sent you a verification link" hideHeader>
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <Mail className="h-16 w-16 text-emerald-500" />
          </div>
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900">Verify Your Email</h2>
            <p className="text-slate-700">
              We've sent a verification link to <strong>{signupEmail}</strong>
            </p>
            <p className="text-slate-600 text-sm">Click the link in your email to complete your registration.</p>
            <div className="space-y-3">
              <Button
                onClick={handleResendVerification}
                disabled={resendMutation.isPending}
                variant="outline"
                className="w-full"
              >
                {resendMutation.isPending ? "Sending..." : "Resend Verification Email"}
              </Button>
              <Link to="/login" className="block text-center text-emerald-600 hover:text-emerald-700 font-medium">
                Back to Sign Up
              </Link>
            </div>
          </div>
        </div>
      </AuthWrapper>
    );
  }

  return (
    <AuthWrapper title="Create Account" description="Join OpenBirding to track your birding adventures">
      <Form form={form} onSubmit={onSubmit} className="space-y-4">
        <FormInput
          name="name"
          type="text"
          placeholder="Enter your name"
          icon={<User className="h-4 w-4" />}
          large
          required
        />

        <FormInput
          name="email"
          type="email"
          placeholder="Enter your email"
          icon={<Mail className="h-4 w-4" />}
          large
          required
          autoFocus
        />

        <FormInput
          name="password"
          type="password"
          placeholder="Create a password (min 8 characters)"
          icon={<Lock className="h-4 w-4" />}
          large
          required
        />

        <FormInput
          name="confirmPassword"
          type="password"
          placeholder="Confirm your password"
          icon={<Lock className="h-4 w-4" />}
          large
          required
        />

        <Button
          type="submit"
          disabled={signupMutation.isPending}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {signupMutation.isPending ? "Creating account..." : "Create Account"}
        </Button>
      </Form>

      <div className="mt-6 text-center">
        <p className="text-slate-600">
          Already have an account?{" "}
          <Link to="/login" className="text-emerald-600 hover:text-emerald-700 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </AuthWrapper>
  );
};

export default Signup;
