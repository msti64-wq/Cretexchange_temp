import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  Bell,
  BookOpen,
  History,
  MapPinned,
  Trophy,
  Ticket,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DriverHeader } from "@/components/DriverHeader";
import { MobileNav } from "@/components/MobileNav";
import { DSCard, DSKpiCard, DSSectionHeader, DSStatusChip } from "@/components/design-system";

const quickLinks = [
  { label: "Dashboard", path: "/" },
  { label: "Wallet", path: "/wallet" },
  { label: "Notifications", path: "/notifications" },
  { label: "Profile", path: "/profile" },
];

const placeholderSections = [
  {
    title: "Ticket Ledger",
    description: "A compact history of reward tickets, the activity that earned them, and where they were generated.",
    icon: Ticket,
    chips: ["Ticket history", "Activity source", "Location context"],
  },
  {
    title: "Drawing History",
    description: "A monthly record of reward drawings, wins, and any prize status tied to your entries.",
    icon: Trophy,
    chips: ["Monthly draws", "Wins", "Prize status"],
  },
  {
    title: "Prize Fulfillment",
    description: "A field-ready view of what was awarded, what is pending, and what has already been delivered.",
    icon: History,
    chips: ["Pending", "Ordered", "Delivered"],
  },
  {
    title: "Future Insights",
    description: "A reserved space for ticket trends, preferred locations, and reward performance summaries.",
    icon: BookOpen,
    chips: ["Trends", "Preferred sites", "Performance"],
  },
];

export default function DriverRewards() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const root = document.documentElement;
    const hadDarkClass = root.classList.contains("dark");
    root.classList.add("dark");

    return () => {
      if (!hadDarkClass) {
        root.classList.remove("dark");
      }
    };
  }, []);

  return (
    <div className="dark min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background pb-20 text-foreground">
      <DriverHeader />

      <main className="mx-auto w-full max-w-6xl space-y-5 overflow-x-hidden px-3 py-4 sm:px-4 sm:py-5">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
          <DSCard className="overflow-hidden" padding="lg" elevated>
            <div className="min-w-0 space-y-5">
              <div className="flex flex-wrap gap-2">
                <DSStatusChip tone="accent">Driver Rewards</DSStatusChip>
                <DSStatusChip tone="info">Field Workspace</DSStatusChip>
                <DSStatusChip tone="success">Monthly View</DSStatusChip>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Rewards Center
                </p>
                <h1 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">
                  Track tickets, wins, and prize fulfillment
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  This page reserves the driver rewards workspace. It will eventually show the ticket
                  trail behind approved washouts, drawing results, and prize status in one place.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <DSKpiCard
                  label="Ticket History"
                  value="—"
                  detail="Entries earned from completed activity"
                  accentTone="info"
                />
                <DSKpiCard
                  label="Monthly Wins"
                  value="—"
                  detail="Drawing results for the current month"
                  accentTone="success"
                />
                <DSKpiCard
                  label="Fulfillment"
                  value="—"
                  detail="Prize status and delivery progress"
                  accentTone="warning"
                />
              </div>
            </div>
          </DSCard>

          <DSCard padding="md">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Navigation
                </p>
                <p className="text-sm text-muted-foreground">
                  Quick links back to the rest of the driver workspace.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {quickLinks.map((item) => (
                  <Button
                    key={item.path}
                    type="button"
                    variant="outline"
                    className="h-11 justify-between border-border bg-background px-4 text-foreground hover:bg-muted/40"
                    onClick={() => setLocation(item.path)}
                  >
                    <span>{item.label}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ))}
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-medium text-foreground">What belongs here</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>Ticket history by activity and location</li>
                  <li>Drawing results and prize status</li>
                  <li>Fulfillment progress for any win</li>
                </ul>
              </div>
            </div>
          </DSCard>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <DSSectionHeader
            eyebrow="Workspace"
            title="Placeholder sections"
            description="These cards reserve the structure for rewards history, drawings, and fulfillment without adding new business logic."
          />
          <div className="flex flex-wrap gap-2">
            <DSStatusChip tone="neutral">Read only</DSStatusChip>
            <DSStatusChip tone="accent">Preview</DSStatusChip>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {placeholderSections.map((section) => {
            const Icon = section.icon;

            return (
              <DSCard key={section.title} padding="lg" elevated className="min-h-[220px]">
                <div className="flex h-full flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-background/70">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2">
                        <DSStatusChip tone="neutral">Coming soon</DSStatusChip>
                        <DSStatusChip tone="info">Driver view</DSStatusChip>
                      </div>
                      <h3 className="mt-3 text-xl font-semibold tracking-tight">
                        {section.title}
                      </h3>
                    </div>
                  </div>

                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    {section.description}
                  </p>

                  <div className="mt-auto flex flex-wrap gap-2">
                    {section.chips.map((chip) => (
                      <span
                        key={chip}
                        className="inline-flex items-center rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              </DSCard>
            );
          })}
        </div>

        <DSCard padding="lg" elevated>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 space-y-2">
              <DSStatusChip tone="warning">Field Workspace placeholder</DSStatusChip>
              <h2 className="text-xl font-semibold tracking-tight">Compact navigation and visibility layer</h2>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                This screen is intentionally narrow in scope: shell, navigation, responsive layout,
                and reserved cards for the rewards experience that will be filled in later.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setLocation("/")}>
                <MapPinned className="mr-2 h-4 w-4" />
                Dashboard
              </Button>
              <Button type="button" variant="outline" onClick={() => setLocation("/wallet")}>
                <Wallet className="mr-2 h-4 w-4" />
                Wallet
              </Button>
              <Button type="button" variant="outline" onClick={() => setLocation("/notifications")}>
                <Bell className="mr-2 h-4 w-4" />
                Notifications
              </Button>
            </div>
          </div>
        </DSCard>
      </main>

      <MobileNav role="driver" />
    </div>
  );
}
