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
import { useLanguage } from "@/lib/i18n";

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
  const { t } = useLanguage();
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
        title: t("wallet.card.success"),
        description: t("wallet.card.successBody"),
      });
      onOpenChange(false);
      // Invalidate the debit card query to refetch the new card
      queryClient.invalidateQueries({ queryKey: ['/api/drivers/debit-card'] });
    },
    onError: (error: any) => {
      toast({
        title: t("wallet.card.failed"),
        description: t("wallet.card.failedBody"),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.agreeToTerms) {
      toast({
        title: t("wallet.card.termsRequired"),
        description: t("wallet.card.termsRequiredBody"),
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
      <DialogContent className="max-h-[90vh] overflow-y-auto border-slate-800 bg-slate-950 text-slate-100 shadow-2xl sm:max-w-[500px]" data-testid="dialog-debit-card-request">
        <DialogHeader>
          <DialogTitle className="flex items-center text-slate-100">
            <CreditCard className="mr-2 h-5 w-5 text-sky-400" />
            {t("wallet.card.dialogTitle")}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {t("wallet.card.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pb-2">
          {/* Benefits Alert */}
          <Alert className="border border-slate-800 bg-slate-900/70">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <AlertDescription className="text-sm text-slate-200">
              <strong>{t("wallet.card.instant")}</strong> {t("wallet.card.instantBody")}
            </AlertDescription>
          </Alert>

          {/* Shipping Information */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 text-sm font-medium text-slate-100">
              <MapPin className="h-4 w-4 text-sky-400" />
              <span>{t("wallet.card.shipping")}</span>
            </div>

            <div>
              <Label htmlFor="shippingName" className="text-slate-200">{t("wallet.card.fullName")}</Label>
              <Input
                id="shippingName"
                value={formData.shippingName}
                onChange={(e) => handleInputChange("shippingName", e.target.value)}
                required
                autoComplete="name"
                className="border-slate-700 bg-slate-900/80 text-slate-100 placeholder:text-slate-400 focus-visible:ring-sky-500/60"
                data-testid="input-card-name"
              />
            </div>

            <div>
              <Label htmlFor="shippingStreet" className="text-slate-200">{t("wallet.card.street")}</Label>
              <Input
                id="shippingStreet"
                value={formData.shippingStreet}
                onChange={(e) => handleInputChange("shippingStreet", e.target.value)}
                required
                autoComplete="street-address"
                className="border-slate-700 bg-slate-900/80 text-slate-100 placeholder:text-slate-400 focus-visible:ring-sky-500/60"
                data-testid="input-street"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="shippingCity" className="text-slate-200">{t("wallet.card.city")}</Label>
                <Input
                  id="shippingCity"
                  value={formData.shippingCity}
                  onChange={(e) => handleInputChange("shippingCity", e.target.value)}
                  required
                  autoComplete="address-level2"
                  className="border-slate-700 bg-slate-900/80 text-slate-100 placeholder:text-slate-400 focus-visible:ring-sky-500/60"
                  data-testid="input-city"
                />
              </div>
              <div>
                <Label htmlFor="shippingState" className="text-slate-200">{t("wallet.card.state")}</Label>
                <Input
                  id="shippingState"
                  value={formData.shippingState}
                  onChange={(e) => handleInputChange("shippingState", e.target.value)}
                  maxLength={2}
                  required
                  autoComplete="address-level1"
                  className="border-slate-700 bg-slate-900/80 text-slate-100 placeholder:text-slate-400 focus-visible:ring-sky-500/60"
                  data-testid="input-state"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="shippingZip" className="text-slate-200">{t("wallet.card.zip")}</Label>
              <Input
                id="shippingZip"
                value={formData.shippingZip}
                onChange={(e) => handleInputChange("shippingZip", e.target.value)}
                required
                autoComplete="postal-code"
                className="border-slate-700 bg-slate-900/80 text-slate-100 placeholder:text-slate-400 focus-visible:ring-sky-500/60"
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
              className="text-sm leading-none text-slate-300 peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {t("wallet.card.terms")}
            </label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={requestCardMutation.isPending}
              className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-slate-100"
              data-testid="button-cancel"
            >
              {t("wallet.card.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={requestCardMutation.isPending || !formData.agreeToTerms}
              className="bg-sky-600 text-white hover:bg-sky-500"
              data-testid="button-submit-card-request"
            >
              {requestCardMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("wallet.card.submitting")}
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  {t("wallet.card.request")}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
