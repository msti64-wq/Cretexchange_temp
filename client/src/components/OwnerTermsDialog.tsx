import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, Building2, CreditCard, DollarSign, Shield, FileText, Clock } from "lucide-react";

interface OwnerTermsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccepted?: () => void;
  readOnly?: boolean;
}

export function OwnerTermsDialog({ open, onOpenChange, onAccepted, readOnly = false }: OwnerTermsDialogProps) {
  const [hasReadTerms, setHasReadTerms] = useState(false);

  const handleAccept = () => {
    onAccepted?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Building2 className="w-5 h-5 text-primary" />
            <span>Location Owner Terms and Conditions</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 text-sm">
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
            <div className="flex items-center mb-2">
              <AlertCircle className="w-4 h-4 text-blue-600 mr-2" />
              <span className="font-semibold text-blue-800">
                {readOnly ? "Platform Terms & Conditions" : "Required Reading"}
              </span>
            </div>
            <p className="text-blue-700 text-xs">
              {readOnly 
                ? "Review the platform terms and conditions you have agreed to." 
                : "You must read and agree to these terms to use CreteXchange as a location owner."
              }
            </p>
          </div>
          
          <div className="border rounded-lg p-4 bg-background">
            <div className="space-y-4 text-xs leading-relaxed max-h-[500px] overflow-y-auto">
              <div className="text-center">
                <h3 className="font-bold text-lg mb-2">CreteXchange Platform Terms</h3>
                <p className="font-semibold">Location Owner Service Agreement</p>
                <p className="font-medium">Effective Date: October 13, 2025</p>
              </div>
              
              <div className="space-y-4">
                <p className="text-center text-sm">
                  By clicking "I Agree," you acknowledge that you have read, understood, and agree to be bound by the following terms for operating washout locations on the CreteXchange platform:
                </p>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center">
                      <DollarSign className="w-4 h-4 mr-2 text-green-600" />
                      1. Platform Fees and Billing
                    </h4>
                    <div className="space-y-2 ml-6 bg-muted/30 p-3 rounded">
                      <p><strong>1.1 Platform Membership Fee:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• <strong>One-time fee:</strong> $15.00 (processed via Stripe)</p>
                        <p>• Required before activating any washout locations</p>
                        <p>• Non-refundable after activation</p>
                        <p>• Grants lifetime access to the platform</p>
                      </div>
                      
                      <p className="pt-2"><strong>1.2 Monthly Location Fees:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• <strong>$1.00 per active location per month</strong></p>
                        <p>• Automatically charged on the 1st of each month via Column book transfer</p>
                        <p>• Pro-rated for partial months when locations are activated mid-month</p>
                        <p>• You must maintain sufficient wallet balance for monthly charges</p>
                        <p>• Failed payments may result in location suspension</p>
                      </div>
                      
                      <p className="pt-2"><strong>1.3 Transaction Fees:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• CreteXchange retains a <strong>$0.40 flat fee per completed washout</strong></p>
                        <p>• Fee is automatically deducted from washout payments via Column book transfer</p>
                        <p>• You receive the washout rate you set minus the $0.40 platform fee</p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center">
                      <CreditCard className="w-4 h-4 mr-2 text-purple-600" />
                      2. Payment Processing & Wallet
                    </h4>
                    <div className="space-y-2 ml-6">
                      <p><strong>2.1 Column BaaS Integration:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Your wallet is powered by Column banking services</p>
                        <p>• You must complete Column business verification (KYB) to activate wallet</p>
                        <p>• Provide accurate business information (EIN, business address, etc.)</p>
                        <p>• Maintain valid funding source (ACH bank account or credit card)</p>
                      </div>
                      
                      <p className="pt-2"><strong>2.2 Wallet Operations:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Washout earnings are credited to your wallet via Column book transfers</p>
                        <p>• Monthly location fees are deducted automatically from your wallet</p>
                        <p>• You can add funds via ACH transfer or credit card</p>
                        <p>• Auto top-up available to prevent low balance issues</p>
                        <p>• Maintain minimum balance to cover monthly location fees</p>
                      </div>
                      
                      <p className="pt-2"><strong>2.3 Withdrawals:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Withdraw funds to your linked bank account anytime</p>
                        <p>• Transfers typically process within 1-3 business days</p>
                        <p>• Ensure sufficient balance remains for pending monthly fees</p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center">
                      <Building2 className="w-4 h-4 mr-2 text-blue-600" />
                      3. Location Management
                    </h4>
                    <div className="space-y-2 ml-6">
                      <p><strong>3.1 Location Responsibilities:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Provide accurate location details (address, hours, capacity)</p>
                        <p>• Set competitive washout rates for drivers</p>
                        <p>• Maintain safe, accessible facilities for concrete drum washouts</p>
                        <p>• Comply with all local environmental and safety regulations</p>
                        <p>• Keep location information updated in the app</p>
                      </div>
                      
                      <p className="pt-2"><strong>3.2 Washout Verification:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Review and approve/reject driver washout submissions promptly</p>
                        <p>• Verify photo evidence shows proper washout at your location</p>
                        <p>• Only approve legitimate washouts to prevent fraud</p>
                        <p>• Report suspicious activity to CreteXchange support</p>
                      </div>
                      
                      <p className="pt-2"><strong>3.3 72-Hour Auto-Approval Policy:</strong></p>
                      <div className="ml-4 space-y-1 bg-amber-50 dark:bg-amber-950/30 p-2 rounded border border-amber-200 dark:border-amber-800">
                        <p className="font-medium text-amber-800 dark:text-amber-400">• Pending washouts must be reviewed within 72 hours</p>
                        <p>• After 72 hours, unreviewed washouts are <strong>automatically approved</strong></p>
                        <p>• Auto-approved washouts trigger immediate payment processing</p>
                        <p>• You will be charged the washout rate plus platform fee</p>
                        <p>• This policy ensures drivers receive timely payment for completed work</p>
                      </div>
                      
                      <p className="pt-2"><strong>3.4 Location Status:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Active locations are visible to drivers and incur monthly fees</p>
                        <p>• You can temporarily deactivate locations (fees pause when inactive)</p>
                        <p>• Reactivation requires meeting current platform requirements</p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center">
                      <FileText className="w-4 h-4 mr-2 text-orange-600" />
                      4. Platform Usage & Compliance
                    </h4>
                    <div className="space-y-2 ml-6">
                      <p><strong>4.1 Service Terms:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Use the platform in accordance with all applicable laws</p>
                        <p>• Maintain proper business licenses and permits</p>
                        <p>• Follow environmental regulations for concrete waste disposal</p>
                        <p>• Provide safe facilities that meet OSHA standards</p>
                      </div>
                      
                      <p className="pt-2"><strong>4.2 Data & Privacy:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Your business information is used for payment processing and verification</p>
                        <p>• Location data is shared with drivers to facilitate washout services</p>
                        <p>• Financial data is securely stored and processed through Column</p>
                        <p>• Review our Privacy Policy for detailed data handling practices</p>
                      </div>
                      
                      <p className="pt-2"><strong>4.3 Independent Business:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• You operate as an independent business, not CreteXchange employee</p>
                        <p>• Responsible for your own taxes, insurance, and business operations</p>
                        <p>• Set your own washout rates and operating hours</p>
                        <p>• CreteXchange provides the technology platform only</p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center">
                      <Clock className="w-4 h-4 mr-2 text-indigo-600" />
                      5. Billing Cycles & Payment Timeline
                    </h4>
                    <div className="space-y-2 ml-6">
                      <p><strong>5.1 Monthly Billing:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Monthly location fees charged on the 1st of each month at 2:00 AM UTC</p>
                        <p>• Automatic Column book transfer from your wallet to platform account</p>
                        <p>• Failed payments trigger low balance alerts and potential suspension</p>
                        <p>• Use auto top-up to ensure sufficient funds for monthly charges</p>
                      </div>
                      
                      <p className="pt-2"><strong>5.2 Washout Payments:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Driver payments processed immediately when you approve washout</p>
                        <p>• Your wallet credited instantly via Column book transfer</p>
                        <p>• Platform fee ($0.40) deducted automatically from each payment</p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center">
                      <Shield className="w-4 h-4 mr-2 text-red-600" />
                      6. Liability & Disputes
                    </h4>
                    <div className="space-y-2 ml-6">
                      <p><strong>6.1 Your Liability:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Responsible for maintaining safe washout facilities</p>
                        <p>• Liable for environmental compliance at your locations</p>
                        <p>• Ensure proper disposal of concrete washout materials</p>
                        <p>• Maintain appropriate business insurance coverage</p>
                      </div>
                      
                      <p className="pt-2"><strong>6.2 Platform Liability:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• CreteXchange provides the technology platform "as is"</p>
                        <p>• Not responsible for disputes between owners and drivers</p>
                        <p>• Not liable for business losses or operational issues</p>
                        <p>• Support available to help resolve payment or technical issues</p>
                      </div>
                      
                      <p className="pt-2"><strong>6.3 Dispute Resolution:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Report payment disputes within 7 days of transaction</p>
                        <p>• Contact support for assistance with driver conflicts</p>
                        <p>• Provide photo evidence and documentation for all claims</p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">7. Termination & Changes</h4>
                    <div className="space-y-2 ml-6">
                      <p><strong>7.1 Account Termination:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• You may close your account anytime (membership fee non-refundable)</p>
                        <p>• Withdraw remaining wallet balance before account closure</p>
                        <p>• Pending washouts must be resolved before termination</p>
                        <p>• CreteXchange may suspend accounts for Terms violations</p>
                      </div>
                      
                      <p className="pt-2"><strong>7.2 Terms Updates:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• CreteXchange may update these terms with 30 days advance notice</p>
                        <p>• Continued use after changes constitutes acceptance</p>
                        <p>• Significant fee changes require explicit re-acceptance</p>
                      </div>
                      
                      <p className="pt-2"><strong>7.3 Contact & Support:</strong></p>
                      <div className="ml-4 space-y-1">
                        <p>• Support available via in-app messaging system</p>
                        <p>• Report technical issues or payment problems promptly</p>
                        <p>• Governed by the laws of the State of Texas</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="border-t pt-4 bg-green-50 p-3 rounded">
                  <p className="font-semibold text-green-800 text-center">
                    By clicking "I Agree," you confirm that you have read, understood, and accept all terms above, including the $15.00 membership fee, $1.00/month location fees, and $0.40 per-washout platform fee structure.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {!readOnly && (
            <>
              <div className="flex items-center space-x-2 p-3 border border-border rounded">
                <Checkbox 
                  id="owner-terms-read"
                  checked={hasReadTerms}
                  onCheckedChange={(v) => setHasReadTerms(!!v)}
                  data-testid="checkbox-owner-terms-read"
                />
                <label htmlFor="owner-terms-read" className="text-sm cursor-pointer">
                  I have read and understand all terms and conditions above
                </label>
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <Button 
                  variant="outline" 
                  onClick={() => onOpenChange(false)}
                  data-testid="button-cancel-owner-terms"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleAccept}
                  disabled={!hasReadTerms}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="button-agree-owner-terms"
                >
                  I Agree
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
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
