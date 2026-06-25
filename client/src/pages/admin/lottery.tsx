import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Ticket, Download, Calendar, Trophy, Archive, Clock, Send, Gift, ChevronDown, ChevronUp, Building2, List, Zap, Medal, FileText } from "lucide-react";
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
  const [numberOfWinners, setNumberOfWinners] = useState(3);
  const [firstPrize, setFirstPrize] = useState("");
  const [firstPrizeDescription, setFirstPrizeDescription] = useState("");
  const [secondPrize, setSecondPrize] = useState("");
  const [secondPrizeDescription, setSecondPrizeDescription] = useState("");
  const [thirdPrize, setThirdPrize] = useState("");
  const [thirdPrizeDescription, setThirdPrizeDescription] = useState("");
  const [allowDuplicateWinnerDriver, setAllowDuplicateWinnerDriver] = useState(false);
  const [previewResult, setPreviewResult] = useState<any | null>(null);

  const { data: months, isLoading: monthsLoading } = useQuery<{ month: number; year: number; isArchived: boolean; totalEntries: number }[]>({
    queryKey: ['/api/admin/lottery/months'],
    enabled: !!user && (user.role === 'admin' || user.role === 'super_admin'),
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/lottery/months');
      return response.json();
    },
  });

  const { data: totals, isLoading: totalsLoading } = useQuery<{ driverId: string; driverName: string; totalEntries: number; payoutPreference: string | null; payoutPreferenceNote: string | null }[]>({
    queryKey: ['/api/admin/lottery/totals', selectedMonth, selectedYear],
    enabled: !!user && (user.role === 'admin' || user.role === 'super_admin'),
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/admin/lottery/totals?month=${selectedMonth}&year=${selectedYear}`);
      return response.json();
    },
  });

  const { data: individualEntries, isLoading: entriesLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/lottery/entries', selectedMonth, selectedYear],
    enabled: showIndividualEntries && !!user && (user.role === 'admin' || user.role === 'super_admin'),
    queryFn: async () => {
      const start = new Date(selectedYear, selectedMonth - 1, 1).toISOString();
      const end = new Date(selectedYear, selectedMonth, 0, 23, 59, 59).toISOString();
      const response = await apiRequest('GET', `/api/admin/lottery/entries?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`);
      return response.json();
    },
  });

  const { data: drawingHistory, isLoading: drawingHistoryLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/lottery/drawings/history'],
    enabled: !!user && (user.role === 'admin' || user.role === 'super_admin'),
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/lottery/drawings/history');
      return response.json();
    },
  });

  const selectedDrawing = drawingHistory?.find((drawing: any) => drawing.lotteryMonth === selectedMonth && drawing.lotteryYear === selectedYear) || null;
  const existingDrawing = selectedDrawing;

  const executeMutation = useMutation({
    mutationFn: async (payload: {
      month: number;
      year: number;
      numberOfWinners: number;
      allowDuplicateWinnerDriver: boolean;
      firstPrize: string;
      secondPrize: string;
      thirdPrize: string;
      prizes: Array<{ title: string | null; description: string | null }>;
    }) => {
      const response = await apiRequest('/api/admin/lottery/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lottery/drawings/history'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lottery/months'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lottery/totals'] });
      toast({ title: "🎉 Monthly Prize Drawing Complete!", description: data.message });
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
        description: data.message || `Archived ${data.archivedCount} reward entries`,
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

  const previewMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/admin/lottery/drawings/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          year: selectedYear,
          winnerCount: numberOfWinners,
          allowDuplicateWinnerDriver,
          prizes: [
            { title: firstPrize || null, description: firstPrizeDescription || null },
            { title: secondPrize || null, description: secondPrizeDescription || null },
            { title: thirdPrize || null, description: thirdPrizeDescription || null },
          ],
        }),
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      setPreviewResult(data);
      toast({
        title: "Preview Ready",
        description: `Previewed ${data?.selectedWinners?.length || 0} reward winners for ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Preview Failed",
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
    setWinnerMessage(`Congratulations ${driver.driverName}! You have been selected as a winner in our ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} Monthly Prize Drawing. Please contact us to claim your prize.`);
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
      description: `Exported ${totals.length} reward entries for ${monthName} ${selectedYear}`,
    });
  };

  const totalEntriesCount = totals?.reduce((sum, t) => sum + t.totalEntries, 0) || 0;
  const uniqueDrivers = totals?.length || 0;
  const selectedDrawingWinnerCount = selectedDrawing?.winners?.length || 0;
  
  const isCurrentMonth = selectedMonth === currentMonth && selectedYear === currentYear;
  const selectedMonthData = months?.find(m => m.month === selectedMonth && m.year === selectedYear);
  const isArchived = selectedMonthData?.isArchived ?? false;

  const availableYears = months?.length 
    ? Array.from(new Set([...months.map(m => m.year), currentYear])).sort((a, b) => b - a)
    : [currentYear];

  const endOfMonth = new Date(selectedYear, selectedMonth, 0);
  const daysUntilClose = isCurrentMonth ? Math.ceil((endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const canRunDrawing = !isCurrentMonth && !selectedDrawing && totalEntriesCount > 0;

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
            <h1 className="font-semibold text-lg">Driver Rewards Program</h1>
            <p className="text-white/80 text-sm">Monthly Prize Drawings - reward entries reset each month</p>
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
                {existingDrawing && (
                  <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300">
                    <Trophy className="w-3 h-3 mr-1" />
                    Prize Drawing Complete
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
              <p className="text-sm text-muted-foreground">Reward Entries</p>
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Medal className="w-5 h-5 text-yellow-500" />
              Monthly Prize Drawing
            </CardTitle>
            <CardDescription>
              Preview reward winners before you run the official monthly prize drawing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="winner-count">Number of Winners</Label>
                <Input
                  id="winner-count"
                  type="number"
                  min={1}
                  max={3}
                  value={numberOfWinners}
                  onChange={(event) => {
                    const nextValue = Math.max(1, Math.min(3, parseInt(event.target.value || "1", 10) || 1));
                    setNumberOfWinners(nextValue);
                  }}
                  data-testid="input-winner-count"
                />
                <p className="text-xs text-muted-foreground">
                  This workflow currently supports up to 3 winners in the admin page.
                </p>
              </div>
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="allow-duplicate-winner-driver"
                    checked={allowDuplicateWinnerDriver}
                    onCheckedChange={(checked) => setAllowDuplicateWinnerDriver(Boolean(checked))}
                    data-testid="checkbox-allow-duplicate-winner-driver"
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="allow-duplicate-winner-driver">Allow duplicate driver winners</Label>
                    <p className="text-xs text-muted-foreground">
                      Leave off to prefer unique drivers. Turn on if you want the same driver to win more than one prize in the same drawing.
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Duplicate-driver runs are supported in preview and in the official drawing execution path.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-2 rounded-lg border border-border/60 p-3">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200">1</span>
                  1st Place Prize
                </Label>
                <Input
                  placeholder="e.g., $500 Prepaid Debit Card"
                  value={firstPrize}
                  onChange={(e) => setFirstPrize(e.target.value)}
                />
                <Textarea
                  placeholder="Prize description for the first winner"
                  value={firstPrizeDescription}
                  onChange={(e) => setFirstPrizeDescription(e.target.value)}
                  rows={2}
                />
              </div>
              {numberOfWinners >= 2 && (
                <div className="space-y-2 rounded-lg border border-border/60 p-3">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200">2</span>
                    2nd Place Prize
                  </Label>
                  <Input
                    placeholder="e.g., $200 Prepaid Debit Card"
                    value={secondPrize}
                    onChange={(e) => setSecondPrize(e.target.value)}
                  />
                  <Textarea
                    placeholder="Prize description for the second winner"
                    value={secondPrizeDescription}
                    onChange={(e) => setSecondPrizeDescription(e.target.value)}
                    rows={2}
                  />
                </div>
              )}
              {numberOfWinners >= 3 && (
                <div className="space-y-2 rounded-lg border border-border/60 p-3">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200">3</span>
                    3rd Place Prize
                  </Label>
                  <Input
                    placeholder="e.g., $100 Prepaid Debit Card"
                    value={thirdPrize}
                    onChange={(e) => setThirdPrize(e.target.value)}
                  />
                  <Textarea
                    placeholder="Prize description for the third winner"
                    value={thirdPrizeDescription}
                    onChange={(e) => setThirdPrizeDescription(e.target.value)}
                    rows={2}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => previewMutation.mutate()}
                disabled={previewMutation.isPending || !totalEntriesCount}
                data-testid="button-preview-drawing"
              >
                <FileText className="w-4 h-4 mr-2" />
                {previewMutation.isPending ? "Previewing..." : "Preview Winners"}
              </Button>
              <Button
                className="bg-yellow-500 hover:bg-yellow-600 text-white"
                onClick={() => executeMutation.mutate({
                  month: selectedMonth,
                  year: selectedYear,
                  numberOfWinners,
                  allowDuplicateWinnerDriver,
                  firstPrize,
                  secondPrize,
                  thirdPrize,
                  prizes: [
                    { title: firstPrize || null, description: firstPrizeDescription || null },
                    { title: secondPrize || null, description: secondPrizeDescription || null },
                    { title: thirdPrize || null, description: thirdPrizeDescription || null },
                  ],
                })}
                disabled={executeMutation.isPending || !totalEntriesCount || Boolean(selectedDrawing) || isCurrentMonth}
                data-testid="button-run-drawing"
              >
                <Zap className="w-4 h-4 mr-2" />
                {executeMutation.isPending ? "Running..." : "Run Official Drawing"}
              </Button>
            </div>

            {selectedDrawing && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                A completed drawing already exists for this month. The official run is blocked until the month is voided or reopened.
              </div>
            )}
          </CardContent>
        </Card>

        {previewResult && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Ticket className="w-5 h-5 text-sky-500" />
                Preview Winners
              </CardTitle>
              <CardDescription>
                Preview results are not persisted until the official drawing is run.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{previewResult.eligibleEntryCount} eligible entries</Badge>
                <Badge variant="outline">{previewResult.eligibleDriverCount} drivers</Badge>
                <Badge variant="outline">{previewResult.winnerCountRequested} requested winners</Badge>
                <Badge variant={previewResult.allowDuplicateWinnerDriver ? "default" : "secondary"}>
                  {previewResult.allowDuplicateWinnerDriver ? "Duplicate winners allowed" : "Unique drivers only"}
                </Badge>
              </div>

              {previewResult.warnings?.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                  <ul className="list-disc space-y-1 pl-5">
                    {previewResult.warnings.map((warning: string) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {previewResult.selectedWinners?.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Place</TableHead>
                      <TableHead>Reward Winner</TableHead>
                      <TableHead>Entry Number</TableHead>
                      <TableHead>Prize</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewResult.selectedWinners.map((winner: any) => (
                      <TableRow key={`${winner.placeIndex}-${winner.driverId}-${winner.entryId}`}>
                        <TableCell className="font-semibold">
                          {winner.placeIndex === 1 ? "🥇 1st" : winner.placeIndex === 2 ? "🥈 2nd" : winner.placeIndex === 3 ? "🥉 3rd" : `#${winner.placeIndex}`}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{winner.driverName}</div>
                          <div className="text-xs text-muted-foreground">{winner.payoutPreference || "Reward winner"}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{winner.ticketNumber || "—"}</TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">{winner.prizeTitle || "—"}</div>
                          {winner.prizeDescription && (
                            <div className="text-xs text-muted-foreground">{winner.prizeDescription}</div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                  Preview results will appear here once you run the preview.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Monthly Prize Drawing Results Card */}
        {existingDrawing && (
          <Card className="border-yellow-300 dark:border-yellow-700 bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-950/30 dark:to-orange-950/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                <Medal className="w-5 h-5 text-yellow-600" />
                {MONTH_NAMES[existingDrawing.lotteryMonth - 1]} {existingDrawing.lotteryYear} — Monthly Prize Drawing Results
              </CardTitle>
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                Drawn on {new Date(existingDrawing.drawingDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge variant="outline">
                  {selectedDrawingWinnerCount} reward winners
                </Badge>
                <Badge variant={existingDrawing.winnerNotificationsSentAt ? "default" : "outline"} className={existingDrawing.winnerNotificationsSentAt ? "bg-green-600 hover:bg-green-700" : ""}>
                  Reward winners {existingDrawing.winnerNotificationsSentAt ? `sent (${existingDrawing.winnerNotificationCount || 0})` : 'pending'}
                </Badge>
                <Badge variant={existingDrawing.participantNotificationsSentAt ? "default" : "outline"} className={existingDrawing.participantNotificationsSentAt ? "bg-blue-600 hover:bg-blue-700" : ""}>
                  Participants {existingDrawing.participantNotificationsSentAt ? `sent (${existingDrawing.participantNotificationCount || 0})` : 'pending'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {existingDrawing.winners?.length ? existingDrawing.winners.map((winner: any) => (
                <div key={`${winner.placeIndex}-${winner.driverId}`} className="flex items-start justify-between bg-white/60 dark:bg-black/20 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-yellow-900 dark:text-yellow-100">
                      {winner.placeIndex === 1 ? '🥇 1st' : winner.placeIndex === 2 ? '🥈 2nd' : winner.placeIndex === 3 ? '🥉 3rd' : `#${winner.placeIndex}`} — {winner.driverName}
                    </p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300 font-mono">Entry {winner.ticketNumber || '—'}</p>
                    {winner.prizeTitle && <p className="text-xs text-yellow-600 dark:text-yellow-400">Prize: {winner.prizeTitle}</p>}
                    {winner.prizeDescription && <p className="text-xs text-yellow-600 dark:text-yellow-400">{winner.prizeDescription}</p>}
                  </div>
                  <Badge variant={winner.notificationId ? "secondary" : "outline"} className={winner.notificationId ? "text-green-700 bg-green-100" : "text-yellow-700 border-yellow-400"}>
                    {winner.notificationId ? "✓ Notified" : "Pending"}
                  </Badge>
                </div>
              )) : [
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
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Archive className="w-5 h-5 text-yellow-500" />
              Completed Drawing History
            </CardTitle>
            <CardDescription>
              Review previous monthly prize drawings and their reward winners.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {drawingHistoryLoading ? (
              <div className="space-y-3">
                {[1, 2].map((item) => (
                  <div key={item} className="h-24 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : drawingHistory && drawingHistory.length > 0 ? (
              <div className="space-y-4">
                {drawingHistory.map((drawing: any) => (
                  <div key={drawing.id} className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {MONTH_NAMES[drawing.lotteryMonth - 1]} {drawing.lotteryYear} — Monthly Prize Drawing
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Run on {new Date(drawing.drawingDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                          {drawing.executedByName ? ` by ${drawing.executedByName}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{drawing.winners?.length || 0} winners</Badge>
                        <Badge variant="outline">{drawing.winnerNotificationCount || 0} winner notifications</Badge>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {(drawing.winners || []).map((winner: any) => (
                        <div key={`${drawing.id}-${winner.placeIndex}`} className="flex items-start justify-between rounded-md bg-background/80 px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {winner.placeIndex === 1 ? '🥇 1st' : winner.placeIndex === 2 ? '🥈 2nd' : winner.placeIndex === 3 ? '🥉 3rd' : `#${winner.placeIndex}`} — {winner.driverName}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">Entry {winner.ticketNumber || '—'}</p>
                            {winner.prizeTitle && <p className="text-xs text-muted-foreground">Prize: {winner.prizeTitle}</p>}
                            {winner.prizeDescription && <p className="text-xs text-muted-foreground">{winner.prizeDescription}</p>}
                          </div>
                          <Badge variant={winner.notificationId ? "secondary" : "outline"}>
                            {winner.notificationId ? "Notified" : "Pending"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                No monthly prize drawings have been completed yet.
              </div>
            )}
          </CardContent>
        </Card>

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
                            Notify Reward Winner
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
                <p>No reward entries for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}</p>
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
                    <><ChevronDown className="w-4 h-4 mr-1" /> Show all reward entries</>
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
                        <TableHead>Entry #</TableHead>
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
                <p className="text-sm text-muted-foreground text-center py-4">No individual reward entries found for this period</p>
                )}
              </CardContent>
            )}
          </Card>
        )}
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
