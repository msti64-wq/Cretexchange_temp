import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { DriverHeader } from "@/components/DriverHeader";
import { WashoutForm } from "@/components/WashoutForm";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin, AlertCircle } from "lucide-react";
import { getCurrentLocation } from "@/lib/gps";

export default function DriverCheckIn() {
  const { locationId } = useParams();
  const [, setLocation] = useLocation();
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const { data: location, isLoading } = useQuery({
    queryKey: ['/api/drivers/locations'],
    select: (data: any[]) => data.find((loc: any) => loc.id === locationId),
    enabled: !!locationId,
  });

  useEffect(() => {
    // Get user's current location
    getCurrentLocation()
      .then(coords => {
        setCurrentLocation({ lat: coords.latitude, lng: coords.longitude });
      })
      .catch(error => {
        setLocationError(error.message);
      });
  }, []);

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

        {/* Location Error Alert */}
        {locationError && (
          <Card className="mb-4 border-yellow-200 bg-yellow-50">
            <CardContent className="p-4">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div>
                  <h3 className="font-medium text-yellow-800">Location Access Required</h3>
                  <p className="text-sm text-yellow-700 mt-1">
                    {locationError} GPS verification may not be available for this check-in.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Check-in Form */}
        <WashoutForm
          location={location}
          currentLocation={currentLocation}
          onSuccess={handleSuccess}
        />
      </div>
    </div>
  );
}
