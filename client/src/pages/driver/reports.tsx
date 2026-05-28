import { MobileNav } from "@/components/MobileNav";
import { DriverHeader } from "@/components/DriverHeader";
import { ReportExplorer } from "@/components/ReportExplorer";
import { DRIVER_REPORT_COLUMNS } from "@shared/reportColumns";

export default function DriverReports() {
  return (
    <div className="min-h-screen bg-background pb-20">
      <DriverHeader />
      <main className="p-4">
        <ReportExplorer
          title="Driver Report"
          description="View your washouts, tickets, driver payments, and related payment history."
          endpoint="/api/reports/driver"
          filenamePrefix="driver-report"
          defaultDateRange="weekly"
          columns={DRIVER_REPORT_COLUMNS}
          showLocationFilter
        />
      </main>
      <MobileNav role="driver" />
    </div>
  );
}

