import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import { FormError } from "@/components/ui/form-error";
import { mutate } from "@/lib/utils";

const AndroidNotify = () => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");

    try {
      const result = await mutate("POST", "/android-notify", { email });
      setStatus("success");
      setMessage(result.message as string);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/20 to-white">
      <div className="max-w-lg mx-auto px-4 py-16 md:py-24">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 text-sm mb-10 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">Android</h1>
        <p className="text-lg text-slate-600 mb-8">
          We're currently focused on perfecting the iOS version of the app. If you want to be notified when the Android
          version is available, please leave your email below.
        </p>

        {status === "success" ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5">
            <p className="text-emerald-800 font-medium">{message}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              placeholder="e.g. you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              large
            />
            {status === "error" && <FormError message={message} />}
            <Button type="submit" variant="primary" size="lg" disabled={status === "loading"} className="w-full">
              {status === "loading" ? "Submitting..." : "Notify Me"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default AndroidNotify;
