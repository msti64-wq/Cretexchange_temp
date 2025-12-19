import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Ticket, Download, Users, Calendar, Trophy } from "lucide-react";
import { MobileNav } from "@/components/MobileNav";
import { useAuth } from "@/hooks/useAuth";

export default function AdminLottery() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: entries, isLoading: entriesLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/lottery/entries', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const response = await fetch(`/api/admin/lottery/entries?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch entries');
      return response.json();
    },
  });

  const { data: totals, isLoading: totalsLoading } = useQuery<{ driverId: string; driverName: string; totalEntries: number }[]>({
    queryKey: ['/api/admin/lottery/totals'],
  });

  const exportToCSV = (type: 'entries' | 'totals') => {
    if (type === 'totals' && totals) {
      const csv = [
        'Driver ID,Driver Name,Total Entries',
        ...totals.map(t => `${t.driverId},"${t.driverName}",${t.totalEntries}`)
      ].join('\n');
      downloadCSV(csv, 'lottery_totals.csv');
    } else if (type === 'entries' && entries) {
      const csv = [
        'Entry ID,Driver ID,Driver Name,Owner Company,Activity ID,Entries Earned,Created At',
        ...entries.map(e => 
          `${e.id},"${e.driverId}","${e.driver?.user?.firstName || ''} ${e.driver?.user?.lastName || ''}","${e.owner?.companyName || ''}","${e.activityId}",${e.entriesEarned},"${new Date(e.createdAt).toISOString()}"`
        )
      ].join('\n');
      downloadCSV(csv, 'lottery_entries.csv');
    }
    toast({
      title: "Export Complete",
      description: `${type === 'totals' ? 'Totals' : 'Entries'} exported to CSV`,
    });
  };

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totalEntriesCount = totals?.reduce((sum, t) => sum + t.totalEntries, 0) || 0;
  const uniqueDrivers = totals?.length || 0;

  if (entriesLoading && totalsLoading) {
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
            <p className="text-white/80 text-sm">Manage lottery entries for external raffle</p>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4">
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
              <p className="text-sm text-muted-foreground">Drivers with Entries</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="totals" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="totals" data-testid="tab-totals">
              <Trophy className="w-4 h-4 mr-2" />
              Totals by Driver
            </TabsTrigger>
            <TabsTrigger value="entries" data-testid="tab-entries">
              <Calendar className="w-4 h-4 mr-2" />
              All Entries
            </TabsTrigger>
          </TabsList>

          <TabsContent value="totals" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">Lottery Totals</CardTitle>
                <Button 
                  size="sm" 
                  onClick={() => exportToCSV('totals')}
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
                        <TableHead className="text-right">Total Entries</TableHead>
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
                    <p>No lottery entries yet</p>
                    <p className="text-sm">Entries will appear when washouts are verified for owners with lottery mode enabled</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="entries" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Date Filter</CardTitle>
                <div className="flex gap-4 mt-2">
                  <div className="flex-1">
                    <label className="text-sm text-muted-foreground">Start Date</label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      data-testid="input-start-date"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-sm text-muted-foreground">End Date</label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      data-testid="input-end-date"
                    />
                  </div>
                </div>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">Entry Details</CardTitle>
                <Button 
                  size="sm" 
                  onClick={() => exportToCSV('entries')}
                  disabled={!entries?.length}
                  data-testid="button-export-entries"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
              </CardHeader>
              <CardContent>
                {entries?.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Driver</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead className="text-right">Entries</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((entry, index) => (
                        <TableRow key={entry.id} data-testid={`row-entry-${index}`}>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(entry.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="font-medium">
                            {entry.driver?.user?.firstName} {entry.driver?.user?.lastName}
                          </TableCell>
                          <TableCell className="text-sm">
                            {entry.owner?.companyName}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline">{entry.entriesEarned}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No entries found for selected date range</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <MobileNav role={user?.role} />
    </div>
  );
}
