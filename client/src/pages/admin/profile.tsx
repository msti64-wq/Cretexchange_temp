import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { MobileNav } from "@/components/MobileNav";
import { User, Settings, Save, LogOut, AlertCircle, Crown, Lock, Eye, EyeOff, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";

export default function AdminProfile() {
  const { toast } = useToast();
  const { logout } = useAuth();
  const [, setLocation] = useLocation();
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [emailData, setEmailData] = useState({
    currentPassword: '',
    newEmail: ''
  });

  const { data: user, isLoading, refetch } = useQuery({
    queryKey: ['/api/auth/user'],
  });

  const changeEmailMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PUT", "/api/admin/update-email", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Email Updated",
        description: "Your email address has been successfully updated.",
      });
      setShowChangeEmail(false);
      setEmailData({ currentPassword: '', newEmail: '' });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Email Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLogout = () => {
    logout();
  };

  const handleChangeEmail = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!emailData.currentPassword) {
      toast({
        title: "Current Password Required",
        description: "Please enter your current password to update your email.",
        variant: "destructive",
      });
      return;
    }

    if (!emailData.newEmail) {
      toast({
        title: "New Email Required",
        description: "Please enter a new email address.",
        variant: "destructive",
      });
      return;
    }

    if (emailData.newEmail === (user as any)?.email) {
      toast({
        title: "Same Email",
        description: "The new email address is the same as your current email.",
        variant: "destructive",
      });
      return;
    }

    changeEmailMutation.mutate({
      currentPassword: emailData.currentPassword,
      newEmail: emailData.newEmail
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="animate-pulse space-y-4 p-4">
          <div className="h-20 bg-muted rounded-lg" />
          <div className="h-32 bg-muted rounded-lg" />
          <div className="h-48 bg-muted rounded-lg" />
        </div>
        <MobileNav role="admin" />
      </div>
    );
  }

  const userData = user as any;
  const isSuperAdmin = userData?.role === 'super_admin';

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="p-4">
          <Card>
            <CardContent className="p-6 text-center">
              <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
              <p className="text-muted-foreground mb-4">
                Profile management is only available for super administrators.
              </p>
              <Button onClick={() => setLocation('/admin/dashboard')} data-testid="button-back-dashboard">
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
        <MobileNav role="admin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="gradient-bg text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
              <Settings className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-lg truncate">Profile Settings</h1>
              <p className="text-white/80 text-sm">Super Administrator</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleLogout}
            className="text-white hover:bg-white/10 flex-shrink-0"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>
      
      <div className="p-4 space-y-4">
        {/* Profile Header */}
        <Card>
          <CardContent className="p-6 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Crown className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-xl font-semibold mb-1" data-testid="text-user-name">
              {userData?.firstName} {userData?.lastName}
            </h2>
            <Badge variant="outline" className="mb-2" data-testid="badge-user-role">
              <Crown className="w-3 h-3 mr-1" />
              Super Administrator
            </Badge>
            <p className="text-muted-foreground text-sm" data-testid="text-user-email">
              {userData?.email}
            </p>
          </CardContent>
        </Card>

        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="w-5 h-5 mr-2" />
              Account Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Username</Label>
                <p className="text-sm font-medium" data-testid="text-username">{userData?.username}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Email Address</Label>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium" data-testid="text-current-email">{userData?.email}</p>
                  <Dialog open={showChangeEmail} onOpenChange={setShowChangeEmail}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="button-change-email">
                        <Mail className="w-4 h-4 mr-1" />
                        Change Email
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Change Email Address</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleChangeEmail} className="space-y-4">
                        <div>
                          <Label htmlFor="currentPassword">Current Password</Label>
                          <div className="relative">
                            <Input
                              id="currentPassword"
                              type={showCurrentPassword ? "text" : "password"}
                              value={emailData.currentPassword}
                              onChange={(e) => setEmailData({...emailData, currentPassword: e.target.value})}
                              placeholder="Enter your current password"
                              className="pr-10"
                              data-testid="input-current-password"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                              data-testid="button-toggle-password"
                            >
                              {showCurrentPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                        
                        <div>
                          <Label htmlFor="newEmail">New Email Address</Label>
                          <Input
                            id="newEmail"
                            type="email"
                            value={emailData.newEmail}
                            onChange={(e) => setEmailData({...emailData, newEmail: e.target.value})}
                            placeholder="Enter new email address"
                            data-testid="input-new-email"
                          />
                        </div>

                        <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg">
                          <div className="flex items-start space-x-2">
                            <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Important</p>
                              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                                Changing your email will update your login credentials and password recovery options. 
                                Make sure you have access to the new email address.
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end space-x-2 pt-4">
                          <Button 
                            type="button" 
                            variant="outline" 
                            onClick={() => {
                              setShowChangeEmail(false);
                              setEmailData({ currentPassword: '', newEmail: '' });
                            }}
                            data-testid="button-cancel-email"
                          >
                            Cancel
                          </Button>
                          <Button 
                            type="submit" 
                            disabled={changeEmailMutation.isPending}
                            data-testid="button-update-email"
                          >
                            {changeEmailMutation.isPending ? "Updating..." : "Update Email"}
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Account Created</Label>
                <p className="text-sm font-medium" data-testid="text-created-date">
                  {userData?.createdAt ? new Date(userData.createdAt).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Lock className="w-5 h-5 mr-2" />
              Security & Access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg">
              <div className="flex items-center space-x-2">
                <Crown className="w-5 h-5 text-green-600" />
                <div>
                  <h4 className="font-medium text-green-800 dark:text-green-200">Super Administrator Access</h4>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    You have full system access including user management, service accounts, and platform configuration.
                  </p>
                </div>
              </div>
            </div>
            
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Last Login</Label>
              <p className="text-sm font-medium" data-testid="text-last-login">Recently</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <MobileNav role="admin" />
    </div>
  );
}