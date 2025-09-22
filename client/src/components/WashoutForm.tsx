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
    console.log("🔧 SIMPLIFIED DIRECT FILE UPLOAD - Bypassing problematic Image() validation");
    console.log("File:", file.name, file.size, file.type);
    
    // CRITICAL FIX: Skip the problematic browser Image() API validation
    // The Image API was causing backwards behavior (good photos failed, bad photos passed)
    // Let the server handle all validation and processing instead
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          console.log("📁 FileReader onload triggered");
          const base64Result = e.target?.result as string;
          
          if (!base64Result || typeof base64Result !== 'string') {
            console.error("❌ FileReader failed - no result:", base64Result);
            throw new Error("Failed to read image file");
          }
          
          console.log("✅ File read successfully:");
          console.log("  - Original size:", file.size, "bytes");
          console.log("  - Base64 length:", base64Result.length, "characters");
          console.log("  - Base64 prefix:", base64Result.substring(0, 50) + "...");
          
          console.log("🌐 Making API request to /api/photos/upload-base64");
          
          // Upload original base64 to server - let server handle all processing
          const response = await apiRequest("/api/photos/upload-base64", {
            method: "POST",
            body: JSON.stringify({
              base64Data: base64Result,
              filename: file.name
            }),
          });
          
          console.log("📡 API Response received:", response.status, response.statusText);
          
          if (response.ok) {
            console.log("✅ Response status is OK, parsing JSON...");
            const result = await response.json();
            console.log("✅ Photo uploaded successfully:", result.objectPath);
            resolve(result.objectPath);
          } else if (response.status === 401) {
            console.error("❌ AUTHENTICATION FAILED - 401 status received");
            
            toast({
              title: "Authentication Required",
              description: "Your session has expired. Please log in again to upload photos that can be seen on all devices.",
              variant: "destructive",
            });
            
            localStorage.removeItem('authToken');
            reject(new Error("Authentication expired - please log in again"));
            return;
          } else {
            console.error("❌ Server returned non-OK status:", response.status);
            try {
              const error = await response.json();
              console.error("❌ Error response body:", error);
              
              toast({
                title: "Photo Upload Failed",
                description: `Server error: ${error.error || error.message || 'Unknown error'}`,
                variant: "destructive",
              });
              
              reject(new Error(`Photo upload failed: ${error.error || error.message || 'Server error'}`));
            } catch (jsonError) {
              console.error("❌ Failed to parse error response as JSON:", jsonError);
              const errorText = await response.text();
              console.error("❌ Error response text:", errorText);
              
              toast({
                title: "Photo Upload Failed",
                description: `Server error (${response.status}): ${errorText || 'Unknown error'}`,
                variant: "destructive",
              });
              
              reject(new Error(`Photo upload failed with status ${response.status}: ${errorText}`));
            }
          }
        } catch (error) {
          console.error("❌ CATCH BLOCK - Upload error:", error);
          console.error("❌ Error type:", typeof error);
          console.error("❌ Error message:", error instanceof Error ? error.message : String(error));
          console.error("❌ Error stack:", error instanceof Error ? error.stack : 'No stack');
          
          if (error instanceof Error && error.message.includes('401')) {
            console.error("❌ Detected 401 error in catch block");
            toast({
              title: "Authentication Required",
              description: "Please log in again to upload photos.",
              variant: "destructive",
            });
            reject(error);
            return;
          }
          
          console.error("❌ FINAL ERROR - Photo upload completely failed");
          toast({
            title: "Photo Upload Failed", 
            description: `Upload error: ${error instanceof Error ? error.message : String(error)}`,
            variant: "destructive",
          });
          
          reject(error);
        }
      };
      
      reader.onerror = () => {
        console.error("❌ File reading failed for:", file.name);
        toast({
          title: "File Reading Failed",
          description: `Unable to read image file ${file.name}. Please try a different photo.`,
          variant: "destructive",
        });
        reject(new Error(`Failed to read image file: ${file.name}`));
      };
      
      // Read file as data URL (base64) - no client-side image validation
      reader.readAsDataURL(file);
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
                  console.log("=== FILE INPUT CHANGE EVENT TRIGGERED ===");
                  const files = Array.from(e.target.files || []);
                  console.log("Files from input:", files.length);
                  
                  if (files.length === 0) {
                    console.log("❌ No files selected");
                    return;
                  }
                  
                  console.log("=== FILES SELECTED ===");
                  console.log("Number of files:", files.length);
                  files.forEach((file, index) => {
                    console.log(`File ${index + 1}: ${file.name}, ${file.size} bytes, ${file.type}`);
                  });
                  
                  // CRITICAL FIX: Set processing state during direct upload
                  setIsProcessingPhotos(true);
                  console.log("🔄 Direct photo upload started - blocking form submission");
                  
                  const newUrls: string[] = [];
                  const failedFiles: string[] = [];
                  
                  for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    try {
                      console.log(`Processing file ${i + 1}/${files.length}: ${file.name}`);
                      const serverUrl = await handleDirectFileUpload(file);
                      console.log(`✅ File ${i + 1} uploaded successfully:`, serverUrl);
                      newUrls.push(serverUrl);
                    } catch (error) {
                      console.error(`❌ Direct upload failed for file ${i + 1} (${file.name}):`, error);
                      failedFiles.push(file.name);
                      
                      // Show individual file error
                      toast({
                        title: "Photo Upload Failed",
                        description: `Failed to upload ${file.name}. ${error instanceof Error ? error.message : 'Unknown error'}`,
                        variant: "destructive",
                      });
                    }
                  }
                  
                  console.log("=== UPLOAD SUMMARY ===");
                  console.log("Successful uploads:", newUrls.length);
                  console.log("Failed uploads:", failedFiles.length);
                  console.log("New server-backed URLs:", newUrls);
                  console.log("Failed files:", failedFiles);
                  
                  if (newUrls.length > 0) {
                    console.log("Adding new URLs to state...");
                    setPhotoUrls(prev => {
                      const updated = [...prev, ...newUrls];
                      console.log("Updated photoUrls state:", updated);
                      return updated;
                    });
                  }
                  
                  // Clear processing state after direct uploads complete
                  setIsProcessingPhotos(false);
                  console.log("✅ Direct photo upload completed - form submission now allowed");
                  
                  // Show success message for successful uploads
                  if (newUrls.length > 0) {
                    toast({
                      title: "Photos Added",
                      description: `${newUrls.length} photo(s) uploaded successfully.` + 
                                   (failedFiles.length > 0 ? ` ${failedFiles.length} failed.` : ''),
                    });
                  } else if (failedFiles.length > 0) {
                    toast({
                      title: "All Uploads Failed",
                      description: `None of the ${failedFiles.length} photo(s) could be uploaded. Please try again or use different photos.`,
                      variant: "destructive",
                    });
                  }
                  
                  // Reset the input so the same files can be selected again if needed
                  e.target.value = '';
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
