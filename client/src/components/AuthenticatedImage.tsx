import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { ImageIcon, Loader2 } from "lucide-react";

interface AuthenticatedImageProps {
  src: string;
  alt: string;
  className?: string;
  "data-testid"?: string;
  onClick?: () => void;
}

export function AuthenticatedImage({ src, alt, className, "data-testid": testId, onClick }: AuthenticatedImageProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    
    const fetchImage = async () => {
      try {
        setLoading(true);
        setError(false);
        
        console.log("🖼️ AuthenticatedImage: Fetching image from:", src);
        console.log("🔑 Auth token available:", !!localStorage.getItem('authToken'));
        
        // For server-side photos that require authentication
        if (src.startsWith('/objects/')) {
          console.log("📁 Fetching authenticated object from server:", src);
          const response = await apiRequest(src);
          console.log("📡 Server response:", response.status, response.statusText);
          
          if (response.ok) {
            const blob = await response.blob();
            objectUrl = URL.createObjectURL(blob);
            setBlobUrl(objectUrl);
            console.log("✅ Image loaded successfully, created blob URL");
          } else {
            throw new Error(`Failed to fetch image: ${response.status}`);
          }
        } else {
          console.log("🌐 Using direct URL (not server object):", src);
          // For other URLs (sessionStorage, external URLs), use directly
          setBlobUrl(src);
        }
      } catch (err) {
        console.error("❌ Error fetching authenticated image:", err);
        console.error("❌ Error details:", {
          src,
          errorMessage: err instanceof Error ? err.message : String(err),
          hasAuthToken: !!localStorage.getItem('authToken')
        });
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchImage();

    // Cleanup function to revoke object URL
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-muted ${className}`} data-testid={testId}>
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className={`flex flex-col items-center justify-center bg-muted text-muted-foreground ${className}`} data-testid={testId}>
        <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
        <span className="text-sm">Failed to load image</span>
      </div>
    );
  }

  return (
    <img
      src={blobUrl}
      alt={alt}
      className={className}
      data-testid={testId}
      onClick={onClick}
    />
  );
}