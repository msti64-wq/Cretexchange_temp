import { MobileNav } from "@/components/MobileNav";
import logoImage from "@assets/cretexchange logo_1760644229633.png";
import { ReportExplorer } from "@/components/ReportExplorer";
import { OWNER_REPORT_COLUMNS } from "@shared/reportColumns";

export default function OwnerReports() {
  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="gradient-bg text-white p-4 shadow-lg">
        <div className="flex items-center space-x-3">
          <img
            src={logoImage}
            alt="CreteXchange Logo"
            className="w-10 h-10 object-contain bg-white/20 rounded-full p-1"
          />
          <div>
            <h1 className="font-semibold text-lg">Owner Reports</h1>
            <p className="text-white/80 text-sm">Washout activity, billing, and payment history</p>
          </div>
        </div>
      </header>

      <main className="p-4">
        <ReportExplorer
          title="Owner Report"
          description="View washouts, charges, payment status, and location details for your account."
          endpoint="/api/reports/owner"
          filenamePrefix="owner-report"
          defaultDateRange="weekly"
          columns={OWNER_REPORT_COLUMNS}
          showLocationFilter
        />
      </main>

      <MobileNav role="owner" />
    </div>
  );
}

