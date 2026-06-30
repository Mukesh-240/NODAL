'use client';

import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface MapIssue {
  id: string;
  category: string;
  severity: number;
  ward: string;
  city: string;
  status: string;
  latitude: number;
  longitude: number;
}

interface PublicMapProps {
  issues: MapIssue[];
  getSeverityColor: (s: number) => string;
}

// Mainland India bounding box — the map can't be panned/zoomed out of the country.
const INDIA_BOUNDS: [[number, number], [number, number]] = [
  [6.4627, 68.1097],
  [35.6745, 97.3953],
];

export default function PublicMap({ issues, getSeverityColor }: PublicMapProps) {
  return (
    <MapContainer
      center={[20.5937, 78.9629]}
      zoom={5}
      maxBounds={INDIA_BOUNDS}
      maxBoundsViscosity={1.0}
      minZoom={4}
      maxZoom={16}
      className="w-full"
      style={{ height: '60vh' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="© OpenStreetMap"
      />
      {issues
        .filter((i) => i.latitude && i.longitude)
        .map((issue) => (
          <CircleMarker
            key={issue.id}
            center={[issue.latitude, issue.longitude]}
            radius={issue.severity >= 8 ? 10 : issue.severity >= 6 ? 8 : 6}
            pathOptions={{
              fillColor: getSeverityColor(issue.severity),
              color: 'white',
              weight: 1.5,
              fillOpacity: 0.85,
            }}
          >
            <Popup>
              <div className="text-xs">
                <p className="font-semibold">{issue.category}</p>
                <p className="text-gray-500">{issue.ward}, {issue.city}</p>
                <p>Severity: {issue.severity}/10</p>
                <p className={issue.status === 'resolved' ? 'text-emerald-600' : 'text-amber-600'}>
                  {issue.status}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
    </MapContainer>
  );
}
