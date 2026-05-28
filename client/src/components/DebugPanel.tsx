import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Bug, AlertTriangle, CheckCircle, XCircle } from "lucide-react";

// API Response Types
interface WhoamiResponse {
  environment: string;
  timestamp: string;
  user: {
    id: string;
    email: string;
    role: string;
    firstName: string;
    lastName: string;
    phone?: string;
    address?: string;
  };
  owner?: {
    id: string;
    companyName?: string;
    businessLicense?: string;
    taxId?: string;
    membershipStatus?: string;
    dashboardAccessAllowed?: boolean;
    accountStatusMessage?: string | null;
  };
  membershipState?: {
    membershipStatus: string;
    dashboardAccessAllowed: boolean;
    accountStatusMessage?: string;
  } | null;
  stripeOnboarding?: any;
}

interface ActivitiesSummaryResponse {
  dateRange: string;
  dateRangeCalculated?: {
    start: string;
    end: string;
  };
  total: number;
  byStatus?: Record<string, number>;
  sampleActivity?: {
    id: string;
    status: string;
    amount: string;
  };
}

interface ActivitiesData {
  activities?: any[];
}

interface DebugPanelProps {
  currentDateRange?: string;
  activitiesData?: ActivitiesData;
  queryKeys?: string[];
}

export function DebugPanel({ currentDateRange = 'today', activitiesData, queryKeys = [] }: DebugPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  // Check for debug parameter in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const debugParam = urlParams.get('debug');
    setIsVisible(debugParam === '1');
  }, []);

  const { data: whoamiData, isLoading: whoamiLoading, error: whoamiError } = useQuery<WhoamiResponse>({
    queryKey: ['/api/debug/whoami'],
    enabled: isVisible,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const { data: activitiesSummary, isLoading: summaryLoading, error: summaryError } = useQuery<ActivitiesSummaryResponse>({
    queryKey: [`/api/debug/owner-activities-summary?dateRange=${currentDateRange}`],
    enabled: isVisible,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  if (!isVisible) {
    return null;
  }

  const getStatusBadge = (status: 'ok' | 'warning' | 'error') => {
    switch (status) {
      case 'ok':
        return <Badge variant="secondary" className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />OK</Badge>;
      case 'warning':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800"><AlertTriangle className="w-3 h-3 mr-1" />Warning</Badge>;
      case 'error':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getOverallStatus = () => {
    if (whoamiError || summaryError) return 'error';
    if (whoamiLoading || summaryLoading) return 'warning';
    if (!whoamiData || !activitiesSummary) return 'warning';
    return 'ok';
  };

  return (
    <div className="fixed top-4 right-4 w-96 z-50">
      <Card className="border-2 border-red-500 bg-white dark:bg-gray-900 shadow-lg">
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
              <CardTitle className="text-sm flex items-center justify-between text-red-600 dark:text-red-400">
                <div className="flex items-center space-x-2">
                  <Bug className="w-4 h-4" />
                  <span>Debug Panel</span>
                  {getStatusBadge(getOverallStatus())}
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="pt-0 text-xs space-y-3">
              {/* Environment Info */}
              <div className="space-y-1">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">Environment</h4>
                <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                  <p><strong>Env:</strong> {whoamiData?.environment || 'loading...'}</p>
                  <p><strong>Timestamp:</strong> {whoamiData?.timestamp ? new Date(whoamiData.timestamp).toLocaleTimeString() : 'loading...'}</p>
                </div>
              </div>

              {/* User Info */}
              <div className="space-y-1">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">User Info</h4>
                {whoamiLoading ? (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded">Loading user data...</div>
                ) : whoamiError ? (
                  <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded text-red-800 dark:text-red-200">
                    Error: {whoamiError instanceof Error ? whoamiError.message : 'Failed to load user data'}
                  </div>
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                    <p><strong>ID:</strong> {whoamiData?.user?.id || 'N/A'}</p>
                    <p><strong>Email:</strong> {whoamiData?.user?.email || 'N/A'}</p>
                    <p><strong>Role:</strong> {whoamiData?.user?.role || 'N/A'}</p>
                    <p><strong>Name:</strong> {whoamiData?.user?.firstName} {whoamiData?.user?.lastName}</p>
                    {whoamiData?.owner && (
                      <>
                        <p><strong>Owner ID:</strong> {whoamiData.owner.id}</p>
                        <p><strong>Company:</strong> {whoamiData.owner.companyName || 'Not set'}</p>
                        <p><strong>Membership:</strong> {whoamiData.owner.membershipStatus || 'Unknown'}</p>
                        <p><strong>Dashboard Access:</strong> {whoamiData.owner.dashboardAccessAllowed ? 'Allowed' : 'Blocked'}</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Activities Summary */}
              <div className="space-y-1">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">Activities Summary</h4>
                {summaryLoading ? (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded">Loading activities data...</div>
                ) : summaryError ? (
                  <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded text-red-800 dark:text-red-200">
                    Error: {summaryError instanceof Error ? summaryError.message : 'Failed to load activities'}
                  </div>
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                    <p><strong>Date Range:</strong> {activitiesSummary?.dateRange || currentDateRange}</p>
                    <p><strong>Period:</strong> {activitiesSummary?.dateRangeCalculated?.start ? 
                      `${new Date(activitiesSummary.dateRangeCalculated.start).toLocaleDateString()} - ${new Date(activitiesSummary.dateRangeCalculated.end).toLocaleDateString()}` 
                      : 'N/A'}</p>
                    <p><strong>Total Activities:</strong> {activitiesSummary?.total || 0}</p>
                    {activitiesSummary?.byStatus && Object.keys(activitiesSummary.byStatus).length > 0 && (
                      <div className="mt-1">
                        <strong>By Status:</strong>
                        <ul className="ml-2 mt-1">
                          {Object.entries(activitiesSummary.byStatus).map(([status, count]) => (
                            <li key={status}>• {status}: {count as number}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {activitiesSummary?.sampleActivity && (
                      <div className="mt-1">
                        <strong>Sample Activity:</strong>
                        <p className="ml-2">ID: {activitiesSummary.sampleActivity.id}</p>
                        <p className="ml-2">Status: {activitiesSummary.sampleActivity.status}</p>
                        <p className="ml-2">Amount: ${activitiesSummary.sampleActivity.amount}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Frontend State */}
              <div className="space-y-1">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">Frontend State</h4>
                <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                  <p><strong>Current Date Range:</strong> {currentDateRange}</p>
                  <p><strong>Activities Data Length:</strong> {activitiesData?.activities?.length || 0}</p>
                  <p><strong>Query Keys:</strong></p>
                  <ul className="ml-2 mt-1">
                    {queryKeys.map((key, index) => (
                      <li key={index} className="break-all">• {key}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex space-x-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.location.reload()}
                  className="text-xs"
                  data-testid="button-debug-refresh"
                >
                  Refresh Page
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const url = new URL(window.location.href);
                    url.searchParams.delete('debug');
                    window.location.href = url.toString();
                  }}
                  className="text-xs"
                  data-testid="button-debug-close"
                >
                  Close Debug
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
}
