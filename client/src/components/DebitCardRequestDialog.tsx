import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, MapPin, CheckCircle2, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface DebitCardRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverName?: string;
  driverAddress?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
}

export function DebitCardRequestDialog({
  open,
  onOpenChange,
  driverName = "",
  driverAddress = {},
}: DebitCardRequestDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    shippingName: driverName,
    shippingStreet: driverAddress.street || "",
    shippingCity: driverAddress.city || "",
    shippingState: driverAddress.state || "",
    shippingZip: driverAddress.zip || "",
    agreeToTerms: false,
  });

  const requestCardMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await apiRequest("POST", "/api/drivers/request-debit-card", data);
    },
    onSuccess: () => {
      toast({
        title: "Debit Card Requested!",
        description: "Your debit card request has been submitted. You'll receive it at the address provided within 7-10 business days.",
      });
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['/api/drivers/debit-card-status'] });
    },
    onError: (error: any) => {
      toast({
        title: "Request Failed",
        description: error.message || "Failed to submit debit card request",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.agreeToTerms) {
      toast({
        title: "Terms Required",
        description: "Please agree to the terms and conditions",
        variant: "destructive",
      });
      return;
    }

    requestCardMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-debit-card-request">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <CreditCard className="w-5 h-5 mr-2" />
            Request Debit Card
          </DialogTitle>
          <DialogDescription>
            Get instant access to your funds with a debit card linked to your WashOut Pro account
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Benefits Alert */}
          <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800 dark:text-green-200 text-sm">
              <strong>Instant Access:</strong> Use your card at ATMs and stores without waiting for bank transfers
            </AlertDescription>
          </Alert>

          {/* Shipping Information */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 text-sm font-medium">
              <MapPin className="w-4 h-4" />
              <span>Shipping Address</span>
            </div>

            <div>
              <Label htmlFor="shippingName">Full Name on Card</Label>
              <Input
                id="shippingName"
                value={formData.shippingName}
                onChange={(e) => handleInputChange("shippingName", e.target.value)}
                required
                data-testid="input-card-name"
              />
            </div>

            <div>
              <Label htmlFor="shippingStreet">Street Address</Label>
              <Input
                id="shippingStreet"
                value={formData.shippingStreet}
                onChange={(e) => handleInputChange("shippingStreet", e.target.value)}
                required
                data-testid="input-street"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="shippingCity">City</Label>
                <Input
                  id="shippingCity"
                  value={formData.shippingCity}
                  onChange={(e) => handleInputChange("shippingCity", e.target.value)}
                  required
                  data-testid="input-city"
                />
              </div>
              <div>
                <Label htmlFor="shippingState">State</Label>
                <Input
                  id="shippingState"
                  value={formData.shippingState}
                  onChange={(e) => handleInputChange("shippingState", e.target.value)}
                  maxLength={2}
                  required
                  data-testid="input-state"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="shippingZip">ZIP Code</Label>
              <Input
                id="shippingZip"
                value={formData.shippingZip}
                onChange={(e) => handleInputChange("shippingZip", e.target.value)}
                required
                data-testid="input-zip"
              />
            </div>
          </div>

          {/* Terms and Conditions */}
          <div className="flex items-start space-x-2">
            <Checkbox
              id="agreeToTerms"
              checked={formData.agreeToTerms}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, agreeToTerms: checked as boolean }))
              }
              data-testid="checkbox-terms"
            />
            <label
              htmlFor="agreeToTerms"
              className="text-sm text-muted-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              I agree to receive a debit card and understand that it will be linked to my WashOut Pro account. 
              Card activation and usage are subject to terms and conditions.
            </label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={requestCardMutation.isPending}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={requestCardMutation.isPending || !formData.agreeToTerms}
              data-testid="button-submit-card-request"
            >
              {requestCardMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Request Card
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
