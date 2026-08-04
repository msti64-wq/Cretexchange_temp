import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export type BoundaryMode = "radius" | "polygon";
export type BoundaryPoint = [number, number];

interface Props {
  facilityCenter: BoundaryPoint;
  mode: BoundaryMode;
  center: BoundaryPoint;
  radiusMeters: number;
  polygon: BoundaryPoint[];
  onCenterChange: (point: BoundaryPoint) => void;
  onRadiusChange: (meters: number) => void;
  onPolygonChange: (points: BoundaryPoint[]) => void;
}

function loadGoogleMaps(onReady: () => void, onError: () => void) {
  if ((window as any).google?.maps) return onReady();
  const existing = document.querySelector<HTMLScriptElement>('script[src*="maps.googleapis.com"]');
  if (existing) {
    existing.addEventListener("load", onReady, { once: true });
    existing.addEventListener("error", onError, { once: true });
    return;
  }
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key || key === "YOUR_API_KEY") return onError();
  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
  script.async = true;
  script.defer = true;
  script.addEventListener("load", onReady, { once: true });
  script.addEventListener("error", onError, { once: true });
  document.head.appendChild(script);
}

export function FacilityBoundaryEditor(props: Props) {
  const { t } = useLanguage();
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlayRef = useRef<any>(null);
  const listenersRef = useRef<any[]>([]);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [mapUnavailable, setMapUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    loadGoogleMaps(() => {
      if (!active || !mapElement.current) return;
      mapRef.current = new google.maps.Map(mapElement.current, {
        center: { lat: props.facilityCenter[1], lng: props.facilityCenter[0] },
        zoom: 18,
        mapTypeId: "satellite",
        streetViewControl: false,
        fullscreenControl: true,
        mapTypeControl: true,
      } as any);
      setMapUnavailable(false);
    }, () => active && setMapUnavailable(true));
    return () => {
      active = false;
      listenersRef.current.forEach((listener) => listener.remove());
      overlayRef.current?.setMap(null);
    };
  }, [props.facilityCenter[0], props.facilityCenter[1]]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !(window as any).google?.maps) return;
    listenersRef.current.forEach((listener) => listener.remove());
    listenersRef.current = [];
    overlayRef.current?.setMap(null);

    if (props.mode === "radius") {
      const circle = new (google.maps as any).Circle({
        map,
        center: { lat: props.center[1], lng: props.center[0] },
        radius: props.radiusMeters,
        editable: true,
        draggable: true,
        fillColor: "#2563eb",
        fillOpacity: 0.22,
        strokeColor: "#1d4ed8",
        strokeWeight: 3,
      });
      overlayRef.current = circle;
      listenersRef.current.push(circle.addListener("center_changed", () => {
        const center = circle.getCenter();
        if (center) propsRef.current.onCenterChange([center.lng(), center.lat()]);
      }));
      listenersRef.current.push(circle.addListener("radius_changed", () => {
        propsRef.current.onRadiusChange(Math.round(circle.getRadius()));
      }));
      map.fitBounds(circle.getBounds() || undefined);
      return;
    }

    const polygon = new (google.maps as any).Polygon({
      map,
      paths: props.polygon.map(([lng, lat]) => ({ lng, lat })),
      editable: true,
      draggable: true,
      fillColor: "#16a34a",
      fillOpacity: 0.22,
      strokeColor: "#15803d",
      strokeWeight: 3,
    });
    overlayRef.current = polygon;
    const sync = () => {
      const points: BoundaryPoint[] = [];
      polygon.getPath().forEach((point: any) => points.push([point.lng(), point.lat()]));
      propsRef.current.onPolygonChange(points);
    };
    listenersRef.current.push(polygon.getPath().addListener("set_at", sync));
    listenersRef.current.push(polygon.getPath().addListener("insert_at", sync));
    listenersRef.current.push(polygon.getPath().addListener("remove_at", sync));
    listenersRef.current.push(polygon.addListener("dragend", sync));
    listenersRef.current.push(map.addListener("click", (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) return;
      polygon.getPath().push(event.latLng);
      sync();
    }));
  }, [props.mode, props.center, props.radiusMeters, props.polygon]);

  const updatePoint = (index: number, axis: 0 | 1, raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    const next = props.polygon.map((point) => [...point] as BoundaryPoint);
    next[index][axis] = value;
    props.onPolygonChange(next);
  };

  return (
    <div className="space-y-4">
      <div
        ref={mapElement}
        className="h-[340px] w-full rounded-xl border bg-muted sm:h-[440px]"
        role="application"
        aria-label={t("geofence.owner.mapLabel")}
        data-testid="facility-boundary-map"
      />
      {mapUnavailable && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="status">
          {t("geofence.owner.mapUnavailable")}
        </div>
      )}
      {props.mode === "radius" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label htmlFor="boundary-lat">{t("geofence.owner.latitude")}</Label><Input id="boundary-lat" type="number" step="0.000001" value={props.center[1]} onChange={(event) => props.onCenterChange([props.center[0], Number(event.target.value)])} /></div>
          <div><Label htmlFor="boundary-lng">{t("geofence.owner.longitude")}</Label><Input id="boundary-lng" type="number" step="0.000001" value={props.center[0]} onChange={(event) => props.onCenterChange([Number(event.target.value), props.center[1]])} /></div>
          <div><Label htmlFor="boundary-radius">{t("geofence.owner.radiusMeters")}</Label><Input id="boundary-radius" type="number" min="1" max="8046" value={props.radiusMeters} onChange={(event) => props.onRadiusChange(Number(event.target.value))} /></div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div><p className="font-medium">{t("geofence.owner.vertices")}</p><p className="text-sm text-muted-foreground">{t("geofence.owner.verticesHelp")}</p></div>
            <Button type="button" variant="outline" onClick={() => props.onPolygonChange([...props.polygon, props.facilityCenter])}><Plus className="mr-2 h-4 w-4" />{t("geofence.owner.addVertex")}</Button>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto" aria-label={t("geofence.owner.vertices")}>
            {props.polygon.map((point, index) => (
              <div key={index} className="grid grid-cols-[auto_1fr_1fr_auto] items-end gap-2 rounded-lg border p-2">
                <MapPin className="mb-2 h-4 w-4" aria-hidden="true" />
                <div><Label htmlFor={`vertex-lng-${index}`}>{t("geofence.owner.longitude")}</Label><Input id={`vertex-lng-${index}`} type="number" step="0.000001" value={point[0]} onChange={(event) => updatePoint(index, 0, event.target.value)} /></div>
                <div><Label htmlFor={`vertex-lat-${index}`}>{t("geofence.owner.latitude")}</Label><Input id={`vertex-lat-${index}`} type="number" step="0.000001" value={point[1]} onChange={(event) => updatePoint(index, 1, event.target.value)} /></div>
                <Button type="button" size="icon" variant="ghost" aria-label={t("geofence.owner.removeVertex")} onClick={() => props.onPolygonChange(props.polygon.filter((_, pointIndex) => pointIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
