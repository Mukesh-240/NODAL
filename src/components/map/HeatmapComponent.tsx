'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface HeatmapProps {
  heatmapData: [number, number, number][];
}

// Mainland India bounding box — the map is locked to this so it can't be panned
// or zoomed out into the ocean / neighbouring countries.
const INDIA_BOUNDS: [[number, number], [number, number]] = [
  [6.4627, 68.1097],   // SW corner
  [35.6745, 97.3953],  // NE corner
];

// Fit the viewport to India on mount. Placed before HeatLayer so that when there
// IS data, HeatLayer's later fitBounds to the data points wins; with no data the
// map stays framed on the country.
function FitIndia() {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(INDIA_BOUNDS);
  }, [map]);
  return null;
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
  return (
    <MapContainer
      center={[20.5937, 78.9629]}
      zoom={5}
      minZoom={4}
      maxZoom={18}
      maxBounds={INDIA_BOUNDS}
      maxBoundsViscosity={1.0}
      style={{ width: '100%', height: '400px' }}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution=""
      />
      <FitIndia />
      <HeatLayer heatmapData={heatmapData} />
    </MapContainer>
  );
}
