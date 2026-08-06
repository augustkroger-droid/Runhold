"use client";

import L from "leaflet";
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { Coordinate } from "@/lib/types/mission";

const startIcon = L.divIcon({
  className: "",
  html: '<span class="runhold-marker runhold-marker-start"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const destinationIcon = L.divIcon({
  className: "",
  html: '<span class="runhold-marker runhold-marker-destination"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const currentIcon = L.divIcon({
  className: "",
  html: '<span class="runhold-marker runhold-marker-current"></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

function MapClickHandler({
  enabled,
  onDestinationSelect,
}: {
  enabled: boolean;
  onDestinationSelect: (point: Coordinate) => void;
}) {
  useMapEvents({
    click(event) {
      if (!enabled) return;
      onDestinationSelect({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    },
  });

  return null;
}

function Recenter({ center }: { center: Coordinate }) {
  const map = useMap();
  map.setView([center.lat, center.lng], map.getZoom(), { animate: true });
  return null;
}

export function MissionMap({
  start,
  destination,
  current,
  canSelectDestination,
  showStartRadius,
  onDestinationSelect,
}: {
  start: Coordinate;
  destination: Coordinate | null;
  current: Coordinate | null;
  canSelectDestination: boolean;
  showStartRadius: boolean;
  onDestinationSelect: (point: Coordinate) => void;
}) {
  const activeCenter = current ?? start;

  return (
    <MapContainer
      center={[activeCenter.lat, activeCenter.lng]}
      zoom={17}
      minZoom={3}
      maxZoom={19}
      scrollWheelZoom
      touchZoom
      className="z-0 h-full min-h-[420px] rounded-lg"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bidragsgivare'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter center={activeCenter} />
      <MapClickHandler
        enabled={canSelectDestination}
        onDestinationSelect={onDestinationSelect}
      />

      <Marker position={[start.lat, start.lng]} icon={startIcon} />
      {showStartRadius ? (
        <Circle
          center={[start.lat, start.lng]}
          radius={20}
          pathOptions={{ color: "#43d9ad", fillColor: "#43d9ad", fillOpacity: 0.14 }}
        />
      ) : null}
      {destination ? (
        <>
          <Marker position={[destination.lat, destination.lng]} icon={destinationIcon} />
          <Circle
            center={[destination.lat, destination.lng]}
            radius={20}
            pathOptions={{ color: "#f5b84b", fillColor: "#f5b84b", fillOpacity: 0.14 }}
          />
          <Polyline
            positions={[
              [start.lat, start.lng],
              [destination.lat, destination.lng],
            ]}
            pathOptions={{ color: "#6ea8fe", dashArray: "8 10", weight: 4 }}
          />
        </>
      ) : null}
      {current ? <Marker position={[current.lat, current.lng]} icon={currentIcon} /> : null}
    </MapContainer>
  );
}
