import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Ticket, Download, Calendar, Trophy, RotateCcw, 
  ArrowLeft, Clock, Users, TrendingUp, Filter,
  FileText, Send, Medal, CheckCircle2, Package
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const STORAGE_KEY = 'lottery_dashboard_reset_date';

export default function SuperAdminLotteryDashboard() {
  const { toast } = useToast();
  const { user, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  
  const [viewMode, setViewMode] = useState<'current' | 'historical'>('current');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [resetDate, setResetDate] = useState<Date | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  
  const [notifyDialogOpen, setNotifyDialogOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<{ driverId: string; driverName: string } | null>(null);
  const [prize, setPrize] = useState("");
  const [winnerMessage, setWinnerMessage] = useState("");
  const [authTimedOut, setAuthTimedOut] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setResetDate(new Date(stored));
    }
  }, []);

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/lottery/months'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/lottery/drawings'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/lottery'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/lottery/totals'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/lottery/entries'] });
  }, [queryClient]);

  useEffect(() => {
    if (!isLoading) {
      setAuthTimedOut(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setAuthTimedOut(true);
    }, 8000);

    return () => window.clearTimeout(timeout);
  }, [isLoading]);

  const { data: months, error: monthsError } = useQuery<{ month: number; year: number; isArchived: boolean; totalEntries: number }[]>({
    queryKey: ['/api/admin/lottery/months'],
    enabled: !!user && user.role === 'super_admin',
    refetchOnMount: "always",
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/lottery/months');
      return response.json();
    },
  });

  const { data: allDrawings, error: drawingsError } = useQuery<any[]>({
    queryKey: ['/api/admin/lottery/drawings'],
    enabled: !!user && user.role === 'super_admin',
    refetchOnMount: "always",
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/lottery/drawings');
      return response.json();
    },
  });

  const { data: lotteryOverview, error: lotteryOverviewError } = useQuery<any>({
    queryKey: ['/api/admin/lottery'],
    enabled: !!user && user.role === 'super_admin',
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/lottery');
      return response.json();
    },
    refetchOnMount: "always",
  });

  const { data: totals, isLoading: totalsLoading, refetch: refetchTotals, error: totalsError } = useQuery<{ driverId: string; driverName: string; totalEntries: number }[]>({
    queryKey: ['/api/admin/lottery/totals', selectedMonth, selectedYear],
    enabled: !!user && user.role === 'super_admin',
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/admin/lottery/totals?month=${selectedMonth}&year=${selectedYear}`);
      return response.json();
    },
    refetchOnMount: "always",
  });

  const { data: entries, isLoading: entriesLoading, error: entriesError } = useQuery<any[]>({
    queryKey: ['/api/admin/lottery/entries', selectedMonth, selectedYear],
    enabled: !!user && user.role === 'super_admin',
    queryFn: async () => {
      const startDate = new Date(selectedYear, selectedMonth - 1, 1);
      const endDate = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);
      const params = new URLSearchParams();
      params.append('startDate', startDate.toISOString());
      params.append('endDate', endDate.toISOString());
      const response = await apiRequest('GET', `/api/admin/lottery/entries?${params.toString()}`);
      return response.json();
    },
    refetchOnMount: "always",
  });

  const notifyMutation = useMutation({
    mutationFn: async (payload: { driverId: string; message: string; month: number; year: number; prize: string }) => {
      return await apiRequest('/api/admin/lottery/notify-winner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Winner Notified!",
        description: data.message,
      });
      setNotifyDialogOpen(false);
      setSelectedDriver(null);
      setPrize("");
      setWinnerMessage("");
    },
    onError: (error: Error) => {
      toast({
        title: "Notification Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleManualReset = () => {
    const newResetDate = new Date();
    localStorage.setItem(STORAGE_KEY, newResetDate.toISOString());
    setResetDate(newResetDate);
    setShowResetDialog(false);
    toast({
      title: "Dashboard Reset",
      description: "Rewards program dashboard view has been reset. Historical data remains intact in the database.",
    });
  };

  const retryAuthLoad = () => {
    setAuthTimedOut(false);
    queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
  };

  const openNotifyDialog = (driver: { driverId: string; driverName: string }) => {
    setSelectedDriver(driver);
    setWinnerMessage(`Congratulations ${driver.driverName}! You have been selected as a winner in our ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} monthly prize drawing. Please contact us to claim your prize.`);
    setNotifyDialogOpen(true);
  };

  const handleSendNotification = () => {
    if (!selectedDriver || !winnerMessage.trim()) return;
    notifyMutation.mutate({
      driverId: selectedDriver.driverId,
      message: winnerMessage,
      month: selectedMonth,
      year: selectedYear,
      prize: prize,
    });
  };

  const filteredEntries = entries?.filter(entry => {
    if (viewMode === 'historical' || !resetDate) return true;
    return new Date(entry.createdAt) >= resetDate;
  }) || [];

  const filteredTotals = viewMode === 'current' && resetDate && entries
    ? (() => {
        const driverCounts: Record<string, { driverId: string; driverName: string; totalEntries: number }> = {};
        filteredEntries.forEach(entry => {
          const driverId = entry.driverId;
          const driverName = entry.driver?.user 
            ? `${entry.driver.user.firstName || ''} ${entry.driver.user.lastName || ''}`.trim() 
            : 'Unknown';
          if (!driverCounts[driverId]) {
            driverCounts[driverId] = { driverId, driverName, totalEntries: 0 };
          }
          driverCounts[driverId].totalEntries += entry.entriesEarned || 1;
        });
        return Object.values(driverCounts).sort((a, b) => b.totalEntries - a.totalEntries);
      })()
    : totals || [];

  const totalEntriesCount = filteredTotals.reduce((sum, t) => sum + t.totalEntries, 0);
  const uniqueDrivers = filteredTotals.length;

  // Drawing for the currently selected month/year
  const selectedDrawing = allDrawings?.find(
    d => d.lotteryMonth === selectedMonth && d.lotteryYear === selectedYear
  ) ?? null;
  const hasLotteryQueryError = Boolean(monthsError || drawingsError || lotteryOverviewError || totalsError || entriesError);

  const PAYOUT_LABEL: Record<string, string> = {
    gift_card: 'Prepaid Debit Card',
    bank_transfer: 'Direct Deposit',
    other_prize: 'Surprise / Other',
  };

  const availableYears = months?.length 
    ? Array.from(new Set([...months.map(m => m.year), currentYear])).sort((a, b) => b - a)
    : [currentYear];

  const exportToCSV = () => {
    if (!filteredTotals.length) return;
    const monthName = MONTH_NAMES[selectedMonth - 1];
    const resetInfo = viewMode === 'current' && resetDate 
      ? `_since_${resetDate.toISOString().split('T')[0]}` 
      : '';
    const csv = [
      'Driver ID,Driver Name,Total Entries',
      ...filteredTotals.map(t => `${t.driverId},"${t.driverName}",${t.totalEntries}`)
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `lottery_${monthName}_${selectedYear}${resetInfo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Export Complete",
      description: `Exported ${filteredTotals.length} driver entries`,
    });
  };

  const exportFullReport = () => {
    if (!entries?.length) return;
    const monthName = MONTH_NAMES[selectedMonth - 1];
    const csv = [
      'Entry ID,Driver ID,Driver Name,Owner Company,Activity ID,Entries Earned,Created At,Month,Year,Archived',
      ...entries.map(e => 
        `${e.id},"${e.driverId}","${e.driver?.user?.firstName || ''} ${e.driver?.user?.lastName || ''}","${e.owner?.companyName || ''}","${e.activityId}",${e.entriesEarned || 1},"${new Date(e.createdAt).toISOString()}",${e.lotteryMonth},${e.lotteryYear},${e.isArchived ? 'Yes' : 'No'}`
      )
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `lottery_full_report_${monthName}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Full Report Exported",
      description: `Exported ${entries.length} entries with full details`,
    });
  };

  if (authTimedOut) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-3">
            <p className="text-base font-semibold text-foreground">Rewards program dashboard is still loading</p>
            <p className="text-sm text-muted-foreground">
              Authentication did not finish in time. Retry loading the page or return to the admin dashboard.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button onClick={retryAuthLoad} data-testid="button-retry-auth">
                Retry
              </Button>
              <Button variant="outline" onClick={() => setLocation('/')} data-testid="button-return-dashboard">
                Return to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/95 px-5 py-4 shadow-sm">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Loading rewards program dashboard</p>
            <p className="text-xs text-muted-foreground">Verifying access and loading live rewards program data</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Super admin access required</p>
            <Button className="mt-4" onClick={() => setLocation('/')}>
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white p-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation('/')}
              className="text-white hover:bg-white/20"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">Rewards Program Dashboard</h1>
              <p className="text-white/80 text-sm">Super Admin - Full Reporting</p>
            </div>
          </div>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="secondary" size="sm" data-testid="button-reset-view">
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset View
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset Dashboard View?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will reset the dashboard counter to start from now. 
                  All historical data remains safely stored in the database for reporting.
                  Only the "current view" will show entries from this point forward.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleManualReset}>
                  Reset View
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        {hasLotteryQueryError && (
          <Card className="border-amber-200 bg-amber-50/80 dark:border-amber-900/30 dark:bg-amber-950/20">
            <CardContent className="p-4">
              <p className="font-semibold text-amber-900 dark:text-amber-100">Rewards program data partially unavailable</p>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                One or more rewards program queries failed to load. Showing whatever data is available instead of an empty page.
              </p>
            </CardContent>
          </Card>
        )}

        {lotteryOverview && (
          <Card className={lotteryOverview.status?.enabled ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/30 dark:bg-emerald-950/20" : "border-amber-200 bg-amber-50/60 dark:border-amber-900/30 dark:bg-amber-950/20"}>
            <CardContent className="p-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Rewards program status</p>
                <p className="text-lg font-semibold text-foreground">
                  {lotteryOverview.status?.enabled ? 'Rewards program active' : 'Rewards program disabled'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {lotteryOverview.currentDrawing
                  ? `Current prize drawing: ${MONTH_NAMES[lotteryOverview.currentDrawing.lotteryMonth - 1]} ${lotteryOverview.currentDrawing.lotteryYear}`
                    : 'No active prize drawing exists yet.'}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Eligible washouts</p>
                  <p className="text-2xl font-semibold text-foreground">{lotteryOverview.totalEligibleWashouts || 0}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Reward entries</p>
                  <p className="text-2xl font-semibold text-foreground">{lotteryOverview.totalTickets || 0}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Drivers entered</p>
                  <p className="text-2xl font-semibold text-foreground">{lotteryOverview.driversEntered || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {resetDate && (
          <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                <Clock className="w-4 h-4" />
                <span className="text-sm">
                  View reset on: {resetDate.toLocaleDateString()} at {resetDate.toLocaleTimeString()}
                </span>
              </div>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant={viewMode === 'current' ? 'default' : 'outline'}
                  onClick={() => setViewMode('current')}
                  data-testid="button-view-current"
                >
                  Since Reset
                </Button>
                <Button 
                  size="sm" 
                  variant={viewMode === 'historical' ? 'default' : 'outline'}
                  onClick={() => setViewMode('historical')}
                  data-testid="button-view-historical"
                >
                  All Historical
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Select Period
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                  <SelectTrigger data-testid="select-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((name, idx) => (
                      <SelectItem key={idx} value={String(idx + 1)}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                  <SelectTrigger className="w-24" data-testid="select-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Entries</p>
                  <p className="text-3xl font-bold text-primary" data-testid="text-total-entries">
                    {totalEntriesCount}
                  </p>
                </div>
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Ticket className="w-6 h-6 text-primary" />
                </div>
              </div>
              {viewMode === 'current' && resetDate && (
                <p className="text-xs text-muted-foreground mt-2">Since last reset</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Participating Drivers</p>
                  <p className="text-3xl font-bold text-secondary" data-testid="text-unique-drivers">
                    {uniqueDrivers}
                  </p>
                </div>
                <div className="w-12 h-12 bg-secondary/10 rounded-full flex items-center justify-center">
                  <Users className="w-6 h-6 text-secondary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{MONTH_NAMES[selectedMonth - 1]} {selectedYear} Leaderboard</CardTitle>
              <CardDescription>
                {viewMode === 'current' && resetDate 
                  ? `Showing entries since ${resetDate.toLocaleDateString()}`
                  : 'Showing all entries for this period'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant="outline"
                onClick={exportToCSV}
                disabled={!filteredTotals.length}
                data-testid="button-export-totals"
              >
                <Download className="w-4 h-4 mr-2" />
                Export Totals
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={exportFullReport}
                disabled={!entries?.length}
                data-testid="button-export-full"
              >
                <FileText className="w-4 h-4 mr-2" />
                Full Report
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {totalsLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => (
                  <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : filteredTotals.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead className="text-center">Entries</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTotals.map((t, index) => (
                    <TableRow key={t.driverId} data-testid={`row-driver-${index}`}>
                      <TableCell>
                        {index < 3 ? (
                          <Badge variant={index === 0 ? "default" : "secondary"} className="font-bold">
                            {index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"} #{index + 1}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground font-medium">#{index + 1}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{t.driverName}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-lg px-3">
                          {t.totalEntries}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openNotifyDialog(t)}
                          data-testid={`button-notify-${index}`}
                        >
                          <Trophy className="w-4 h-4 mr-1" />
                          Notify Reward Winner
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Ticket className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">No reward entries</p>
                <p className="text-sm">
                  {viewMode === 'current' && resetDate 
                    ? 'No reward entries since the last reset'
                    : `No reward entries for ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Winners & Notifications — shows completed drawing for selected month */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Medal className="w-5 h-5 text-yellow-500" />
              Winners &amp; Notifications — {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
            </CardTitle>
            <CardDescription>
              {selectedDrawing
                  ? `Prize drawing executed on ${new Date(selectedDrawing.drawingDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} by ${selectedDrawing.executedByName || 'admin'}`
                : 'No prize drawing has been executed for this period yet.'}
            </CardDescription>
            {selectedDrawing && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge variant={selectedDrawing.winnerNotificationsSentAt ? 'default' : 'outline'} className={selectedDrawing.winnerNotificationsSentAt ? 'bg-green-600 hover:bg-green-700' : ''}>
                  Winners {selectedDrawing.winnerNotificationsSentAt ? `sent (${selectedDrawing.winnerNotificationCount || 0})` : 'pending'}
                </Badge>
                <Badge variant={selectedDrawing.participantNotificationsSentAt ? 'default' : 'outline'} className={selectedDrawing.participantNotificationsSentAt ? 'bg-blue-600 hover:bg-blue-700' : ''}>
                  Participants {selectedDrawing.participantNotificationsSentAt ? `sent (${selectedDrawing.participantNotificationCount || 0})` : 'pending'}
                </Badge>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {!selectedDrawing ? (
              <div className="text-center py-8 text-muted-foreground">
                <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Execute a prize drawing to see winners and their notifications here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {[
                  {
                    place: '1st',
                    emoji: '🥇',
                    name: selectedDrawing.firstPlaceDriverName,
                    ticket: selectedDrawing.firstPlaceTicketNumber,
                    prize: selectedDrawing.firstPrize,
                    payout: selectedDrawing.firstPlacePayoutPreference,
                    delivered: selectedDrawing.firstPlaceDelivered,
                    deliveredAt: selectedDrawing.firstPlaceDeliveredAt,
                  },
                  {
                    place: '2nd',
                    emoji: '🥈',
                    name: selectedDrawing.secondPlaceDriverName,
                    ticket: selectedDrawing.secondPlaceTicketNumber,
                    prize: selectedDrawing.secondPrize,
                    payout: selectedDrawing.secondPlacePayoutPreference,
                    delivered: selectedDrawing.secondPlaceDelivered,
                    deliveredAt: selectedDrawing.secondPlaceDeliveredAt,
                  },
                  {
                    place: '3rd',
                    emoji: '🥉',
                    name: selectedDrawing.thirdPlaceDriverName,
                    ticket: selectedDrawing.thirdPlaceTicketNumber,
                    prize: selectedDrawing.thirdPrize,
                    payout: selectedDrawing.thirdPlacePayoutPreference,
                    delivered: selectedDrawing.thirdPlaceDelivered,
                    deliveredAt: selectedDrawing.thirdPlaceDeliveredAt,
                  },
                ].filter(w => w.name).map((winner) => (
                  <div
                    key={winner.place}
                    className="flex items-start justify-between p-4 rounded-lg border bg-muted/30"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg">{winner.emoji}</span>
                        <span className="font-semibold text-base">{winner.place} Place — {winner.name}</span>
                        {winner.ticket && (
                          <span className="text-xs font-mono bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 px-2 py-0.5 rounded">
                            🎟 {winner.ticket}
                          </span>
                        )}
                      </div>
                      {winner.prize && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Trophy className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>Prize: <span className="font-medium text-foreground">{winner.prize}</span></span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Package className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>
                          Delivery preference:{' '}
                          <span className="font-medium text-foreground">
                            {PAYOUT_LABEL[winner.payout] || winner.payout || 'Not set'}
                          </span>
                        </span>
                      </div>
                      {winner.delivered && winner.deliveredAt && (
                        <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Delivered on {new Date(winner.deliveredAt).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                    <Badge
                      variant={winner.delivered ? 'default' : 'secondary'}
                      className={`ml-4 flex-shrink-0 ${winner.delivered ? 'bg-green-600 hover:bg-green-700' : ''}`}
                    >
                      {winner.delivered ? '✓ Delivered' : 'Pending'}
                    </Badge>
                  </div>
                ))}

                <p className="text-xs text-muted-foreground pt-2 border-t">
                  Winner and participant announcements are sent automatically when a prize drawing is executed. Use the "Notify Reward Winner" button on the leaderboard to send additional messages to any driver.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reporting Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold">{months?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Months with Data</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold">
                  {months?.filter(m => m.isArchived).length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Closed Drawings</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold">
                  {months?.reduce((sum, m) => sum + m.totalEntries, 0) || 0}
                </p>
                <p className="text-xs text-muted-foreground">All-Time Entries</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold">
                  {entries?.length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Entries This Period</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog open={notifyDialogOpen} onOpenChange={setNotifyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              Notify Reward Winner
            </DialogTitle>
            <DialogDescription>
              Send a notification to {selectedDriver?.driverName} about their reward win.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="prize">Prize (optional)</Label>
              <Input
                id="prize"
                placeholder="e.g., $500 Cash, Gift Card, etc."
                value={prize}
                onChange={(e) => setPrize(e.target.value)}
                data-testid="input-prize"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="message">Message to Driver</Label>
              <textarea
                id="message"
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Compose your winner notification message..."
                value={winnerMessage}
                onChange={(e) => setWinnerMessage(e.target.value)}
                data-testid="input-winner-message"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotifyDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSendNotification}
              disabled={!winnerMessage.trim() || notifyMutation.isPending}
              data-testid="button-send-notification"
            >
              {notifyMutation.isPending ? (
                'Sending...'
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Notification
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
