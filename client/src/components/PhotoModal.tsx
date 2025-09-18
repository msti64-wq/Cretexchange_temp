import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

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
  
  // Reset photo index when activity changes or modal opens
  useEffect(() => {
    setCurrentPhotoIndex(0);
  }, [activity?.id, isOpen]);
  
  if (!activity) return null;
  
  // Helper function to get photo URLs from different activity formats
  const getPhotoUrls = (activity: any): string[] => {
    // Check multiple possible sources for photo URLs
    const possibleSources = [
      activity.photoUrls,
      activity.photo_urls,
      activity.washout_activities?.photo_urls
    ];
    
    for (const source of possibleSources) {
      if (!source) continue;
      
      let urls: string[] = [];
      
      // Handle different data types
      if (typeof source === 'string') {
        // Handle Postgres array string format like "{url1,url2}"
        if (source.startsWith('{') && source.endsWith('}')) {
          urls = source.slice(1, -1).split(',').map(url => url.trim()).filter(Boolean);
        } else {
          // Single string URL
          urls = [source];
        }
      } else if (Array.isArray(source)) {
        // Already an array
        urls = source.filter(Boolean); // Remove empty/null values
      }
      
      // Return first non-empty array found
      if (urls.length > 0) {
        return urls;
      }
    }
    
    return []; // No photos found
  };
  
  // Robust photo URL extraction to handle different API response formats
  const photoUrls = getPhotoUrls(activity);
  
  const status = activity.status;
  const amount = activity.amount || 0;
  const driverName = `${activity.driver?.user?.firstName || ''} ${activity.driver?.user?.lastName || ''}`.trim();
  const truckNumber = activity.driver?.truckNumber;
  const locationName = activity.location?.name || '';
  const checkInTime = activity.checkInTime;

  // Helper function to get displayable photo URL
  const getPhotoDisplayUrl = (photoUrl: string) => {
    if (photoUrl.startsWith('local-photo-')) {
      // Get the base64 data from session storage
      const base64Data = sessionStorage.getItem(photoUrl);
      return base64Data || '/placeholder-image.jpg';
    }
    return photoUrl;
  };

  const nextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % photoUrls.length);
  };

  const prevPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + photoUrls.length) % photoUrls.length);
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
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div>
              <h3 className="font-semibold text-lg" data-testid="text-driver-info">
                {driverName}
                {String(truckNumber || '') && (
                  <span className="text-muted-foreground font-normal">
                    {driverName ? ' - ' : ''}Truck #{truckNumber}
                  </span>
                )}
              </h3>
              <p className="text-muted-foreground">{locationName}</p>
              {checkInTime && (
                <p className="text-sm text-muted-foreground">
                  {new Date(checkInTime).toLocaleDateString()} at{' '}
                  {new Date(checkInTime).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </p>
              )}
              {(activity.latitude && activity.longitude) && (
                <p className="text-sm text-muted-foreground" data-testid="text-gps-coordinates">
                  🌐 GPS: {Number(activity.latitude).toFixed(6)}, {Number(activity.longitude).toFixed(6)}
                </p>
              )}
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-primary">{formatCurrency(Number(amount))}</div>
              <p className="text-sm text-muted-foreground">Washout Amount</p>
            </div>
          </div>

          {/* Photo Viewer */}
          {photoUrls.length > 0 ? (
            <div className="space-y-4">
              <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: "16/9" }}>
                <img
                  src={getPhotoDisplayUrl(photoUrls[currentPhotoIndex])}
                  alt={`Washout photo ${currentPhotoIndex + 1}`}
                  className="w-full h-full object-contain"
                  data-testid={`image-washout-photo-${currentPhotoIndex}`}
                />
                
                {photoUrls.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70"
                      onClick={prevPhoto}
                      data-testid="button-prev-photo"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70"
                      onClick={nextPhoto}
                      data-testid="button-next-photo"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </>
                )}
                
                {photoUrls.length > 1 && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white px-2 py-1 rounded text-sm">
                    {currentPhotoIndex + 1} of {photoUrls.length}
                  </div>
                )}
              </div>

              {photoUrls.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {photoUrls.map((url: string, index: number) => (
                    <img
                      key={index}
                      src={getPhotoDisplayUrl(url)}
                      alt={`Thumbnail ${index + 1}`}
                      className={`w-16 h-16 object-cover rounded cursor-pointer border-2 flex-shrink-0 ${
                        index === currentPhotoIndex ? 'border-primary' : 'border-transparent'
                      }`}
                      onClick={() => setCurrentPhotoIndex(index)}
                      data-testid={`thumbnail-photo-${index}`}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No photos available for this washout</p>
              
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}