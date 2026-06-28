'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface HeatmapProps {
  heatmapData: [number, number, number][];
}

// leaflet.heat@0.2.0 is a UMD plugin that references a global `L`. As a top-level
// `import 'leaflet.heat'` it has no `L` in scope when bundled and throws at
// module-eval — which rejected this dynamic(ssr:false) import and made the whole
// map vanish. So: expose L on window, then load the plugin lazily at runtime.
// The base map always renders; the heat overlay is added once the plugin loads.
function HeatLayer({ heatmapData }: HeatmapProps) {
  const map = useMap();

  useEffect(() => {
    if (!heatmapData || heatmapData.length === 0) return;

    let heat: L.Layer | undefined;
    let cancelled = false;

    (async () => {
      (window as unknown as { L: typeof L }).L = L; // plugin expects global L
      await import('leaflet.heat');
      if (cancelled) return;

      heat = (L as any).heatLayer(heatmapData, {
        max: 1.0,
        maxZoom: 17,
        blur: 25,
        radius: 25,
        minOpacity: 0.2,
        gradient: {
          0.0: '#43a047', // green (low severity)
          0.33: '#fdd835', // yellow (medium)
          0.66: '#fb8c00', // orange (high)
          1.0: '#e53935', // red (critical)
        },
      }).addTo(map);

      const lats = heatmapData.map((d) => d[0]);
      const lngs = heatmapData.map((d) => d[1]);
      const bounds = L.latLngBounds(
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)]
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    })().catch((err) => console.error('[HeatLayer] heat plugin failed:', err));

    return () => {
      cancelled = true;
      if (heat) map.removeLayer(heat);
    };
  }, [map, heatmapData]);

  return null;
}

export default function HeatmapComponent({ heatmapData }: HeatmapProps) {
  // Default to Chennai center if no issues
  const center: [number, number] = [13.0827, 80.2707];

  return (
    <MapContainer
      center={center}
      zoom={11}
      style={{ width: '100%', height: '400px' }}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution=""
      />
      <HeatLayer heatmapData={heatmapData} />
    </MapContainer>
  );
}
