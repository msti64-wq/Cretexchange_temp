import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";
import { LegalDocumentViewer } from "@/components/LegalDocumentViewer";

interface DriverTermsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccepted?: () => void;
  readOnly?: boolean;
}

export function DriverTermsDialog({ open, onOpenChange, onAccepted, readOnly = false }: DriverTermsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { language, t } = useLanguage();
  const [hasReadTerms, setHasReadTerms] = useState(false);

  const termsStatusUrl = `/api/drivers/terms-status?language=${encodeURIComponent(language)}`;

  const agreeToTermsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/drivers/agree-to-terms", { language });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: t("legal.acceptedToast") });
      queryClient.setQueryData([termsStatusUrl], data);
      queryClient.invalidateQueries({ queryKey: [termsStatusUrl] });
      queryClient.invalidateQueries({ queryKey: ['/api/drivers/terms-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
      onOpenChange(false);
      setHasReadTerms(false);
      onAccepted?.();
    },
    onError: () => {
      toast({
        title: t("legal.acceptFailedToast"),
        description: t("legal.acceptFailedDescription"),
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-primary" />
            <span>{t("legal.driverDialogTitle")}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
            <div className="flex items-center mb-2">
              <AlertCircle className="w-4 h-4 text-blue-600 mr-2" />
              <span className="font-semibold text-blue-800">
                {readOnly ? t("legal.reviewAccepted") : t("legal.requiredReading")}
              </span>
            </div>
            <p className="text-blue-700 text-xs">
              {readOnly ? t("legal.readOnlyDescription") : t("legal.driverRequiredDescription")}
            </p>
          </div>

          <div className="max-h-[500px] overflow-y-auto">
            <LegalDocumentViewer role="driver" language={language} />
          </div>

          {!readOnly && (
            <>
              <div className="flex items-center space-x-2 p-3 border border-border rounded">
                <Checkbox
                  id="terms-read"
                  checked={hasReadTerms}
                  onCheckedChange={(v) => setHasReadTerms(!!v)}
                  data-testid="checkbox-terms-read"
                />
                <label htmlFor="terms-read" className="text-sm cursor-pointer">
                  {t("legal.readAndUnderstand")}
                </label>
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  data-testid="button-cancel-terms"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={() => agreeToTermsMutation.mutate()}
                  disabled={!hasReadTerms || agreeToTermsMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="button-agree-terms"
                >
                  {agreeToTermsMutation.isPending ? t("legal.recording") : t("legal.iAgree")}
                </Button>
              </div>
            </>
          )}

          {readOnly && (
            <div className="flex justify-center pt-4 border-t">
              <Button
                onClick={() => onOpenChange(false)}
                className="w-32"
                data-testid="button-close-terms"
              >
                {t("common.close")}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
