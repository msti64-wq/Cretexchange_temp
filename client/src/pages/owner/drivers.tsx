import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { PhotoModal } from "@/components/PhotoModal";
import { Users, Search, Filter, MapPin, Clock, Image as ImageIcon } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function OwnerDrivers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPeriod, setFilterPeriod] = useState("7");
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);

  const { data: activities, isLoading } = useQuery({
    queryKey: ['/api/owners/activities'],
  });

  const { data: locations } = useQuery({
    queryKey: ['/api/owners/locations'],
  });

  const filteredActivities = activities?.filter((activity: any) => {
    const matchesSearch = 
      activity.users?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      activity.users?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      activity.washout_locations?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesLocation = selectedLocation === "all" || activity.washout_locations?.id === selectedLocation;
    
    const activityDate = new Date(activity.washout_activities?.checkInTime);
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(filterPeriod));
    const matchesPeriod = activityDate >= daysAgo;

    return matchesSearch && matchesLocation && matchesPeriod;
  }) || [];

  // Group activities by driver
  const driverStats = filteredActivities.reduce((acc: any, activity: any) => {
    const driverId = activity.users?.id;
    if (!driverId) return acc;

    if (!acc[driverId]) {
      acc[driverId] = {
        driver: activity.users,
        totalWashouts: 0,
        totalEarnings: 0,
        locations: new Set(),
        lastActivity: null,
      };
    }

    acc[driverId].totalWashouts += 1;
    acc[driverId].totalEarnings += Number(activity.washout_activities?.amount);
    acc[driverId].locations.add(activity.washout_locations?.name);
    
    if (!acc[driverId].lastActivity || new Date(activity.washout_activities?.checkInTime) > new Date(acc[driverId].lastActivity)) {
      acc[driverId].lastActivity = activity.washout_activities?.checkInTime;
    }

    return acc;
  }, {});

  const driverList = Object.values(driverStats);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="animate-pulse space-y-4 p-4">
          <div className="h-20 bg-muted rounded-lg" />
          <div className="h-32 bg-muted rounded-lg" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
        <MobileNav role="owner" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="gradient-bg text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">Driver Activity</h1>
              <p className="text-white/80 text-sm">Monitor driver performance</p>
            </div>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard title="Drivers" className="text-center">
            <div className="text-2xl font-bold text-primary" data-testid="text-total-drivers">
              {driverList.length}
            </div>
            <div className="text-xs text-muted-foreground">Active</div>
          </StatCard>

          <StatCard title="Washouts" className="text-center">
            <div className="text-2xl font-bold text-secondary" data-testid="text-total-washouts">
              {filteredActivities.length}
            </div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </StatCard>

          <StatCard title="Revenue" className="text-center">
            <div className="text-2xl font-bold text-accent" data-testid="text-total-revenue">
              {formatCurrency(
                filteredActivities.reduce((sum: number, activity: any) => sum + Number(activity.washout_activities?.amount || 0), 0)
              )}
            </div>
            <div className="text-xs text-muted-foreground">Generated</div>
          </StatCard>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filters</span>
              </div>
              
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search drivers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-drivers"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Time Period</label>
                  <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                    <SelectTrigger data-testid="select-period">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Last 7 days</SelectItem>
                      <SelectItem value="14">Last 14 days</SelectItem>
                      <SelectItem value="30">Last 30 days</SelectItem>
                      <SelectItem value="90">Last 3 months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Location</label>
                  <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                    <SelectTrigger data-testid="select-location">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Locations</SelectItem>
                      {locations?.map((location: any) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Driver List */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center">
            <Users className="w-5 h-5 mr-2" />
            Driver Performance
          </h2>

          {driverList.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No driver activity found for the selected period</p>
              </CardContent>
            </Card>
          ) : (
            driverList.map((driverStat: any, index: number) => (
              <Card key={driverStat.driver.id} className="hover:shadow-md transition-shadow" data-testid={`card-driver-${index}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1" data-testid={`text-driver-name-${index}`}>
                        {driverStat.driver.firstName} {driverStat.driver.lastName}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-2" data-testid={`text-driver-employer-${index}`}>
                        Driver
                      </p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          <span data-testid={`text-last-activity-${index}`}>
                            Last: {new Date(driverStat.lastActivity).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <MapPin className="w-4 h-4 mr-1" />
                          <span data-testid={`text-locations-count-${index}`}>
                            {driverStat.locations.size} location{driverStat.locations.size !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-accent mb-1" data-testid={`text-driver-earnings-${index}`}>
                        {formatCurrency(driverStat.totalEarnings)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <span data-testid={`text-driver-washouts-${index}`}>
                          {driverStat.totalWashouts} washout{driverStat.totalWashouts !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {Array.from(driverStat.locations).slice(0, 3).map((location: string, locIndex: number) => (
                        <Badge key={locIndex} variant="outline" className="text-xs">
                          {location}
                        </Badge>
                      ))}
                      {driverStat.locations.size > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{driverStat.locations.size - 3} more
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Avg: {formatCurrency(driverStat.totalEarnings / driverStat.totalWashouts)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Recent Activities */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Recent Activity</h2>
          
          {filteredActivities.slice(0, 10).map((activity: any, index: number) => (
            <Card key={activity.washout_activities?.id || index} className="hover:shadow-md transition-shadow" data-testid={`card-activity-${index}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium" data-testid={`text-activity-driver-${index}`}>
                      {activity.users?.firstName} {activity.users?.lastName}
                    </h4>
                    <p className="text-sm text-muted-foreground" data-testid={`text-activity-location-${index}`}>
                      {activity.washout_locations?.name}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                      <span data-testid={`text-activity-time-${index}`}>
                        {new Date(activity.washout_activities?.checkInTime).toLocaleDateString()} at{' '}
                        {new Date(activity.washout_activities?.checkInTime).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </span>
                      {activity.washout_activities?.photoUrls && activity.washout_activities?.photoUrls.length > 0 && (
                        <div className="flex items-center">
                          <ImageIcon className="w-4 h-4 mr-1" />
                          <span>{activity.washout_activities?.photoUrls.length} photo(s)</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {activity.washout_activities?.photoUrls?.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          setSelectedActivity(activity);
                          setIsPhotoModalOpen(true);
                        }}
                        data-testid={`button-view-photos-${index}`}
                      >
                        <ImageIcon className="w-4 h-4 mr-1" />
                        View Photos
                      </Button>
                    )}
                    <div className="text-right">
                      <div className="font-semibold text-foreground" data-testid={`text-activity-amount-${index}`}>
                        {formatCurrency(Number(activity.washout_activities?.amount || 0))}
                      </div>
                      <Badge 
                        variant={
                          activity.washout_activities?.status === 'verified' ? 'default' : 
                          activity.washout_activities?.status === 'pending' ? 'secondary' : 'destructive'
                        }
                        className="text-xs"
                        data-testid={`badge-activity-status-${index}`}
                      >
                        {activity.washout_activities?.status === 'verified' ? 'Paid' : 
                         activity.washout_activities?.status === 'pending' ? 'Pending' : 'Rejected'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      <PhotoModal
        isOpen={isPhotoModalOpen}
        onClose={() => {
          setIsPhotoModalOpen(false);
          setSelectedActivity(null);
        }}
        activity={selectedActivity}
      />

      <MobileNav role="owner" />
    </div>
  );
}
