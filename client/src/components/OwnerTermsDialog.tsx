import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";
import { LegalDocumentViewer } from "@/components/LegalDocumentViewer";

interface OwnerTermsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccepted?: () => void;
  readOnly?: boolean;
}

export function OwnerTermsDialog({ open, onOpenChange, onAccepted, readOnly = false }: OwnerTermsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { language, t } = useLanguage();
  const [hasReadTerms, setHasReadTerms] = useState(false);

  const termsStatusUrl = `/api/owners/terms-status?language=${encodeURIComponent(language)}`;

  const agreeToTermsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/owners/agree-to-terms", { language });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: t("legal.acceptedToast") });
      queryClient.setQueryData([termsStatusUrl], data);
      queryClient.invalidateQueries({ queryKey: [termsStatusUrl] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/terms-status'] });
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

  const handleAccept = () => {
    if (readOnly) {
      onAccepted?.();
      onOpenChange(false);
      return;
    }

    agreeToTermsMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Building2 className="w-5 h-5 text-primary" />
            <span>{t("legal.ownerDialogTitle")}</span>
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
              {readOnly ? t("legal.readOnlyDescription") : t("legal.ownerRequiredDescription")}
            </p>
          </div>

          <div className="max-h-[500px] overflow-y-auto">
            <LegalDocumentViewer role="owner" language={language} />
          </div>

          {!readOnly && (
            <>
              <div className="space-y-3 rounded border border-border p-4">
                <p className="text-sm font-medium text-foreground">
                  {t("legal.readAndUnderstand")}
                </p>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    id="owner-terms-read"
                    checked={hasReadTerms}
                    onCheckedChange={(v) => setHasReadTerms(!!v)}
                    data-testid="checkbox-owner-terms-read"
                  />
                  <span>{t("legal.iAgree")}</span>
                </label>
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  data-testid="button-cancel-owner-terms"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleAccept}
                  disabled={!hasReadTerms || agreeToTermsMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="button-agree-owner-terms"
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
                data-testid="button-close-owner-terms"
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
