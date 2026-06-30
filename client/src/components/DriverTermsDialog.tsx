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
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-slate-100">
            <FileText className="w-5 h-5 text-sky-400" />
            <span>{t("legal.driverDialogTitle")}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center mb-2">
              <AlertCircle className="mr-2 h-4 w-4 text-sky-400" />
              <span className="font-semibold text-slate-100">
                {readOnly ? t("legal.reviewAccepted") : t("legal.requiredReading")}
              </span>
            </div>
            <p className="text-xs text-slate-300">
              {readOnly ? t("legal.readOnlyDescription") : t("legal.driverRequiredDescription")}
            </p>
          </div>

          <div className="max-h-[500px] overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/80 p-1">
            <LegalDocumentViewer role="driver" language={language} />
          </div>

          {!readOnly && (
            <>
              <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-sm font-medium text-slate-100">
                  {t("legal.readAndUnderstand")}
                </p>
                <label className="flex items-center gap-2 text-sm cursor-pointer text-slate-200">
                  <Checkbox
                    id="terms-read"
                    checked={hasReadTerms}
                    onCheckedChange={(v) => setHasReadTerms(!!v)}
                    data-testid="checkbox-terms-read"
                  />
                  <span>{t("legal.iAgree")}</span>
                </label>
              </div>

              <div className="flex items-center justify-between border-t border-slate-800 pt-4">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-slate-100"
                  data-testid="button-cancel-terms"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={() => agreeToTermsMutation.mutate()}
                  disabled={!hasReadTerms || agreeToTermsMutation.isPending}
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
                  data-testid="button-agree-terms"
                >
                  {agreeToTermsMutation.isPending ? t("legal.recording") : t("legal.iAgree")}
                </Button>
              </div>
            </>
          )}

          {readOnly && (
            <div className="flex justify-center border-t border-slate-800 pt-4">
              <Button
                onClick={() => onOpenChange(false)}
                className="w-32 bg-sky-600 text-white hover:bg-sky-500"
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
