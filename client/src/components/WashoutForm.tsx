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
  const [isProcessingPhotos, setIsProcessingPhotos] = useState(false);

  const checkInMutation = useMutation({
    mutationFn: async (data: any) => {
      console.log("=== CHECK-IN MUTATION START ===");
      console.log("Data being sent:", data);
      console.log("Auth token:", localStorage.getItem('authToken') ? 'present' : 'missing');
      
      const response = await apiRequest("/api/drivers/checkin", {
        method: "POST",
        body: JSON.stringify(data),
      });
      
      console.log("Response status:", response.status);
      const result = await response.json();
      console.log("Response data:", result);
      return result;
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

  const handleDirectFileUpload = async (file: File): Promise<string> => {
    console.log("=== DIRECT FILE UPLOAD ===");
    console.log("File:", file.name, file.size, file.type);
    
    // Compress image before uploading to server
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = async () => {
        try {
          // Calculate new dimensions (max 800px width/height)
          let { width, height } = img;
          const maxSize = 800;
          
          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = (height * maxSize) / width;
              width = maxSize;
            } else {
              width = (width * maxSize) / height;
              height = maxSize;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          
          // Draw and compress
          ctx?.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
          
          console.log("Original size:", file.size, "Compressed base64 length:", compressedBase64.length);
          
          // Upload compressed photo to server
          console.log("Uploading photo to server...");
          const response = await apiRequest("/api/photos/upload-base64", {
            method: "POST",
            body: JSON.stringify({
              base64Data: compressedBase64,
              filename: file.name
            }),
          });
          
          if (response.ok) {
            const result = await response.json();
            console.log("Photo uploaded successfully:", result.objectPath);
            resolve(result.objectPath);
          } else if (response.status === 401) {
            // CRITICAL FIX: Handle authentication errors properly
            console.error("❌ AUTHENTICATION FAILED - Token expired or invalid!");
            console.error("This is why photos fall back to sessionStorage and break cross-platform access!");
            
            // Show user-friendly error instead of silent fallback
            toast({
              title: "Authentication Required",
              description: "Your session has expired. Please log in again to upload photos that can be seen on all devices.",
              variant: "destructive",
            });
            
            // Clear invalid token
            localStorage.removeItem('authToken');
            
            // Reject to prevent fallback - force user to re-authenticate
            reject(new Error("Authentication expired - please log in again"));
            return;
          } else {
            const error = await response.json();
            console.error("❌ PHOTO UPLOAD FAILED - Server error:", error, "Status:", response.status);
            
            // CRITICAL FIX: DO NOT fall back to sessionStorage
            // This was causing cross-platform photo display issues
            toast({
              title: "Photo Upload Failed",
              description: "Unable to upload photo to server. Please check your connection and try again. Without successful upload, photos won't be visible on other devices.",
              variant: "destructive",
            });
            
            // Reject instead of fallback to prevent local-photo-* URLs in database
            reject(new Error(`Photo upload failed: ${error.message || 'Server error'}`));
          }
        } catch (error) {
          console.error("Upload error:", error);
          
          // Check if it's an auth error
          if (error instanceof Error && error.message.includes('401')) {
            // Authentication error - don't fall back
            console.error("❌ AUTHENTICATION ERROR DETECTED");
            toast({
              title: "Authentication Required",
              description: "Please log in again to upload photos.",
              variant: "destructive",
            });
            reject(error);
            return;
          }
          
          // CRITICAL FIX: DO NOT fall back to sessionStorage for ANY errors
          // This was causing cross-platform photo display issues
          console.error("❌ PHOTO UPLOAD FAILED - Network or processing error:", error);
          toast({
            title: "Photo Upload Failed", 
            description: "Unable to process photo upload. Please check your connection and try again. Photos must be uploaded to server to be visible on all devices.",
            variant: "destructive",
          });
          
          // Reject instead of fallback to prevent local-photo-* URLs in database
          reject(error);
        }
      };
      
      img.onerror = () => {
        console.error("Image loading failed for file:", file.name);
        toast({
          title: "Image Processing Failed",
          description: `Unable to process image ${file.name}. Please try selecting a different photo.`,
          variant: "destructive",
        });
        reject(new Error(`Image loading failed for ${file.name}`));
      };
      
      img.src = URL.createObjectURL(file);
    });
  };

  const handleGetUploadParameters = async () => {
    console.log("=== AD BLOCKER BYPASS - USING DIRECT UPLOAD ===");
    console.log("Skipping external upload service due to ad blocker");
    
    // Return a special URL that signals we're using direct upload
    return {
      method: "POST" as const,
      url: "direct-upload://local-processing",
    };
  };

  const handlePhotoComplete = async (result: UploadResult<any, any>) => {
    console.log("=== PHOTO UPLOAD COMPLETED ===");
    console.log("Upload result:", result);
    console.log("Successful files:", result.successful);
    
    const uploadedFiles = result.successful || [];
    
    if (uploadedFiles.length === 0) {
      console.log("No successful uploads found");
      return;
    }

    // CRITICAL FIX: Set processing state to block form submission
    setIsProcessingPhotos(true);
    console.log("🔄 Photo processing started - blocking form submission");
    
    // IMMEDIATELY add temporary URLs to track progress
    const tempUrls = uploadedFiles.map((file: any, index: number) => `temp-photo-${Date.now()}-${index}`);
    console.log("Adding temporary URLs to track progress:", tempUrls);
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
        const uploadURL = (file as any).uploadURL || 
                         (file as any).response?.uploadURL || 
                         (file as any).response?.body?.Location || 
                         (file as any).meta?.location;
        
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
    
    // CRITICAL FIX: Clear processing state after all photos are processed
    setIsProcessingPhotos(false);
    console.log("✅ Photo processing completed - form submission now allowed");
    console.log("Final photoUrls state should be:", realUrls);
  };

  // CRITICAL FIX: Helper function to validate photo URLs
  const areAllPhotosServerBacked = () => {
    return photoUrls.every(url => 
      url.includes('/objects/photos/') || 
      url.startsWith('/objects/photos/') ||
      url.startsWith('https://') && url.includes('/objects/photos/')
    );
  };

  const hasTempOrInvalidUrls = () => {
    return photoUrls.some(url => 
      url.startsWith('temp-photo-') ||
      url.startsWith('local-photo-') ||
      url.startsWith('data:') ||
      url.startsWith('photo-') // Also catch placeholder URLs
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // CRITICAL FIX: Validate all photos are server-backed before submission
    if (isProcessingPhotos) {
      console.warn("❌ SUBMISSION BLOCKED - Photos still processing");
      toast({
        title: "Photos Still Processing",
        description: "Please wait for photo uploads to complete before submitting.",
        variant: "destructive",
      });
      return;
    }

    if (hasTempOrInvalidUrls()) {
      console.error("❌ SUBMISSION BLOCKED - Invalid photo URLs detected:", photoUrls);
      const invalidUrls = photoUrls.filter(url => 
        url.startsWith('temp-photo-') ||
        url.startsWith('local-photo-') ||
        url.startsWith('data:') ||
        url.startsWith('photo-')
      );
      console.error("Invalid URLs:", invalidUrls);
      
      toast({
        title: "Invalid Photo URLs",
        description: "Some photos failed to upload properly. Please remove and re-upload them.",
        variant: "destructive",
      });
      return;
    }

    if (!areAllPhotosServerBacked()) {
      console.error("❌ SUBMISSION BLOCKED - Not all photos are server-backed:", photoUrls);
      toast({
        title: "Photo Upload Incomplete",
        description: "Photos must be uploaded to server to be visible on all devices. Please wait or re-upload.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      console.log("✅ Submitting check-in with validated server-backed photoUrls:", photoUrls);
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
            <div className="space-y-2">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length === 0) return;
                  
                  console.log("=== FILES SELECTED ===");
                  console.log("Number of files:", files.length);
                  
                  // CRITICAL FIX: Set processing state during direct upload
                  setIsProcessingPhotos(true);
                  console.log("🔄 Direct photo upload started - blocking form submission");
                  
                  const newUrls: string[] = [];
                  for (const file of files) {
                    try {
                      const serverUrl = await handleDirectFileUpload(file);
                      newUrls.push(serverUrl);
                    } catch (error) {
                      console.error("Direct upload failed for file:", file.name, error);
                      // Don't add failed uploads to prevent temp URLs
                    }
                  }
                  
                  console.log("Adding new server-backed photo URLs:", newUrls);
                  setPhotoUrls(prev => [...prev, ...newUrls]);
                  
                  // Clear processing state after direct uploads complete
                  setIsProcessingPhotos(false);
                  console.log("✅ Direct photo upload completed - form submission now allowed");
                  
                  toast({
                    title: "Photos Added",
                    description: `${files.length} photo(s) added successfully.`,
                  });
                }}
                className="hidden"
                id="photo-input"
              />
              <Button
                type="button"
                onClick={() => {
                  console.log("=== PHOTO BUTTON CLICKED ===");
                  document.getElementById('photo-input')?.click();
                }}
                className="w-full mt-2"
              >
                <Camera className="w-5 h-5 mr-2" />
                Take Photos ({photoUrls.length}/5)
              </Button>
            </div>
            
            {photoUrls.length > 0 ? (
              isProcessingPhotos ? (
                <p className="text-sm text-blue-600" data-testid="text-photos-processing">
                  🔄 Processing {photoUrls.length} photo(s)... Please wait.
                </p>
              ) : hasTempOrInvalidUrls() ? (
                <p className="text-sm text-red-600" data-testid="text-photos-failed">
                  ❌ {photoUrls.filter(url => url.startsWith('temp-') || url.startsWith('local-') || url.startsWith('data:') || url.startsWith('photo-')).length} photo(s) failed to upload. Please re-upload.
                </p>
              ) : (
                <p className="text-sm text-green-600" data-testid="text-photos-uploaded">
                  ✅ {photoUrls.length} photo(s) uploaded successfully and ready for submission
                </p>
              )
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
            disabled={isSubmitting || photoUrls.length === 0 || isProcessingPhotos || hasTempOrInvalidUrls()}
            data-testid="button-complete-checkin"
          >
            {isSubmitting ? "Processing..." : 
             isProcessingPhotos ? "Processing Photos..." :
             photoUrls.length === 0 ? "Upload Photos to Continue" :
             hasTempOrInvalidUrls() ? "Photo Upload Failed - Re-upload Required" :
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
