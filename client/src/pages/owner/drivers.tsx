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
import { BrandHeaderLogo } from "@/components/BrandHeaderLogo";
import { isBillableWashoutForOwnerBilling } from "@shared/washoutApproval";
import { formatLocalizedCurrency, formatLocalizedDate, translateActivityStatus, useLanguage } from "@/lib/i18n";

export default function OwnerDrivers() {
  const { t, language } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPeriod, setFilterPeriod] = useState("7");
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);

  const { data: activitiesData, isLoading } = useQuery<any>({
    queryKey: [`/api/owners/activities?dateRange=all`],
  });

  const { data: locations } = useQuery<any>({
    queryKey: ['/api/owners/locations'],
  });

  // Extract activities array from API response and ensure it's an array
  const activitiesArray = Array.isArray(activitiesData) ? activitiesData : (activitiesData?.activities ?? []);
  const filteredActivities = activitiesArray.filter((activity: any) => {
    const matchesSearch = 
      activity.driver?.user?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      activity.driver?.user?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      activity.location?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesLocation = selectedLocation === "all" || activity.location?.id === selectedLocation;
    
    const activityDate = new Date(activity.checkInTime);
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(filterPeriod));
    const matchesPeriod = activityDate >= daysAgo;

    return matchesSearch && matchesLocation && matchesPeriod;
  });

  const billableActivities = filteredActivities.filter((activity: any) =>
    isBillableWashoutForOwnerBilling({ status: activity.status }),
  );

  // Group activities by driver
  const driverStats = filteredActivities.reduce((acc: any, activity: any) => {
    const driverId = activity.driver?.user?.id;
    if (!driverId) return acc;

    if (!acc[driverId]) {
      acc[driverId] = {
        driver: activity.driver?.user,
        totalWashouts: 0,
        totalPendingCharges: 0,
        locations: new Set(),
        lastActivity: null,
      };
    }

    acc[driverId].totalWashouts += 1;
    if (isBillableWashoutForOwnerBilling({ status: activity.status })) {
      acc[driverId].totalPendingCharges += Number(activity.amount || 0);
    }
    acc[driverId].locations.add(activity.location?.name);
    
    if (!acc[driverId].lastActivity || new Date(activity.checkInTime) > new Date(acc[driverId].lastActivity)) {
      acc[driverId].lastActivity = activity.checkInTime;
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
            <BrandHeaderLogo alt={t("owner.drivers.title")} size="compact" />
            <div>
              <h1 className="font-semibold text-lg">{t("owner.drivers.title")}</h1>
              <p className="text-white/80 text-sm">{t("owner.drivers.subtitle")}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard title={t("common.drivers")} className="text-center">
            <div className="text-2xl font-bold text-primary" data-testid="text-total-drivers">
              {driverList.length}
            </div>
            <div className="text-xs text-muted-foreground">{t("owner.drivers.active")}</div>
          </StatCard>

          <StatCard title={t("common.washouts")} className="text-center">
            <div className="text-2xl font-bold text-secondary" data-testid="text-total-washouts">
              {filteredActivities.length}
            </div>
            <div className="text-xs text-muted-foreground">{t("owner.drivers.activityHistory")}</div>
          </StatCard>

          <StatCard title={t("owner.drivers.tipObligations")} className="text-center">
            <div className="text-2xl font-bold text-accent" data-testid="text-total-pending-charges">
              {formatLocalizedCurrency(
                billableActivities.reduce((sum: number, activity: any) => sum + Number(activity.amount || 0), 0),
                language,
              )}
            </div>
            <div className="text-xs text-muted-foreground">{t("owner.drivers.billableOnly")}</div>
          </StatCard>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t("common.filters")}</span>
              </div>
              
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t("owner.drivers.search")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-drivers"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t("owner.drivers.timePeriod")}</label>
                  <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                    <SelectTrigger data-testid="select-period">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">{t("owner.drivers.lastDays", { count: 7 })}</SelectItem>
                      <SelectItem value="14">{t("owner.drivers.lastDays", { count: 14 })}</SelectItem>
                      <SelectItem value="30">{t("owner.drivers.lastDays", { count: 30 })}</SelectItem>
                      <SelectItem value="90">{t("owner.drivers.lastMonths", { count: 3 })}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t("common.locations")}</label>
                  <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                    <SelectTrigger data-testid="select-location">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("owner.drivers.allLocations")}</SelectItem>
                      {Array.isArray(locations) && locations.map((location: any) => (
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
            {t("owner.drivers.performance")}
          </h2>

          {driverList.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">{t("owner.drivers.empty")}</p>
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
                        {t("owner.drivers.driver")}
                      </p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          <span data-testid={`text-last-activity-${index}`}>
                            {t("owner.drivers.lastActivity", { date: formatLocalizedDate(driverStat.lastActivity, language) })}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <MapPin className="w-4 h-4 mr-1" />
                          <span data-testid={`text-locations-count-${index}`}>
                            {t(driverStat.locations.size === 1 ? "owner.drivers.locationCount" : "owner.drivers.locationCount_plural", { count: driverStat.locations.size })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-accent mb-1" data-testid={`text-driver-pending-charges-${index}`}>
                        {formatLocalizedCurrency(driverStat.totalPendingCharges, language)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <span data-testid={`text-driver-washouts-${index}`}>
                          {t(driverStat.totalWashouts === 1 ? "owner.drivers.washoutCount" : "owner.drivers.washoutCount_plural", { count: driverStat.totalWashouts })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {Array.from(driverStat.locations).slice(0, 3).map((location, locIndex) => (
                        <Badge key={locIndex} variant="outline" className="text-xs">
                          {String(location)}
                        </Badge>
                      ))}
                      {driverStat.locations.size > 3 && (
                        <Badge variant="outline" className="text-xs">
                          {t("owner.drivers.moreLocations", { count: driverStat.locations.size - 3 })}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("common.average")}: {formatLocalizedCurrency(driverStat.totalPendingCharges / driverStat.totalWashouts, language)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Recent Activities */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t("owner.drivers.recentActivity")}</h2>
          
          {filteredActivities.slice(0, 10).map((activity: any, index: number) => (
            <div key={activity.id || index} className="p-3 bg-muted/50 rounded-lg" data-testid={`card-activity-${index}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Users className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate" data-testid={`text-activity-driver-${index}`}>
                      {activity.driver?.user?.firstName} {activity.driver?.user?.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground truncate" data-testid={`text-activity-location-${index}`}>
                      {activity.location?.name}
                    </div>
                  </div>
                </div>
                
                <div className="text-right ml-2">
                  <div className="font-semibold text-sm" data-testid={`text-activity-amount-${index}`}>
                    {formatLocalizedCurrency(Number(activity.amount || 0), language)}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <Badge 
                  variant={
                    activity.status === 'verified' ? 'default' : 
                    activity.status === 'pending' ? 'secondary' : 'destructive'
                  }
                  className="text-xs"
                  data-testid={`badge-activity-status-${index}`}
                >
                  {translateActivityStatus(activity.status, t)}
                </Badge>
                
                <div className="flex items-center gap-1">
                  {activity.photoUrls?.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-6 px-2"
                      onClick={() => {
                        setSelectedActivity(activity);
                        setIsPhotoModalOpen(true);
                      }}
                      data-testid={`button-view-photos-${index}`}
                    >
                      <ImageIcon className="w-3 h-3" />
                    </Button>
                  )}
                  <div className="text-xs text-muted-foreground" data-testid={`text-activity-time-${index}`}>
                    {formatLocalizedDate(activity.checkInTime, language)}
                  </div>
                </div>
              </div>
            </div>
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
