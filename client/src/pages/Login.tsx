import { Link, useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/Form";
import { FormInput } from "@/components/FormInput";
import { AuthWrapper } from "@/components/AuthWrapper";
import { useAuthStore } from "@/lib/authStore";
import { mutate } from "@/lib/utils";
import toast from "react-hot-toast";
import type { LoginData, AuthResponse } from "@/lib/types";

type LoginFormData = {
  email: string;
  password: string;
};

const Login = () => {
  const { setUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const form = useForm<LoginFormData>({
    defaultValues: {
      email: (location.state as { email?: string })?.email || "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginData): Promise<AuthResponse> => {
      return mutate("POST", "/auth/login", data) as Promise<AuthResponse>;
    },
    onSuccess: (data) => {
      setUser(data.user);
      const redirectTo = (location.state as { redirect?: string })?.redirect || "/";
      navigate(redirectTo);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Login failed");
    },
  });

  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  const successMessage = (location.state as { message?: string })?.message;

  return (
    <AuthWrapper title="Welcome Back" description="Sign in to your OpenBirding account">
      {successMessage && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-md">
          <p className="text-emerald-700 text-sm">{successMessage}</p>
        </div>
      )}
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

        <FormInput
          name="password"
          type="password"
          placeholder="Enter your password"
          icon={<Lock className="h-4 w-4" />}
          className="bg-white border-slate-300 text-slate-900 placeholder:text-slate-500"
          required
          autoFocus={!!(location.state as { email?: string })?.email}
        />

        <Button
          type="submit"
          disabled={loginMutation.isPending}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {loginMutation.isPending ? "Signing in..." : "Sign In"}
        </Button>
      </Form>

      <div className="mt-6 text-center">
        <p className="text-slate-600">
          Don't have an account?{" "}
          <Link to="/signup" className="text-emerald-600 hover:text-emerald-700 font-medium">
            Sign up
          </Link>
        </p>
      </div>

      <div className="mt-4 text-center">
        <Link to="/forgot-password" className="text-slate-600 hover:text-slate-700 text-sm">
          Forgot your password?
        </Link>
      </div>
    </AuthWrapper>
  );
};

export default Login;
