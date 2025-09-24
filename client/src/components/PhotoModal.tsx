import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, ImageIcon, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface PhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  activity: any;
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
      const response = await apiRequest(`/api/photos/activity/${activity.id}`);
      return response.json();
    },
    enabled: !!activity?.id && isOpen
  });
  
  // Reset photo index when activity changes or modal opens
  useEffect(() => {
    setCurrentPhotoIndex(0);
  }, [activity?.id, isOpen]);
  
  if (!activity) return null;
  
  const photos = photosData?.photos || [];
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
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Washout Photos</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Loading photos...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Show error state
  if (error) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Washout Photos</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-8 text-red-600">
            <ImageIcon className="h-8 w-8" />
            <span className="ml-2">Failed to load photos</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (photos.length === 0) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Washout Verification</span>
              <Badge 
                variant={status === 'verified' ? 'default' : status === 'pending' ? 'secondary' : 'destructive'}
              >
                {status === 'verified' ? 'Approved' : status === 'pending' ? 'Pending' : 'Rejected'}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-8 text-gray-500">
            <ImageIcon className="h-8 w-8" />
            <span className="ml-2">No photos available for this washout</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const currentPhoto = photos[currentPhotoIndex];

  const nextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % photos.length);
  };

  const prevPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Washout Verification</span>
            <Badge 
              variant={status === 'verified' ? 'default' : status === 'pending' ? 'secondary' : 'destructive'}
            >
              {status === 'verified' ? 'Approved' : status === 'pending' ? 'Pending' : 'Rejected'}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Activity Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Driver:</span> {driverName}
              {truckNumber && <span className="text-gray-600"> (Truck #{truckNumber})</span>}
            </div>
            <div>
              <span className="font-medium">Location:</span> {locationName}
            </div>
            <div>
              <span className="font-medium">Amount:</span> {formatCurrency(amount)}
            </div>
            <div>
              <span className="font-medium">Check-in:</span> {
                checkInTime ? new Date(checkInTime).toLocaleString() : 'N/A'
              }
            </div>
          </div>

          {/* Photo Viewer */}
          <div className="relative">
            <div className="flex items-center justify-center bg-gray-100 rounded-lg min-h-[400px] relative">
              {/* Main Photo - NEW: Simple img tag with signed URL */}
              <img
                src={currentPhoto.url}
                alt={`Washout photo ${currentPhotoIndex + 1}`}
                className="max-w-full max-h-[500px] object-contain rounded-lg"
                data-testid={`photo-${currentPhotoIndex}`}
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = '/placeholder-image.jpg';
                }}
              />

              {/* Navigation buttons for multiple photos */}
              {photos.length > 1 && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute left-2 bg-white/90 hover:bg-white"
                    onClick={prevPhoto}
                    data-testid="button-previous-photo"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute right-2 bg-white/90 hover:bg-white"
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
                <span className="text-sm text-gray-600" data-testid="text-photo-counter">
                  Photo {currentPhotoIndex + 1} of {photos.length}
                </span>
              </div>
            )}

            {/* Photo Thumbnails for multiple photos */}
            {photos.length > 1 && (
              <div className="flex justify-center space-x-2 mt-4 overflow-x-auto">
                {photos.map((photo, index) => (
                  <button
                    key={photo.id}
                    onClick={() => setCurrentPhotoIndex(index)}
                    className={`flex-shrink-0 w-16 h-16 rounded border-2 overflow-hidden ${
                      index === currentPhotoIndex 
                        ? 'border-blue-500' 
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    data-testid={`thumbnail-${index}`}
                  >
                    <img
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
          <div className="text-xs text-gray-500 text-center">
            Uploaded: {currentPhoto.uploadedAt ? 
              new Date(currentPhoto.uploadedAt).toLocaleString() : 'Unknown'
            }
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}