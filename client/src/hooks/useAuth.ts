import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";

interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "driver" | "owner" | "admin";
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
    try {
      console.log('🚪 Starting logout process...');
      
      // Remove auth token first
      localStorage.removeItem('authToken');
      console.log('✅ Auth token removed');
      
      // Clear all React Query cache to prevent stale data
      queryClient.clear();
      console.log('✅ Query cache cleared');
      
      // Set user state to null to trigger auth state change
      queryClient.setQueryData(["/api/auth/user"], null);
      console.log('✅ User state cleared');
      
      // Use a small delay to ensure state updates propagate
      setTimeout(() => {
        console.log('🔄 Redirecting to home page...');
        setLocation('/');
        console.log('✅ Logout completed successfully');
      }, 50);
      
    } catch (error) {
      console.error('❌ Error during logout:', error);
      // Fallback: force navigation to home page
      try {
        setLocation('/');
      } catch (navError) {
        console.error('❌ Navigation error, forcing page reload:', navError);
        // Last resort: force page reload to clear state
        window.location.href = '/';
      }
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
