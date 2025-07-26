import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import * as LucideIcons from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Save } from "lucide-react";
import type { Hotspot } from "@/lib/types";
import { getTagsByCategory } from "@/lib/tags";
import { mutate } from "@/lib/utils";

type HotspotSheetProps = {
  hotspot: Hotspot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type FormData = {
  tags: string[];
};

const HotspotSheet = ({ hotspot, open, onOpenChange }: HotspotSheetProps) => {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  useEffect(() => {
    if (hotspot) {
      setSelectedTags(hotspot.tags || []);
    }
  }, [hotspot]);
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    defaultValues: {
      tags: hotspot?.tags || [],
    },
  });

  const updateHotspotMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (!hotspot) return;
      return mutate("PUT", `/hotspots/${hotspot._id}`, data);
    },
    onSuccess: () => {
      toast.success("Hotspot updated successfully");
      queryClient.invalidateQueries({ queryKey: ["/hotspots"] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to update hotspot");
      console.error("Error updating hotspot:", error);
    },
  });

  const onSubmit = (data: FormData) => {
    updateHotspotMutation.mutate({ ...data, tags: selectedTags });
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
  };

  const getIconComponent = (iconName: string) => {
    const IconComponent = LucideIcons[iconName as keyof typeof LucideIcons];
    return IconComponent ? <IconComponent className="h-4 w-4" /> : null;
  };

  const categories = getTagsByCategory();

  if (!hotspot) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px] bg-slate-900 border-slate-700">
        <SheetHeader>
          <SheetTitle className="text-white">Edit Hotspot</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl text-white">{hotspot.name}</CardTitle>
                  <p className="text-sm text-gray-300 flex items-center gap-1 mt-1">
                    <MapPin className="h-4 w-4" />
                    {`${hotspot.county}, ${hotspot.state}, ${hotspot.country}`}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-200 border-emerald-400/30">
                  {hotspot.species} species
                </Badge>
                <Badge variant="outline" className="text-gray-300 border-gray-400/30">
                  {hotspot.location.coordinates[1].toFixed(4)}, {hotspot.location.coordinates[0].toFixed(4)}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Tags</h3>
              <p className="text-sm text-gray-300">Select all that apply</p>

              {Object.entries(categories).map(([category, categoryTags]) => (
                <div key={category} className="space-y-3">
                  <h4 className="text-md font-medium text-white capitalize">{category}</h4>
                  <div className="flex flex-wrap gap-2">
                    {categoryTags.map((tag) => {
                      const isSelected = selectedTags.includes(tag.id);
                      return (
                        <Badge
                          key={tag.id}
                          variant={isSelected ? "default" : "outline"}
                          className={`cursor-pointer transition-all ${
                            isSelected
                              ? `bg-${tag.color.replace("text-", "")} text-white border-${tag.color.replace(
                                  "text-",
                                  ""
                                )}`
                              : "text-gray-300 border-gray-400/30 hover:bg-slate-700/50"
                          }`}
                          onClick={() => toggleTag(tag.id)}
                        >
                          <span className={`mr-1 ${tag.color}`}>{getIconComponent(tag.icon)}</span>
                          {tag.name}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <SheetFooter>
              <Button
                type="submit"
                disabled={updateHotspotMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {updateHotspotMutation.isPending ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Saving...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Save className="h-4 w-4" />
                    Save Changes
                  </div>
                )}
              </Button>
            </SheetFooter>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default HotspotSheet;
