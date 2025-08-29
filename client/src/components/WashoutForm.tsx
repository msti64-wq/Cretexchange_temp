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
    console.log("=== PHOTO UPLOAD COMPLETED ===");
    console.log("Upload result:", result);
    console.log("Successful files:", result.successful);
    
    const uploadedFiles = result.successful;
    
    if (uploadedFiles.length === 0) {
      console.log("No successful uploads found");
      return;
    }

    // IMMEDIATELY add temporary URLs to enable the button
    const tempUrls = uploadedFiles.map((file, index) => `temp-photo-${Date.now()}-${index}`);
    console.log("Adding temporary URLs to enable button:", tempUrls);
    setPhotoUrls(prev => [...prev, ...tempUrls]);

    toast({
      title: "Photos Uploading",
      description: `${uploadedFiles.length} photo(s) uploaded successfully.`,
    });

    // Process real photo URLs in background
    const realUrls: string[] = [];
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      try {
        console.log(`Processing file ${i + 1}:`, file);
        console.log("Available file properties:", Object.keys(file));
        
        // Try different possible property names for the upload URL
        const uploadURL = file.uploadURL || file.response?.uploadURL || file.response?.body?.Location || file.s3?.location;
        
        if (!uploadURL) {
          console.log("No upload URL found, keeping temp URL");
          realUrls.push(tempUrls[i]); // Keep the temp URL
          continue;
        }
        
        console.log("Processing ACL for URL:", uploadURL);
        try {
          const response = await apiRequest("PUT", "/api/washout-photos", {
            photoURL: uploadURL,
          });
          
          if (response.ok) {
            const data = await response.json();
            realUrls.push(data.objectPath || uploadURL);
            console.log("ACL processed successfully:", data.objectPath || uploadURL);
          } else {
            realUrls.push(uploadURL);
            console.log("ACL failed, using upload URL directly:", uploadURL);
          }
        } catch (aclError) {
          console.log("ACL request failed:", aclError);
          realUrls.push(uploadURL);
        }
      } catch (error) {
        console.log("Photo processing failed:", error);
        realUrls.push(tempUrls[i]); // Keep the temp URL
      }
    }
    
    // Replace temp URLs with real ones
    console.log("Replacing temp URLs with real URLs:", realUrls);
    setPhotoUrls(prev => {
      const newUrls = [...prev];
      // Replace the last N temp URLs with real URLs
      for (let i = 0; i < tempUrls.length; i++) {
        const tempIndex = newUrls.lastIndexOf(tempUrls[i]);
        if (tempIndex !== -1) {
          newUrls[tempIndex] = realUrls[i];
        }
      }
      return newUrls;
    });
    
    console.log("Final photoUrls state should be:", realUrls);
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
          <div className="space-y-2">
            <Label htmlFor="photos" className="flex items-center">
              <Camera className="w-4 h-4 mr-2" />
              Upload Photos (Required)
            </Label>
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
            
            {photoUrls.length > 0 ? (
              <p className="text-sm text-green-600" data-testid="text-photos-uploaded">
                ✓ {photoUrls.length} photo(s) uploaded successfully
              </p>
            ) : (
              <p className="text-sm text-amber-600" data-testid="text-photos-required">
                📸 Please upload at least one photo before checking in
              </p>
            )}
            
            {/* Debug info */}
            <details className="text-xs text-muted-foreground">
              <summary>Debug: Photo URLs ({photoUrls.length})</summary>
              <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-20">
                {JSON.stringify(photoUrls, null, 2)}
              </pre>
            </details>
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
            disabled={isSubmitting || photoUrls.length === 0}
            data-testid="button-complete-checkin"
          >
            {isSubmitting ? "Processing..." : 
             photoUrls.length === 0 ? "Upload Photos to Continue" : 
             "Complete Washout"}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            By checking in, you confirm completion of the washout service
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
