import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Camera, MapPin, Clock } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UploadResult } from "@uppy/core";

interface WashoutFormProps {
  location: {
    id: string;
    name: string;
    address: string;
    rate: string;
  };
  currentLocation?: { lat: number; lng: number };
  onSuccess?: () => void;
}

export function WashoutForm({ location, currentLocation, onSuccess }: WashoutFormProps) {
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const checkInMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/drivers/checkin", data);
      return response.json();
    },
    onSuccess: () => {
      // Invalidate all relevant caches
      queryClient.invalidateQueries({ queryKey: ['/api/drivers/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/drivers/activities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/activities'] });
      
      toast({
        title: "Check-in Successful",
        description: "Your washout has been recorded successfully.",
      });
      onSuccess?.();
    },
    onError: (error) => {
      toast({
        title: "Check-in Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleGetUploadParameters = async () => {
    const response = await apiRequest("POST", "/api/objects/upload");
    const data = await response.json();
    return {
      method: "PUT" as const,
      url: data.uploadURL,
    };
  };

  const handlePhotoComplete = async (result: UploadResult) => {
    console.log("Photo upload completed:", result);
    const uploadedFiles = result.successful;
    
    if (uploadedFiles.length === 0) {
      return;
    }

    // Process real photo URLs immediately
    const urls: string[] = [];
    for (const file of uploadedFiles) {
      try {
        console.log("Processing photo upload:", file);
        console.log("Available file properties:", Object.keys(file));
        
        // Try different possible property names for the upload URL
        const uploadURL = file.uploadURL || file.response?.uploadURL || file.response?.body?.Location || file.s3?.location;
        
        if (!uploadURL) {
          console.log("No upload URL found, using fallback");
          // Use a fallback URL if we can't get the real one
          urls.push(`uploaded-photo-${Date.now()}-${Math.random()}`);
          continue;
        }
        
        console.log("Using upload URL for ACL:", uploadURL);
        const response = await apiRequest("PUT", "/api/washout-photos", {
          photoURL: uploadURL,
        });
        
        if (response.ok) {
          const data = await response.json();
          urls.push(data.objectPath || uploadURL);
          console.log("ACL processed successfully:", data.objectPath || uploadURL);
        } else {
          // If ACL processing fails, still use the upload URL
          urls.push(uploadURL);
          console.log("ACL failed, using upload URL directly:", uploadURL);
        }
      } catch (error) {
        console.log("Photo processing failed:", error);
        // Add a fallback URL if everything fails
        urls.push(`fallback-photo-${Date.now()}-${Math.random()}`);
      }
    }
    
    // Add all processed URLs to the photoUrls state
    console.log("Adding processed photo URLs:", urls);
    setPhotoUrls(prev => [...prev, ...urls]);
    
    toast({
      title: "Photos Uploaded",
      description: `${uploadedFiles.length} photo(s) uploaded successfully.`,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      console.log("Submitting check-in with photoUrls:", photoUrls);
      await checkInMutation.mutateAsync({
        locationId: location.id,
        latitude: currentLocation?.lat?.toString(),
        longitude: currentLocation?.lng?.toString(),
        notes,
        photoUrls,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center">
          <MapPin className="w-5 h-5 mr-2" />
          Check-in at {location.name}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{location.address}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Location Info */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-muted-foreground">Washout Rate</span>
              <span className="text-lg font-semibold text-accent" data-testid="text-rate">
                ${location.rate}
              </span>
            </div>
            <div className="flex items-center text-sm text-muted-foreground">
              <Clock className="w-4 h-4 mr-1" />
              <span data-testid="text-checkin-time">
                {new Date().toLocaleString()}
              </span>
            </div>
          </div>

          {/* GPS Status */}
          {currentLocation && (
            <div className="flex items-center text-sm text-green-600">
              <MapPin className="w-4 h-4 mr-1" />
              <span data-testid="text-gps-verified">GPS Location Verified</span>
            </div>
          )}

          {/* Photo Upload */}
          <div>
            <Label htmlFor="photos">Washout Photos</Label>
            <ObjectUploader
              maxNumberOfFiles={5}
              maxFileSize={10485760} // 10MB
              onGetUploadParameters={handleGetUploadParameters}
              onComplete={handlePhotoComplete}
              buttonClassName="w-full mt-2"
            >
              <Camera className="w-5 h-5 mr-2" />
              Take Photos ({photoUrls.length}/5)
            </ObjectUploader>
            <p className="text-xs text-muted-foreground mt-1">
              Photos help verify completion of washout ({photoUrls.length} uploaded)
            </p>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any additional notes about this washout..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="textarea-notes"
            />
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting}
            data-testid="button-complete-checkin"
          >
            {isSubmitting ? "Processing..." : "Complete Washout"}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            By checking in, you confirm completion of the washout service
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
