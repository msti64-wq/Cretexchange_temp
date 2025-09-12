import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DriverHeader } from "@/components/DriverHeader";
import { MobileNav } from "@/components/MobileNav";
import { PhotoModal } from "@/components/PhotoModal";
import { Calendar, Download, MapPin, Clock, Image as ImageIcon, Filter } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { exportToCsv } from "@/lib/csvExport";

export default function DriverActivity() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);

  // Build URLs with query parameters instead of path parameters
  const activitiesUrl = `/api/drivers/activities${startDate || endDate ? '?' : ''}${
    [
      startDate ? `startDate=${startDate}` : '',
      endDate ? `endDate=${endDate}` : ''
    ].filter(Boolean).join('&')
  }`;
  
  const paymentsUrl = `/api/drivers/payments${startDate || endDate ? '?' : ''}${
    [
      startDate ? `startDate=${startDate}` : '',
      endDate ? `endDate=${endDate}` : ''
    ].filter(Boolean).join('&')
  }`;

  const { data: activities, isLoading } = useQuery({
    queryKey: [activitiesUrl],
    staleTime: 0, // Always fetch fresh data
  });

  const { data: payments } = useQuery({
    queryKey: [paymentsUrl],
    staleTime: 0, // Always fetch fresh data  
  });

  const filteredActivities = activities?.filter((activity: any) => {
    if (filterStatus === "all") return true;
    return (activity.washout_activities?.status || activity.status) === filterStatus;
  }) || [];

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const headers: any = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      
      const response = await fetch(`/api/export/driver-activities?startDate=${startDate}&endDate=${endDate}`, {
        headers,
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `driver-activities-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  const stats = {
    totalActivities: filteredActivities.length,
    totalEarnings: filteredActivities.reduce((sum: number, activity: any) => sum + Number(activity.washout_activities?.amount || activity.amount || 0), 0),
    verifiedCount: filteredActivities.filter((a: any) => (a.washout_activities?.status || a.status) === 'verified').length,
    pendingCount: filteredActivities.filter((a: any) => (a.washout_activities?.status || a.status) === 'pending').length,
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DriverHeader />
        <div className="animate-pulse p-4 space-y-4">
          <div className="h-32 bg-muted rounded-lg" />
          <div className="h-10 bg-muted rounded-lg" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <DriverHeader />
      
      <div className="p-4 space-y-4">
        {/* Stats Summary */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary" data-testid="text-total-activities">
                  {stats.totalActivities}
                </div>
                <div className="text-sm text-muted-foreground">Total Washouts</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-secondary" data-testid="text-total-earnings">
                  {formatCurrency(stats.totalEarnings)}
                </div>
                <div className="text-sm text-muted-foreground">Total Earned</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-semibold text-green-600" data-testid="text-verified-count">
                  {stats.verifiedCount}
                </div>
                <div className="text-sm text-muted-foreground">Verified</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-semibold text-yellow-600" data-testid="text-pending-count">
                  {stats.pendingCount}
                </div>
                <div className="text-sm text-muted-foreground">Pending</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filters</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Start Date</label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    min="2020-01-01"
                    max="2030-12-31"
                    data-testid="input-start-date"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">End Date</label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min="2020-01-01"
                    max="2030-12-31"
                    data-testid="input-end-date"
                  />
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button 
                  size="sm"
                  variant={filterStatus === "all" ? "default" : "outline"}
                  onClick={() => setFilterStatus("all")}
                  data-testid="button-filter-all"
                >
                  All
                </Button>
                <Button 
                  size="sm"
                  variant={filterStatus === "verified" ? "default" : "outline"}
                  onClick={() => setFilterStatus("verified")}
                  data-testid="button-filter-verified"
                >
                  Verified
                </Button>
                <Button 
                  size="sm"
                  variant={filterStatus === "pending" ? "default" : "outline"}
                  onClick={() => setFilterStatus("pending")}
                  data-testid="button-filter-pending"
                >
                  Pending
                </Button>
              </div>

              <Button 
                variant="outline" 
                size="sm"
                onClick={handleExport}
                className="w-full"
                data-testid="button-export"
              >
                <Download className="w-4 h-4 mr-2" />
                Export to CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Activity List */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center">
            <Calendar className="w-5 h-5 mr-2" />
            Activity History
          </h2>

          {filteredActivities.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No activities found for the selected period</p>
              </CardContent>
            </Card>
          ) : (
            filteredActivities.map((activity: any, index: number) => (
              <Card key={activity.washout_activities?.id || activity.id || index} className="hover:shadow-md transition-shadow" data-testid={`card-activity-${index}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1" data-testid={`text-activity-location-${index}`}>
                        {activity.washout_locations?.name || activity.location?.name || 'Unknown Location'}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-2" data-testid={`text-activity-address-${index}`}>
                        {activity.washout_locations?.address || activity.location?.address || ''}
                      </p>
                      {(activity.location?.owner?.user?.phone) && (
                        <p className="text-xs text-muted-foreground mb-2" data-testid={`text-owner-phone-${index}`}>
                          📞 Owner: {activity.location.owner.user.phone}
                        </p>
                      )}
                      {((activity.washout_activities?.latitude && activity.washout_activities?.longitude) || (activity.latitude && activity.longitude)) && (
                        <p className="text-xs text-muted-foreground mb-2" data-testid={`text-gps-coordinates-${index}`}>
                          🌐 GPS: {Number(activity.washout_activities?.latitude || activity.latitude).toFixed(6)}, {Number(activity.washout_activities?.longitude || activity.longitude).toFixed(6)}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          <span data-testid={`text-activity-date-${index}`}>
                            {new Date(activity.washout_activities?.checkInTime || activity.checkInTime).toLocaleDateString()} at{' '}
                            {new Date(activity.washout_activities?.checkInTime || activity.checkInTime).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-foreground mb-1" data-testid={`text-activity-amount-${index}`}>
                        {formatCurrency(Number(activity.washout_activities?.amount || activity.amount || 0))}
                      </div>
                      <Badge 
                        variant={
                          (activity.washout_activities?.status || activity.status) === 'verified' ? 'default' : 
                          (activity.washout_activities?.status || activity.status) === 'pending' ? 'secondary' : 'destructive'
                        }
                        data-testid={`badge-activity-status-${index}`}
                      >
                        {(activity.washout_activities?.status || activity.status) === 'verified' ? 'Verified' : 
                         (activity.washout_activities?.status || activity.status) === 'pending' ? 'Pending' : 'Rejected'}
                      </Badge>
                    </div>
                  </div>

                  {(activity.washout_activities?.notes || activity.notes) && (
                    <p className="text-sm text-muted-foreground mb-3" data-testid={`text-activity-notes-${index}`}>
                      {activity.washout_activities?.notes || activity.notes}
                    </p>
                  )}

                  {(activity.washout_activities?.photoUrls || activity.photoUrls) && (activity.washout_activities?.photoUrls || activity.photoUrls).length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-sm h-8 px-3 w-fit"
                      onClick={() => {
                        setSelectedActivity(activity);
                        setIsPhotoModalOpen(true);
                      }}
                      data-testid={`button-view-photos-${index}`}
                    >
                      <ImageIcon className="w-4 h-4 mr-1" />
                      View Photos ({(activity.washout_activities?.photoUrls || activity.photoUrls).length})
                    </Button>
                  )}

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <div className="flex items-center text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4 mr-1" />
                      <span>GPS Verified</span>
                    </div>
                    {activity.verifiedAt && (
                      <div className="text-xs text-green-600">
                        Verified {new Date(activity.verifiedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <MobileNav role="driver" />
      
      {/* Photo Modal */}
      <PhotoModal
        isOpen={isPhotoModalOpen}
        onClose={() => setIsPhotoModalOpen(false)}
        activity={selectedActivity}
        canApprove={false} // Drivers cannot approve/reject photos
      />
    </div>
  );
}
