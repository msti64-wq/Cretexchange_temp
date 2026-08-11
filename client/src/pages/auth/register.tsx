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
import { BrandHeaderLogo } from "@/components/BrandHeaderLogo";
import { InstallPrompt } from "@/components/InstallPrompt";
import { useLanguage } from "@/lib/i18n";

export default function Register({ preselectedRole }: { preselectedRole?: 'driver' | 'owner' }) {
  const { toast } = useToast();
  const { t } = useLanguage();
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
        throw new Error(t("auth.register.passwordMismatch"));
      }
      
      const { confirmPassword, ...registerData } = data;
      const response = await apiRequest("POST", "/api/register", registerData);
      return response.json();
    },
    onSuccess: (data) => {
      if (typeof data.token === "string" && data.token) localStorage.setItem('authToken', data.token);
      else localStorage.removeItem('authToken');
      
      toast({
        title: t("auth.register.successTitle"),
        description: t("auth.register.successDescription"),
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
        title: t("auth.register.failedTitle"),
        description: t("auth.register.failedDescription"),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate that role is selected
    if (!formData.role) {
      toast({
        title: t("auth.register.roleRequiredTitle"),
        description: t("auth.register.roleRequiredDescription"),
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
              {t("auth.backHome")}
            </Button>
          </Link>
          <BrandHeaderLogo alt="CreteXchange" />
        </div>
      </header>

      {/* Registration Form */}
      <main className="container mx-auto px-6 py-12 flex items-center justify-center">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t("auth.register.title")}</CardTitle>
            <p className="text-muted-foreground">
              {formData.role ? (
                t("auth.register.roleIntroduction", { role: formData.role === "driver" ? t("auth.register.driver") : t("auth.register.owner") })
              ) : (
                t("auth.register.introduction")
              )}
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t("auth.register.firstName")}</Label>
                  <Input
                    id="firstName"
                    type="text"
                    placeholder={t("auth.register.firstNamePlaceholder")}
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    required
                    data-testid="input-first-name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t("auth.register.lastName")}</Label>
                  <Input
                    id="lastName"
                    type="text"
                    placeholder={t("auth.register.lastNamePlaceholder")}
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    required
                    data-testid="input-last-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">{t("auth.register.username")}</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder={t("auth.register.usernamePlaceholder")}
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                  data-testid="input-username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t("common.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("auth.register.emailPlaceholder")}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">{t("auth.register.phone")}</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder={t("auth.register.phonePlaceholder")}
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                  data-testid="input-phone"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="street">{t("auth.register.street")}</Label>
                <Input
                  id="street"
                  type="text"
                  placeholder={t("auth.register.streetPlaceholder")}
                  value={formData.street}
                  onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                  required
                  data-testid="input-street"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">{t("common.city")}</Label>
                  <Input
                    id="city"
                    type="text"
                    placeholder={t("auth.register.cityPlaceholder")}
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    required
                    data-testid="input-city"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state">{t("common.state")}</Label>
                  <Input
                    id="state"
                    type="text"
                    placeholder={t("auth.register.statePlaceholder")}
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    required
                    maxLength={2}
                    data-testid="input-state"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="zip">{t("auth.register.zip")}</Label>
                <Input
                  id="zip"
                  type="text"
                  placeholder={t("auth.register.zipPlaceholder")}
                  value={formData.zip}
                  onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                  required
                  data-testid="input-zip"
                />
              </div>

              {/* Only show role selector if role isn't already set */}
              {!formData.role && (
                <div className="space-y-2">
                  <Label htmlFor="role">{t("auth.register.role")}</Label>
                  <Select 
                    value={formData.role} 
                    onValueChange={(value) => setFormData({ ...formData, role: value })}
                    required
                  >
                    <SelectTrigger data-testid="select-role">
                      <SelectValue placeholder={t("auth.register.rolePlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="driver">
                        <div className="flex items-center">
                          <Truck className="w-4 h-4 mr-2" />
                          {t("auth.register.driver")}
                        </div>
                      </SelectItem>
                      <SelectItem value="owner">
                        <div className="flex items-center">
                          <Building2 className="w-4 h-4 mr-2" />
                          {t("auth.register.owner")}
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
                        <span className="font-medium text-primary">{t("auth.register.registeringAs", { role: t("auth.register.driver") })}</span>
                      </>
                    ) : (
                      <>
                        <Building2 className="w-5 h-5 text-primary" />
                        <span className="font-medium text-primary">{t("auth.register.registeringAs", { role: t("auth.register.owner") })}</span>
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
                    {t("auth.register.changeRole")}
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.register.password")}</Label>
                <PasswordInput
                  id="password"
                  placeholder={t("auth.register.passwordPlaceholder")}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  data-testid="input-password"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t("auth.register.confirmPassword")}</Label>
                <PasswordInput
                  id="confirmPassword"
                  placeholder={t("auth.register.confirmPasswordPlaceholder")}
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
                {registerMutation.isPending ? t("auth.register.creating") : t("auth.register.submit")}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">{t("auth.register.existing")} </span>
              <Link href="/login" className="text-primary hover:underline" data-testid="link-login">
                {t("auth.register.signInHere")}
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
