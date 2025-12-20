import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Ticket, Download, Calendar, Trophy, Archive, Clock } from "lucide-react";
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

  const { data: months, isLoading: monthsLoading } = useQuery<{ month: number; year: number; isArchived: boolean; totalEntries: number }[]>({
    queryKey: ['/api/admin/lottery/months'],
  });

  const { data: totals, isLoading: totalsLoading, refetch: refetchTotals } = useQuery<{ driverId: string; driverName: string; totalEntries: number }[]>({
    queryKey: ['/api/admin/lottery/totals', selectedMonth, selectedYear],
    queryFn: async () => {
      const response = await fetch(`/api/admin/lottery/totals?month=${selectedMonth}&year=${selectedYear}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch totals');
      return response.json();
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
    ? [...new Set(months.map(m => m.year)), currentYear].sort((a, b) => b - a)
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
              
              {user?.role === 'super_admin' && !isArchived && !isCurrentMonth && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" data-testid="button-close-month">
                      <Archive className="w-4 h-4 mr-2" />
                      Close Month
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
      </main>

      <MobileNav role={user?.role} />
    </div>
  );
}
