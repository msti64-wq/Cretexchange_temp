import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  activity: any;
  onApprove?: (activityId: string) => void;
  onReject?: (activityId: string) => void;
  isLoading?: boolean;
}

export function PhotoModal({ 
  isOpen, 
  onClose, 
  activity, 
  onApprove, 
  onReject, 
  isLoading = false 
}: PhotoModalProps) {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const approveMutation = useMutation({
    mutationFn: async (activityId: string) => {
      return apiRequest(`/api/owners/activities/${activityId}/verify`, {
        method: 'PUT',
      });
    },
    onSuccess: () => {
      toast({ title: "Washout approved for payment" });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/activities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to approve washout", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (activityId: string) => {
      return apiRequest(`/api/owners/activities/${activityId}/reject`, {
        method: 'PUT',
      });
    },
    onSuccess: () => {
      toast({ title: "Washout rejected" });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/activities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to reject washout", variant: "destructive" });
    },
  });
  
  if (!activity) return null;
  
  const photoUrls = activity.washout_activities?.photoUrls || [];
  const activityId = activity.washout_activities?.id;
  const status = activity.washout_activities?.status;
  const amount = activity.washout_activities?.amount || 0;
  const driverName = `${activity.users?.firstName || ''} ${activity.users?.lastName || ''}`.trim();
  const locationName = activity.washout_locations?.name || '';
  const checkInTime = activity.washout_activities?.checkInTime;

  const nextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % photoUrls.length);
  };

  const prevPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + photoUrls.length) % photoUrls.length);
  };

  const handleApprove = () => {
    if (activityId) {
      approveMutation.mutate(activityId);
    }
  };

  const handleReject = () => {
    if (activityId) {
      rejectMutation.mutate(activityId);
    }
  };

  const isProcessing = approveMutation.isPending || rejectMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Washout Verification</span>
            <Badge 
              variant={status === 'verified' ? 'default' : status === 'pending' ? 'secondary' : 'destructive'}
            >
              {status === 'verified' ? 'Paid' : status === 'pending' ? 'Pending' : 'Rejected'}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Activity Details */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div>
              <h3 className="font-semibold text-lg">{driverName}</h3>
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
                  src={photoUrls[currentPhotoIndex]}
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
                      src={url}
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

          {/* Action Buttons */}
          {status === 'pending' && (
            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={handleReject}
                variant="destructive"
                className="flex-1"
                disabled={isProcessing}
                data-testid="button-reject-washout"
              >
                <X className="w-4 h-4 mr-2" />
                Reject Washout
              </Button>
              <Button
                onClick={handleApprove}
                className="flex-1"
                disabled={isProcessing}
                data-testid="button-approve-washout"
              >
                <Check className="w-4 h-4 mr-2" />
                Approve for Payment
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}