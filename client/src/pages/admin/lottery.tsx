import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Ticket, Download, Calendar, Trophy, Archive, Clock, Send, Gift, ChevronDown, ChevronUp, Building2, List, Zap, Medal } from "lucide-react";
import { MobileNav } from "@/components/MobileNav";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function AdminLottery() {
  const { toast } = useToast();
  const { user } = useAuth();
  
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  
  const [notifyDialogOpen, setNotifyDialogOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<{ driverId: string; driverName: string; payoutPreference: string | null; payoutPreferenceNote: string | null } | null>(null);
  const [prize, setPrize] = useState("");
  const [winnerMessage, setWinnerMessage] = useState("");
  const [showIndividualEntries, setShowIndividualEntries] = useState(false);
  const [executeDialogOpen, setExecuteDialogOpen] = useState(false);
  const [firstPrize, setFirstPrize] = useState("");
  const [secondPrize, setSecondPrize] = useState("");
  const [thirdPrize, setThirdPrize] = useState("");
  const [drawingResult, setDrawingResult] = useState<any | null>(null);

  const { data: months, isLoading: monthsLoading } = useQuery<{ month: number; year: number; isArchived: boolean; totalEntries: number }[]>({
    queryKey: ['/api/admin/lottery/months'],
  });

  const { data: totals, isLoading: totalsLoading } = useQuery<{ driverId: string; driverName: string; totalEntries: number; payoutPreference: string | null; payoutPreferenceNote: string | null }[]>({
    queryKey: ['/api/admin/lottery/totals', selectedMonth, selectedYear],
    queryFn: async () => {
      const response = await fetch(`/api/admin/lottery/totals?month=${selectedMonth}&year=${selectedYear}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch totals');
      return response.json();
    },
  });

  const { data: individualEntries, isLoading: entriesLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/lottery/entries', selectedMonth, selectedYear],
    queryFn: async () => {
      const start = new Date(selectedYear, selectedMonth - 1, 1).toISOString();
      const end = new Date(selectedYear, selectedMonth, 0, 23, 59, 59).toISOString();
      const response = await fetch(`/api/admin/lottery/entries?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch entries');
      return response.json();
    },
    enabled: showIndividualEntries,
  });

  const { data: existingDrawing, isLoading: drawingLoading } = useQuery<any>({
    queryKey: ['/api/admin/lottery/drawings', selectedMonth, selectedYear],
    queryFn: async () => {
      const response = await fetch('/api/admin/lottery/drawings', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch drawings');
      const all: any[] = await response.json();
      return all.find(d => d.lotteryMonth === selectedMonth && d.lotteryYear === selectedYear) || null;
    },
  });

  const executeMutation = useMutation({
    mutationFn: async (payload: { month: number; year: number; firstPrize: string; secondPrize: string; thirdPrize: string }) => {
      const response = await apiRequest('/api/admin/lottery/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return response;
    },
    onSuccess: (data: any) => {
      setDrawingResult(data);
      setExecuteDialogOpen(false);
      setFirstPrize(""); setSecondPrize(""); setThirdPrize("");
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lottery/drawings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lottery/months'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lottery/totals'] });
      toast({ title: "🎉 Drawing Complete!", description: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Drawing Failed", description: error.message, variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ month, year }: { month: number; year: number }) => {
      return await apiRequest('/api/admin/lottery/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, year }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lottery/months'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lottery/totals'] });
      toast({
        title: "Month Closed",
        description: data.message || `Archived ${data.archivedCount} entries`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Archive Failed",
        description: error.message,
        variant: "destructive",
      });
    },
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

  const openNotifyDialog = (driver: { driverId: string; driverName: string; payoutPreference: string | null; payoutPreferenceNote: string | null }) => {
    setSelectedDriver(driver);
    setWinnerMessage(`Congratulations ${driver.driverName}! You have been selected as a winner in our ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} lottery drawing. Please contact us to claim your prize.`);
    setNotifyDialogOpen(true);
  };

  const getPayoutPreferenceLabel = (pref: string | null) => {
    if (pref === "gift_card") return "🎁 Gift Card";
    if (pref === "other_prize") return "🎉 Surprise / Other Prize";
    return "🏦 Bank Transfer";
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

  const exportToCSV = () => {
    if (!totals?.length) return;
    const monthName = MONTH_NAMES[selectedMonth - 1];
    const csv = [
      'Driver ID,Driver Name,Total Entries',
      ...totals.map(t => `${t.driverId},"${t.driverName}",${t.totalEntries}`)
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `lottery_${monthName}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Export Complete",
      description: `Exported ${totals.length} driver entries for ${monthName} ${selectedYear}`,
    });
  };

  const totalEntriesCount = totals?.reduce((sum, t) => sum + t.totalEntries, 0) || 0;
  const uniqueDrivers = totals?.length || 0;
  
  const isCurrentMonth = selectedMonth === currentMonth && selectedYear === currentYear;
  const selectedMonthData = months?.find(m => m.month === selectedMonth && m.year === selectedYear);
  const isArchived = selectedMonthData?.isArchived ?? false;

  const availableYears = months?.length 
    ? Array.from(new Set([...months.map(m => m.year), currentYear])).sort((a, b) => b - a)
    : [currentYear];

  const endOfMonth = new Date(selectedYear, selectedMonth, 0);
  const daysUntilClose = isCurrentMonth ? Math.ceil((endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0;

  if (monthsLoading && totalsLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="animate-pulse space-y-4 p-4">
          <div className="h-20 bg-muted rounded-lg" />
          <div className="h-32 bg-muted rounded-lg" />
          <div className="h-64 bg-muted rounded-lg" />
        </div>
        <MobileNav role={user?.role} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="gradient-bg text-white p-4 shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <Ticket className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-semibold text-lg">Driver Lottery</h1>
            <p className="text-white/80 text-sm">Monthly drawings - entries reset each month</p>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Select Drawing Period
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                <SelectTrigger className="flex-1" data-testid="select-month">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, idx) => (
                    <SelectItem key={idx} value={String(idx + 1)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger className="w-28" data-testid="select-year">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="mt-4 flex items-center justify-between">
              {isCurrentMonth ? (
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-medium">Drawing closes in {daysUntilClose} days</span>
                </div>
              ) : isArchived ? (
                <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                  <Archive className="w-3 h-3 mr-1" />
                  Closed
                </Badge>
              ) : (
                <Badge variant="outline" className="text-orange-600 border-orange-600">
                  Open (Past Month)
                </Badge>
              )}
              
              <div className="flex gap-2 flex-wrap justify-end">
                {/* Execute Drawing button */}
                {!isCurrentMonth && !existingDrawing && !drawingLoading && totalEntriesCount > 0 && (
                  <Button
                    size="sm"
                    className="bg-yellow-500 hover:bg-yellow-600 text-white"
                    onClick={() => setExecuteDialogOpen(true)}
                    data-testid="button-execute-drawing"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Execute Drawing
                  </Button>
                )}

                {existingDrawing && (
                  <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300">
                    <Trophy className="w-3 h-3 mr-1" />
                    Drawing Complete
                  </Badge>
                )}

                {user?.role === 'super_admin' && !isArchived && !isCurrentMonth && !existingDrawing && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="button-close-month">
                        <Archive className="w-4 h-4 mr-2" />
                        Archive Only
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Close {MONTH_NAMES[selectedMonth - 1]} {selectedYear} Drawing?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will archive all {totalEntriesCount} entries for this month. 
                          Driver counters will show zero for this month and entries cannot be modified.
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => archiveMutation.mutate({ month: selectedMonth, year: selectedYear })}
                          disabled={archiveMutation.isPending}
                        >
                          {archiveMutation.isPending ? 'Closing...' : 'Close Drawing'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-primary" data-testid="text-total-entries">
                {totalEntriesCount}
              </div>
              <p className="text-sm text-muted-foreground">Total Entries</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-secondary" data-testid="text-unique-drivers">
                {uniqueDrivers}
              </div>
              <p className="text-sm text-muted-foreground">Drivers</p>
            </CardContent>
          </Card>
        </div>

        {/* Drawing Results Card */}
        {existingDrawing && (
          <Card className="border-yellow-300 dark:border-yellow-700 bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-950/30 dark:to-orange-950/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                <Medal className="w-5 h-5 text-yellow-600" />
                {MONTH_NAMES[existingDrawing.lotteryMonth - 1]} {existingDrawing.lotteryYear} — Drawing Results
              </CardTitle>
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                Drawn on {new Date(existingDrawing.drawingDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { place: '🥇 1st', name: existingDrawing.firstPlaceDriverName, ticket: existingDrawing.firstPlaceTicketNumber, pref: existingDrawing.firstPlacePayoutPreference, prize: existingDrawing.firstPrize, delivered: existingDrawing.firstPlaceDelivered },
                { place: '🥈 2nd', name: existingDrawing.secondPlaceDriverName, ticket: existingDrawing.secondPlaceTicketNumber, pref: existingDrawing.secondPlacePayoutPreference, prize: existingDrawing.secondPrize, delivered: existingDrawing.secondPlaceDelivered },
                { place: '🥉 3rd', name: existingDrawing.thirdPlaceDriverName, ticket: existingDrawing.thirdPlaceTicketNumber, pref: existingDrawing.thirdPlacePayoutPreference, prize: existingDrawing.thirdPrize, delivered: existingDrawing.thirdPlaceDelivered },
              ].filter(w => w.name).map((winner) => (
                <div key={winner.place} className="flex items-center justify-between bg-white/60 dark:bg-black/20 rounded-lg px-3 py-2">
                  <div>
                    <p className="font-semibold text-sm text-yellow-900 dark:text-yellow-100">{winner.place} — {winner.name}</p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300 font-mono">{winner.ticket}</p>
                    {winner.prize && <p className="text-xs text-yellow-600 dark:text-yellow-400">Prize: {winner.prize}</p>}
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">{getPayoutPreferenceLabel(winner.pref)}</p>
                  </div>
                  <Badge variant={winner.delivered ? "secondary" : "outline"} className={winner.delivered ? "text-green-700 bg-green-100" : "text-yellow-700 border-yellow-400"}>
                    {winner.delivered ? "✓ Delivered" : "Pending"}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg">
              {MONTH_NAMES[selectedMonth - 1]} {selectedYear} Leaderboard
            </CardTitle>
            <Button 
              size="sm" 
              onClick={exportToCSV}
              disabled={!totals?.length}
              data-testid="button-export-totals"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            {totals?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead className="text-right">Entries</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {totals.map((t, index) => (
                    <TableRow key={t.driverId} data-testid={`row-driver-${index}`}>
                      <TableCell>
                        {index < 3 ? (
                          <Badge variant={index === 0 ? "default" : "secondary"}>
                            {index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"} #{index + 1}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">#{index + 1}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{t.driverName}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline">{t.totalEntries}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-xs text-muted-foreground hidden sm:inline">
                            {getPayoutPreferenceLabel(t.payoutPreference)}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openNotifyDialog(t)}
                            data-testid={`button-notify-${index}`}
                          >
                            <Trophy className="w-4 h-4 mr-1" />
                            Notify Winner
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Ticket className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No entries for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}</p>
                {isCurrentMonth && (
                  <p className="text-sm">Entries will appear when washouts are verified</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Individual Entry Ledger */}
        {totals && totals.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <List className="w-4 h-4" />
                  Individual Entries
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowIndividualEntries(!showIndividualEntries)}
                  className="text-xs"
                >
                  {showIndividualEntries ? (
                    <><ChevronUp className="w-4 h-4 mr-1" /> Hide</>
                  ) : (
                    <><ChevronDown className="w-4 h-4 mr-1" /> Show all entries</>
                  )}
                </Button>
              </div>
            </CardHeader>

            {showIndividualEntries && (
              <CardContent className="pt-0">
                {entriesLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-10 bg-muted rounded animate-pulse" />
                    ))}
                  </div>
                ) : individualEntries && individualEntries.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ticket #</TableHead>
                        <TableHead>Driver</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Entries</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {individualEntries.map((entry: any) => (
                        <TableRow key={entry.id}>
                          <TableCell>
                            {entry.ticketNumber ? (
                              <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded">
                                {entry.ticketNumber}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            {entry.driver?.user?.username || entry.driver?.user?.firstName || "Driver"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            <div className="flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {entry.owner?.companyName || "Location"}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {entry.activity?.checkInTime
                              ? new Date(entry.activity.checkInTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline">+{entry.entriesEarned}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No individual entries found for this period</p>
                )}
              </CardContent>
            )}
          </Card>
        )}
      </main>

      {/* Execute Drawing Dialog */}
      <Dialog open={executeDialogOpen} onOpenChange={setExecuteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              Execute {MONTH_NAMES[selectedMonth - 1]} {selectedYear} Drawing
            </DialogTitle>
            <DialogDescription>
              This will randomly select 1st, 2nd, and 3rd place winners weighted by their number of entries, send them automatic win notifications, and archive the month. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-200">
              <strong>{totalEntriesCount}</strong> entries from <strong>{uniqueDrivers}</strong> drivers will be entered into the drawing.
            </div>
            <div className="space-y-2">
              <Label>🥇 1st Place Prize <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input placeholder="e.g., $500 Cash, $250 Gift Card" value={firstPrize} onChange={e => setFirstPrize(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>🥈 2nd Place Prize <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input placeholder="e.g., $200 Gift Card" value={secondPrize} onChange={e => setSecondPrize(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>🥉 3rd Place Prize <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input placeholder="e.g., $100 Gift Card" value={thirdPrize} onChange={e => setThirdPrize(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExecuteDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-yellow-500 hover:bg-yellow-600 text-white"
              onClick={() => executeMutation.mutate({ month: selectedMonth, year: selectedYear, firstPrize, secondPrize, thirdPrize })}
              disabled={executeMutation.isPending}
            >
              {executeMutation.isPending ? (
                <><Clock className="w-4 h-4 mr-2 animate-spin" />Drawing...</>
              ) : (
                <><Zap className="w-4 h-4 mr-2" />Execute Drawing</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={notifyDialogOpen} onOpenChange={setNotifyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              Notify Lottery Winner
            </DialogTitle>
            <DialogDescription>
              Send a notification to {selectedDriver?.driverName} about their lottery win.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Driver's payout preference */}
            {selectedDriver && (
              <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 rounded-lg">
                <Gift className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    Driver's Prize Preference
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {getPayoutPreferenceLabel(selectedDriver.payoutPreference)}
                    {selectedDriver.payoutPreferenceNote && (
                      <span className="block text-xs mt-0.5 italic">"{selectedDriver.payoutPreferenceNote}"</span>
                    )}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="prize">Prize Description (optional)</Label>
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
              <Textarea
                id="message"
                placeholder="Compose your winner notification message..."
                value={winnerMessage}
                onChange={(e) => setWinnerMessage(e.target.value)}
                rows={5}
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

      <MobileNav role={user?.role} />
    </div>
  );
}
