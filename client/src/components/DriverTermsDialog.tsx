import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, Wallet, CreditCard, Clock, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface DriverTermsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccepted?: () => void;
  readOnly?: boolean;
}

export function DriverTermsDialog({ open, onOpenChange, onAccepted, readOnly = false }: DriverTermsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [hasReadTerms, setHasReadTerms] = useState(false);

  const agreeToTermsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/drivers/agree-to-terms", {});
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Terms accepted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/drivers/terms-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
      onOpenChange(false);
      onAccepted?.();
    },
    onError: () => {
      toast({ 
        title: "Failed to record agreement", 
        description: "Please try again",
        variant: "destructive" 
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Wallet className="w-5 h-5 text-primary" />
            <span>Wallet Terms and Conditions</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 text-sm">
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
            <div className="flex items-center mb-2">
              <AlertCircle className="w-4 h-4 text-blue-600 mr-2" />
              <span className="font-semibold text-blue-800">
                {readOnly ? "Terms & Conditions" : "Required Reading"}
              </span>
            </div>
            <p className="text-blue-700 text-xs">
              {readOnly 
                ? "Review the terms and conditions you have previously agreed to." 
                : "You must read and agree to these terms before using your wallet for withdrawals."
              }
            </p>
          </div>
          
          <div className="border rounded-lg p-4 bg-background">
            <div className="space-y-4 text-xs leading-relaxed max-h-96 overflow-y-auto">
              <div className="text-center">
                <h3 className="font-bold text-lg mb-2">WashOut Pro Driver Wallet Terms</h3>
                <p className="font-semibold">Driver Payment & Withdrawal Agreement</p>
                <p className="font-medium">Effective Date: September 16, 2025</p>
              </div>
              
              <div className="space-y-4">
                <p className="text-center text-sm">
                  By clicking "I Agree," you acknowledge that you have read, understood, and agree to be bound by the following terms for using the WashOut Pro wallet system:
                </p>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center">
                      <CreditCard className="w-4 h-4 mr-2 text-green-600" />
                      1. Withdrawal Fees and Processing
                    </h4>
                    <div className="space-y-2 ml-6 bg-muted/30 p-3 rounded">
                      <p><strong>1.1 Processing Fees:</strong> WashOut Pro charges the following withdrawal fees:</p>
                      <div className="ml-4 space-y-1">
                        <p>• <strong>Withdrawals under $10.00:</strong> $1.00 flat fee</p>
                        <p>• <strong>Withdrawals $10.00 and above:</strong> 10% processing fee</p>
                      </div>
                      <p><strong>1.2 Minimum Withdrawal:</strong> The minimum withdrawal amount is $5.00.</p>
                      <p><strong>1.3 Fee Deduction:</strong> Processing fees are automatically deducted from your withdrawal amount before transfer to your bank account.</p>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center">
                      <Clock className="w-4 h-4 mr-2 text-blue-600" />
                      2. Payment Processing
                    </h4>
                    <div className="space-y-2 ml-6">
                      <p><strong>2.1 Processing Time:</strong> Withdrawal requests are typically processed within 1-3 business days.</p>
                      <p><strong>2.2 Bank Requirements:</strong> You must provide valid bank account information for withdrawals.</p>
                      <p><strong>2.3 Failed Withdrawals:</strong> If a withdrawal fails due to invalid account information, funds will be returned to your wallet balance.</p>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center">
                      <Wallet className="w-4 h-4 mr-2 text-purple-600" />
                      3. Wallet Usage
                    </h4>
                    <div className="space-y-2 ml-6">
                      <p><strong>3.1 Earnings:</strong> Your wallet is credited when washout activities are approved by location owners.</p>
                      <p><strong>3.2 Balance Limits:</strong> There are no limits on wallet balance, but you are responsible for withdrawing funds regularly.</p>
                      <p><strong>3.3 Account Responsibility:</strong> You are responsible for maintaining accurate bank account information for withdrawals.</p>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center">
                      <Shield className="w-4 h-4 mr-2 text-orange-600" />
                      4. Terms and Compliance
                    </h4>
                    <div className="space-y-2 ml-6">
                      <p><strong>4.1 Service Usage:</strong> You agree to use the WashOut Pro platform in accordance with all applicable laws and regulations.</p>
                      <p><strong>4.2 Independent Contractor:</strong> You understand that you are an independent contractor and not an employee of WashOut Pro.</p>
                      <p><strong>4.3 Fee Acknowledgment:</strong> By agreeing to these terms, you acknowledge and accept the withdrawal fee structure outlined above.</p>
                      <p><strong>4.4 Changes:</strong> WashOut Pro may update these terms with advance notice. Continued use constitutes acceptance of updated terms.</p>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">5. Contact and Support</h4>
                    <div className="space-y-2 ml-6">
                      <p><strong>5.1 Questions:</strong> For questions about your wallet or withdrawals, use the support messaging system in the app.</p>
                      <p><strong>5.2 Governing Law:</strong> This agreement is governed by the laws of the state of Texas.</p>
                    </div>
                  </div>
                </div>
                
                <div className="border-t pt-4 bg-green-50 p-3 rounded">
                  <p className="font-semibold text-green-800 text-center">
                    By clicking "I Agree," you confirm that you have read, understood, and accept all terms above, including the withdrawal fee structure.
                  </p>
                </div>
              </div>
            </div>
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
                  I have read and understand all terms and conditions above
                </label>
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <Button 
                  variant="outline" 
                  onClick={() => onOpenChange(false)}
                  data-testid="button-cancel-terms"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => agreeToTermsMutation.mutate()}
                  disabled={!hasReadTerms || agreeToTermsMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="button-agree-terms"
                >
                  {agreeToTermsMutation.isPending ? "Recording..." : "I Agree"}
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
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}