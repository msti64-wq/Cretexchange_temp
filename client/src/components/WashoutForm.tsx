import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Camera, MapPin, Clock, ShieldAlert, ShieldCheck, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatAddress } from "@shared/addressUtils";
import { getCurrentLocation } from "@/lib/gps";
import { computePhotoFingerprint } from "@/lib/photoFingerprint";
import { useLanguage } from "@/lib/i18n";
import { resolveDriverCheckInButtonState, resolveGpsPreflightStatus, resolvePhotoUploadRecoveryState, type GpsPreflightStatus } from "@/lib/pilotOnboarding";
import { presentDriverOperationalError } from "@/lib/driverOperationalErrorPresentation";
import type { DriverOperationalErrorPresentation } from "@/lib/driverOperationalErrorPresentation";

const MAX_PHOTO_UPLOAD_BYTES = 15 * 1024 * 1024;
const SUPPORTED_PHOTO_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

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
  onSuccess?: (activityId?: string) => void;
}

export function WashoutForm({ location, onSuccess }: WashoutFormProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const [notes, setNotes] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]); // Keep for compatibility
  const [photoData, setPhotoData] = useState<Array<{
    storageKey: string;
    contentType: string;
    fileSize: number;
    photoTakenAt: string;
    uploadedAt: string;
    gpsLatitude: number | null;
    gpsLongitude: number | null;
    imageFingerprint: string | null;
  }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingPhotos, setIsProcessingPhotos] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<GpsPreflightStatus>("required");
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsWarning, setGpsWarning] = useState<string | null>(null);
  const [pendingPhotoFiles, setPendingPhotoFiles] = useState<File[]>([]);
  const [failedPhotoFiles, setFailedPhotoFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ total: number; current: number; completed: number; failed: number } | null>(null);
  const [submissionError, setSubmissionError] = useState<DriverOperationalErrorPresentation | null>(null);
  const uploadInFlightRef = useRef(false);
  const uploadedPhotoCount = Math.max(photoData.length, photoUrls.length);
  const uploadRecovery = resolvePhotoUploadRecoveryState({
    successfulCount: uploadedPhotoCount,
    failedCount: failedPhotoFiles.length,
    isProcessing: isProcessingPhotos,
  });

  const ensureGpsLocation = async ({ isRetry = false }: { isRetry?: boolean } = {}) => {
    if (gpsLocation) {
      return gpsLocation;
    }

    setGpsStatus(isRetry ? "retrying" : "checking");
    try {
      const coords = await getCurrentLocation();
      const nextLocation = { lat: coords.latitude, lng: coords.longitude };
      setGpsLocation(nextLocation);
      setGpsStatus("ready");
      setGpsWarning(null);
      return nextLocation;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setGpsStatus(resolveGpsPreflightStatus(error));
      setGpsWarning(/denied/i.test(message) ? t("pilot.gps.permissionDenied") : t("pilot.gps.unavailable"));
      toast({
        title: t("pilot.gps.title"),
        description: /denied/i.test(message) ? t("pilot.gps.permissionDenied") : t("pilot.gps.unavailable"),
        variant: "destructive",
      });
      return null;
    }
  };

  useEffect(() => {
    void ensureGpsLocation();
  }, []);

  const checkInMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("/api/activities/create-with-photos", {
        method: "POST",
        body: JSON.stringify(data),
      });
      
      const result = await response.json();
      return result;
    },
    onSuccess: (result) => {
      setSubmissionError(null);
      // Invalidate all relevant caches
      queryClient.invalidateQueries({ queryKey: ['/api/drivers/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/drivers/activities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/activities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/billing/pending-summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/billing/settings'] });
      
      toast({
        title: t("driver.washout.successTitle"),
        description: t("driver.washout.successDescription"),
      });
      onSuccess?.(typeof result?.activity?.id === "string" ? result.activity.id : undefined);
    },
    onError: (error) => {
      const presentation = presentDriverOperationalError(error, () => {
        void queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      });
      setSubmissionError(presentation);
      // Reuse the root authentication flow for an expired or invalid session.
      // It removes the invalid token and switches the route set to sign-in; a
      // protected operational mutation must not leave a stale session in place.
      toast({
        title: t(presentation.titleKey),
        description: t(presentation.descriptionKey),
        variant: "destructive",
      });
    },
  });

  const handleDirectFileUpload = async (
    file: File,
    browserLocation: { lat: number; lng: number } | null,
  ): Promise<string> => {
    const contentType = file.type || "image/jpeg";
    if (!SUPPORTED_PHOTO_CONTENT_TYPES.has(contentType)) {
      throw new Error(
        t("driver.washout.photoFormatUnsupported"),
      );
    }

    if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
      throw new Error(
        t("driver.washout.photoTooLarge", { limit: Math.floor(MAX_PHOTO_UPLOAD_BYTES / (1024 * 1024)) }),
      );
    }

    try {
      // Step 1: Get signed upload URL from new endpoint
      const uploadUrlResponse = await apiRequest("/api/photos/upload-url", {
        method: "POST",
        body: JSON.stringify({
          contentType,
          fileSize: file.size,
        }),
      });
      
      if (!uploadUrlResponse.ok) {
        throw new Error(t("driver.washout.uploadPreparationFailed"));
      }
      
      const { uploadUrl, storageKey, contentType: responseContentType } = await uploadUrlResponse.json();
      // Step 2: Upload directly to cloud storage
      let uploadResponse: Response;
      try {
        uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': responseContentType,
          },
        });
          } catch {
        throw new Error(t("driver.washout.uploadTransferFailed"));
      }
      
      if (!uploadResponse.ok) {
        throw new Error(t("driver.washout.uploadRejected"));
          }
      
      // Store photo metadata for later submission
      let imageFingerprint: string | null = null;
      try {
        imageFingerprint = await computePhotoFingerprint(file);
      } catch {
        imageFingerprint = null;
      }

      const photoMetadata = {
        storageKey,
        contentType: responseContentType,
        fileSize: file.size,
        photoTakenAt: new Date(file.lastModified || Date.now()).toISOString(),
        uploadedAt: new Date().toISOString(),
        gpsLatitude: browserLocation?.lat ?? null,
        gpsLongitude: browserLocation?.lng ?? null,
        imageFingerprint,
      };
      
      setPhotoData(prev => [...prev, photoMetadata]);
      
      return storageKey; // Return storage key for compatibility
      
    } catch (error) {
      throw error;
    }
  };

  const uploadPhotos = async (files: File[], browserLocation: { lat: number; lng: number }, { isRetry = false }: { isRetry?: boolean } = {}) => {
    if (files.length === 0 || uploadInFlightRef.current) return;

    uploadInFlightRef.current = true;
    setIsProcessingPhotos(true);
    setUploadProgress({ total: files.length, current: 0, completed: 0, failed: 0 });
    const newUrls: string[] = [];
    const failedFiles: File[] = [];

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setUploadProgress({ total: files.length, current: index + 1, completed: newUrls.length, failed: failedFiles.length });
        try {
          const serverUrl = await handleDirectFileUpload(file, browserLocation);
          newUrls.push(serverUrl);
          setUploadProgress({ total: files.length, current: index + 1, completed: newUrls.length, failed: failedFiles.length });
        } catch {
          failedFiles.push(file);
          setUploadProgress({ total: files.length, current: index + 1, completed: newUrls.length, failed: failedFiles.length });
    toast({
            title: t("driver.washout.photoUploadFailedTitle"),
            description: t("pilot.upload.failed"),
            variant: "destructive",
    });
        }
      }

      if (newUrls.length > 0) {
        setPhotoUrls((previous) => [...previous, ...newUrls]);
        setPendingPhotoFiles([]);
        }
      setFailedPhotoFiles((previous) => isRetry ? failedFiles : [...previous, ...failedFiles]);
        
      if (newUrls.length > 0) {
        toast({
          title: t("driver.washout.photosAddedTitle"),
          description: failedFiles.length
            ? t("pilot.upload.partial", { count: failedFiles.length })
            : t("pilot.upload.complete", { count: newUrls.length }),
          });
          }
    } finally {
      uploadInFlightRef.current = false;
      setIsProcessingPhotos(false);
        }
  };
    
  const uploadSelectedPhotos = async (files: File[]) => {
    setPendingPhotoFiles(files);
    const browserLocation = await ensureGpsLocation();
    if (!browserLocation) return;
    await uploadPhotos(files, browserLocation);
  };

  const retryGps = async () => {
    const browserLocation = await ensureGpsLocation({ isRetry: true });
    if (browserLocation && pendingPhotoFiles.length > 0) {
      await uploadPhotos(pendingPhotoFiles, browserLocation);
        }
  };
    
  const retryFailedPhotos = async () => {
    if (isProcessingPhotos || failedPhotoFiles.length === 0) return;
    const filesToRetry = [...failedPhotoFiles];
    const browserLocation = await ensureGpsLocation();
    if (browserLocation) {
      await uploadPhotos(filesToRetry, browserLocation, { isRetry: true });
    }
  };

  // NEW: Helper functions to validate photos using new system
  const areAllPhotosServerBacked = () => {
    if (photoData.length > 0) {
      return photoData.every(photo =>
        photo.storageKey && 
        photo.contentType && 
        photo.fileSize > 0
      );
    }
    
    // NEW: For new system storage keys, accept any non-temp storage key
    if (photoUrls.length > 0 && photoUrls.every(url => url.startsWith('photo-'))) {
      return photoUrls.every(url =>
        url.startsWith('photo-') && !url.startsWith('temp-')
      );
    }
    
    // Fallback: Keep old URL validation for backwards compatibility
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
      (url.startsWith('photo-') && url.includes('temp-')) // Only temp photo URLs are invalid
    );
  };

  const checkInButton = resolveDriverCheckInButtonState({
    gpsStatus,
    hasGpsLocation: Boolean(gpsLocation),
    successfulPhotoCount: uploadedPhotoCount,
    failedPhotoCount: failedPhotoFiles.length,
    isProcessingPhotos,
    isSubmitting,
    hasInvalidPhotoUrls: hasTempOrInvalidUrls(),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmissionError(null);
    
    // NEW: Check if photos are required and present
    if (photoData.length === 0 && photoUrls.length === 0) {
      toast({
        title: t("driver.washout.photosRequiredTitle"),
        description: t("driver.washout.photosRequiredDescription"),
        variant: "destructive",
      });
      return;
    }

    if (failedPhotoFiles.length > 0 || !uploadRecovery.canSubmit) {
      toast({
        title: t("pilot.upload.incomplete"),
        description: t("pilot.upload.incompleteHelp"),
        variant: "destructive",
      });
      return;
    }

    if (gpsStatus === "permission_denied" || gpsStatus === "unavailable" || !gpsLocation) {
      toast({
        title: t("pilot.gps.title"),
        description: gpsStatus === "permission_denied" ? t("pilot.gps.permissionDenied") : t("pilot.gps.required"),
        variant: "destructive",
      });
      return;
    }
    
    // CRITICAL FIX: Validate all photos are server-backed before submission
    if (isProcessingPhotos) {
      toast({
        title: t("driver.washout.photosProcessingTitle"),
        description: t("driver.washout.photosProcessingDescription"),
        variant: "destructive",
      });
      return;
    }

    if (hasTempOrInvalidUrls()) {
      toast({
        title: t("driver.washout.invalidPhotoUrlsTitle"),
        description: t("driver.washout.invalidPhotoUrlsDescription"),
        variant: "destructive",
      });
      return;
    }

    if (!areAllPhotosServerBacked()) {
      toast({
        title: t("driver.washout.uploadIncompleteTitle"),
        description: t("driver.washout.uploadIncompleteDescription"),
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await checkInMutation.mutateAsync({
        activityData: {
          locationId: location.id,
          amount: location.rate,
          latitude: gpsLocation?.lat?.toString(),
          longitude: gpsLocation?.lng?.toString(),
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
          {t("driver.washout.title", { location: location.name })}
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
              <span className="text-sm text-muted-foreground">{t("driver.washout.configuredIncentive")}</span>
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
          <p className="mt-2 text-xs text-muted-foreground">{t("driver.washout.configuredIncentiveQualification")}</p>

          {/* GPS Status */}
          {gpsStatus === "ready" && gpsLocation && (
            <div className="flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <ShieldCheck className="w-4 h-4 mr-2" />
              <span data-testid="text-gps-verified">
                {t("pilot.gps.ready")}
              </span>
            </div>
          )}
          {gpsStatus === "checking" && (
            <div className="flex items-center rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              <span>{t("pilot.gps.checking")}</span>
            </div>
          )}
          {gpsStatus === "retrying" && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700" data-testid="gps-preflight-retrying">
              <div className="flex items-center">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                <span>{t("pilot.gps.retrying")}</span>
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-3" disabled data-testid="button-retry-gps">
                {t("pilot.gps.retry")}
              </Button>
            </div>
          )}
          {gpsStatus === "required" && (
            <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-950" data-testid="gps-preflight-required">
              <p className="font-medium">{t("pilot.gps.required")}</p>
              <p className="mt-1 text-xs text-sky-800">{t("pilot.gps.why")}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void retryGps()} data-testid="button-retry-gps">
                <MapPin className="mr-2 h-4 w-4" />
                {t("pilot.gps.retry")}
              </Button>
            </div>
          )}
          {(gpsStatus === "permission_denied" || gpsStatus === "unavailable") && (
            <div className="flex items-start rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <ShieldAlert className="w-4 h-4 mr-2 mt-0.5" />
              <div>
                <p className="font-medium">{gpsStatus === "permission_denied" ? t("pilot.gps.permissionDenied") : t("pilot.gps.unavailable")}</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {gpsWarning || t("pilot.gps.why")}
                </p>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void retryGps()} data-testid="button-retry-gps">
                  {t("pilot.gps.retry")}
                </Button>
              </div>
            </div>
          )}

          {/* Photo Upload */}
          <div className="space-y-2">
            <Label htmlFor="photo-input" className="flex items-center">
              <Camera className="w-4 h-4 mr-2" />
              {t("driver.washout.uploadPhotos")}
            </Label>
            <p className="text-xs text-muted-foreground">{t("pilot.upload.requirement")}</p>
            <div className="space-y-2">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) await uploadSelectedPhotos(files);
                  e.target.value = '';
                }}
                disabled={isProcessingPhotos}
                className="hidden"
                id="photo-input"
              />
              <Button
                type="button"
                onClick={() => document.getElementById('photo-input')?.click()}
                className="w-full mt-2"
                disabled={isProcessingPhotos}
              >
                <Camera className="w-5 h-5 mr-2" />
                {t("driver.washout.takePhotos", { count: Math.max(photoData.length, photoUrls.length) })}
              </Button>
            </div>
            
            {uploadRecovery.state === "uploading" ? (
                <div className="space-y-1 text-sm text-blue-600" data-testid="text-photos-processing">
                  <p>{t("pilot.upload.progressUploading", { current: uploadProgress?.current || 1, total: uploadProgress?.total || 1 })}</p>
                  <p className="text-xs">{t("pilot.upload.progressUploaded", { completed: uploadProgress?.completed || 0, total: uploadProgress?.total || 1 })}</p>
                </div>
              ) : uploadRecovery.state === "partial_failure" || uploadRecovery.state === "failed" ? (
                <div className="space-y-1 text-sm text-amber-700" data-testid="text-photos-partial-failure">
                  <p>{t("pilot.upload.progressUploaded", { completed: uploadRecovery.successfulCount, total: uploadRecovery.totalCount })}</p>
                  <p>{t("pilot.upload.partial", { count: uploadRecovery.failedCount })}</p>
                  <p className="text-xs">{t("pilot.upload.incompleteHelp")}</p>
                </div>
              ) : hasTempOrInvalidUrls() ? (
                <p className="text-sm text-red-600" data-testid="text-photos-failed">
                  ❌ {photoUrls.filter(url => url.startsWith('temp-') || url.startsWith('local-') || url.startsWith('data:') || url.startsWith('photo-')).length} photo(s) failed to upload. Please re-upload.
                </p>
              ) : uploadRecovery.state === "complete" ? (
                <p className="text-sm text-green-600" data-testid="text-photos-uploaded">
                  ✅ {t("pilot.upload.complete", { count: uploadRecovery.successfulCount })}
                </p>
            ) : (
              <p className="text-sm text-amber-600" data-testid="text-photos-required">
                {t("pilot.upload.requirement")}
              </p>
            )}
            {failedPhotoFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-destructive">{t("pilot.upload.failedCount", { count: failedPhotoFiles.length })}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void retryFailedPhotos()} disabled={isProcessingPhotos} data-testid="button-retry-failed-photos">
                  {t("pilot.upload.retry")}
                </Button>
              </div>
            )}
            
                </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">{t("driver.washout.notes")}</Label>
            <Textarea
              id="notes"
              placeholder={t("driver.washout.notesPlaceholder")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="textarea-notes"
            />
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full"
            disabled={!checkInButton.enabled}
            data-testid="button-complete-checkin"
          >
            {isSubmitting ? t("driver.washout.processing") :
             isProcessingPhotos ? t("driver.washout.processingPhotos") :
             photoUrls.length === 0 ? t("driver.washout.uploadToContinue") :
             hasTempOrInvalidUrls() ? t("driver.washout.reuploadRequired") :
             t("driver.washout.complete")}
          </Button>

          {submissionError && submissionError.action !== "none" && submissionError.action !== "reauthenticate" && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="alert" data-testid="driver-operational-recovery">
              <p className="font-medium">{t(submissionError.titleKey)}</p>
              <p className="mt-1">{t(submissionError.descriptionKey)}</p>
              {submissionError.action === "retry" ? <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setSubmissionError(null)}>{t("common.retry")}</Button> : (
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setLocation(submissionError.action === "profile" || submissionError.action === "terms" ? "/profile" : submissionError.action === "locations" ? "/locations" : "/")}>
                  {submissionError.action === "profile" || submissionError.action === "terms" ? t("driver.error.openProfile") : submissionError.action === "locations" ? t("driver.error.browseLocations") : t("driver.error.chooseMaterial")}
                </Button>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            {t("driver.washout.confirmation")}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
