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
                <h3 className="font-bold text-lg mb-2">CreteXchange Driver Terms</h3>
                <p className="font-semibold">Driver Payment, Wallet & Debit Card Agreement</p>
                <p className="font-medium">Effective Date: October 13, 2025</p>
              </div>
              
              <div className="space-y-4">
                <p className="text-center text-sm">
                  By clicking "I Agree," you acknowledge that you have read, understood, and agree to be bound by the following terms for using the CreteXchange wallet system:
                </p>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center">
                      <Wallet className="w-4 h-4 mr-2 text-green-600" />
                      1. Wallet & Payment System
                    </h4>
                    <div className="space-y-2 ml-6 bg-muted/30 p-3 rounded">
                      <p><strong>1.1 Wallet Verification:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Your wallet is powered by CreteXchange payment services</p>
                        <p>• Must complete identity verification (KYC) to activate wallet</p>
                        <p>• Provide accurate personal information (SSN, date of birth, address)</p>
                        <p>• One wallet per driver account</p>
                      </div>
                      
                      <p className="pt-2"><strong>1.2 Earning Payments:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Wallet credited when location owners approve your washout submissions</p>
                        <p>• Payments processed through the configured payout system</p>
                        <p>• Platform fee ($5.00) deducted from each washout payment automatically</p>
                        <p>• You receive: (Location washout rate - $5.00 platform fee)</p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center">
                      <CreditCard className="w-4 h-4 mr-2 text-purple-600" />
                      2. Debit Card
                    </h4>
                    <div className="space-y-2 ml-6">
                      <p><strong>2.1 Card Features:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Request a physical debit card linked to your wallet</p>
                        <p>• Instant access to wallet funds at ATMs and stores</p>
                        <p>• No additional fees for card usage (standard ATM fees may apply)</p>
                        <p>• Card shipped to your verified address (7-10 business days)</p>
                      </div>
                      
                      <p className="pt-2"><strong>2.2 Card Responsibility:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Protect your card PIN and security information</p>
                        <p>• Report lost or stolen cards immediately through the app</p>
                        <p>• Responsible for all authorized transactions</p>
                        <p>• Card can be frozen/unfrozen anytime in the app</p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center">
                      <CreditCard className="w-4 h-4 mr-2 text-blue-600" />
                      3. Withdrawal Fees and Processing
                    </h4>
                    <div className="space-y-2 ml-6 bg-muted/30 p-3 rounded">
                      <p><strong>3.1 Processing Fees:</strong> CreteXchange charges the following withdrawal fees:</p>
                      <div className="ml-4 space-y-1">
                        <p>• <strong>Withdrawals under $10.00:</strong> $1.00 flat fee</p>
                        <p>• <strong>Withdrawals $10.00 and above:</strong> 10% processing fee</p>
                      </div>
                      <p><strong>3.2 Minimum Withdrawal:</strong> The minimum withdrawal amount is $5.00.</p>
                      <p><strong>3.3 Fee Deduction:</strong> Processing fees are automatically deducted from your withdrawal amount before transfer to your bank account.</p>
                      <p><strong>3.4 Processing Time:</strong> ACH withdrawals typically process within 1-3 business days.</p>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center">
                      <Clock className="w-4 h-4 mr-2 text-orange-600" />
                      4. Washout Service Requirements
                    </h4>
                    <div className="space-y-2 ml-6">
                      <p><strong>4.1 Service Process:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Find and check-in at verified washout locations via GPS</p>
                        <p>• Complete concrete drum washout service</p>
                        <p>• Submit photo evidence showing completed washout</p>
                        <p>• Wait for location owner approval (typically within 24 hours)</p>
                      </div>
                      
                      <p className="pt-2"><strong>4.2 Photo Requirements:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Photos must clearly show completed washout at the location</p>
                        <p>• Include visible location landmarks or signage</p>
                        <p>• Submit only legitimate washout evidence</p>
                        <p>• Fraudulent submissions may result in account suspension</p>
                      </div>
                      
                      <p className="pt-2"><strong>4.3 Platform Fee:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• <strong>$5.00 flat fee per completed washout</strong></p>
                        <p>• Automatically deducted from payment through the wallet ledger</p>
                        <p>• Covers platform usage, payment processing, and support</p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center">
                      <Shield className="w-4 h-4 mr-2 text-red-600" />
                      5. Terms and Compliance
                    </h4>
                    <div className="space-y-2 ml-6">
                      <p><strong>5.1 Service Usage:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Use the CreteXchange platform in accordance with all applicable laws</p>
                        <p>• Follow location-specific rules and safety protocols</p>
                        <p>• Properly dispose of concrete washout materials as directed</p>
                        <p>• Maintain professional conduct at all washout locations</p>
                      </div>
                      
                      <p className="pt-2"><strong>5.2 Independent Contractor:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• You are an independent contractor, not a CreteXchange employee</p>
                        <p>• Responsible for your own taxes and business expenses</p>
                        <p>• No employment benefits or guarantees provided</p>
                        <p>• Set your own schedule and choose locations</p>
                      </div>
                      
                      <p className="pt-2"><strong>5.3 Account Responsibility:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Maintain accurate personal and banking information</p>
                        <p>• Keep wallet funded for any applicable fees</p>
                        <p>• Protect your account credentials and debit card</p>
                        <p>• Report unauthorized activity immediately</p>
                      </div>
                      
                      <p className="pt-2"><strong>5.4 Changes:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• CreteXchange may update these terms with 30 days advance notice</p>
                        <p>• Continued use constitutes acceptance of updated terms</p>
                        <p>• Significant fee changes require explicit re-acceptance</p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">6. Contact and Support</h4>
                    <div className="space-y-2 ml-6">
                      <p><strong>6.1 Questions:</strong> For questions about your wallet, debit card, or withdrawals, use the support messaging system in the app.</p>
                      <p><strong>6.2 Disputes:</strong> Report payment disputes within 7 days of transaction.</p>
                      <p><strong>6.3 Governing Law:</strong> This agreement is governed by the laws of the State of Texas.</p>
                    </div>
                  </div>
                </div>
                
                <div className="border-t pt-4 bg-green-50 p-3 rounded">
                  <p className="font-semibold text-green-800 text-center">
                    By clicking "I Agree," you confirm that you have read, understood, and accept all terms above, including the $5.00 platform fee per washout, withdrawal fee structure, and wallet payment services.
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
