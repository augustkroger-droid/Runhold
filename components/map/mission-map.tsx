"use client";

import L from "leaflet";
import { useEffect } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { Coordinate } from "@/lib/game/gps/position";

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

  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom(), { animate: true });
  }, [center.lat, center.lng, map]);

  return null;
}

export function MissionMap({
  start,
  destination,
  current,
  canSelectDestination,
  showStartRadius,
  scanRadiusM,
  onDestinationSelect,
}: {
  start: Coordinate;
  destination: Coordinate | null;
  current: Coordinate | null;
  canSelectDestination: boolean;
  showStartRadius: boolean;
  scanRadiusM?: number | null;
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
      zoomControl={false}
      className="z-0 h-full min-h-[420px] rounded-lg"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bidragsgivare &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <ZoomControl position="topright" />
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
      {scanRadiusM && current ? (
        <Circle
          center={[current.lat, current.lng]}
          radius={scanRadiusM}
          pathOptions={{ color: "#f5b84b", fillColor: "#f5b84b", fillOpacity: 0.08 }}
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
            pathOptions={{ color: "#0b1320", opacity: 0.55, weight: 8 }}
          />
          <Polyline
            positions={[
              [start.lat, start.lng],
              [destination.lat, destination.lng],
            ]}
            pathOptions={{ color: "#2f6fed", dashArray: "8 10", weight: 4 }}
          />
        </>
      ) : null}
      {current ? <Marker position={[current.lat, current.lng]} icon={currentIcon} /> : null}
    </MapContainer>
  );
}
