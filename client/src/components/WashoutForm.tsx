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
import { formatAddress } from "@shared/addressUtils";

interface WashoutFormProps {
  location: {
    id: string;
    name: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    rate: string;
  };
  currentLocation?: { lat: number; lng: number } | null;
  onSuccess?: () => void;
}

export function WashoutForm({ location, currentLocation, onSuccess }: WashoutFormProps) {
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]); // Keep for compatibility
  const [photoData, setPhotoData] = useState<Array<{
    storageKey: string;
    contentType: string;
    fileSize: number;
  }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingPhotos, setIsProcessingPhotos] = useState(false);

  const checkInMutation = useMutation({
    mutationFn: async (data: any) => {
      console.log("=== NEW: TRANSACTIONAL CHECK-IN START ===");
      console.log("Activity data:", data.activityData);
      console.log("Photo data:", data.photoData);
      console.log("Auth token:", localStorage.getItem('authToken') ? 'present' : 'missing');
      
      const response = await apiRequest("/api/activities/create-with-photos", {
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
    console.log("🔧 NEW: Direct file upload started for:", file.name, file.size, "bytes");
    
    try {
      // Step 1: Get signed upload URL from new endpoint
      console.log("📡 Getting signed upload URL...");
      const uploadUrlResponse = await apiRequest("/api/photos/upload-url", {
        method: "POST",
        body: JSON.stringify({
          contentType: file.type || 'image/jpeg'
        }),
      });
      
      if (!uploadUrlResponse.ok) {
        throw new Error(`Failed to get upload URL: ${uploadUrlResponse.status}`);
      }
      
      const { uploadUrl, storageKey, contentType } = await uploadUrlResponse.json();
      console.log("✅ Got signed upload URL:", { storageKey, contentType });
      
      // Step 2: Upload directly to cloud storage
      console.log("☁️ Uploading to cloud storage...");
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': contentType,
        },
      });
      
      if (!uploadResponse.ok) {
        throw new Error(`Cloud upload failed: ${uploadResponse.status}`);
      }
      
      console.log("✅ Photo uploaded successfully to storage:", storageKey);
      
      // Store photo metadata for later submission
      const photoMetadata = {
        storageKey,
        contentType,
        fileSize: file.size
      };
      
      setPhotoData(prev => [...prev, photoMetadata]);
      console.log("📋 Stored photo metadata:", photoMetadata);
      
      return storageKey; // Return storage key for compatibility
      
    } catch (error) {
      console.error("❌ NEW: Upload error:", error);
      
      toast({
        title: "Photo Upload Failed", 
        description: `Upload error: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
      
      throw error;
    }
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
            locationId: location.id,
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

  // NEW: Helper functions to validate photos using new system
  const areAllPhotosServerBacked = () => {
    // NEW: For new system, check if we have valid photo metadata
    if (photoData.length > 0) {
      console.log("🔍 NEW: Validating photo metadata:", photoData);
      const isValid = photoData.every(photo => 
        photo.storageKey && 
        photo.contentType && 
        photo.fileSize > 0
      );
      console.log("✅ NEW: Photo metadata validation result:", isValid);
      return isValid;
    }
    
    // NEW: For new system storage keys, accept any non-temp storage key
    if (photoUrls.length > 0 && photoUrls.every(url => url.startsWith('photo-'))) {
      console.log("🔍 NEW: Validating storage keys:", photoUrls);
      const isValid = photoUrls.every(url => 
        url.startsWith('photo-') && !url.startsWith('temp-')
      );
      console.log("✅ NEW: Storage key validation result:", isValid);
      return isValid;
    }
    
    // Fallback: Keep old URL validation for backwards compatibility
    console.log("🔍 OLD: Validating old-style URLs:", photoUrls);
    const isValid = photoUrls.every(url => 
      url.includes('/objects/photos/') || 
      url.startsWith('/objects/photos/') ||
      url.startsWith('https://') && url.includes('/objects/photos/')
    );
    console.log("✅ OLD: URL validation result:", isValid);
    return isValid;
  };

  const hasTempOrInvalidUrls = () => {
    console.log("🔍 Checking for temp/invalid URLs in:", photoUrls);
    const hasInvalid = photoUrls.some(url => 
      url.startsWith('temp-photo-') ||
      url.startsWith('local-photo-') ||
      url.startsWith('data:') ||
      (url.startsWith('photo-') && url.includes('temp-')) // Only temp photo URLs are invalid
    );
    console.log("❌ Has invalid URLs:", hasInvalid);
    return hasInvalid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // NEW: Check if photos are required and present
    if (photoData.length === 0 && photoUrls.length === 0) {
      console.error("❌ SUBMISSION BLOCKED - No photos uploaded");
      toast({
        title: "Photos Required",
        description: "Please upload at least one photo before checking in.",
        variant: "destructive",
      });
      return;
    }
    
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
      console.log("✅ NEW: Submitting transactional check-in with photos:");
      console.log("Photo data:", photoData);
      console.log("Activity details:", { locationId: location.id, amount: location.rate });
      
      await checkInMutation.mutateAsync({
        activityData: {
          locationId: location.id,
          amount: location.rate,
          latitude: currentLocation?.lat?.toString(),
          longitude: currentLocation?.lng?.toString(),
          notes,
          checkInTime: new Date(), // Send Date object as expected by schema
          status: 'pending', // Add required status field
        },
        photoData: photoData,
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
        <p className="text-sm text-muted-foreground">
          {formatAddress({
            street: location.street,
            city: location.city,
            state: location.state,
            zip: location.zip
          })}
        </p>
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
                Take Photos ({Math.max(photoData.length, photoUrls.length)}/5)
              </Button>
            </div>
            
            {(photoData.length > 0 || photoUrls.length > 0) ? (
              isProcessingPhotos ? (
                <p className="text-sm text-blue-600" data-testid="text-photos-processing">
                  🔄 Processing {Math.max(photoData.length, photoUrls.length)} photo(s)... Please wait.
                </p>
              ) : hasTempOrInvalidUrls() ? (
                <p className="text-sm text-red-600" data-testid="text-photos-failed">
                  ❌ {photoUrls.filter(url => url.startsWith('temp-') || url.startsWith('local-') || url.startsWith('data:') || url.startsWith('photo-')).length} photo(s) failed to upload. Please re-upload.
                </p>
              ) : (
                <p className="text-sm text-green-600" data-testid="text-photos-uploaded">
                  ✅ {Math.max(photoData.length, photoUrls.length)} photo(s) uploaded successfully and ready for submission
                </p>
              )
            ) : (
              <p className="text-sm text-amber-600" data-testid="text-photos-required">
                📸 Please upload at least one photo before checking in
              </p>
            )}
            
            {/* Debug info */}
            <details className="text-xs text-muted-foreground">
              <summary>Debug: NEW Photo Data ({photoData.length}) | OLD URLs ({photoUrls.length})</summary>
              <div className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-32 space-y-2">
                <div>
                  <strong>NEW Photo Metadata:</strong>
                  <pre>{JSON.stringify(photoData, null, 2)}</pre>
                </div>
                <div>
                  <strong>OLD Photo URLs:</strong>
                  <pre>{JSON.stringify(photoUrls, null, 2)}</pre>
                </div>
              </div>
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
