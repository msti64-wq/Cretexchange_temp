import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { MobileNav } from "@/components/MobileNav";
import { 
  Settings, 
  Clock, 
  Calendar, 
  Building2, 
  Loader2, 
  CheckCircle2,
  AlertCircle,
  Zap,
  CalendarDays,
  CalendarRange
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface OwnerBillingSettings {
  ownerId: string;
  companyName: string;
  username: string;
  billingCadence: string;
  billingCutoffTime: string;
  billingTimezone: string;
  billingDayOfWeek: number;
}

interface BillingSettingsResponse {
  owners: OwnerBillingSettings[];
  billingCadenceOptions: { value: string; label: string }[];
  dayOfWeekOptions: { value: number; label: string }[];
  timezoneOptions: string[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getCadenceIcon(cadence: string) {
  switch (cadence) {
    case 'immediate':
      return <Zap className="w-4 h-4 text-yellow-500" />;
    case 'daily':
      return <CalendarDays className="w-4 h-4 text-blue-500" />;
    case 'weekly':
      return <CalendarRange className="w-4 h-4 text-purple-500" />;
    default:
      return <Clock className="w-4 h-4" />;
  }
}

function getCadenceBadge(cadence: string) {
  switch (cadence) {
    case 'immediate':
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Immediate</Badge>;
    case 'daily':
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Daily</Badge>;
    case 'weekly':
      return <Badge variant="secondary" className="bg-purple-100 text-purple-800">Weekly</Badge>;
    default:
      return <Badge variant="outline">{cadence}</Badge>;
  }
}

export default function AdminBillingSettings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedOwner, setSelectedOwner] = useState<OwnerBillingSettings | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  
  const [editForm, setEditForm] = useState({
    billingCadence: 'daily',
    billingCutoffTime: '23:59',
    billingTimezone: 'America/Chicago',
    billingDayOfWeek: 0
  });

  const [bulkForm, setBulkForm] = useState({
    billingCadence: 'daily',
    billingCutoffTime: '23:59',
    billingTimezone: 'America/Chicago',
    billingDayOfWeek: 0
  });

  const { data: billingData, isLoading } = useQuery<BillingSettingsResponse>({
    queryKey: ['/api/admin/billing/settings'],
    retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ ownerId, settings }: { ownerId: string; settings: any }) => {
      const response = await apiRequest(`/api/admin/billing/settings/${ownerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/billing/settings'] });
      setEditDialogOpen(false);
      toast({
        title: "Settings Updated",
        description: "Owner billing settings have been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update billing settings",
        variant: "destructive",
      });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (settings: any) => {
      const response = await apiRequest('/api/admin/billing/settings/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/billing/settings'] });
      setBulkDialogOpen(false);
      toast({
        title: "Bulk Update Complete",
        description: `Updated billing settings for ${data.updated} owners.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Bulk Update Failed",
        description: error.message || "Failed to bulk update billing settings",
        variant: "destructive",
      });
    },
  });

  const handleEditOwner = (owner: OwnerBillingSettings) => {
    setSelectedOwner(owner);
    setEditForm({
      billingCadence: owner.billingCadence,
      billingCutoffTime: owner.billingCutoffTime.substring(0, 5),
      billingTimezone: owner.billingTimezone,
      billingDayOfWeek: owner.billingDayOfWeek
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedOwner) return;
    updateMutation.mutate({
      ownerId: selectedOwner.ownerId,
      settings: editForm
    });
  };

  const handleBulkUpdate = () => {
    bulkUpdateMutation.mutate(bulkForm);
  };

  const cadenceStats = billingData?.owners.reduce((acc, owner) => {
    acc[owner.billingCadence] = (acc[owner.billingCadence] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="gradient-bg text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">Payment Processing Settings</h1>
              <p className="text-white/80 text-sm">Manage owner billing schedules</p>
            </div>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Processing Mode Overview
            </CardTitle>
            <CardDescription>
              Configure when washout payments are processed for each owner
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-lg border bg-yellow-50 dark:bg-yellow-900/20">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-5 h-5 text-yellow-600" />
                  <span className="font-medium">Immediate</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Payments processed instantly when washout is approved
                </p>
                <p className="text-2xl font-bold">{cadenceStats['immediate'] || 0}</p>
                <p className="text-xs text-muted-foreground">owners</p>
              </div>
              
              <div className="p-4 rounded-lg border bg-blue-50 dark:bg-blue-900/20">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarDays className="w-5 h-5 text-blue-600" />
                  <span className="font-medium">Daily</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Payments batched and processed at end of day
                </p>
                <p className="text-2xl font-bold">{cadenceStats['daily'] || 0}</p>
                <p className="text-xs text-muted-foreground">owners</p>
              </div>
              
              <div className="p-4 rounded-lg border bg-purple-50 dark:bg-purple-900/20">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarRange className="w-5 h-5 text-purple-600" />
                  <span className="font-medium">Weekly</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Payments batched and processed at end of week
                </p>
                <p className="text-2xl font-bold">{cadenceStats['weekly'] || 0}</p>
                <p className="text-xs text-muted-foreground">owners</p>
              </div>
            </div>

            <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full md:w-auto" data-testid="button-bulk-update">
                  <Settings className="w-4 h-4 mr-2" />
                  Bulk Update All Owners
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Bulk Update Billing Settings</DialogTitle>
                  <DialogDescription>
                    Update billing settings for all owners at once. This is useful when switching between test and production modes.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Processing Mode</Label>
                    <Select 
                      value={bulkForm.billingCadence} 
                      onValueChange={(v) => setBulkForm(f => ({ ...f, billingCadence: v }))}
                    >
                      <SelectTrigger data-testid="select-bulk-cadence">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="immediate">Immediate (process instantly)</SelectItem>
                        <SelectItem value="daily">Daily (end of day batch)</SelectItem>
                        <SelectItem value="weekly">Weekly (end of week batch)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {bulkForm.billingCadence !== 'immediate' && (
                    <>
                      <div className="space-y-2">
                        <Label>Cutoff Time</Label>
                        <Select 
                          value={bulkForm.billingCutoffTime} 
                          onValueChange={(v) => setBulkForm(f => ({ ...f, billingCutoffTime: v }))}
                        >
                          <SelectTrigger data-testid="select-bulk-cutoff">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="18:00">6:00 PM</SelectItem>
                            <SelectItem value="20:00">8:00 PM</SelectItem>
                            <SelectItem value="22:00">10:00 PM</SelectItem>
                            <SelectItem value="23:59">11:59 PM (End of Day)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Timezone</Label>
                        <Select 
                          value={bulkForm.billingTimezone} 
                          onValueChange={(v) => setBulkForm(f => ({ ...f, billingTimezone: v }))}
                        >
                          <SelectTrigger data-testid="select-bulk-timezone">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="America/New_York">Eastern Time</SelectItem>
                            <SelectItem value="America/Chicago">Central Time</SelectItem>
                            <SelectItem value="America/Denver">Mountain Time</SelectItem>
                            <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                            <SelectItem value="America/Phoenix">Arizona (no DST)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                  
                  {bulkForm.billingCadence === 'weekly' && (
                    <div className="space-y-2">
                      <Label>Processing Day</Label>
                      <Select 
                        value={bulkForm.billingDayOfWeek.toString()} 
                        onValueChange={(v) => setBulkForm(f => ({ ...f, billingDayOfWeek: parseInt(v) }))}
                      >
                        <SelectTrigger data-testid="select-bulk-day">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DAY_NAMES.map((day, idx) => (
                            <SelectItem key={idx} value={idx.toString()}>{day}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
                  <Button 
                    onClick={handleBulkUpdate} 
                    disabled={bulkUpdateMutation.isPending}
                    data-testid="button-confirm-bulk"
                  >
                    {bulkUpdateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Update All Owners
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Owner Billing Settings
            </CardTitle>
            <CardDescription>
              Individual billing configuration for each location owner
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Owner</TableHead>
                      <TableHead>Processing Mode</TableHead>
                      <TableHead className="hidden md:table-cell">Cutoff Time</TableHead>
                      <TableHead className="hidden md:table-cell">Timezone</TableHead>
                      <TableHead className="hidden lg:table-cell">Weekly Day</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billingData?.owners.map((owner) => (
                      <TableRow key={owner.ownerId} data-testid={`row-owner-${owner.ownerId}`}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{owner.companyName}</p>
                            <p className="text-sm text-muted-foreground">@{owner.username}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getCadenceIcon(owner.billingCadence)}
                            {getCadenceBadge(owner.billingCadence)}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {owner.billingCadence === 'immediate' ? (
                            <span className="text-muted-foreground">N/A</span>
                          ) : (
                            owner.billingCutoffTime.substring(0, 5)
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {owner.billingCadence === 'immediate' ? (
                            <span className="text-muted-foreground">N/A</span>
                          ) : (
                            owner.billingTimezone.replace('America/', '')
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {owner.billingCadence === 'weekly' ? (
                            DAY_NAMES[owner.billingDayOfWeek]
                          ) : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEditOwner(owner)}
                            data-testid={`button-edit-${owner.ownerId}`}
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!billingData?.owners || billingData.owners.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No owners found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Billing Settings</DialogTitle>
              <DialogDescription>
                {selectedOwner && `Configure billing settings for ${selectedOwner.companyName}`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Processing Mode</Label>
                <Select 
                  value={editForm.billingCadence} 
                  onValueChange={(v) => setEditForm(f => ({ ...f, billingCadence: v }))}
                >
                  <SelectTrigger data-testid="select-edit-cadence">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">Immediate (process instantly)</SelectItem>
                    <SelectItem value="daily">Daily (end of day batch)</SelectItem>
                    <SelectItem value="weekly">Weekly (end of week batch)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {editForm.billingCadence === 'immediate' && 'Payments will be processed immediately when a washout is approved.'}
                  {editForm.billingCadence === 'daily' && 'All payments will be batched and processed together at the end of each day.'}
                  {editForm.billingCadence === 'weekly' && 'All payments will be batched and processed together at the end of each week.'}
                </p>
              </div>
              
              {editForm.billingCadence !== 'immediate' && (
                <>
                  <div className="space-y-2">
                    <Label>Cutoff Time</Label>
                    <Select 
                      value={editForm.billingCutoffTime} 
                      onValueChange={(v) => setEditForm(f => ({ ...f, billingCutoffTime: v }))}
                    >
                      <SelectTrigger data-testid="select-edit-cutoff">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="18:00">6:00 PM</SelectItem>
                        <SelectItem value="20:00">8:00 PM</SelectItem>
                        <SelectItem value="22:00">10:00 PM</SelectItem>
                        <SelectItem value="23:59">11:59 PM (End of Day)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Washouts completed before this time will be included in that day's batch.
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Timezone</Label>
                    <Select 
                      value={editForm.billingTimezone} 
                      onValueChange={(v) => setEditForm(f => ({ ...f, billingTimezone: v }))}
                    >
                      <SelectTrigger data-testid="select-edit-timezone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="America/New_York">Eastern Time</SelectItem>
                        <SelectItem value="America/Chicago">Central Time</SelectItem>
                        <SelectItem value="America/Denver">Mountain Time</SelectItem>
                        <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                        <SelectItem value="America/Phoenix">Arizona (no DST)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              
              {editForm.billingCadence === 'weekly' && (
                <div className="space-y-2">
                  <Label>Processing Day</Label>
                  <Select 
                    value={editForm.billingDayOfWeek.toString()} 
                    onValueChange={(v) => setEditForm(f => ({ ...f, billingDayOfWeek: parseInt(v) }))}
                  >
                    <SelectTrigger data-testid="select-edit-day">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_NAMES.map((day, idx) => (
                        <SelectItem key={idx} value={idx.toString()}>{day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Payments will be batched and processed on this day of the week.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button 
                onClick={handleSaveEdit} 
                disabled={updateMutation.isPending}
                data-testid="button-save-edit"
              >
                {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Important Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
              <p><strong>Immediate mode</strong> is recommended for testing - payments process instantly when washouts are approved.</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
              <p><strong>Daily mode</strong> is recommended for production - payments are batched and processed together, reducing transaction fees.</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
              <p><strong>Weekly mode</strong> is available for owners who prefer less frequent billing cycles.</p>
            </div>
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5" />
              <p>Changes take effect immediately for new washouts. Pending payments will be processed according to their original settings.</p>
            </div>
          </CardContent>
        </Card>
      </main>

      <MobileNav role={user?.role} />
    </div>
  );
}
