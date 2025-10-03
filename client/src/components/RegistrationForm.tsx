import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Save } from "lucide-react";

const driverSchema = z.object({
  user: z.object({
    phone: z.string().min(1, "Phone number is required"),
    street: z.string().min(1, "Street is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(2, "State is required"),
    zip: z.string().min(5, "ZIP code is required"),
    paymentMethod: z.enum(["check", "venmo", "zelle", "ach"]),
    paymentFrequency: z.enum(["weekly", "biweekly", "monthly"]),
  }),
  driver: z.object({
    employerName: z.string().min(1, "Employer name is required"),
    employerStreet: z.string().min(1, "Employer street is required"),
    employerCity: z.string().min(1, "Employer city is required"),
    employerState: z.string().min(2, "Employer state is required"),
    employerZip: z.string().min(5, "Employer ZIP is required"),
    employerPhone: z.string().min(1, "Employer phone is required"),
    licenseNumber: z.string().optional(),
    truckNumber: z.string().optional(),
  }),
});

const ownerSchema = z.object({
  user: z.object({
    phone: z.string().min(1, "Phone number is required"),
    street: z.string().min(1, "Street is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(2, "State is required"),
    zip: z.string().min(5, "ZIP code is required"),
    paymentMethod: z.enum(["ach", "credit_card"]),
  }),
  owner: z.object({
    companyName: z.string().min(1, "Company name is required"),
    businessLicense: z.string().optional(),
    taxId: z.string().optional(),
  }),
});

const adminSchema = z.object({
  user: z.object({
    phone: z.string().min(1, "Phone number is required"),
    street: z.string().min(1, "Street is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(2, "State is required"),
    zip: z.string().min(5, "ZIP code is required"),
  }),
});

interface RegistrationFormProps {
  type: "driver" | "owner" | "admin";
  onSubmit: (data: any) => void;
  isLoading?: boolean;
}

export function RegistrationForm({ type, onSubmit, isLoading }: RegistrationFormProps) {
  const getSchema = () => {
    switch (type) {
      case "driver":
        return driverSchema;
      case "owner":
        return ownerSchema;
      case "admin":
        return adminSchema;
      default:
        return z.object({});
    }
  };

  const form = useForm({
    resolver: zodResolver(getSchema()),
    defaultValues: {
      user: {
        phone: "",
        street: "",
        city: "",
        state: "",
        zip: "",
        paymentMethod: type === "owner" ? "ach" : "check",
        paymentFrequency: "weekly",
      },
      driver: {
        employerName: "",
        employerStreet: "",
        employerCity: "",
        employerState: "",
        employerZip: "",
        employerPhone: "",
        licenseNumber: "",
        truckNumber: "",
      },
      owner: {
        companyName: "",
        businessLicense: "",
        taxId: "",
      },
    },
  });

  const handleSubmit = (data: any) => {
    onSubmit(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Personal Information */}
        <Card>
          <CardContent className="p-4">
            <h4 className="font-semibold mb-4">Personal Information</h4>
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="user.phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="(555) 123-4567" data-testid="input-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="user.street"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Address</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="123 Main St" data-testid="input-street" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="user.city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="City" data-testid="input-city" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="user.state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="ST" maxLength={2} data-testid="input-state" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="user.zip"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ZIP Code</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="12345" data-testid="input-zip" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {type !== "admin" && (
                <FormField
                  control={form.control}
                  name="user.paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {type === "driver" ? "Preferred Payment Method" : "Payment Method for Drivers"}
                      </FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <SelectTrigger data-testid="select-payment-method">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {type === "driver" ? (
                              <>
                                <SelectItem value="check">Check</SelectItem>
                                <SelectItem value="venmo">Venmo</SelectItem>
                                <SelectItem value="zelle">Zelle</SelectItem>
                                <SelectItem value="ach">ACH Transfer</SelectItem>
                              </>
                            ) : (
                              <>
                                <SelectItem value="ach">ACH Transfer</SelectItem>
                                <SelectItem value="credit_card">Credit Card</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {type === "driver" && (
                <FormField
                  control={form.control}
                  name="user.paymentFrequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Frequency</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <SelectTrigger data-testid="select-payment-frequency">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="biweekly">Bi-weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Driver-specific fields */}
        {type === "driver" && (
          <Card>
            <CardContent className="p-4">
              <h4 className="font-semibold mb-4">Employment Information</h4>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="driver.employerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employer Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Concrete Company Name" data-testid="input-employer-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="driver.employerStreet"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employer Street Address</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="123 Business Blvd" data-testid="input-employer-street" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="driver.employerCity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Employer City</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="City" data-testid="input-employer-city" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="driver.employerState"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Employer State</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="ST" maxLength={2} data-testid="input-employer-state" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="driver.employerZip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employer ZIP Code</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="12345" data-testid="input-employer-zip" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="driver.employerPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employer Phone</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="(555) 123-4567" data-testid="input-employer-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="driver.licenseNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CDL License Number (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="License number" data-testid="input-license-number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="driver.truckNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Truck Number (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Truck #123, Unit A5" data-testid="input-truck-number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Owner-specific fields */}
        {type === "owner" && (
          <Card>
            <CardContent className="p-4">
              <h4 className="font-semibold mb-4">Business Information</h4>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="owner.companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Your business name" data-testid="input-company-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="owner.businessLicense"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business License Number (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="License number" data-testid="input-business-license" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="owner.taxId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tax ID / EIN (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Tax identification number" data-testid="input-tax-id" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full py-3 text-lg"
          disabled={isLoading}
          data-testid="button-complete-registration"
        >
          <Save className="w-5 h-5 mr-2" />
          {isLoading ? "Creating Profile..." : "Complete Registration"}
        </Button>

        {/* Terms and conditions */}
        <p className="text-xs text-muted-foreground text-center mt-4">
          By completing registration, you agree to our Terms of Service and Privacy Policy.
          {type === "owner" && " Your account will require admin approval before you can add locations."}
        </p>
      </form>
    </Form>
  );
}
