import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "driver" | "owner" | "admin" | "super_admin";
}

export function useAuth({ enabled = true }: { enabled?: boolean } = {}) {
  const [, setLocation] = useLocation();
  
  const { data: user, isLoading, error } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const token = localStorage.getItem('authToken');
      const response = await fetch("/api/auth/user", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "same-origin",
      });
      
      if (!response.ok) {
        // Remove invalid token
        localStorage.removeItem('authToken');
        return null;
      }
      
      return response.json();
    },
    enabled,
    retry: false,
  });

  const logout = async () => {
    try {
      await apiRequest("POST", "/api/logout");
    } catch {
      // Local cleanup remains deterministic if the session is already expired.
    } finally {
      localStorage.removeItem('authToken');
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
      setLocation('/');
    }
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout,
    error,
  };
}
