import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { DriverHeader } from "@/components/DriverHeader";
import { WashoutForm } from "@/components/WashoutForm";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin, AlertCircle } from "lucide-react";

export default function DriverCheckIn() {
  const { locationId } = useParams();
  const [, setLocation] = useLocation();

  const { data: location, isLoading } = useQuery({
    queryKey: ['/api/drivers/locations'],
    select: (data: any[]) => {
      const item = data.find((item: any) => {
        const loc = item.washout_locations || item;
        return loc.id === locationId;
      });
      return item ? (item.washout_locations || item) : null;
    },
    enabled: !!locationId,
  });

  const handleSuccess = () => {
    setLocation('/activity');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DriverHeader />
        <div className="p-4">
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded mb-4" />
            <div className="h-64 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!location) {
    return (
      <div className="min-h-screen bg-background">
        <DriverHeader />
        <div className="p-4">
          <Card>
            <CardContent className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Location Not Found</h2>
              <p className="text-muted-foreground mb-4">
                The washout location you're looking for doesn't exist or is no longer available.
              </p>
              <Button onClick={() => setLocation('/locations')} data-testid="button-back-to-locations">
                <MapPin className="w-4 h-4 mr-2" />
                Browse Locations
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DriverHeader />
      
      <div className="p-4">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => setLocation('/locations')}
          className="mb-4"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Locations
        </Button>

        {/* Check-in Form */}
        <WashoutForm
          location={location}
          onSuccess={handleSuccess}
        />
      </div>
    </div>
  );
}
