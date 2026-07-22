import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { DollarSign, Download, Calendar, Filter } from "lucide-react";
import logoImage from "@assets/cretexchange logo_1760644229633.png";
import { formatAddress } from "@shared/addressUtils";
import { resolveLocationDriverTipRateCents } from "@shared/locationBilling";
import { formatLocalizedCurrency, formatLocalizedDate, translateActivityStatus, useLanguage } from "@/lib/i18n";

export default function OwnerPayments() {
  const { t, language } = useLanguage();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const buildActivitiesUrl = () => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    params.set('dateRange', 'custom');
    return `/api/owners/activities${params.toString() ? '?' + params.toString() : '?dateRange=all'}`;
  };

  const { data: activitiesData, isLoading } = useQuery<any>({
    queryKey: [buildActivitiesUrl()],
  });

  // Extract activities array from API response and ensure it's an array
  const activitiesArray = Array.isArray(activitiesData) ? activitiesData : (activitiesData?.activities ?? []);
  
  const filteredActivities = activitiesArray.filter((activity: any) => {
    if (filterStatus === "all") return true;
    if (filterStatus === "completed") return activity.status === "verified";
    if (filterStatus === "pending") return activity.status === "pending";
    return activity.status === filterStatus;
  });

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const headers: any = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`/api/export/owner-activities?startDate=${startDate}&endDate=${endDate}`, {
        headers,
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `owner-payments-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  const stats = {
    totalPayments: filteredActivities.reduce((sum: number, activity: any) => {
      const driverTip = resolveLocationDriverTipRateCents(activity.location?.rate);
      return sum + Number(activity.amount || 0) + (driverTip / 100);
    }, 0),
    totalFees: filteredActivities.reduce((sum: number, activity: any) => {
      const platformFee = 5.00;
      return sum + platformFee;
    }, 0),
    completedCount: filteredActivities.filter((a: any) => a.status === 'verified').length,
    pendingCount: filteredActivities.filter((a: any) => a.status === 'pending').length,
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="animate-pulse space-y-4 p-4">
          <div className="h-20 bg-muted rounded-lg" />
          <div className="h-32 bg-muted rounded-lg" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
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
            <img 
              src={logoImage}
              alt={t("owner.payments.title")}
              className="w-10 h-10 object-contain bg-white/20 rounded-full p-1"
            />
            <div>
              <h1 className="font-semibold text-lg">{t("owner.payments.title")}</h1>
              <p className="text-white/80 text-sm">{t("owner.payments.subtitle")}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard title={t("owner.payments.totalPaid")} className="text-center">
            <div className="text-2xl font-bold text-primary" data-testid="text-total-paid">
              {formatLocalizedCurrency(stats.totalPayments, language)}
            </div>
            <div className="text-xs text-muted-foreground">{t("owner.payments.toDriversAndTips")}</div>
          </StatCard>

          <StatCard title={t("owner.payments.totalFees")} className="text-center">
            <div className="text-2xl font-bold text-secondary" data-testid="text-total-fees">
              {formatLocalizedCurrency(stats.totalFees, language)}
            </div>
            <div className="text-xs text-muted-foreground">{t("owner.payments.platformFees")}</div>
          </StatCard>
        </div>

        {/* Additional Stats */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard title={t("common.completed")} className="text-center">
            <div className="text-xl font-bold text-green-600" data-testid="text-completed-payments">
              {stats.completedCount}
            </div>
            <div className="text-xs text-muted-foreground">{t("owner.payments.payments")}</div>
          </StatCard>

          <StatCard title={t("common.pending")} className="text-center">
            <div className="text-xl font-bold text-yellow-600" data-testid="text-pending-payments">
              {stats.pendingCount}
            </div>
            <div className="text-xs text-muted-foreground">{t("owner.payments.payments")}</div>
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
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t("common.startDate")}</label>
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
                  <label className="text-sm text-muted-foreground mb-1 block">{t("common.endDate")}</label>
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
                  {t("common.all")}
                </Button>
                <Button 
                  size="sm"
                  variant={filterStatus === "completed" ? "default" : "outline"}
                  onClick={() => setFilterStatus("completed")}
                  data-testid="button-filter-completed"
                >
                  {t("common.completed")}
                </Button>
                <Button 
                  size="sm"
                  variant={filterStatus === "pending" ? "default" : "outline"}
                  onClick={() => setFilterStatus("pending")}
                  data-testid="button-filter-pending"
                >
                  {t("common.pending")}
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
                {t("common.exportCsv")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Payment List */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center">
            <Calendar className="w-5 h-5 mr-2" />
            {t("owner.payments.title")}
          </h2>

          {filteredActivities.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">{t("owner.payments.empty")}</p>
              </CardContent>
            </Card>
          ) : (
            filteredActivities.map((activity: any, index: number) => (
              <Card key={activity.id} className="hover:shadow-md transition-shadow" data-testid={`card-payment-${index}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1" data-testid={`text-driver-name-${index}`}>
                        {activity.driver?.user?.firstName} {activity.driver?.user?.lastName}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-2" data-testid={`text-location-name-${index}`}>
                        📍 {activity.location?.name}
                      </p>
                      {activity.location && (
                        <p className="text-xs text-muted-foreground mb-2">
                          {formatAddress({
                            street: activity.location.street || '',
                            city: activity.location.city || '',
                            state: activity.location.state || '',
                            zip: activity.location.zip || ''
                          })}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span data-testid={`text-activity-date-${index}`}>
                          🕒 {formatLocalizedDate(activity.checkInTime, language, { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-foreground mb-1" data-testid={`text-payment-amount-${index}`}>
                        {formatLocalizedCurrency(Number(activity.amount || 0), language)}
                      </div>
                      <div className="text-xs text-muted-foreground mb-2" data-testid={`text-platform-fee-${index}`}>
                        {t("owner.payments.platformFee")}: {formatLocalizedCurrency(5.00, language)} ({t("owner.payments.default")})
                      </div>
                      <div className="text-xs text-muted-foreground mb-2" data-testid={`text-driver-tip-${index}`}>
                        {t("owner.payments.driverTip")}: {formatLocalizedCurrency(resolveLocationDriverTipRateCents(activity.location?.rate) / 100, language)}
                      </div>
                      <Badge 
                        variant={
                          activity.status === 'verified' ? 'default' : 
                          activity.status === 'pending' ? 'secondary' : 'destructive'
                        }
                        data-testid={`badge-payment-status-${index}`}
                      >
                        {activity.status === 'pending' ? t("owner.payments.pendingPayment") : translateActivityStatus(activity.status, t)}
                      </Badge>
                    </div>
                  </div>

                  {/* Photos button if available */}
                  {(activity.photoUrls?.length > 0) && (
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <div className="text-sm text-muted-foreground">
                        {t("owner.payments.photosAvailable")}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-8 px-3"
                        data-testid={`button-view-photos-${index}`}
                      >
                        {t("common.viewPhotos")} ({activity.photoUrls.length})
                      </Button>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div className="text-sm text-muted-foreground">
                      {t("owner.payments.platformFees")}
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-red-600" data-testid={`text-total-fees-${index}`}>
                        {formatLocalizedCurrency(5.00, language)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <div className="text-sm text-muted-foreground">
                      {t("owner.payments.netToDriver")}
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-green-600" data-testid={`text-net-amount-${index}`}>
                        {formatLocalizedCurrency(Number(activity.amount || 0) + (resolveLocationDriverTipRateCents(activity.location?.rate) / 100), language)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>

      <MobileNav role="owner" />
    </div>
  );
}
