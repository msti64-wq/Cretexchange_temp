import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, ImageIcon, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { AuthenticatedImage } from "@/components/AuthenticatedImage";
import { formatPhotoVerificationStatus } from "@shared/photoVerification";
import type { PhotoDuplicateMatch } from "@shared/photoFingerprint";

interface PhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  activity: any;
  canApprove?: boolean;
}

interface PhotoItem {
  id: string;
  url: string;
  uploadedAt?: string | null;
  photoTakenAt?: string | null;
  gpsLatitude?: string | number | null;
  gpsLongitude?: string | number | null;
  verificationStatus?: "verified" | "warning" | "failed" | "needs_review" | null;
  verificationDistanceMiles?: string | number | null;
  verificationReason?: string | null;
  duplicateMatchedPhotoId?: string | null;
  duplicateMatchedUploadedAt?: string | null;
  duplicateSimilarityScore?: number | string | null;
  duplicateHashDistance?: number | string | null;
  locationId?: string | null;
  driverId?: string | null;
  duplicateMatches?: PhotoDuplicateMatch[] | null;
}

export function PhotoModal({ 
  isOpen, 
  onClose, 
  activity
}: PhotoModalProps) {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  
  // Fetch photos using new clean API
  const { data: photosData, isLoading, error } = useQuery({
    queryKey: ['activity-photos', activity?.id],
    queryFn: async () => {
      if (!activity?.id) return { photos: [] };
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/photos/activity/${activity.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.message || `Failed to load photos (${response.status})`
        );
      }

      return payload;
    },
    enabled: !!activity?.id && isOpen
  });
  
  // Reset photo index when activity changes or modal opens
  useEffect(() => {
    setCurrentPhotoIndex(0);
  }, [activity?.id, isOpen]);
  
  if (!activity) return null;
  
  const photos: PhotoItem[] = photosData?.photos || [];
  const status = activity.status;
  const amount = activity.amount || 0;
  const driverName = `${activity.driver?.user?.firstName || ''} ${activity.driver?.user?.lastName || ''}`.trim();
  const truckNumber = activity.driver?.truckNumber;
  const locationName = activity.location?.name || '';
  const checkInTime = activity.checkInTime;

  // Show loading state
  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-h-[90vh] max-w-4xl border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Recovery Evidence Photos</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-8 text-slate-300">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Loading photos...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Show error state
  if (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to load photos";
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-h-[90vh] max-w-4xl border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Recovery Evidence Photos</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-8 text-red-400">
            <ImageIcon className="h-8 w-8" />
            <span className="ml-2">{errorMessage}</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (photos.length === 0) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-h-[90vh] max-w-4xl border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-slate-100">
              <span>Recovery Verification</span>
              <Badge 
                variant={status === 'verified' ? 'default' : status === 'pending' ? 'secondary' : 'destructive'}
              >
                {status === 'verified' ? 'Approved' : status === 'pending' ? 'Pending' : 'Rejected'}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-8 text-slate-400">
            <ImageIcon className="h-8 w-8" />
            <span className="ml-2">No photos available for this recovery activity</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const currentPhoto = photos[currentPhotoIndex];
  const verificationStatus = currentPhoto.verificationStatus || "needs_review";
  const distanceMiles =
    currentPhoto.verificationDistanceMiles == null
      ? null
      : Number(currentPhoto.verificationDistanceMiles);
  const duplicateMatches = currentPhoto.duplicateMatches || [];
  const duplicateMatchedUploadedAt = currentPhoto.duplicateMatchedUploadedAt
    ? new Date(currentPhoto.duplicateMatchedUploadedAt).toLocaleString()
    : null;
  const duplicateSimilarityScore =
    currentPhoto.duplicateSimilarityScore == null
      ? null
      : Number(currentPhoto.duplicateSimilarityScore);
  const duplicateHashDistance =
    currentPhoto.duplicateHashDistance == null
      ? null
      : Number(currentPhoto.duplicateHashDistance);
  const badgeVariant =
    verificationStatus === "verified"
      ? "default"
      : verificationStatus === "warning"
        ? "secondary"
        : verificationStatus === "failed"
          ? "destructive"
          : "outline";

  const nextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % photos.length);
  };

  const prevPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-hidden border-slate-800 bg-slate-950 text-slate-100 shadow-2xl max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-slate-100">
            <span>Recovery Verification</span>
            <Badge 
              variant={status === 'verified' ? 'default' : status === 'pending' ? 'secondary' : 'destructive'}
            >
              {status === 'verified' ? 'Approved' : status === 'pending' ? 'Pending' : 'Rejected'}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Activity Details */}
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div>
              <span className="font-medium text-slate-200">Driver:</span> {driverName}
              {truckNumber && <span className="text-slate-400"> (Truck #{truckNumber})</span>}
            </div>
            <div>
              <span className="font-medium text-slate-200">Location:</span> {locationName}
            </div>
            <div>
              <span className="font-medium text-slate-200">Amount:</span> {formatCurrency(amount)}
            </div>
            <div>
              <span className="font-medium text-slate-200">Check-in:</span> {
                checkInTime ? new Date(checkInTime).toLocaleString() : 'N/A'
              }
            </div>
          </div>

          {/* Photo Viewer */}
          <div className="relative">
            <div className="relative flex min-h-[400px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900/80">
              {/* Main Photo - NEW: Simple img tag with signed URL */}
              <AuthenticatedImage
                src={currentPhoto.url}
                alt={`Recovery evidence photo ${currentPhotoIndex + 1}`}
                className="max-h-[500px] max-w-full rounded-lg object-contain"
                data-testid={`photo-${currentPhotoIndex}`}
              />

              {/* Navigation buttons for multiple photos */}
              {photos.length > 1 && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute left-2 border-slate-700 bg-slate-950/90 text-slate-100 hover:bg-slate-800 hover:text-slate-100"
                    onClick={prevPhoto}
                    data-testid="button-previous-photo"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute right-2 border-slate-700 bg-slate-950/90 text-slate-100 hover:bg-slate-800 hover:text-slate-100"
                    onClick={nextPhoto}
                    data-testid="button-next-photo"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>

            {/* Photo Counter */}
            {photos.length > 1 && (
              <div className="flex justify-center mt-2">
                <span className="text-sm text-slate-400" data-testid="text-photo-counter">
                  Photo {currentPhotoIndex + 1} of {photos.length}
                </span>
              </div>
            )}

            {/* Photo Thumbnails for multiple photos */}
            {photos.length > 1 && (
              <div className="flex justify-center space-x-2 mt-4 overflow-x-auto">
                {photos.map((photo: PhotoItem, index: number) => (
                  <button
                    key={photo.id}
                    onClick={() => setCurrentPhotoIndex(index)}
                    className={`flex-shrink-0 h-16 w-16 overflow-hidden rounded border-2 ${
                      index === currentPhotoIndex 
                        ? 'border-sky-500' 
                        : 'border-slate-700 hover:border-slate-500'
                    }`}
                    data-testid={`thumbnail-${index}`}
                  >
                    <AuthenticatedImage
                      src={photo.url}
                      alt={`Thumbnail ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Photo Metadata */}
          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-100">Verification</span>
                <Badge variant={badgeVariant}>
                  {formatPhotoVerificationStatus(verificationStatus)}
                </Badge>
              </div>
              {distanceMiles != null && (
                <span className="text-xs text-slate-400">
                  {distanceMiles.toFixed(2)} mi from location
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-1 text-xs text-slate-400 sm:grid-cols-2">
              <div>
                Taken: {currentPhoto.photoTakenAt
                  ? new Date(currentPhoto.photoTakenAt).toLocaleString()
                  : "Unknown"}
              </div>
              <div>
                Uploaded: {currentPhoto.uploadedAt
                  ? new Date(currentPhoto.uploadedAt).toLocaleString()
                  : "Unknown"}
              </div>
              <div>
                Location ID: {currentPhoto.locationId || activity?.location?.id || "Unknown"}
              </div>
              <div>
                Driver ID: {currentPhoto.driverId || activity?.driver?.id || "Unknown"}
              </div>
            </div>
            {currentPhoto.verificationReason && (
              <p className="text-xs text-slate-400">
                {currentPhoto.verificationReason}
              </p>
            )}
            {currentPhoto.duplicateMatchedPhotoId && (
              <div className="grid grid-cols-1 gap-1 text-xs text-slate-400 sm:grid-cols-2">
                <div>
                  Duplicate match photo ID: {currentPhoto.duplicateMatchedPhotoId}
                </div>
                <div>
                  Duplicate match uploaded: {duplicateMatchedUploadedAt || "Unknown"}
                </div>
                <div>
                  Duplicate similarity: {duplicateSimilarityScore == null ? "Unknown" : `${duplicateSimilarityScore}%`}
                </div>
                <div>
                  Duplicate hash distance: {duplicateHashDistance == null ? "Unknown" : duplicateHashDistance}
                </div>
              </div>
            )}
          </div>

          {duplicateMatches.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-slate-900/75 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-amber-300">Possible duplicate matches</div>
                <Badge variant="secondary">
                  {duplicateMatches.length} match{duplicateMatches.length === 1 ? "" : "es"}
                </Badge>
              </div>
              <div className="mt-3 space-y-2">
                {duplicateMatches.map((match, index) => (
                  <div
                    key={`${match.photoId}-${index}`}
                    className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-100"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">
                        Prior upload:{" "}
                        {match.priorUploadedAt
                          ? new Date(match.priorUploadedAt).toLocaleString()
                          : "Unknown"}
                      </div>
                      <Badge variant="outline">{match.confidence}% confidence</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                      <div>Driver: {match.driverName || match.driverId}</div>
                      <div>Location: {match.locationName || match.locationId}</div>
                      <div>Match photo: {match.photoId}</div>
                      <div>Hash distance: {match.hashDistance}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
