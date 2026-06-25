'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { Issue } from '@/types';

interface HeatmapProps {
  heatmapData: [number, number, number][];
}

function HeatLayer({ heatmapData }: HeatmapProps) {
  const map = useMap();

  useEffect(() => {
    if (!heatmapData || heatmapData.length === 0) return;

    // Create heat layer
    const heat = (L as any).heatLayer(heatmapData, {
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

    // Fit bounds to all markers
    if (heatmapData.length > 0) {
      const lats = heatmapData.map(d => d[0]);
      const lngs = heatmapData.map(d => d[1]);
      const bounds = L.latLngBounds(
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)]
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }

    return () => {
      map.removeLayer(heat);
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
