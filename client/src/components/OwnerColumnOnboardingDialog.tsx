import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, AlertTriangle } from "lucide-react";

const ownerOnboardingSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  taxId: z.string().regex(/^\d{9}$/, "Tax ID must be 9 digits (EIN format)"),
  businessLicense: z.string().optional(),
  addressLine1: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().length(2, "State must be 2 letters (e.g., CA, NY)").toUpperCase(),
  postalCode: z.string().regex(/^\d{5}$/, "Postal code must be 5 digits"),
});

type OwnerOnboardingFormData = z.infer<typeof ownerOnboardingSchema>;

interface OwnerColumnOnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: OwnerOnboardingFormData) => Promise<void>;
  isPending?: boolean;
}

export function OwnerColumnOnboardingDialog({ 
  open, 
  onOpenChange, 
  onSubmit, 
  isPending = false 
}: OwnerColumnOnboardingDialogProps) {
  const form = useForm<OwnerOnboardingFormData>({
    resolver: zodResolver(ownerOnboardingSchema),
    defaultValues: {
      companyName: "",
      taxId: "",
      businessLicense: "",
      addressLine1: "",
      city: "",
      state: "",
      postalCode: "",
    },
  });

  const handleSubmit = async (data: OwnerOnboardingFormData) => {
    await onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Set Up Business Payment Account
          </DialogTitle>
          <DialogDescription>
            To process payments and manage your wallet, we need to verify your business
            information and set up your payment account.
          </DialogDescription>
        </DialogHeader>

        <Alert className="my-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Please ensure all information exactly matches your business registration.
            This is required for identity verification and compliance.
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="ABC Washout Services LLC"
                      data-testid="input-company-name"
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Legal business name as registered
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="taxId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax ID (EIN)</FormLabel>
                    <FormControl>
                      <PasswordInput
                        {...field}
                        placeholder="123456789"
                        maxLength={9}
                        data-testid="input-tax-id"
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      9 digits, no dashes
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="businessLicense"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business License (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="BL-12345"
                        data-testid="input-business-license"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Business Address</h3>
              
              <FormField
                control={form.control}
                name="addressLine1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Address</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="123 Business Blvd"
                        data-testid="input-address"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Dallas"
                          data-testid="input-city"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="TX"
                          maxLength={2}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                          data-testid="input-state"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="postalCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ZIP Code</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="75201"
                          maxLength={5}
                          data-testid="input-zip"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                className="flex-1"
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="flex-1"
                data-testid="button-submit-onboarding"
              >
                {isPending ? "Setting Up Account..." : "Set Up Payment Account"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
