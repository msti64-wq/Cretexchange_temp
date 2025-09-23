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
        
        // For server-side photos that require authentication
        if (src.startsWith('/objects/photos/')) {
          // Extract the photo key from the path (e.g., '/objects/photos/photo-123.jpg' -> 'photo-123.jpg')
          const photoKey = src.replace('/objects/photos/', '');
          console.log('🔍 AuthenticatedImage: Processing photo key:', { src, photoKey });
          
          // Fetch image data with authentication and create blob URL
          const proxyUrl = `/api/objects/photos/${encodeURIComponent(photoKey)}`;
          console.log('🌐 AuthenticatedImage: Fetching authenticated image:', proxyUrl);
          
          const response = await apiRequest(proxyUrl);
          if (response.ok) {
            const blob = await response.blob();
            objectUrl = URL.createObjectURL(blob);
            console.log('✅ AuthenticatedImage: Created blob URL:', {
              blobSize: blob.size,
              blobType: blob.type
            });
            setBlobUrl(objectUrl);
          } else {
            console.error('❌ AuthenticatedImage: Failed to fetch image:', {
              status: response.status,
              statusText: response.statusText
            });
            throw new Error(`Failed to fetch image: ${response.status}`);
          }
        } else {
          // For other URLs (sessionStorage, external URLs), use directly
          setBlobUrl(src);
        }
      } catch (err) {
        console.error("Error fetching authenticated image:", err);
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

  console.log('🖼️ AuthenticatedImage: Rendering img element', {
    hasBlobUrl: !!blobUrl,
    blobUrlLength: blobUrl?.length,
    blobUrlPreview: blobUrl?.substring(0, 100) + '...',
    loading,
    error
  });

  return (
    <img
      src={blobUrl}
      alt={alt}
      className={className}
      data-testid={testId}
      onClick={onClick}
      onLoad={() => {
        console.log('✅ AuthenticatedImage: Image loaded successfully', {
          src: blobUrl?.substring(0, 100) + '...'
        });
      }}
      onError={(e) => {
        console.error('❌ AuthenticatedImage: Image failed to load', {
          src: blobUrl?.substring(0, 100) + '...',
          error: e,
          naturalWidth: (e.target as HTMLImageElement)?.naturalWidth,
          naturalHeight: (e.target as HTMLImageElement)?.naturalHeight
        });
      }}
    />
  );
}