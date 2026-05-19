import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { RegistrationForm } from "@/components/RegistrationForm";
import { Truck, Building2, Shield, ArrowLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";

export default function Register() {
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("driver");

  // Check if user selected a role from the landing page
  useEffect(() => {
    const selectedRole = localStorage.getItem('selectedRole');
    if (selectedRole === 'driver' || selectedRole === 'owner') {
      setActiveTab(selectedRole);
      // Clear it so it doesn't persist
      localStorage.removeItem('selectedRole');
    }
  }, []);

  const driverRegistrationMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/auth/register/driver", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Registration Successful",
        description: "Your driver profile has been created successfully.",
      });
      setLocation('/');
    },
    onError: (error) => {
      toast({
        title: "Registration Failed", 
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const ownerRegistrationMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/auth/register/owner", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Registration Successful",
        description: "Your owner profile has been created. Approval is pending.",
      });
      setLocation('/');
    },
    onError: (error) => {
      toast({
        title: "Registration Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Redirect if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
            <p className="text-muted-foreground mb-4">
              Please sign in to complete your registration.
            </p>
            <Button onClick={() => window.location.href = '/login'} data-testid="button-sign-in">
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If user already has a role, redirect to dashboard
  if ((user as any)?.role && (user as any).role !== 'admin') {
    setLocation('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="gradient-bg text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.href = '/'}
            className="text-white hover:bg-white/20 p-2"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="text-center">
            <h1 className="font-semibold text-lg">Complete Registration</h1>
            <p className="text-white/80 text-sm">Choose your role to continue</p>
          </div>
          <div className="w-9" /> {/* Spacer for centering */}
        </div>
      </header>

      <div className="p-4">
        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="text-center">
              Welcome, {(user as any)?.firstName}!
            </CardTitle>
            <p className="text-center text-muted-foreground">
              Please select your role and complete your profile information.
            </p>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="driver" className="flex items-center" data-testid="tab-driver">
                  <Truck className="w-4 h-4 mr-1" />
                  Driver
                </TabsTrigger>
                <TabsTrigger value="owner" className="flex items-center" data-testid="tab-owner">
                  <Building2 className="w-4 h-4 mr-1" />
                  Owner
                </TabsTrigger>
              </TabsList>

              <TabsContent value="driver" className="mt-6">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Truck className="w-8 h-8 text-secondary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Concrete Truck Driver</h3>
                  <p className="text-muted-foreground text-sm">
                    Find nearby washout locations, track your earnings, and get paid for completed washouts.
                  </p>
                </div>
                <RegistrationForm
                  type="driver"
                  onSubmit={(data) => driverRegistrationMutation.mutate(data)}
                  isLoading={driverRegistrationMutation.isPending}
                />
              </TabsContent>

              <TabsContent value="owner" className="mt-6">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Building2 className="w-8 h-8 text-accent" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Washout Location Owner</h3>
                  <p className="text-muted-foreground text-sm">
                    Manage washout locations, set rates, monitor driver activity, and process payments.
                  </p>
                </div>
                <RegistrationForm
                  type="owner"
                  onSubmit={(data) => ownerRegistrationMutation.mutate(data)}
                  isLoading={ownerRegistrationMutation.isPending}
                />
              </TabsContent>

            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
