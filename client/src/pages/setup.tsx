import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft, Truck, CheckCircle, XCircle } from "lucide-react";

export default function Setup() {
  const { toast } = useToast();
  const [setupStatus, setSetupStatus] = useState<'idle' | 'running' | 'complete'>('idle');
  const [results, setResults] = useState<Array<{username: string, status: 'success' | 'error', message: string}>>([]);

  const testUsers = [
    { username: 'deploytest', password: 'test123', firstName: 'Deploy', lastName: 'Test', email: 'deploy@test.com', role: 'driver' },
    { username: 'prodtest', password: 'test123', firstName: 'Prod', lastName: 'Test', email: 'prodtest@example.com', role: 'driver' },
    { username: 'D1', password: 'D1', firstName: 'D1', lastName: 'Driver', email: 'D1@email.com', role: 'driver' },
    { username: 'O1', password: 'O1', firstName: 'O1', lastName: 'Owner', email: 'O1@email.com', role: 'owner' },
    { username: 'admin', password: 'admin123', firstName: 'Super', lastName: 'Admin', email: 'admin@cretexchange.com', role: 'super_admin' },
    { username: 'testdriver', password: 'test123', firstName: 'Test', lastName: 'Driver', email: 'test@example.com', role: 'driver' }
  ];

  const setupMutation = useMutation({
    mutationFn: async () => {
      const results: Array<{username: string, status: 'success' | 'error', message: string}> = [];
      
      for (const user of testUsers) {
        try {
          const response = await apiRequest("/api/register", {
            method: "POST",
            body: JSON.stringify(user),
          });
          
          if (response.ok) {
            results.push({
              username: user.username,
              status: 'success',
              message: 'Created successfully'
            });
          } else {
            const errorData = await response.json();
            results.push({
              username: user.username,
              status: 'error',
              message: errorData.message || 'Registration failed'
            });
          }
        } catch (error) {
          results.push({
            username: user.username,
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      return results;
    },
    onSuccess: (results) => {
      setResults(results);
      setSetupStatus('complete');
      
      const successCount = results.filter(r => r.status === 'success').length;
      const errorCount = results.filter(r => r.status === 'error').length;
      
      toast({
        title: "Setup Complete",
        description: `${successCount} users created, ${errorCount} errors`,
        variant: successCount > 0 ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Setup Failed",
        description: error.message,
        variant: "destructive",
      });
      setSetupStatus('idle');
    },
  });

  const handleSetup = () => {
    setSetupStatus('running');
    setResults([]);
    setupMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      {/* Header */}
      <header className="p-6 border-b bg-card/50 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between">
          <Link href="/login">
            <Button variant="ghost" size="sm" className="p-2" data-testid="button-back">
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Login
            </Button>
          </Link>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Truck className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">CreteXchange</h1>
          </div>
        </div>
      </header>

      {/* Setup Form */}
      <main className="container mx-auto px-6 py-16 flex items-center justify-center">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Database Setup</CardTitle>
            <p className="text-muted-foreground">
              Initialize the database with test users for development and testing.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {setupStatus === 'idle' && (
              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  This will create the following test users:
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {testUsers.map(user => (
                    <div key={user.username} className="text-left">
                      <strong>{user.username}</strong> / {user.password} ({user.role})
                    </div>
                  ))}
                </div>
                <Button 
                  onClick={handleSetup}
                  className="w-full"
                  data-testid="button-setup"
                >
                  Initialize Database
                </Button>
              </div>
            )}

            {setupStatus === 'running' && (
              <div className="text-center space-y-4">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
                <p>Creating users...</p>
              </div>
            )}

            {setupStatus === 'complete' && (
              <div className="space-y-4">
                <h3 className="font-semibold">Setup Results:</h3>
                <div className="space-y-2">
                  {results.map((result, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-muted">
                      <div className="flex items-center space-x-2">
                        {result.status === 'success' ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className="font-medium">{result.username}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">{result.message}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground text-center">
                    You can now log in with any of the successfully created users.
                  </p>
                  <Link href="/login">
                    <Button className="w-full mt-4" data-testid="button-login">
                      Go to Login
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}