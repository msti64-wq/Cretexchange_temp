import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";

interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "driver" | "owner" | "admin" | "super_admin";
}

export function useAuth() {
  const [, setLocation] = useLocation();
  
  const { data: user, isLoading, error } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const token = localStorage.getItem('authToken');
      if (!token) {
        return null;
      }
      
      const response = await fetch("/api/auth/user", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        // Remove invalid token
        localStorage.removeItem('authToken');
        return null;
      }
      
      return response.json();
    },
    retry: false,
  });

  const logout = () => {
    // Remove auth token first
    localStorage.removeItem('authToken');
    
    // Immediately set user state to null to prevent race conditions
    queryClient.setQueryData(["/api/auth/user"], null);
    
    // Clear all cached data
    queryClient.clear();
    
    // Navigate to home page
    setLocation('/');
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout,
    error,
  };
}
