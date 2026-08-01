import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation, Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BrandHeaderLogo } from "@/components/BrandHeaderLogo";
import { useLanguage } from "@/lib/i18n";

export default function Login() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");

  const loginMutation = useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      const response = await apiRequest("/api/login", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return response.json();
    },
    onSuccess: async (data) => {
      // Store the token in localStorage
      localStorage.setItem('authToken', data.token);
      
      toast({
        title: t("auth.login.successTitle"),
        description: t("auth.login.successDescription"),
      });
      
      // Invalidate auth query to refetch user data
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      
      // Navigate to home page
      setLocation('/');
    },
    onError: (error: any) => {
      toast({
        title: t("auth.login.failedTitle"),
        description: t("auth.login.failedDescription"),
        variant: "destructive",
      });
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/auth/forgot-password", { email });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t("auth.login.resetSentTitle"),
        description: t("auth.login.resetSentDescription"),
      });
      setShowForgotPassword(false);
      setForgotPasswordEmail("");
    },
    onError: (error: any) => {
      toast({
        title: t("auth.login.requestFailedTitle"),
        description: t("auth.login.requestFailedDescription"),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(formData);
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotPasswordEmail) {
      toast({
        title: t("auth.login.emailRequiredTitle"),
        description: t("auth.login.emailRequiredDescription"),
        variant: "destructive",
      });
      return;
    }
    forgotPasswordMutation.mutate(forgotPasswordEmail);
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

      {/* Login Form */}
      <main className="container mx-auto px-6 py-16 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t("auth.login.title")}</CardTitle>
            <p className="text-muted-foreground">
              {t("auth.login.introduction")}
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">{t("auth.login.username")}</Label>
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  placeholder={t("auth.login.usernamePlaceholder")}
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                  data-testid="input-username"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.login.password")}</Label>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  placeholder={t("auth.login.passwordPlaceholder")}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  data-testid="input-password"
                />
              </div>

              <div className="text-xs text-muted-foreground text-center mb-2">
                {t("auth.login.passwordCaseSensitive")}
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={loginMutation.isPending}
                data-testid="button-login"
              >
                {loginMutation.isPending ? t("auth.login.signingIn") : t("auth.login.submit")}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
                <DialogTrigger asChild>
                  <Button variant="link" size="sm" className="text-primary hover:underline" data-testid="button-forgot-password">
                    {t("auth.login.forgotPassword")}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>{t("auth.login.resetTitle")}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reset-email">{t("auth.login.resetEmail")}</Label>
                      <Input
                        id="reset-email"
                        type="email"
                        placeholder={t("auth.login.resetEmailPlaceholder")}
                        value={forgotPasswordEmail}
                        onChange={(e) => setForgotPasswordEmail(e.target.value)}
                        required
                        data-testid="input-reset-email"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("auth.login.resetHelp")}
                    </p>
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={forgotPasswordMutation.isPending}
                      data-testid="button-send-reset"
                    >
                      {forgotPasswordMutation.isPending ? t("auth.login.sending") : t("auth.login.sendReset")}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">{t("auth.login.newAccount")} </span>
              <Link href="/register" className="text-primary hover:underline" data-testid="link-register">
                {t("auth.login.signUpHere")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
