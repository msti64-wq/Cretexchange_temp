import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation, Link } from "wouter";
import { ArrowLeft, Building2, User, Truck } from "lucide-react";
import logoImage from "@assets/Crete Exchange logo_1760724722599.png";
import { InstallPrompt } from "@/components/InstallPrompt";

export default function Register({ preselectedRole }: { preselectedRole?: 'driver' | 'owner' }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [registeredUserType, setRegisteredUserType] = useState<'driver' | 'owner' | null>(null);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    phone: "",
    street: "",
    city: "",
    state: "",
    zip: "",
    role: "",
  });

  // Check if user selected a role from URL prop or landing page
  useEffect(() => {
    if (preselectedRole) {
      setFormData(prev => ({ ...prev, role: preselectedRole }));
    } else {
      const selectedRole = localStorage.getItem('selectedRole');
      if (selectedRole === 'driver' || selectedRole === 'owner') {
        setFormData(prev => ({ ...prev, role: selectedRole }));
        // Clear it so it doesn't persist
        localStorage.removeItem('selectedRole');
      }
    }
  }, [preselectedRole]);

  const registerMutation = useMutation({
    mutationFn: async (data: any) => {
      if (data.password !== data.confirmPassword) {
        throw new Error("Passwords do not match");
      }
      
      const { confirmPassword, ...registerData } = data;
      const response = await apiRequest("POST", "/api/register", registerData);
      return response.json();
    },
    onSuccess: (data) => {
      // Store the token in localStorage
      localStorage.setItem('authToken', data.token);
      
      toast({
        title: "Registration Successful",
        description: "Your account has been created successfully!",
      });
      
      // Invalidate auth query to refetch user data
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      
      // Show install prompt for the registered user type
      console.log('🎯 Registration successful! Setting up install prompt for:', formData.role);
      setRegisteredUserType(formData.role as 'driver' | 'owner');
      
      // Immediately redirect to home to prevent 404, then show install prompt
      console.log('🔄 Redirecting to home route to prevent 404');
      setLocation('/');
      
      // Show install prompt after brief delay to ensure route change happens
      setTimeout(() => {
        console.log('⏳ Now showing install prompt on home route');
        setShowInstallPrompt(true);
      }, 100);
    },
    onError: (error: any) => {
      toast({
        title: "Registration Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate that role is selected
    if (!formData.role) {
      toast({
        title: "Please select a role",
        description: "You must choose whether you're a driver or location owner.",
        variant: "destructive",
      });
      return;
    }
    
    registerMutation.mutate(formData);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      {/* Header */}
      <header className="p-6 border-b bg-card/50 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" size="sm" className="p-2" data-testid="button-back">
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Home
            </Button>
          </Link>
          <img 
            src={logoImage}
            alt="CreteXchange - Streamlining Concrete Connections"
            className="w-32 h-32 object-contain"
          />
        </div>
      </header>

      {/* Registration Form */}
      <main className="container mx-auto px-6 py-12 flex items-center justify-center">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Create Account</CardTitle>
            <p className="text-muted-foreground">
              {formData.role ? (
                `Complete your registration as a ${formData.role === 'driver' ? 'Concrete Truck Driver' : 'Location Owner'}.`
              ) : (
                'Join CreteXchange to get started as a driver or location owner.'
              )}
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="First name"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    required
                    data-testid="input-first-name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Last name"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    required
                    data-testid="input-last-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Choose a username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                  data-testid="input-username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                  data-testid="input-phone"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="street">Street Address</Label>
                <Input
                  id="street"
                  type="text"
                  placeholder="123 Main St"
                  value={formData.street}
                  onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                  required
                  data-testid="input-street"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    type="text"
                    placeholder="City"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    required
                    data-testid="input-city"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    type="text"
                    placeholder="CA"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    required
                    maxLength={2}
                    data-testid="input-state"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="zip">ZIP Code</Label>
                <Input
                  id="zip"
                  type="text"
                  placeholder="12345"
                  value={formData.zip}
                  onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                  required
                  data-testid="input-zip"
                />
              </div>

              {/* Only show role selector if role isn't already set */}
              {!formData.role && (
                <div className="space-y-2">
                  <Label htmlFor="role">I am a...</Label>
                  <Select 
                    value={formData.role} 
                    onValueChange={(value) => setFormData({ ...formData, role: value })}
                    required
                  >
                    <SelectTrigger data-testid="select-role">
                      <SelectValue placeholder="Select your role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="driver">
                        <div className="flex items-center">
                          <Truck className="w-4 h-4 mr-2" />
                          Concrete Truck Driver
                        </div>
                      </SelectItem>
                      <SelectItem value="owner">
                        <div className="flex items-center">
                          <Building2 className="w-4 h-4 mr-2" />
                          Location Owner
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Show selected role confirmation when role is pre-set */}
              {formData.role && (
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                  <div className="flex items-center justify-center space-x-2">
                    {formData.role === 'driver' ? (
                      <>
                        <Truck className="w-5 h-5 text-primary" />
                        <span className="font-medium text-primary">Registering as Concrete Truck Driver</span>
                      </>
                    ) : (
                      <>
                        <Building2 className="w-5 h-5 text-primary" />
                        <span className="font-medium text-primary">Registering as Location Owner</span>
                      </>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="w-full mt-2 text-xs text-muted-foreground"
                    onClick={() => setFormData({ ...formData, role: '' })}
                  >
                    Change role
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  placeholder="Create a password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  data-testid="input-password"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <PasswordInput
                  id="confirmPassword"
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  required
                  data-testid="input-confirm-password"
                />
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={registerMutation.isPending}
                data-testid="button-register"
              >
                {registerMutation.isPending ? "Creating Account..." : "Create Account"}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Already have an account? </span>
              <Link href="/login" className="text-primary hover:underline" data-testid="link-login">
                Sign in here
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Show Install Prompt after successful registration */}
      {showInstallPrompt && registeredUserType && (
        <InstallPrompt
          userType={registeredUserType}
          onInstall={() => {
            console.log('✅ User accepted install prompt');
            setShowInstallPrompt(false);
            setTimeout(() => setLocation('/'), 1000); // Brief delay then redirect
          }}
          onDismiss={() => {
            console.log('❌ User dismissed install prompt');
            setShowInstallPrompt(false);
            setLocation('/'); // Immediate redirect
          }}
        />
      )}
    </div>
  );
}