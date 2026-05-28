import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/MobileNav";
import { ReportExplorer } from "@/components/ReportExplorer";
import { OWNER_REPORT_COLUMNS, DRIVER_REPORT_COLUMNS } from "@shared/reportColumns";
import { useAuth } from "@/hooks/useAuth";

export default function AdminReports() {
  const { user } = useAuth();
  const [reportMode, setReportMode] = useState<"owner" | "driver">("owner");

  const { data: ownersData } = useQuery<any[]>({
    queryKey: ["/api/admin/owners"],
    retry: false,
  });

  const { data: locationsData } = useQuery<any[]>({
    queryKey: ["/api/admin/locations"],
    retry: false,
  });

  const { data: usersData } = useQuery<any>({
    queryKey: ["/api/admin/users"],
    retry: false,
  });

  const ownerOptions = useMemo(() => {
    const owners = ownersData || [];
    return owners.map((entry: any) => ({
      value: entry.owners?.id,
      label: `${entry.users?.firstName || "Owner"} ${entry.users?.lastName || ""}`.trim() || entry.owners?.companyName || entry.owners?.id,
    })).filter((option: any) => option.value);
  }, [ownersData]);

  const driverOptions = useMemo(() => {
    const drivers = usersData?.drivers || [];
    return drivers.map((entry: any) => ({
      value: entry.drivers?.id,
      label: `${entry.users?.firstName || "Driver"} ${entry.users?.lastName || ""}`.trim() || entry.drivers?.truckNumber || entry.drivers?.id,
    })).filter((option: any) => option.value);
  }, [usersData]);

  const locationOptions = useMemo(() => {
    const locations = locationsData || [];
    return locations.map((location: any) => ({
      value: location.id,
      label: `${location.name} - ${location.street || ""}`.trim(),
    })).filter((option: any) => option.value);
  }, [locationsData]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="gradient-bg text-white p-4 shadow-lg">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-semibold text-lg">Admin Reports</h1>
            <p className="text-white/80 text-sm">Generate reports across owners and drivers</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={reportMode === "owner" ? "secondary" : "outline"}
              className="bg-white/10 text-white border-white/20 hover:bg-white/20"
              onClick={() => setReportMode("owner")}
            >
              Owner Reports
            </Button>
            <Button
              variant={reportMode === "driver" ? "secondary" : "outline"}
              className="bg-white/10 text-white border-white/20 hover:bg-white/20"
              onClick={() => setReportMode("driver")}
            >
              Driver Reports
            </Button>
          </div>
        </div>
      </header>

      <main className="p-4">
        <ReportExplorer
          title={reportMode === "owner" ? "Owner Report" : "Driver Report"}
          description={reportMode === "owner"
            ? "Filter by owner, location, payment status, and washout status."
            : "Filter by driver, owner, location, payment status, and washout status."}
          endpoint={reportMode === "owner" ? "/api/reports/owner" : "/api/reports/driver"}
          filenamePrefix={reportMode === "owner" ? "admin-owner-report" : "admin-driver-report"}
          defaultDateRange="weekly"
          columns={reportMode === "owner" ? OWNER_REPORT_COLUMNS : DRIVER_REPORT_COLUMNS}
          showOwnerFilter
          showDriverFilter={reportMode === "driver"}
          showLocationFilter
          ownerOptions={ownerOptions}
          driverOptions={driverOptions}
          locationOptions={locationOptions}
        />
      </main>

      <MobileNav role={user?.role} />
    </div>
  );
}
