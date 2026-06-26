import { useEffect, useMemo, useState } from "react";
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
import { Ticket, Download, Calendar, Trophy, Archive, Clock, Send, Gift, ChevronDown, ChevronUp, Building2, List, Zap, Medal, FileText, Package, Pencil, History, Plus, RotateCcw, Info, Truck } from "lucide-react";
import { MobileNav } from "@/components/MobileNav";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DEFAULT_PRIZE_TIERS = [
  { label: "First Place", title: "", description: "", quantity: 1 },
  { label: "Second Place", title: "", description: "", quantity: 1 },
  { label: "Third Place", title: "", description: "", quantity: 1 },
];

const clampTierQuantity = (value: number | string | null | undefined, allowZero = false) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return allowZero ? 0 : 1;
  return Math.max(allowZero ? 0 : 1, Math.floor(parsed));
};

type PrizeCatalogItem = {
  id: string;
  title: string;
  description: string | null;
  prizeType: string;
  estimatedValueCents: number | null;
  isActive: boolean;
  inventoryQuantity: number;
  reservedQuantity: number;
  minimumInventoryAlert: number;
  isUnlimited: boolean;
  lastInventoryUpdate: string | null;
  fulfillmentInstructions: string | null;
  sponsorVendor: string | null;
  internalNotes: string | null;
  createdBy: string | null;
  inventoryUpdatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type PrizeCatalogSummary = {
  catalog: PrizeCatalogItem;
  availableQuantity: number;
  isLowInventory: boolean;
  lastAdjustment: {
    id: string;
    adjustmentType: string;
    quantityDelta: number;
    quantityBefore: number;
    quantityAfter: number;
    reservedBefore: number;
    reservedAfter: number;
    referenceType: string | null;
    referenceId: string | null;
    reason: string;
    createdBy: string;
    createdAt: string;
    metadata: Record<string, unknown> | null;
  } | null;
};

type PrizeCatalogAdjustment = {
  id: string;
  prizeCatalogId: string;
  adjustmentType: string;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  reservedBefore: number;
  reservedAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  reason: string;
  createdBy: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

type PrizeCatalogFormState = {
  title: string;
  description: string;
  prizeType: string;
  estimatedValue: string;
  inventoryQuantity: string;
  minimumInventoryAlert: string;
  isUnlimited: boolean;
  fulfillmentInstructions: string;
  sponsorVendor: string;
  internalNotes: string;
  isActive: boolean;
};

const PRIZE_TYPE_LABELS: Record<string, string> = {
  prepaid_card: "Prepaid Card",
  gift_card: "Gift Card",
  physical_item: "Physical Item",
  sponsored_item: "Sponsored Item",
  service_credit: "Service Credit",
  other: "Other",
};

const PRIZE_TYPE_OPTIONS = [
  "prepaid_card",
  "gift_card",
  "physical_item",
  "sponsored_item",
  "service_credit",
  "other",
];

const EMPTY_PRIZE_FORM: PrizeCatalogFormState = {
  title: "",
  description: "",
  prizeType: "gift_card",
  estimatedValue: "",
  inventoryQuantity: "0",
  minimumInventoryAlert: "0",
  isUnlimited: false,
  fulfillmentInstructions: "",
  sponsorVendor: "",
  internalNotes: "",
  isActive: true,
};

const formatMoneyDisplay = (cents: number | null | undefined) => {
  if (cents === null || cents === undefined || Number.isNaN(Number(cents))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
};

const formatDateTimeDisplay = (value: string | Date | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const toIntegerOrZero = (value: string | number | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
};

const toNullableCents = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round(parsed * 100));
};

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
  const [prizeTiers, setPrizeTiers] = useState(DEFAULT_PRIZE_TIERS);
  const [allowDuplicateWinnerDriver, setAllowDuplicateWinnerDriver] = useState(false);
  const [previewResult, setPreviewResult] = useState<any | null>(null);
  
  const [catalogStatusFilter, setCatalogStatusFilter] = useState<"all" | "active" | "inactive" | "low" | "out_of_stock" | "unlimited">("all");
  const [catalogTypeFilter, setCatalogTypeFilter] = useState<string>("all");
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const [catalogFormOpen, setCatalogFormOpen] = useState(false);
  const [catalogEditingId, setCatalogEditingId] = useState<string | null>(null);
  const [inventoryDialogOpen, setInventoryDialogOpen] = useState(false);
  const [inventoryAdjustValue, setInventoryAdjustValue] = useState("");
  const [inventoryAdjustReason, setInventoryAdjustReason] = useState("");
  const [inventoryAdjustMetadata, setInventoryAdjustMetadata] = useState("");
  const [catalogFormState, setCatalogFormState] = useState<PrizeCatalogFormState>(EMPTY_PRIZE_FORM);

  useEffect(() => {
    setPreviewResult(null);
  }, [selectedMonth, selectedYear, allowDuplicateWinnerDriver, prizeTiers]);

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

  const { data: prizeCatalog, isLoading: prizeCatalogLoading } = useQuery<PrizeCatalogItem[]>({
    queryKey: ['/api/admin/prize-catalog'],
    enabled: !!user && (user.role === 'admin' || user.role === 'super_admin'),
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/prize-catalog');
      return response.json();
    },
  });

  const selectedCatalog = useMemo(
    () => prizeCatalog?.find((item) => item.id === selectedCatalogId) || null,
    [prizeCatalog, selectedCatalogId]
  );

  const { data: selectedCatalogDetail } = useQuery<PrizeCatalogItem>({
    queryKey: ['/api/admin/prize-catalog', catalogEditingId, 'detail'],
    enabled: !!catalogEditingId && catalogFormOpen && !!user && (user.role === 'admin' || user.role === 'super_admin'),
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/admin/prize-catalog/${catalogEditingId}`);
      return response.json();
    },
  });

  const { data: selectedCatalogSummary } = useQuery<PrizeCatalogSummary>({
    queryKey: ['/api/admin/prize-catalog', selectedCatalogId, 'summary'],
    enabled: !!selectedCatalogId && !!user && (user.role === 'admin' || user.role === 'super_admin'),
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/admin/prize-catalog/${selectedCatalogId}/inventory/summary`);
      return response.json();
    },
  });

  const { data: selectedCatalogHistory } = useQuery<PrizeCatalogAdjustment[]>({
    queryKey: ['/api/admin/prize-catalog', selectedCatalogId, 'history'],
    enabled: !!selectedCatalogId && !!user && (user.role === 'admin' || user.role === 'super_admin'),
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/admin/prize-catalog/${selectedCatalogId}/inventory/history`);
      return response.json();
    },
  });

  useEffect(() => {
    if (selectedCatalogDetail && catalogEditingId) {
      setCatalogFormState({
        title: selectedCatalogDetail.title || "",
        description: selectedCatalogDetail.description || "",
        prizeType: selectedCatalogDetail.prizeType || "gift_card",
        estimatedValue: selectedCatalogDetail.estimatedValueCents !== null && selectedCatalogDetail.estimatedValueCents !== undefined
          ? String((Number(selectedCatalogDetail.estimatedValueCents) / 100).toFixed(2))
          : "",
        inventoryQuantity: String(selectedCatalogDetail.inventoryQuantity ?? 0),
        minimumInventoryAlert: String(selectedCatalogDetail.minimumInventoryAlert ?? 0),
        isUnlimited: Boolean(selectedCatalogDetail.isUnlimited),
        fulfillmentInstructions: selectedCatalogDetail.fulfillmentInstructions || "",
        sponsorVendor: selectedCatalogDetail.sponsorVendor || "",
        internalNotes: selectedCatalogDetail.internalNotes || "",
        isActive: Boolean(selectedCatalogDetail.isActive),
      });
    }
  }, [selectedCatalogDetail, catalogEditingId]);

  const selectedDrawing = drawingHistory?.find((drawing: any) => drawing.lotteryMonth === selectedMonth && drawing.lotteryYear === selectedYear) || null;
  const existingDrawing = selectedDrawing;
  const totalWinnerCount = prizeTiers.reduce((sum, tier, index) => sum + clampTierQuantity(tier.quantity, index > 0), 0);
  const normalizedPrizeTiers = prizeTiers.map((tier, index) => ({
    title: tier.title.trim() || null,
    description: tier.description.trim() || null,
    quantity: clampTierQuantity(tier.quantity, index > 0),
    tierLabel: tier.label,
    placeLabel: tier.label,
    tierOrder: index + 1,
  }));
  const previewResultCount = previewResult?.selectedWinners?.length || 0;
  const previewIsComplete = Boolean(previewResult) && previewResultCount === totalWinnerCount;
  const filteredPrizeCatalog = useMemo(() => {
    return (prizeCatalog || []).filter((item) => {
      const availableQuantity = item.isUnlimited
        ? Number.POSITIVE_INFINITY
        : Math.max(0, Number(item.inventoryQuantity || 0) - Number(item.reservedQuantity || 0));
      const isOutOfStock = !item.isUnlimited && availableQuantity <= 0;
      const isLowInventory = !item.isUnlimited && availableQuantity > 0 && availableQuantity <= Number(item.minimumInventoryAlert || 0);

      if (catalogStatusFilter === "active" && !item.isActive) return false;
      if (catalogStatusFilter === "inactive" && item.isActive) return false;
      if (catalogStatusFilter === "low" && !isLowInventory) return false;
      if (catalogStatusFilter === "out_of_stock" && !isOutOfStock) return false;
      if (catalogStatusFilter === "unlimited" && !item.isUnlimited) return false;
      if (catalogTypeFilter !== "all" && item.prizeType !== catalogTypeFilter) return false;

      return true;
    });
  }, [catalogStatusFilter, catalogTypeFilter, prizeCatalog]);

  const prizeCatalogCounts = useMemo(() => {
    const counts = {
      total: (prizeCatalog || []).length,
      active: 0,
      inactive: 0,
      lowInventory: 0,
      outOfStock: 0,
      unlimited: 0,
    };

    (prizeCatalog || []).forEach((item) => {
      const availableQuantity = item.isUnlimited
        ? Number.POSITIVE_INFINITY
        : Math.max(0, Number(item.inventoryQuantity || 0) - Number(item.reservedQuantity || 0));
      const isOutOfStock = !item.isUnlimited && availableQuantity <= 0;
      const isLowInventory = !item.isUnlimited && availableQuantity > 0 && availableQuantity <= Number(item.minimumInventoryAlert || 0);

      if (item.isActive) counts.active += 1;
      if (!item.isActive) counts.inactive += 1;
      if (isLowInventory) counts.lowInventory += 1;
      if (isOutOfStock) counts.outOfStock += 1;
      if (item.isUnlimited) counts.unlimited += 1;
    });

    return counts;
  }, [prizeCatalog]);

  const selectedCatalogAvailableQuantity = selectedCatalogSummary?.availableQuantity
    ?? (selectedCatalog
      ? selectedCatalog.isUnlimited
        ? Number.POSITIVE_INFINITY
        : Math.max(0, Number(selectedCatalog.inventoryQuantity || 0) - Number(selectedCatalog.reservedQuantity || 0))
      : 0);
  const selectedCatalogIsOutOfStock = !!selectedCatalog && !selectedCatalog.isUnlimited && selectedCatalogAvailableQuantity <= 0;
  const selectedCatalogIsLowInventory = !!selectedCatalog && !selectedCatalog.isUnlimited && selectedCatalogAvailableQuantity > 0 && selectedCatalogAvailableQuantity <= Number(selectedCatalog.minimumInventoryAlert || 0);
  const selectedCatalogInventoryHistory = selectedCatalogHistory || [];

  const executeMutation = useMutation({
    mutationFn: async (payload: {
      month: number;
      year: number;
      numberOfWinners: number;
      allowDuplicateWinnerDriver: boolean;
      firstPrize: string;
      secondPrize: string;
      thirdPrize: string;
      prizes: Array<{ title: string | null; description: string | null; quantity: number; tierLabel: string; placeLabel: string; tierOrder: number }>;
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

  const saveCatalogMutation = useMutation({
    mutationFn: async (payload: { mode: "create" | "edit"; id?: string; data: Record<string, unknown> }) => {
      const url = payload.mode === "create"
        ? '/api/admin/prize-catalog'
        : `/api/admin/prize-catalog/${payload.id}`;
      const response = await apiRequest(url, {
        method: payload.mode === "create" ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.data),
      });
      return response.json();
    },
    onSuccess: (data: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/prize-catalog'] });
      if (variables.id) {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/prize-catalog', variables.id, 'detail'] });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/prize-catalog', variables.id, 'summary'] });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/prize-catalog', variables.id, 'history'] });
      }
      setCatalogFormOpen(false);
      setCatalogEditingId(null);
      setCatalogFormState(EMPTY_PRIZE_FORM);
      toast({
        title: variables.mode === "create" ? "Prize Created" : "Prize Updated",
        description: data.message || "Prize catalog saved successfully.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Save Failed", description: error.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await apiRequest(`/api/admin/prize-catalog/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      return response.json();
    },
    onSuccess: (data: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/prize-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/prize-catalog', variables.id, 'detail'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/prize-catalog', variables.id, 'summary'] });
      toast({
        title: variables.isActive ? "Prize Activated" : "Prize Deactivated",
        description: data.message || "Prize status updated.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Status Update Failed", description: error.message, variant: "destructive" });
    },
  });

  const inventoryMutation = useMutation({
    mutationFn: async ({ id, delta, reason, metadata }: { id: string; delta: number; reason: string; metadata?: Record<string, unknown> | null }) => {
      const response = await apiRequest(`/api/admin/prize-catalog/${id}/inventory/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantityDelta: delta,
          reason,
          metadata: metadata || undefined,
        }),
      });
      return response.json();
    },
    onSuccess: (data: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/prize-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/prize-catalog', variables.id, 'summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/prize-catalog', variables.id, 'history'] });
      setInventoryDialogOpen(false);
      setInventoryAdjustValue("");
      setInventoryAdjustReason("");
      setInventoryAdjustMetadata("");
      toast({
        title: "Inventory Updated",
        description: data.message || "Prize inventory adjusted successfully.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Inventory Update Failed", description: error.message, variant: "destructive" });
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
          winnerCount: totalWinnerCount,
          allowDuplicateWinnerDriver,
          prizes: normalizedPrizeTiers,
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

  const openCreateCatalogDialog = () => {
    setCatalogEditingId(null);
    setCatalogFormState(EMPTY_PRIZE_FORM);
    setCatalogFormOpen(true);
  };

  const openEditCatalogDialog = (item: PrizeCatalogItem) => {
    setCatalogEditingId(item.id);
    setCatalogFormState({
      title: item.title || "",
      description: item.description || "",
      prizeType: item.prizeType || "gift_card",
      estimatedValue: item.estimatedValueCents !== null && item.estimatedValueCents !== undefined
        ? String((Number(item.estimatedValueCents) / 100).toFixed(2))
        : "",
      inventoryQuantity: String(item.inventoryQuantity ?? 0),
      minimumInventoryAlert: String(item.minimumInventoryAlert ?? 0),
      isUnlimited: Boolean(item.isUnlimited),
      fulfillmentInstructions: item.fulfillmentInstructions || "",
      sponsorVendor: item.sponsorVendor || "",
      internalNotes: item.internalNotes || "",
      isActive: Boolean(item.isActive),
    });
    setCatalogFormOpen(true);
  };

  const openInventoryDialog = (item: PrizeCatalogItem) => {
    setSelectedCatalogId(item.id);
    setInventoryAdjustValue("");
    setInventoryAdjustReason("");
    setInventoryAdjustMetadata("");
    setInventoryDialogOpen(true);
  };

  const openHistoryView = (item: PrizeCatalogItem) => {
    setSelectedCatalogId(item.id);
  };

  const handleCatalogFormSubmit = () => {
    const payload = {
      title: catalogFormState.title.trim(),
      description: catalogFormState.description.trim() || null,
      prizeType: catalogFormState.prizeType,
      estimatedValueCents: toNullableCents(catalogFormState.estimatedValue),
      inventoryQuantity: toIntegerOrZero(catalogFormState.inventoryQuantity),
      minimumInventoryAlert: toIntegerOrZero(catalogFormState.minimumInventoryAlert),
      isUnlimited: catalogFormState.isUnlimited,
      fulfillmentInstructions: catalogFormState.fulfillmentInstructions.trim() || null,
      sponsorVendor: catalogFormState.sponsorVendor.trim() || null,
      internalNotes: catalogFormState.internalNotes.trim() || null,
      isActive: catalogFormState.isActive,
    };

    if (!payload.title) {
      toast({ title: "Title Required", description: "Prize title is required.", variant: "destructive" });
      return;
    }

    if (!payload.prizeType) {
      toast({ title: "Prize Type Required", description: "Prize type is required.", variant: "destructive" });
      return;
    }

    saveCatalogMutation.mutate({
      mode: catalogEditingId ? "edit" : "create",
      id: catalogEditingId || undefined,
      data: payload,
    });
  };

  const handleInventoryAdjustSubmit = () => {
    if (!selectedCatalogId) return;
    const delta = Number(inventoryAdjustValue);
    if (!Number.isInteger(delta) || delta === 0) {
      toast({ title: "Adjustment Required", description: "Enter a non-zero inventory adjustment.", variant: "destructive" });
      return;
    }
    if (!inventoryAdjustReason.trim()) {
      toast({ title: "Reason Required", description: "A reason is required for inventory adjustments.", variant: "destructive" });
      return;
    }

    let metadata: Record<string, unknown> | null = null;
    if (inventoryAdjustMetadata.trim()) {
      try {
        metadata = JSON.parse(inventoryAdjustMetadata) as Record<string, unknown>;
      } catch {
        toast({
          title: "Invalid Metadata",
          description: "Metadata must be valid JSON if provided.",
          variant: "destructive",
        });
        return;
      }
    }

    inventoryMutation.mutate({
      id: selectedCatalogId,
      delta,
      reason: inventoryAdjustReason.trim(),
      metadata,
    });
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
              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-semibold">Tier Quantities</Label>
                  <Badge variant="outline">{totalWinnerCount} total winners</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Configure how many reward winners each prize tier should produce.
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
              {prizeTiers.map((tier, index) => (
                <div key={tier.label} className="space-y-3 rounded-lg border border-border/60 p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Label className="flex items-center gap-2 text-sm font-semibold">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200">
                        {index + 1}
                      </span>
                      {tier.label}
                    </Label>
                    <div className="ml-auto flex items-center gap-2">
                      <Label htmlFor={`tier-quantity-${index}`} className="text-xs font-medium text-muted-foreground">
                        Qty
                      </Label>
                      <Input
                        id={`tier-quantity-${index}`}
                        type="number"
                        min={index === 0 ? 1 : 0}
                        step={1}
                        className="w-20"
                        value={tier.quantity}
                        onChange={(event) => {
                          const nextQuantity = clampTierQuantity(event.target.value || (index === 0 ? 1 : 0), index > 0);
                          setPrizeTiers((current) => current.map((currentTier, currentIndex) => (
                            currentIndex === index
                              ? { ...currentTier, quantity: nextQuantity }
                              : currentTier
                          )));
                        }}
                        data-testid={`input-tier-quantity-${index}`}
                      />
                    </div>
                  </div>
                  <Input
                    placeholder={`e.g., ${index === 0 ? "$500 Milwaukee Tool Kit" : index === 1 ? "$50 Visa Card" : "YETI Tumbler"}`}
                    value={tier.title}
                    onChange={(e) => {
                      const nextTitle = e.target.value;
                      setPrizeTiers((current) => current.map((currentTier, currentIndex) => (
                        currentIndex === index
                          ? { ...currentTier, title: nextTitle }
                          : currentTier
                      )));
                    }}
                    data-testid={`input-tier-title-${index}`}
                  />
                  <Textarea
                    placeholder={`Prize description for ${tier.label.toLowerCase()}`}
                    value={tier.description}
                    onChange={(e) => {
                      const nextDescription = e.target.value;
                      setPrizeTiers((current) => current.map((currentTier, currentIndex) => (
                        currentIndex === index
                          ? { ...currentTier, description: nextDescription }
                          : currentTier
                      )));
                    }}
                    rows={2}
                    data-testid={`input-tier-description-${index}`}
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => previewMutation.mutate()}
                disabled={previewMutation.isPending || !totalEntriesCount || totalWinnerCount < 1}
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
                  numberOfWinners: totalWinnerCount,
                  allowDuplicateWinnerDriver,
                  firstPrize: prizeTiers[0]?.title || "",
                  secondPrize: prizeTiers[1]?.title || "",
                  thirdPrize: prizeTiers[2]?.title || "",
                  prizes: normalizedPrizeTiers,
                })}
                disabled={executeMutation.isPending || !totalEntriesCount || totalWinnerCount < 1 || Boolean(selectedDrawing) || isCurrentMonth || !previewIsComplete}
                data-testid="button-run-drawing"
              >
                <Zap className="w-4 h-4 mr-2" />
                {executeMutation.isPending ? "Running..." : "Run Official Drawing"}
              </Button>
            </div>

            {!previewIsComplete && (
              <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
                Preview winners first. The official drawing remains disabled until the preview succeeds without validation warnings.
              </div>
            )}

            {totalWinnerCount < 1 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                Configure at least one prize tier winner before previewing or running the official drawing.
              </div>
            )}

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
                <Badge variant="outline">{previewResult.selectedWinners?.length || 0} selected winners</Badge>
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
                      <TableHead>Place / Tier</TableHead>
                      <TableHead>Reward Winner</TableHead>
                      <TableHead>Entry Number</TableHead>
                      <TableHead>Prize</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewResult.selectedWinners.map((winner: any) => (
                      <TableRow key={`${winner.placeIndex}-${winner.driverId}-${winner.entryId}`}>
                        <TableCell className="font-semibold">
                          <div className="space-y-1">
                            <div>
                              {winner.tierLabel || (winner.placeIndex === 1 ? "🥇 1st" : winner.placeIndex === 2 ? "🥈 2nd" : winner.placeIndex === 3 ? "🥉 3rd" : `#${winner.placeIndex}`)}
                            </div>
                            {winner.tierQuantity > 1 && (
                              <div className="text-xs font-normal text-muted-foreground">
                                Winner {winner.tierWinnerIndex} of {winner.tierQuantity}
                              </div>
                            )}
                          </div>
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
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Package className="w-5 h-5 text-sky-500" />
                  Prize Catalog Procurement Dashboard
                </CardTitle>
                <CardDescription>
                  Manage Driver Rewards Program prize inventory, fulfillment notes, and catalog status.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={openCreateCatalogDialog} data-testid="button-create-prize">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Prize
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                <p className="text-xs font-medium text-muted-foreground">Catalog Items</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{prizeCatalogCounts.total}</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                <p className="text-xs font-medium text-muted-foreground">Active</p>
                <p className="mt-1 text-2xl font-bold text-emerald-500">{prizeCatalogCounts.active}</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                <p className="text-xs font-medium text-muted-foreground">Low Inventory</p>
                <p className="mt-1 text-2xl font-bold text-amber-500">{prizeCatalogCounts.lowInventory}</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                <p className="text-xs font-medium text-muted-foreground">Out of Stock</p>
                <p className="mt-1 text-2xl font-bold text-red-500">{prizeCatalogCounts.outOfStock}</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                <p className="text-xs font-medium text-muted-foreground">Unlimited</p>
                <p className="mt-1 text-2xl font-bold text-sky-500">{prizeCatalogCounts.unlimited}</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { key: "all", label: "All" },
                  { key: "active", label: "Active" },
                  { key: "inactive", label: "Inactive" },
                  { key: "low", label: "Low Inventory" },
                  { key: "out_of_stock", label: "Out of Stock" },
                  { key: "unlimited", label: "Unlimited" },
                ].map((filter) => {
                  const active = catalogStatusFilter === filter.key;
                  return (
                    <Button
                      key={filter.key}
                      type="button"
                      variant="outline"
                      size="sm"
                      className={
                        active
                          ? "border-orange-500 bg-orange-500 text-white hover:bg-orange-600"
                          : "border-slate-700 bg-slate-900/30 text-white hover:bg-slate-800 dark:border-slate-600 dark:bg-slate-800/40 dark:text-white"
                      }
                      onClick={() => setCatalogStatusFilter(filter.key as any)}
                    >
                      {filter.label}
                    </Button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-56">
                  <Select value={catalogTypeFilter} onValueChange={setCatalogTypeFilter}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Prize Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Prize Type</SelectItem>
                      {PRIZE_TYPE_OPTIONS.map((type) => (
                        <SelectItem key={type} value={type}>
                          {PRIZE_TYPE_LABELS[type] || type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCatalogStatusFilter("all");
                    setCatalogTypeFilter("all");
                  }}
                  className="border-slate-700 bg-slate-900/30 text-white hover:bg-slate-800 dark:border-slate-600 dark:bg-slate-800/40 dark:text-white"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset Filters
                </Button>
              </div>
            </div>

            {prizeCatalogLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-24 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : filteredPrizeCatalog.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border/70">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead>Prize</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Inventory</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Inventory Update</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPrizeCatalog.map((item) => {
                      const availableQuantity = item.isUnlimited
                        ? Number.POSITIVE_INFINITY
                        : Math.max(0, Number(item.inventoryQuantity || 0) - Number(item.reservedQuantity || 0));
                      const isOutOfStock = !item.isUnlimited && availableQuantity <= 0;
                      const isLowInventory = !item.isUnlimited && availableQuantity > 0 && availableQuantity <= Number(item.minimumInventoryAlert || 0);
                      const rowSelected = selectedCatalogId === item.id;

                      return (
                        <TableRow
                          key={item.id}
                          className={[
                            rowSelected ? "bg-sky-950/20 dark:bg-sky-950/30" : "",
                            !item.isActive ? "opacity-80" : "",
                          ].filter(Boolean).join(" ")}
                        >
                          <TableCell>
                            <button
                              type="button"
                              className="w-full text-left"
                              onClick={() => openHistoryView(item)}
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-slate-800">
                                  <Gift className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 space-y-1">
                                  <p className="truncate font-semibold text-foreground">{item.title}</p>
                                  <p className="line-clamp-2 text-xs text-muted-foreground">{item.description || "No description provided."}</p>
                                  {item.sponsorVendor && (
                                    <p className="text-xs text-sky-500 dark:text-sky-300">Sponsor: {item.sponsorVendor}</p>
                                  )}
                                </div>
                              </div>
                            </button>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="border-slate-700 bg-slate-900/30 text-white dark:border-slate-600 dark:bg-slate-800/40">
                              {PRIZE_TYPE_LABELS[item.prizeType] || item.prizeType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-2">
                              {item.isUnlimited ? (
                                <Badge className="bg-blue-600 text-white hover:bg-blue-700">Unlimited</Badge>
                              ) : (
                                <div className="space-y-1">
                                  <div className={`text-lg font-bold ${isOutOfStock ? "text-red-500" : isLowInventory ? "text-amber-500" : "text-emerald-500"}`}>
                                    {availableQuantity}
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    <Badge variant="outline" className="border-slate-700 bg-slate-900/30 text-white">
                                      Available
                                    </Badge>
                                    <Badge variant="outline" className="border-slate-700 bg-slate-900/30 text-white">
                                      Reserved {item.reservedQuantity}
                                    </Badge>
                                  </div>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Badge className={item.isActive ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-slate-500 text-white hover:bg-slate-600"}>
                                {item.isActive ? "Active" : "Inactive"}
                              </Badge>
                              {item.isUnlimited && <Badge className="bg-blue-600 text-white hover:bg-blue-700">Unlimited</Badge>}
                              {!item.isUnlimited && isOutOfStock && <Badge className="bg-red-600 text-white hover:bg-red-700">Out of Stock</Badge>}
                              {!item.isUnlimited && isLowInventory && !isOutOfStock && <Badge className="bg-amber-500 text-white hover:bg-amber-600">Low Inventory</Badge>}
                              {!item.isUnlimited && !isOutOfStock && !isLowInventory && <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">Healthy Stock</Badge>}
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Minimum alert: {item.minimumInventoryAlert}
                            </p>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1 text-sm">
                              <p className="text-foreground">{formatDateTimeDisplay(item.lastInventoryUpdate)}</p>
                              <p className="text-xs text-muted-foreground">Updated by {item.inventoryUpdatedBy || "—"}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-slate-700 bg-slate-900/30 text-white hover:bg-slate-800 dark:border-slate-600 dark:bg-slate-800/40 dark:text-white"
                                onClick={() => openHistoryView(item)}
                              >
                                <History className="mr-1 h-4 w-4" />
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-slate-700 bg-slate-900/30 text-white hover:bg-slate-800 dark:border-slate-600 dark:bg-slate-800/40 dark:text-white"
                                onClick={() => openEditCatalogDialog(item)}
                              >
                                <Pencil className="mr-1 h-4 w-4" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-slate-700 bg-slate-900/30 text-white hover:bg-slate-800 dark:border-slate-600 dark:bg-slate-800/40 dark:text-white"
                                onClick={() => openInventoryDialog(item)}
                              >
                                <RotateCcw className="mr-1 h-4 w-4" />
                                Adjust
                              </Button>
                              <Button
                                size="sm"
                                className={item.isActive ? "bg-slate-700 text-white hover:bg-slate-800" : "bg-emerald-600 text-white hover:bg-emerald-700"}
                                onClick={() => statusMutation.mutate({ id: item.id, isActive: !item.isActive })}
                              >
                                {item.isActive ? "Deactivate" : "Activate"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/70 p-8 text-center">
                <Package className="mx-auto mb-3 h-10 w-10 text-sky-500" />
                <p className="text-sm font-semibold text-foreground">No catalog items match the current filters.</p>
                <p className="mt-1 text-sm text-muted-foreground">Adjust filters or add a new prize to continue.</p>
              </div>
            )}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <Card className="border-border/70 bg-muted/20">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Info className="h-4 w-4 text-sky-500" />
                    Selected Prize Summary
                  </CardTitle>
                  <CardDescription>
                    {selectedCatalog ? "Review inventory state and recent history for the selected prize." : "Select a prize to inspect inventory summary and adjustment history."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedCatalog ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Badge className={selectedCatalog.isActive ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-slate-500 text-white hover:bg-slate-600"}>
                          {selectedCatalog.isActive ? "Active" : "Inactive"}
                        </Badge>
                        {selectedCatalog.isUnlimited ? (
                          <Badge className="bg-blue-600 text-white hover:bg-blue-700">Unlimited</Badge>
                        ) : selectedCatalogIsOutOfStock ? (
                          <Badge className="bg-red-600 text-white hover:bg-red-700">Out of Stock</Badge>
                        ) : selectedCatalogIsLowInventory ? (
                          <Badge className="bg-amber-500 text-white hover:bg-amber-600">Low Inventory</Badge>
                        ) : (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">Healthy Stock</Badge>
                        )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-border/70 bg-background/80 p-3">
                          <p className="text-xs font-medium text-muted-foreground">Available Quantity</p>
                          <p className="mt-1 text-2xl font-bold text-foreground">
                            {selectedCatalog.isUnlimited ? "Unlimited" : selectedCatalogAvailableQuantity}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border/70 bg-background/80 p-3">
                          <p className="text-xs font-medium text-muted-foreground">Reserved Quantity</p>
                          <p className="mt-1 text-2xl font-bold text-sky-500">{selectedCatalog.reservedQuantity}</p>
                        </div>
                        <div className="rounded-lg border border-border/70 bg-background/80 p-3">
                          <p className="text-xs font-medium text-muted-foreground">Total Inventory</p>
                          <p className="mt-1 text-lg font-semibold text-foreground">{selectedCatalog.inventoryQuantity}</p>
                        </div>
                        <div className="rounded-lg border border-border/70 bg-background/80 p-3">
                          <p className="text-xs font-medium text-muted-foreground">Minimum Alert</p>
                          <p className="mt-1 text-lg font-semibold text-amber-500">{selectedCatalog.minimumInventoryAlert}</p>
                        </div>
                      </div>

                      {selectedCatalogSummary?.lastAdjustment && (
                        <div className="rounded-lg border border-border/70 bg-background/80 p-3 text-sm text-foreground">
                          <p className="font-semibold">Most Recent Adjustment</p>
                          <p className="mt-1 text-muted-foreground">
                            {selectedCatalogSummary.lastAdjustment.adjustmentType.replace(/_/g, " ")} · {selectedCatalogSummary.lastAdjustment.quantityDelta > 0 ? "+" : ""}
                            {selectedCatalogSummary.lastAdjustment.quantityDelta} ·{" "}
                            {formatDateTimeDisplay(selectedCatalogSummary.lastAdjustment.createdAt)}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {selectedCatalogSummary.lastAdjustment.reason}
                          </p>
                        </div>
                      )}

                      <div className="space-y-2 rounded-lg border border-border/70 bg-background/80 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => openEditCatalogDialog(selectedCatalog)}
                            className="bg-slate-700 text-white hover:bg-slate-800"
                          >
                            <Pencil className="mr-1 h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-700 bg-slate-900/30 text-white hover:bg-slate-800 dark:border-slate-600 dark:bg-slate-800/40 dark:text-white"
                            onClick={() => openInventoryDialog(selectedCatalog)}
                          >
                            <RotateCcw className="mr-1 h-4 w-4" />
                            Adjust Inventory
                          </Button>
                          <Button
                            size="sm"
                            className={selectedCatalog.isActive ? "bg-slate-700 text-white hover:bg-slate-800" : "bg-emerald-600 text-white hover:bg-emerald-700"}
                            onClick={() => statusMutation.mutate({ id: selectedCatalog.id, isActive: !selectedCatalog.isActive })}
                          >
                            {selectedCatalog.isActive ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                        <div className="grid gap-2 text-sm">
                          <p className="text-foreground"><span className="font-semibold">Type:</span> {PRIZE_TYPE_LABELS[selectedCatalog.prizeType] || selectedCatalog.prizeType}</p>
                          <p className="text-foreground"><span className="font-semibold">Estimated value:</span> {formatMoneyDisplay(selectedCatalog.estimatedValueCents)}</p>
                          <p className="text-foreground"><span className="font-semibold">Sponsor/vendor:</span> {selectedCatalog.sponsorVendor || "—"}</p>
                          <p className="text-foreground"><span className="font-semibold">Fulfillment instructions:</span> {selectedCatalog.fulfillmentInstructions || "—"}</p>
                          <p className="text-foreground"><span className="font-semibold">Internal notes:</span> {selectedCatalog.internalNotes || "—"}</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-sm font-semibold text-foreground">Inventory Adjustment History</h4>
                          <Badge variant="outline" className="border-slate-700 bg-slate-900/30 text-white dark:border-slate-600 dark:bg-slate-800/40">
                            {selectedCatalogInventoryHistory.length} records
                          </Badge>
                        </div>
                        {selectedCatalogInventoryHistory.length > 0 ? (
                          <div className="overflow-hidden rounded-lg border border-border/70">
                            <Table>
                              <TableHeader className="bg-muted/30">
                                <TableRow>
                                  <TableHead>Adjustment</TableHead>
                                  <TableHead>Change</TableHead>
                                  <TableHead>Before / After</TableHead>
                                  <TableHead>Reason</TableHead>
                                  <TableHead>Created</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {selectedCatalogInventoryHistory.map((adjustment) => (
                                  <TableRow key={adjustment.id}>
                                    <TableCell className="font-medium text-foreground">
                                      {adjustment.adjustmentType.replace(/_/g, " ")}
                                    </TableCell>
                                    <TableCell>
                                      <span className={adjustment.quantityDelta > 0 ? "font-semibold text-emerald-500" : "font-semibold text-red-500"}>
                                        {adjustment.quantityDelta > 0 ? "+" : ""}
                                        {adjustment.quantityDelta}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-sm text-foreground">
                                      {adjustment.quantityBefore} → {adjustment.quantityAfter}
                                      <div className="text-xs text-muted-foreground">
                                        Reserved {adjustment.reservedBefore} → {adjustment.reservedAfter}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-sm text-foreground">{adjustment.reason}</TableCell>
                                    <TableCell className="text-sm text-foreground">
                                      <div>{formatDateTimeDisplay(adjustment.createdAt)}</div>
                                      <div className="text-xs text-muted-foreground font-mono">{adjustment.createdBy || "—"}</div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                            No inventory adjustments recorded yet for this prize.
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                      Click View on a prize to inspect inventory summary and adjustment history.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-muted/20">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Truck className="h-4 w-4 text-sky-500" />
                    Procurement Notes
                  </CardTitle>
                  <CardDescription>
                    Inventory updates are manual and append-only. No inventory is reserved or deducted by drawings in this phase.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg border border-border/70 bg-background/80 p-3 text-sm text-foreground">
                    <p className="font-semibold">Behavior rules</p>
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      <li>• Inventory may be zero.</li>
                      <li>• Inventory never goes negative.</li>
                      <li>• Unlimited prizes ignore shortage checks later but still keep quantity fields.</li>
                      <li>• Inactive prizes remain visible for history and operational review.</li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-background/80 p-3 text-sm text-foreground">
                    <p className="font-semibold">Inventory warnings</p>
                    <p className="mt-2 text-muted-foreground">
                      Low inventory and out-of-stock states are visual warnings only in this phase.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

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

      <Dialog open={catalogFormOpen} onOpenChange={(open) => {
        setCatalogFormOpen(open);
        if (!open) {
          setCatalogEditingId(null);
          setCatalogFormState(EMPTY_PRIZE_FORM);
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-sky-500" />
              {catalogEditingId ? "Edit Prize Catalog Item" : "Add Prize Catalog Item"}
            </DialogTitle>
            <DialogDescription>
              Configure reusable Driver Rewards Program prizes for Monthly Prize Drawings.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="catalog-title">Prize Title</Label>
              <Input
                id="catalog-title"
                value={catalogFormState.title}
                onChange={(event) => setCatalogFormState((current) => ({ ...current, title: event.target.value }))}
                placeholder="e.g., Milwaukee Tool Kit"
                data-testid="input-catalog-title"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="catalog-description">Description</Label>
              <Textarea
                id="catalog-description"
                value={catalogFormState.description}
                onChange={(event) => setCatalogFormState((current) => ({ ...current, description: event.target.value }))}
                placeholder="Prize description"
                rows={3}
                data-testid="input-catalog-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-prize-type">Prize Type</Label>
              <Select value={catalogFormState.prizeType} onValueChange={(value) => setCatalogFormState((current) => ({ ...current, prizeType: value }))}>
                <SelectTrigger id="catalog-prize-type">
                  <SelectValue placeholder="Select a prize type" />
                </SelectTrigger>
                <SelectContent>
                  {PRIZE_TYPE_OPTIONS.map((type) => (
                    <SelectItem key={type} value={type}>
                      {PRIZE_TYPE_LABELS[type] || type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-value">Estimated Value (USD)</Label>
              <Input
                id="catalog-value"
                type="number"
                min="0"
                step="0.01"
                value={catalogFormState.estimatedValue}
                onChange={(event) => setCatalogFormState((current) => ({ ...current, estimatedValue: event.target.value }))}
                placeholder="0.00"
                data-testid="input-catalog-estimated-value"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-quantity">Available Quantity</Label>
              <Input
                id="catalog-quantity"
                type="number"
                min="0"
                step="1"
                value={catalogFormState.inventoryQuantity}
                onChange={(event) => setCatalogFormState((current) => ({ ...current, inventoryQuantity: event.target.value }))}
                data-testid="input-catalog-quantity"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-min-alert">Minimum Inventory Alert</Label>
              <Input
                id="catalog-min-alert"
                type="number"
                min="0"
                step="1"
                value={catalogFormState.minimumInventoryAlert}
                onChange={(event) => setCatalogFormState((current) => ({ ...current, minimumInventoryAlert: event.target.value }))}
                data-testid="input-catalog-min-alert"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="catalog-unlimited"
                  checked={catalogFormState.isUnlimited}
                  onCheckedChange={(checked) => setCatalogFormState((current) => ({ ...current, isUnlimited: Boolean(checked) }))}
                />
                <Label htmlFor="catalog-unlimited">Unlimited prize</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Unlimited prizes keep inventory fields for tracking, but shortage checks are ignored later.
              </p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="catalog-fulfillment">Fulfillment Instructions</Label>
              <Textarea
                id="catalog-fulfillment"
                value={catalogFormState.fulfillmentInstructions}
                onChange={(event) => setCatalogFormState((current) => ({ ...current, fulfillmentInstructions: event.target.value }))}
                placeholder="How to fulfill this prize manually"
                rows={3}
                data-testid="input-catalog-fulfillment"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-vendor">Sponsor / Vendor</Label>
              <Input
                id="catalog-vendor"
                value={catalogFormState.sponsorVendor}
                onChange={(event) => setCatalogFormState((current) => ({ ...current, sponsorVendor: event.target.value }))}
                placeholder="Optional sponsor or vendor"
                data-testid="input-catalog-vendor"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-active">Status</Label>
              <Select value={catalogFormState.isActive ? "active" : "inactive"} onValueChange={(value) => setCatalogFormState((current) => ({ ...current, isActive: value === "active" }))}>
                <SelectTrigger id="catalog-active">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="catalog-notes">Internal Notes</Label>
              <Textarea
                id="catalog-notes"
                value={catalogFormState.internalNotes}
                onChange={(event) => setCatalogFormState((current) => ({ ...current, internalNotes: event.target.value }))}
                placeholder="Internal notes only"
                rows={3}
                data-testid="input-catalog-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCatalogFormOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCatalogFormSubmit}
              disabled={saveCatalogMutation.isPending}
              data-testid="button-save-catalog"
            >
              {saveCatalogMutation.isPending ? "Saving..." : catalogEditingId ? "Save Changes" : "Create Prize"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inventoryDialogOpen} onOpenChange={setInventoryDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-sky-500" />
              Adjust Prize Inventory
            </DialogTitle>
            <DialogDescription>
              Increase or decrease available quantity with a required reason. Negative final inventory is blocked.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <p className="text-sm font-semibold text-foreground">{selectedCatalog?.title || "Selected prize"}</p>
              <p className="text-xs text-muted-foreground">
                Current available quantity: {selectedCatalog?.isUnlimited ? "Unlimited" : selectedCatalogAvailableQuantity}
              </p>
              <p className="text-xs text-muted-foreground">
                Reserved quantity: {selectedCatalog?.reservedQuantity ?? "—"}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inventory-delta">Quantity Delta</Label>
                <Input
                  id="inventory-delta"
                  type="number"
                  step="1"
                  value={inventoryAdjustValue}
                  onChange={(event) => setInventoryAdjustValue(event.target.value)}
                  placeholder="+5 or -2"
                  data-testid="input-inventory-delta"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inventory-reason">Reason</Label>
                <Input
                  id="inventory-reason"
                  value={inventoryAdjustReason}
                  onChange={(event) => setInventoryAdjustReason(event.target.value)}
                  placeholder="Required reason"
                  data-testid="input-inventory-reason"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inventory-metadata">Metadata JSON (optional)</Label>
              <Textarea
                id="inventory-metadata"
                value={inventoryAdjustMetadata}
                onChange={(event) => setInventoryAdjustMetadata(event.target.value)}
                placeholder='{"source":"manual audit"}'
                rows={3}
                data-testid="input-inventory-metadata"
              />
            </div>

            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              Inventory adjustment is append-only. Final inventory cannot become negative.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInventoryDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInventoryAdjustSubmit}
              disabled={inventoryMutation.isPending}
              data-testid="button-save-inventory-adjustment"
            >
              {inventoryMutation.isPending ? "Saving..." : "Save Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
