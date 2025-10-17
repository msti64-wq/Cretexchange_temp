import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Truck, Building2, Shield, ArrowRight } from "lucide-react";
import { useState } from "react";
import logoImage from "@assets/Crete Exchange logo_1760724722599.png";

export default function Landing() {
  const [selectedRole, setSelectedRole] = useState<'driver' | 'owner' | null>(null);

  const handleGetStarted = (role: 'driver' | 'owner') => {
    window.location.href = `/register/${role}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      {/* Header */}
      <header className="p-6 border-b bg-card/50 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between">
          <img 
            src={logoImage}
            alt="CreteXchange - Streamlining Concrete Connections"
            className="w-32 h-32 object-contain"
          />
          <Button 
            onClick={() => window.location.href = '/login'}
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
          {/* Desktop Message */}
          <div className="hidden md:block">
            <h2 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
              From Washout to Reuse — The Smarter Concrete Connection
            </h2>
            <p className="text-xl text-muted-foreground mb-12 max-w-4xl mx-auto">
              CreteXchange simplifies how concrete truck drivers and site owners manage material disposal and recycling. Whether you need a verified washout location to clean out your drum or a recycling site to drop off concrete rubble, CreteXchange connects you instantly. Our platform helps drivers earn money, track site activity, and promote environmental sustainability — transforming waste into opportunity while ensuring every job stays compliant and efficient.
            </p>
          </div>

          {/* Mobile Message */}
          <div className="block md:hidden">
            <h2 className="text-3xl font-bold text-foreground mb-6">
              From Washout to Reuse — The Smarter Concrete Connection
            </h2>
            <p className="text-lg text-muted-foreground mb-12 max-w-xl mx-auto">
              Connecting drivers to verified washout and recycling locations — streamlining concrete cleanup, disposal, and reuse.
            </p>
          </div>
          
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
                <li>• Find nearby concrete recycling locations</li>
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

      </main>

      {/* Footer */}
      <footer className="border-t bg-card/50 backdrop-blur py-8">
        <div className="container mx-auto px-6 text-center text-muted-foreground">
          <p>&copy; 2024 CreteXchange. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
