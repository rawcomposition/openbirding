import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/Form";
import { FormInput } from "@/components/FormInput";
import { AuthWrapper } from "@/components/AuthWrapper";
import { useAuthStore } from "@/lib/authStore";
import { mutate } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import type { SignupData, AuthResponse } from "@/lib/types";

type SignupFormData = {
  email: string;
  password: string;
  confirmPassword: string;
};

const Signup = () => {
  const { setUser } = useAuthStore();
  const navigate = useNavigate();

  const signupMutation = useMutation({
    mutationFn: async (data: SignupData): Promise<AuthResponse> => {
      return mutate("POST", "/auth/signup", data) as Promise<AuthResponse>;
    },
    onSuccess: (data) => {
      setUser(data.user);
      toast.success("Account created successfully!");
      navigate("/");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Signup failed");
    },
  });

  const form = useForm<SignupFormData>();

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
      password: data.password,
    });
  };

  return (
    <AuthWrapper title="Create Account" description="Join OpenBirding to track your birding adventures">
      <Form form={form} onSubmit={onSubmit} className="space-y-4">
        <FormInput
          name="email"
          type="email"
          placeholder="Enter your email"
          icon={<Mail className="h-4 w-4" />}
          className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
          required
        />

        <FormInput
          name="password"
          type="password"
          placeholder="Create a password (min 8 characters)"
          icon={<Lock className="h-4 w-4" />}
          className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
          required
        />

        <FormInput
          name="confirmPassword"
          type="password"
          placeholder="Confirm your password"
          icon={<Lock className="h-4 w-4" />}
          className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
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
        <p className="text-slate-400">
          Already have an account?{" "}
          <Link to="/login" className="text-emerald-400 hover:text-emerald-300 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </AuthWrapper>
  );
};

export default Signup;
