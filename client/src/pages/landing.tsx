import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Truck, Building2, Shield, ArrowRight } from "lucide-react";
import { useState } from "react";

export default function Landing() {
  const [selectedRole, setSelectedRole] = useState<'driver' | 'owner' | null>(null);

  const handleGetStarted = (role: 'driver' | 'owner') => {
    // Store the selected role in localStorage for after authentication
    localStorage.setItem('selectedRole', role);
    window.location.href = '/api/login';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      {/* Header */}
      <header className="p-6 border-b bg-card/50 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Truck className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">WashOut Pro</h1>
          </div>
          <Button 
            onClick={() => window.location.href = '/api/login'}
            data-testid="button-login"
            className="bg-primary hover:bg-primary/90"
          >
            Sign In
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
            The Complete Concrete Washout Solution
          </h2>
          <p className="text-xl text-muted-foreground mb-12 max-w-3xl mx-auto">
            Connect concrete truck drivers with verified washout locations. 
            Earn money, track activities, and ensure environmental compliance.
          </p>
          
          {/* Role Selection */}
          <div className="max-w-4xl mx-auto mb-12">
            <h3 className="text-2xl font-semibold text-foreground mb-8 text-center">
              Choose your path to get started:
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
              <Card 
                className={`cursor-pointer transition-all duration-200 hover:shadow-lg ${
                  selectedRole === 'driver' ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/30'
                }`}
                onClick={() => setSelectedRole('driver')}
              >
                <CardHeader className="text-center pb-4">
                  <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Truck className="w-10 h-10 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">I'm a Driver</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <p className="text-muted-foreground mb-6">
                    Find washout locations, earn money, and track your activities
                  </p>
                  <Button 
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGetStarted('driver');
                    }}
                    data-testid="button-start-driver"
                  >
                    Get Started as Driver
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>

              <Card 
                className={`cursor-pointer transition-all duration-200 hover:shadow-lg ${
                  selectedRole === 'owner' ? 'ring-2 ring-secondary bg-secondary/5' : 'hover:bg-muted/30'
                }`}
                onClick={() => setSelectedRole('owner')}
              >
                <CardHeader className="text-center pb-4">
                  <div className="w-20 h-20 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Building2 className="w-10 h-10 text-secondary" />
                  </div>
                  <CardTitle className="text-2xl">I'm a Location Owner</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <p className="text-muted-foreground mb-6">
                    Manage locations, set rates, and process payments
                  </p>
                  <Button 
                    className="w-full"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGetStarted('owner');
                    }}
                    data-testid="button-start-owner"
                  >
                    Get Started as Owner
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <Card className="text-center hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Truck className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-xl">For Drivers</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Find nearby washout locations</li>
                <li>• Track your daily earnings</li>
                <li>• GPS-enabled check-ins</li>
                <li>• Photo verification system</li>
                <li>• Automated weekly payments</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="text-center hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-8 h-8 text-secondary" />
              </div>
              <CardTitle className="text-xl">For Location Owners</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Manage multiple locations</li>
                <li>• Set custom washout rates</li>
                <li>• Monitor driver activity</li>
                <li>• Verify completed washouts</li>
                <li>• Automated payment processing</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="text-center hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-accent" />
              </div>
              <CardTitle className="text-xl">Compliance & Security</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Environmental compliance tracking</li>
                <li>• Secure payment processing</li>
                <li>• Photo documentation</li>
                <li>• Activity history exports</li>
                <li>• Real-time GPS verification</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* CTA Section */}
        <div className="text-center bg-gradient-to-r from-primary to-secondary rounded-2xl p-12 text-white">
          <h3 className="text-3xl font-bold mb-4">Ready to Get Started?</h3>
          <p className="text-xl mb-8 opacity-90">
            Join thousands of drivers and location owners using WashOut Pro
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg"
              variant="secondary"
              onClick={() => handleGetStarted('driver')}
              data-testid="button-join-driver"
              className="bg-white text-primary hover:bg-white/90"
            >
              Join as Driver
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button 
              size="lg"
              variant="outline"
              onClick={() => handleGetStarted('owner')}
              data-testid="button-join-owner"
              className="border-white text-white hover:bg-white/10"
            >
              Join as Location Owner
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card/50 backdrop-blur py-8">
        <div className="container mx-auto px-6 text-center text-muted-foreground">
          <p>&copy; 2024 WashOut Pro. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
