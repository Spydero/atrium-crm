"use client";

import { useEffect, useRef } from "react";

// Stable empty deps helper for optional callbacks
function useStableCallback<T extends (...args: never[]) => void>(fn?: T) {
  const ref = useRef(fn);
  ref.current = fn;
  return ref;
}

type Props = {
  lat: number;
  lng: number;
  label?: string;
  className?: string;
  height?: number;
  zoom?: number;
};

export function ListingMap({
  lat,
  lng,
  label,
  className = "",
  height = 240,
  zoom = 14,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;

    async function mount() {
      const L = await import("leaflet");
      if (cancelled || !ref.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      ref.current.innerHTML = "";
      map = L.map(ref.current, {
        scrollWheelZoom: false,
        zoomControl: true,
      }).setView([lat, lng], zoom);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker([lat, lng]).addTo(map);
      if (label) marker.bindPopup(label);

      // Container often lays out after paint - fix grey/blank tiles
      setTimeout(() => map?.invalidateSize(), 80);
      setTimeout(() => map?.invalidateSize(), 300);
    }

    mount();

    return () => {
      cancelled = true;
      if (map) {
        map.remove();
        map = null;
      }
    };
  }, [lat, lng, label, zoom]);

  return (
    <div
      ref={ref}
      className={`overflow-hidden rounded-[8px] border border-line bg-[#e8ecf0] ${className}`}
      style={{ height }}
    />
  );
}

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
};

export function InventoryMap({
  pins,
  className = "",
  height = 480,
  onSelect,
}: {
  pins: MapPin[];
  className?: string;
  height?: number;
  onSelect?: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onSelectRef = useStableCallback(onSelect);
  const pinKey = pins.map((p) => `${p.id}:${p.lat}:${p.lng}`).join("|");

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    let ro: ResizeObserver | null = null;

    async function mount() {
      const L = await import("leaflet");
      if (cancelled || !ref.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      ref.current.innerHTML = "";
      // Leaflet needs an explicit sized container
      ref.current.style.height = `${height}px`;
      ref.current.style.width = "100%";

      map = L.map(ref.current, {
        scrollWheelZoom: true,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const bounds =
        pins.length > 0
          ? L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number]))
          : null;

      if (!pins.length) {
        map.setView([25.2048, 55.2708], 11);
      } else {
        for (const pin of pins) {
          const marker = L.marker([pin.lat, pin.lng]).addTo(map!);
          const html = `<strong>${escapeHtml(pin.title)}</strong>${
            pin.subtitle
              ? `<br/><span style="color:#66707a">${escapeHtml(pin.subtitle)}</span>`
              : ""
          }`;
          marker.bindPopup(html);
          marker.on("click", () => onSelectRef.current?.(pin.id));
        }
        map.fitBounds(bounds!.pad(0.2), { maxZoom: 13 });
      }

      const refresh = () => {
        if (!map) return;
        map.invalidateSize({ animate: false });
        if (bounds && pins.length) {
          map.fitBounds(bounds.pad(0.2), { maxZoom: 13, animate: false });
        }
      };
      requestAnimationFrame(refresh);
      setTimeout(refresh, 50);
      setTimeout(refresh, 250);
      setTimeout(refresh, 600);

      if (ref.current && typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => refresh());
        ro.observe(ref.current);
      }
    }

    mount();

    return () => {
      cancelled = true;
      ro?.disconnect();
      if (map) {
        map.remove();
        map = null;
      }
    };
    // pinKey captures pin identity; height for container
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey, height]);

  return (
    <div
      ref={ref}
      className={`w-full overflow-hidden rounded-[10px] border border-line bg-[#e8ecf0] ${className}`}
      style={{ height, minHeight: height }}
    />
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function ListingMapEmpty({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-[8px] border border-dashed border-line bg-[#f3f5f7] px-4 py-8 text-center text-sm text-muted ${className}`}
    >
      No map pin yet. Search a real place below, or leave location text-only.
    </div>
  );
}
