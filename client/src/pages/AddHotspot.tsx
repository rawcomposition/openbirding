import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormInput } from "@/components/FormInput";
import { Form } from "@/components/Form";
import { mutate } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useAutoFocus } from "@/hooks/useAutoFocus";

type LocationFormData = {
  locationId: string;
};

type HotspotFormData = {
  name: string;
};

const AddHotspot = () => {
  const [locationId, setLocationId] = useState("");
  const locationInputRef = useAutoFocus();

  const locationForm = useForm<LocationFormData>({
    defaultValues: {
      locationId: "",
    },
  });

  const hotspotForm = useForm<HotspotFormData>({
    defaultValues: {},
  });

  const { data, isLoading } = useQuery({
    queryKey: ["hotspot", locationId],
    queryFn: async () => {
      return mutate("POST", "/get-hotspot", { locationId: locationId.trim() });
    },
    enabled: !!locationId,
  });

  useEffect(() => {
    if (data) {
      hotspotForm.reset(data);
    }
  }, [data, hotspotForm]);

  const onSubmitLocation = (formData: LocationFormData) => {
    setLocationId(formData.locationId);
  };

  const onSubmitHotspot = (formData: HotspotFormData) => {
    console.log(formData);
  };

  if (!locationId) {
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
            <Form form={locationForm} onSubmit={onSubmitLocation} className="space-y-6">
              <FormInput
                ref={locationInputRef}
                name="locationId"
                label="eBird Location ID"
                placeholder="e.g., L12345678"
                required
              />

              <div className="flex justify-center">
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-2"
                >
                  Continue
                </Button>
              </div>
            </Form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-2xl text-white">Add New Hotspot</CardTitle>
          <CardDescription className="text-slate-300">Enter the details of the hotspot</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Form form={hotspotForm} onSubmit={onSubmitHotspot} className="space-y-6">
            <FormInput name="name" label="Hotspot Name" placeholder="e.g., Great Blue Heron" required />
            <div className="flex justify-center">
              <Button
                type="submit"
                disabled={isLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-2"
              >
                Add Hotspot
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AddHotspot;
