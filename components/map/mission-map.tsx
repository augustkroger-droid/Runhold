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

type MapObjectCluster = {
  id: string;
  objects: PlayerMapObject[];
  position: Coordinate;
  markerType: string;
  label: string;
};

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

function mapObjectIcon(object: PlayerMapObject, selected: boolean) {
  const resource = RESOURCE_DEFINITIONS.find(
    (definition) => definition.id === object.resourceId,
  );
  const markerType = object.objectKind === "chest" ? "chest" : object.resourceId;
  const selectedClassName = selected ? " runhold-map-object-selected" : "";

  return L.divIcon({
    className: "",
    html: `<span class="runhold-map-object runhold-map-object-${markerType}${selectedClassName}">${object.objectKind === "chest" ? "?" : (resource?.icon ?? "?")}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function mapObjectClusterIcon(cluster: MapObjectCluster) {
  return L.divIcon({
    className: "",
    html: `<span class="runhold-map-object-cluster runhold-map-object-cluster-${cluster.markerType}"><span class="runhold-map-object-cluster-icons">${cluster.label}</span><span class="runhold-map-object-cluster-count">${cluster.objects.length}</span></span>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

function objectLabel(object: PlayerMapObject): string {
  if (object.objectKind === "chest") return "?";

  const resource = RESOURCE_DEFINITIONS.find(
    (definition) => definition.id === object.resourceId,
  );

  return resource?.icon ?? "?";
}

function objectMarkerType(object: PlayerMapObject): string {
  return object.objectKind === "chest" ? "chest" : (object.resourceId ?? "unknown");
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

function clusterGridSizePx(zoom: number): number | null {
  if (zoom >= 17) return null;
  if (zoom >= 15) return 44;
  if (zoom >= 13) return 56;
  if (zoom >= 11) return 70;
  return 86;
}

function MapObjectMarkers({
  mapObjects,
  selectedMapObjectIds,
  onMapObjectSelect,
}: {
  mapObjects: PlayerMapObject[];
  selectedMapObjectIds?: ReadonlySet<string>;
  onMapObjectSelect?: (object: PlayerMapObject) => void;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useMapEvents({
    zoomend(event) {
      setZoom(event.target.getZoom());
    },
  });

  const { individualObjects, clusters } = useMemo(() => {
    const gridSizePx = clusterGridSizePx(zoom);
    const selectedObjects = mapObjects.filter((object) =>
      selectedMapObjectIds?.has(object.id),
    );
    const selectedIds = new Set(selectedObjects.map((object) => object.id));

    if (!gridSizePx) {
      return {
        individualObjects: mapObjects,
        clusters: [] as MapObjectCluster[],
      };
    }

    const grouped = new Map<
      string,
      {
        objects: PlayerMapObject[];
        latSum: number;
        lngSum: number;
      }
    >();

    for (const object of mapObjects) {
      if (selectedIds.has(object.id)) continue;

      const point = map.project([object.position.lat, object.position.lng], zoom);
      const markerType = objectMarkerType(object);
      const key = `${markerType}:${Math.floor(point.x / gridSizePx)}:${Math.floor(
        point.y / gridSizePx,
      )}`;
      const group = grouped.get(key);

      if (group) {
        group.objects.push(object);
        group.latSum += object.position.lat;
        group.lngSum += object.position.lng;
      } else {
        grouped.set(key, {
          objects: [object],
          latSum: object.position.lat,
          lngSum: object.position.lng,
        });
      }
    }

    const nextIndividualObjects = [...selectedObjects];
    const nextClusters: MapObjectCluster[] = [];

    for (const [key, group] of grouped) {
      if (group.objects.length === 1) {
        nextIndividualObjects.push(group.objects[0]);
        continue;
      }

      const firstObject = group.objects[0];

      nextClusters.push({
        id: key,
        objects: group.objects,
        markerType: objectMarkerType(firstObject),
        label: objectLabel(firstObject),
        position: {
          lat: group.latSum / group.objects.length,
          lng: group.lngSum / group.objects.length,
        },
      });
    }

    return {
      individualObjects: nextIndividualObjects,
      clusters: nextClusters,
    };
  }, [map, mapObjects, selectedMapObjectIds, zoom]);

  return (
    <>
      {clusters.map((cluster) => (
        <Marker
          key={`cluster-${cluster.id}`}
          position={[cluster.position.lat, cluster.position.lng]}
          icon={mapObjectClusterIcon(cluster)}
          eventHandlers={{
            click: () => {
              const bounds = L.latLngBounds(
                cluster.objects.map(
                  (object) =>
                    [object.position.lat, object.position.lng] as [number, number],
                ),
              );

              map.fitBounds(bounds.pad(0.45), {
                animate: true,
                maxZoom: Math.max(16, zoom + 1),
              });
            },
          }}
        />
      ))}

      {individualObjects.map((object) => (
        <Marker
          key={object.id}
          position={[object.position.lat, object.position.lng]}
          icon={mapObjectIcon(object, Boolean(selectedMapObjectIds?.has(object.id)))}
          eventHandlers={
            onMapObjectSelect
              ? {
                  click: () => onMapObjectSelect(object),
                }
              : undefined
          }
        />
      ))}
    </>
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
  selectedMapObjectIds,
  routePoints = [],
  plannedRoutePoints = [],
  centerLabel,
  centerControlClassName = "bottom-4 right-4",
  onViewChange,
  onMapObjectSelect,
  onDestinationSelect,
}: {
  start: Coordinate;
  destination: Coordinate | null;
  current: Coordinate | null;
  canSelectDestination: boolean;
  showStartRadius: boolean;
  scanRadiusM?: number | null;
  mapObjects?: PlayerMapObject[];
  selectedMapObjectIds?: ReadonlySet<string>;
  routePoints?: Coordinate[];
  plannedRoutePoints?: Coordinate[];
  centerLabel: string;
  centerControlClassName?: string;
  onViewChange?: (center: Coordinate) => void;
  onMapObjectSelect?: (object: PlayerMapObject) => void;
  onDestinationSelect: (point: Coordinate) => void;
}) {
  const activeCenter = current ?? start;
  const [following, setFollowing] = useState(true);
  const routeLine = useMemo(
    () => routePoints.map((point) => [point.lat, point.lng] as [number, number]),
    [routePoints],
  );
  const plannedRouteLine = useMemo(
    () =>
      plannedRoutePoints.map((point) => [point.lat, point.lng] as [number, number]),
    [plannedRoutePoints],
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
      <MapObjectMarkers
        mapObjects={mapObjects}
        selectedMapObjectIds={selectedMapObjectIds}
        onMapObjectSelect={onMapObjectSelect}
      />
      {plannedRouteLine.length > 1 ? (
        <>
          <Polyline
            positions={plannedRouteLine}
            pathOptions={{ color: "#101820", opacity: 0.6, weight: 8 }}
          />
          <Polyline
            positions={plannedRouteLine}
            pathOptions={{ color: "#f5b84b", opacity: 0.95, weight: 4 }}
          />
        </>
      ) : null}
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
