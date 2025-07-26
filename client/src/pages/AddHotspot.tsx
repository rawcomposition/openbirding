import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormInput } from "@/components/FormInput";
import { Form } from "@/components/Form";

type FormData = {
  locationId: string;
};

const AddHotspot = () => {
  const [shouldFetch, setShouldFetch] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const form = useForm<FormData>({
    defaultValues: {
      locationId: "",
    },
  });

  const locationId = form.watch("locationId");

  const {
    isPending,
    error: queryError,
    data,
  } = useQuery({
    queryKey: ["/api/get-hotspot", { locationId: locationId.trim() }],
    enabled: shouldFetch && !!locationId.trim(),
  });

  useEffect(() => {
    if (data) {
      navigate(`/hotspots`);
    }
  }, [data, navigate]);

  useEffect(() => {
    if (queryError) {
      setError(queryError.message);
      setShouldFetch(false);
    }
  }, [queryError]);

  const onSubmit = () => {
    setError("");
    setShouldFetch(true);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-2xl text-white">Add New Hotspot</CardTitle>
          <CardDescription className="text-slate-300">
            Enter an eBird Location ID to add a new hotspot to the database
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Form form={form} onSubmit={onSubmit} className="space-y-6">
            <FormInput name="locationId" label="eBird Location ID" placeholder="e.g., L12345678" required />

            {error && (
              <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">{error}</div>
            )}

            <div className="flex justify-center">
              <Button
                type="submit"
                disabled={isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-2"
              >
                {isPending ? "Fetching..." : "Continue"}
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AddHotspot;
