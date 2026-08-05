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
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { FEATURE_FLAGS } from "@shared/featureFlags";
import { DriverGeofenceIndicator, type DriverGeofenceState } from "@/components/driver/DriverGeofenceIndicator";
import type { Coordinates } from "@/lib/gps";

const MAX_PHOTO_UPLOAD_BYTES = 15 * 1024 * 1024;
const SUPPORTED_PHOTO_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function createSubmissionReference(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const suffix = Array.from({ length: 12 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `00000000-0000-4000-8000-${suffix}`;
}

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
  const [gpsLocation, setGpsLocation] = useState<({ lat: number; lng: number } & Coordinates) | null>(null);
  const [geofenceAdvisoryState, setGeofenceAdvisoryState] = useState<DriverGeofenceState | null>(null);
  const [geofenceAdvisoryLoading, setGeofenceAdvisoryLoading] = useState(false);
  const [geofenceState, setGeofenceState] = useState<DriverGeofenceState | null>(null);
  const [geofenceReason, setGeofenceReason] = useState("");
  const [geofenceAcknowledged, setGeofenceAcknowledged] = useState(false);
  const [geofenceNote, setGeofenceNote] = useState("");
  const submissionReference = useRef(createSubmissionReference());
  const { enabled: geofenceAdvisoryEnabled } = useFeatureFlag(FEATURE_FLAGS.GEOFENCE_ADVISORY_EVALUATION);
  const { enabled: geofenceEnforcementEnabled } = useFeatureFlag(FEATURE_FLAGS.GEOFENCE_SUBMISSION_ENFORCEMENT);
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

  const ensureGpsLocation = async ({ isRetry = false, forceRefresh = false }: { isRetry?: boolean; forceRefresh?: boolean } = {}) => {
    if (gpsLocation && !forceRefresh) {
      return gpsLocation;
    }

    if (forceRefresh) setGpsLocation(null);
    setGpsStatus(isRetry ? "retrying" : "checking");
    try {
      const coords = await getCurrentLocation();
      const nextLocation = { lat: coords.latitude, lng: coords.longitude, ...coords };
      setGpsLocation(nextLocation);
      setGpsStatus("ready");
      setGpsWarning(null);
      return nextLocation;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setGpsLocation(null);
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

  useEffect(() => {
    if (!geofenceAdvisoryEnabled) {
      setGeofenceAdvisoryState(null);
      setGeofenceAdvisoryLoading(false);
      return;
    }
    if (!["ready", "permission_denied", "unavailable"].includes(gpsStatus)) return;

    let active = true;
    setGeofenceAdvisoryLoading(true);
    void apiRequest(`/api/drivers/locations/${location.id}/geofence-advisory`, {
      method: "POST",
      body: JSON.stringify({ observation: gpsLocation ? {
        latitude: gpsLocation.latitude,
        longitude: gpsLocation.longitude,
        accuracyMeters: gpsLocation.accuracyMeters,
        observedAt: gpsLocation.observedAt,
      } : null }),
    }).then((response) => response.json()).then((result) => {
      if (active) setGeofenceAdvisoryState(result.state);
    }).catch(() => {
      if (active) setGeofenceAdvisoryState("LOCATION_UNAVAILABLE");
    }).finally(() => {
      if (active) setGeofenceAdvisoryLoading(false);
    });
    return () => { active = false; };
  }, [geofenceAdvisoryEnabled, gpsStatus, gpsLocation?.observedAt, location.id]);

  useEffect(() => {
    if (!geofenceEnforcementEnabled || !gpsLocation) {
      setGeofenceState(null);
      return;
    }
    let active = true;
    void apiRequest(`/api/drivers/locations/${location.id}/geofence-check`, {
      method: "POST",
      body: JSON.stringify({ observation: {
        latitude: gpsLocation.latitude,
        longitude: gpsLocation.longitude,
        accuracyMeters: gpsLocation.accuracyMeters,
        observedAt: gpsLocation.observedAt,
      } }),
    }).then((response) => response.json()).then((result) => {
      if (active) setGeofenceState(result.state);
    }).catch(() => {
      if (active) setGeofenceState("LOCATION_UNAVAILABLE");
    });
    return () => { active = false; };
  }, [geofenceEnforcementEnabled, gpsLocation?.observedAt, location.id]);

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
    if (geofenceAdvisoryEnabled) {
      setGeofenceAdvisoryState(null);
      setGeofenceAdvisoryLoading(true);
    }
    const browserLocation = await ensureGpsLocation({ isRetry: true, forceRefresh: true });
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

    if (geofenceEnforcementEnabled && geofenceState === "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE" && (!geofenceAcknowledged || !geofenceReason)) {
      toast({ title: t("geofence.driver.acknowledgementRequired"), description: t("geofence.driver.acknowledgementRequiredHelp"), variant: "destructive" });
      return;
    }

    if (geofenceEnforcementEnabled && geofenceState && ["LOCATION_UNAVAILABLE", "LOCATION_ACCURACY_INSUFFICIENT", "GEOMETRY_INVALID"].includes(geofenceState)) {
      toast({ title: t("geofence.driver.unavailable"), description: t("geofence.driver.retryLocation"), variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    try {
      const submissionGps = geofenceEnforcementEnabled ? await getCurrentLocation() : gpsLocation;
      if (geofenceEnforcementEnabled) setGpsLocation({ lat: submissionGps.latitude, lng: submissionGps.longitude, ...submissionGps });
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
        geofenceEvidence: geofenceEnforcementEnabled ? {
          submissionReference: submissionReference.current,
          observation: {
            latitude: submissionGps.latitude,
            longitude: submissionGps.longitude,
            accuracyMeters: submissionGps.accuracyMeters,
            observedAt: submissionGps.observedAt,
          },
          acknowledgement: geofenceState === "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE" ? {
            confirmed: geofenceAcknowledged,
            reasonCode: geofenceReason,
            note: geofenceNote.trim() || undefined,
          } : undefined,
        } : undefined,
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

          {geofenceAdvisoryEnabled && geofenceAdvisoryLoading && (
            <div className="flex min-h-11 items-center rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800" role="status" aria-label={t("geofence.driver.checking")} data-testid="driver-checkin-geofence-loading">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
              <span>{t("geofence.driver.checking")}</span>
            </div>
          )}
          {geofenceAdvisoryEnabled && !geofenceAdvisoryLoading && geofenceAdvisoryState && (
            <div data-testid="driver-checkin-geofence-advisory">
              <DriverGeofenceIndicator state={geofenceAdvisoryState} />
              {["LOCATION_UNAVAILABLE", "LOCATION_ACCURACY_INSUFFICIENT", "GEOMETRY_UNAVAILABLE", "GEOMETRY_INVALID"].includes(geofenceAdvisoryState) && (
                <Button type="button" variant="outline" size="sm" className="mb-3 min-h-11" onClick={() => void retryGps()} disabled={gpsStatus === "retrying"} data-testid="button-retry-geofence-gps">
                  <MapPin className="mr-2 h-4 w-4" />
                  {t("geofence.driver.retryGps")}
                </Button>
              )}
            </div>
          )}
          {geofenceEnforcementEnabled && !geofenceAdvisoryEnabled && geofenceState && <DriverGeofenceIndicator state={geofenceState} />}
          {geofenceEnforcementEnabled && geofenceState === "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE" && (
            <fieldset className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
              <legend className="px-1 font-medium">{t("geofence.driver.confirmException")}</legend>
              <Label htmlFor="geofence-reason">{t("geofence.driver.reason")}</Label>
              <select id="geofence-reason" className="h-10 w-full rounded-md border bg-white px-3" value={geofenceReason} onChange={(event) => setGeofenceReason(event.target.value)} required>
                <option value="">{t("geofence.driver.chooseReason")}</option>
                <option value="FACILITY_PERSONNEL_DIRECTED">{t("geofence.driver.reason.personnel")}</option>
                <option value="APPROVED_AREA_INACCESSIBLE">{t("geofence.driver.reason.inaccessible")}</option>
                <option value="BOUNDARY_APPEARS_INCORRECT">{t("geofence.driver.reason.boundary")}</option>
                <option value="GPS_APPEARS_INACCURATE">{t("geofence.driver.reason.gps")}</option>
                <option value="OTHER">{t("geofence.driver.reason.other")}</option>
              </select>
              <Label htmlFor="geofence-note">{t("geofence.driver.note")}</Label>
              <Textarea id="geofence-note" value={geofenceNote} onChange={(event) => setGeofenceNote(event.target.value)} maxLength={500} placeholder={t("geofence.driver.notePlaceholder")} />
              <label className="flex gap-2 text-sm"><input type="checkbox" checked={geofenceAcknowledged} onChange={(event) => setGeofenceAcknowledged(event.target.checked)} />{t("geofence.driver.confirmAccuracy")}</label>
            </fieldset>
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
            disabled={!checkInButton.enabled || (geofenceEnforcementEnabled && Boolean(geofenceState && ["LOCATION_UNAVAILABLE", "LOCATION_ACCURACY_INSUFFICIENT", "GEOMETRY_INVALID"].includes(geofenceState)))}
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
