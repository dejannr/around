import { useEffect, useMemo, useRef, type ComponentRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ContentItem } from "../../data/demo";
type MapboxModule = typeof import("@rnmapbox/maps").default;
type CameraRef = ComponentRef<MapboxModule["Camera"]>;
type ShapeSourceRef = ComponentRef<MapboxModule["ShapeSource"]>;

type Props = {
  items: ContentItem[];
  onSelect: (item: ContentItem) => void;
  showUserLocation: boolean;
  userCoordinate: [number, number] | null;
};
const token = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
// Keep demo mode compatible with Expo Go. The native module is loaded only in a
// development build after a Mapbox token has been configured.
const Mapbox = token
  ? (require("@rnmapbox/maps")
      .default as typeof import("@rnmapbox/maps").default)
  : null;
if (token && Mapbox) Mapbox.setAccessToken(token);

// Uses a single clustered ShapeSource rather than React marker components.
export function MapSurface({
  items,
  onSelect,
  showUserLocation,
  userCoordinate,
}: Props) {
  const shapeSourceRef = useRef<ShapeSourceRef | null>(null);
  const cameraRef = useRef<CameraRef | null>(null);
  const points = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: items.map((item) => ({
        type: "Feature" as const,
        properties: { id: item.id, contentType: item.type },
        geometry: {
          type: "Point" as const,
          coordinates: [item.longitude, item.latitude],
        },
      })),
    }),
    [items],
  );
  useEffect(() => {
    if (token && Mapbox) Mapbox.setAccessToken(token);
  }, []);
  if (!token || !Mapbox)
    return (
      <View style={styles.fallback}>
        <View style={styles.grid} />
        <Text style={styles.fallbackText}>
          Add a Mapbox public token to enable the live map
        </Text>
      </View>
    );
  return (
    <Mapbox.MapView
      style={StyleSheet.absoluteFill}
      styleURL={Mapbox.StyleURL.Street}
      logoEnabled={false}
      attributionEnabled={false}
    >
      <Mapbox.Camera
        ref={cameraRef}
        centerCoordinate={userCoordinate ?? [20.4573, 44.8176]}
        zoomLevel={userCoordinate ? 14 : 12}
      />
      {showUserLocation && <Mapbox.UserLocation visible />}
      <Mapbox.ShapeSource
        id="around-content"
        shape={points}
        cluster
        clusterRadius={48}
        ref={shapeSourceRef}
        onPress={(event) => {
          const feature = event.features[0];
          if (
            feature?.properties?.cluster &&
            feature.geometry.type === "Point"
          ) {
            void shapeSourceRef.current
              ?.getClusterExpansionZoom(JSON.stringify(feature))
              .then((zoomLevel) => {
                const point = feature.geometry as unknown as {
                  coordinates: [number, number];
                };
                const [longitude, latitude] = point.coordinates as [
                  number,
                  number,
                ];
                cameraRef.current?.setCamera({
                  centerCoordinate: [longitude, latitude],
                  zoomLevel,
                  animationDuration: 300,
                });
              });
            return;
          }
          const id = feature?.properties?.id;
          const match = items.find((item) => item.id === id);
          if (match) onSelect(match);
        }}
      >
        <Mapbox.CircleLayer
          id="clusters"
          filter={["has", "point_count"]}
          style={{
            circleColor: "#256c4d",
            circleRadius: 20,
            circleStrokeColor: "#fff",
            circleStrokeWidth: 2,
          }}
        />
        <Mapbox.SymbolLayer
          id="cluster-count"
          filter={["has", "point_count"]}
          style={{
            textField: ["get", "point_count_abbreviated"],
            textSize: 12,
            textColor: "#ffffff",
          }}
        />
        <Mapbox.CircleLayer
          id="points"
          filter={["!", ["has", "point_count"]]}
          style={{
            circleColor: "#256c4d",
            circleRadius: 9,
            circleStrokeColor: "#fff",
            circleStrokeWidth: 2,
          }}
        />
      </Mapbox.ShapeSource>
    </Mapbox.MapView>
  );
}
const styles = StyleSheet.create({
  fallback: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#dce8dc",
    overflow: "hidden",
  },
  grid: {
    ...StyleSheet.absoluteFill,
    opacity: 0.4,
    backgroundColor: "#c5d8c5",
    borderWidth: 1,
    borderColor: "#afc6af",
  },
  fallbackText: {
    alignSelf: "center",
    marginTop: "60%",
    color: "#527057",
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: 55,
  },
});
