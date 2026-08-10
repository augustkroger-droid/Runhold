"use client";

import L from "leaflet";
import { Crosshair } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import type { PlayerMapObject } from "@/lib/game/state/map-objects";
import { RESOURCE_DEFINITIONS } from "@/lib/game/definitions/resources";

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

function mapObjectIcon(object: PlayerMapObject) {
  const resource = RESOURCE_DEFINITIONS.find(
    (definition) => definition.id === object.resourceId,
  );
  const markerType = object.objectKind === "chest" ? "chest" : object.resourceId;

  return L.divIcon({
    className: "",
    html: `<span class="runhold-map-object runhold-map-object-${markerType}">${object.objectKind === "chest" ? "?" : (resource?.icon ?? "?")}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

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

function FollowCurrent({
  center,
  following,
}: {
  center: Coordinate;
  following: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!following) return;
    map.setView([center.lat, center.lng], map.getZoom(), { animate: true });
  }, [center.lat, center.lng, following, map]);

  return null;
}

function MapFollowEvents({
  onManualMove,
  onViewChange,
}: {
  onManualMove: () => void;
  onViewChange?: (center: Coordinate) => void;
}) {
  useMapEvents({
    dragstart: onManualMove,
    zoomstart: onManualMove,
    moveend(event) {
      const center = event.target.getCenter();
      onViewChange?.({ lat: center.lat, lng: center.lng });
    },
  });

  return null;
}

function CenterControl({
  center,
  label,
  className,
  onCentered,
}: {
  center: Coordinate;
  label: string;
  className: string;
  onCentered: () => void;
}) {
  const map = useMap();

  return (
    <button
      type="button"
      className={`absolute z-[1000] grid size-12 place-items-center rounded-full border border-white/20 bg-[#101820]/92 text-white shadow-2xl backdrop-blur ${className}`}
      aria-label={label}
      title={label}
      onClick={() => {
        onCentered();
        map.setView([center.lat, center.lng], Math.max(map.getZoom(), 16), {
          animate: true,
        });
      }}
    >
      <Crosshair aria-hidden="true" size={22} />
    </button>
  );
}

export function MissionMap({
  start,
  destination,
  current,
  canSelectDestination,
  showStartRadius,
  scanRadiusM,
  mapObjects = [],
  routePoints = [],
  centerLabel,
  centerControlClassName = "bottom-4 right-4",
  onViewChange,
  onDestinationSelect,
}: {
  start: Coordinate;
  destination: Coordinate | null;
  current: Coordinate | null;
  canSelectDestination: boolean;
  showStartRadius: boolean;
  scanRadiusM?: number | null;
  mapObjects?: PlayerMapObject[];
  routePoints?: Coordinate[];
  centerLabel: string;
  centerControlClassName?: string;
  onViewChange?: (center: Coordinate) => void;
  onDestinationSelect: (point: Coordinate) => void;
}) {
  const activeCenter = current ?? start;
  const [following, setFollowing] = useState(true);
  const routeLine = useMemo(
    () => routePoints.map((point) => [point.lat, point.lng] as [number, number]),
    [routePoints],
  );

  return (
    <MapContainer
      center={[activeCenter.lat, activeCenter.lng]}
      zoom={17}
      minZoom={3}
      maxZoom={19}
      scrollWheelZoom
      touchZoom
      zoomControl={false}
      className="z-0 h-full min-h-[420px]"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bidragsgivare &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <ZoomControl position="topright" />
      <FollowCurrent center={activeCenter} following={following} />
      <MapFollowEvents
        onManualMove={() => setFollowing(false)}
        onViewChange={onViewChange}
      />
      <CenterControl
        center={activeCenter}
        label={centerLabel}
        className={centerControlClassName}
        onCentered={() => setFollowing(true)}
      />
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
      {mapObjects.map((object) => (
        <Marker
          key={object.id}
          position={[object.position.lat, object.position.lng]}
          icon={mapObjectIcon(object)}
        />
      ))}
      {routeLine.length > 1 ? (
        <>
          <Polyline
            positions={routeLine}
            pathOptions={{ color: "#0b1320", opacity: 0.5, weight: 8 }}
          />
          <Polyline
            positions={routeLine}
            pathOptions={{ color: "#6ea8fe", opacity: 0.92, weight: 4 }}
          />
        </>
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
