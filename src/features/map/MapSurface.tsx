import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { captureRef } from "react-native-view-shot";
import type { ContentItem } from "../../data/demo";
type MapboxModule = typeof import("@rnmapbox/maps").default;
type CameraRef = ComponentRef<MapboxModule["Camera"]>;
type ShapeSourceRef = ComponentRef<MapboxModule["ShapeSource"]>;

type Props = {
  items: ContentItem[];
  onSelect: (item: ContentItem) => void;
  onViewportChange: (viewport: {
    center: [number, number];
    zoom: number;
    bounds: {
      northeast: [number, number];
      southwest: [number, number];
    };
  }) => void;
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

// Mapbox symbols preserve an image's original proportions. Fetch a small square
// thumbnail so every photo sits neatly in the circular head of its pin.
function mapThumbnailUrl(imageUrl: string) {
  try {
    const url = new URL(imageUrl);
    if (url.hostname.endsWith("images.unsplash.com")) {
      url.searchParams.set("auto", "format");
      url.searchParams.set("fit", "crop");
      url.searchParams.set("w", "96");
      url.searchParams.set("h", "96");
      url.searchParams.set("q", "84");
    }
    if (
      url.hostname.endsWith(".supabase.co") &&
      url.pathname.includes("/storage/v1/object/public/")
    ) {
      url.pathname = url.pathname.replace(
        "/storage/v1/object/public/",
        "/storage/v1/render/image/public/",
      );
      url.searchParams.set("width", "96");
      url.searchParams.set("height", "96");
      url.searchParams.set("resize", "cover");
    }
    return url.toString();
  } catch {
    return imageUrl;
  }
}

// Uses a single clustered ShapeSource rather than React marker components.
export function MapSurface({
  items,
  onSelect,
  onViewportChange,
  showUserLocation,
  userCoordinate,
}: Props) {
  const shapeSourceRef = useRef<ShapeSourceRef | null>(null);
  const cameraRef = useRef<CameraRef | null>(null);
  const [hasMapLayout, setHasMapLayout] = useState(false);
  const [photoPinImages, setPhotoPinImages] = useState<Record<string, string>>(
    {},
  );
  const markerImages = useMemo(
    () => ({
      aroundPin: require("../../../assets/around-map-pin.png"),
      ...Object.fromEntries(
        items.flatMap((item) =>
          photoPinImages[item.id]
            ? [[`activity-photo-${item.id}`, photoPinImages[item.id]]]
            : [],
        ),
      ),
    }),
    [items, photoPinImages],
  );
  const points = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: items.map((item) => ({
        type: "Feature" as const,
        properties: {
          id: item.id,
          contentType: item.type,
          hasImage: Boolean(photoPinImages[item.id]),
          imageKey: photoPinImages[item.id]
            ? `activity-photo-${item.id}`
            : null,
        },
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
    <View
      style={StyleSheet.absoluteFill}
      onLayout={({ nativeEvent: { layout } }) => {
        const ready = layout.width > 0 && layout.height > 0;
        setHasMapLayout((current) => (current === ready ? current : ready));
      }}
    >
      {hasMapLayout && (
        <Mapbox.MapView
          style={StyleSheet.absoluteFill}
          styleURL={Mapbox.StyleURL.Street}
          zoomEnabled
          scrollEnabled
          logoEnabled={false}
          attributionEnabled={false}
          onCameraChanged={(state) => {
            const center = state.properties.center;
            if (center.length < 2) return;
            onViewportChange({
              center: [center[0], center[1]],
              zoom: state.properties.zoom,
              bounds: {
                northeast: [
                  state.properties.bounds.ne[0],
                  state.properties.bounds.ne[1],
                ],
                southwest: [
                  state.properties.bounds.sw[0],
                  state.properties.bounds.sw[1],
                ],
              },
            });
          }}
        >
          <Mapbox.Camera
            ref={cameraRef}
            centerCoordinate={userCoordinate ?? [20.4573, 44.8176]}
            zoomLevel={userCoordinate ? 14 : 12}
          />
          {showUserLocation && <Mapbox.UserLocation visible />}
          <Mapbox.Images images={markerImages} />
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
                    const [longitude, latitude] = point.coordinates;
                    cameraRef.current?.setCamera({
                      centerCoordinate: [longitude, latitude],
                      zoomLevel,
                      animationDuration: 420,
                      animationMode: "easeTo",
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
                circleColor: "#e81e4c",
                circleRadius: [
                  "step",
                  ["get", "point_count"],
                  18,
                  5,
                  22,
                  15,
                  27,
                ],
                circleStrokeColor: "#fff",
                circleStrokeWidth: 2,
                circleOpacity: 0.96,
                circleRadiusTransition: { duration: 260, delay: 0 },
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
            <Mapbox.SymbolLayer
              id="points"
              filter={["!", ["get", "hasImage"]]}
              style={{
                iconImage: "aroundPin",
                iconSize: 0.72,
                iconAnchor: "bottom",
                iconAllowOverlap: true,
                iconIgnorePlacement: true,
              }}
            />
            <Mapbox.SymbolLayer
              id="photo-pin-tail"
              filter={[
                "all",
                ["!", ["has", "point_count"]],
                ["get", "hasImage"],
              ]}
              style={{
                iconImage: "aroundPin",
                iconSize: 0.88,
                iconAnchor: "bottom",
                iconAllowOverlap: true,
                iconIgnorePlacement: true,
              }}
            />
            <Mapbox.SymbolLayer
              id="photo-pins"
              filter={[
                "all",
                ["!", ["has", "point_count"]],
                ["get", "hasImage"],
              ]}
              style={{
                iconImage: ["get", "imageKey"],
                iconSize: 0.24,
                iconTranslate: [0, -37],
                iconAllowOverlap: true,
                iconIgnorePlacement: true,
                iconOpacityTransition: { duration: 260, delay: 0 },
              }}
            />
          </Mapbox.ShapeSource>
        </Mapbox.MapView>
      )}
      <View pointerEvents="none" style={styles.photoCaptureStage}>
        {items.flatMap((item) =>
          item.imageUrl && !photoPinImages[item.id]
            ? [
                <CircularPhotoCapture
                  key={`${item.id}-${item.imageUrl}`}
                  imageUrl={mapThumbnailUrl(item.imageUrl)}
                  onCaptured={(uri) =>
                    setPhotoPinImages((current) =>
                      current[item.id] === uri
                        ? current
                        : { ...current, [item.id]: uri },
                    )
                  }
                />,
              ]
            : [],
        )}
      </View>
    </View>
  );
}

function CircularPhotoCapture({
  imageUrl,
  onCaptured,
}: {
  imageUrl: string;
  onCaptured: (uri: string) => void;
}) {
  const captureTarget = useRef<View>(null);
  const hasCaptured = useRef(false);
  useEffect(() => {
    hasCaptured.current = false;
  }, [imageUrl]);
  const capture = () => {
    if (hasCaptured.current || !captureTarget.current) return;
    hasCaptured.current = true;
    requestAnimationFrame(() => {
      if (!captureTarget.current) return;
      void captureRef(captureTarget, {
        format: "png",
        quality: 1,
        result: "tmpfile",
        width: 72,
        height: 72,
      })
        .then(onCaptured)
        .catch(() => {
          hasCaptured.current = false;
        });
    });
  };
  return (
    <View ref={captureTarget} collapsable={false} style={styles.photoCapture}>
      <Image
        source={{ uri: imageUrl }}
        style={styles.photoCaptureImage}
        resizeMode="cover"
        onLoad={capture}
      />
    </View>
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
  photoCaptureStage: {
    position: "absolute",
    width: 1,
    height: 1,
    left: -100,
    top: -100,
    overflow: "hidden",
  },
  photoCapture: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: "hidden",
    backgroundColor: "#ffffff",
  },
  photoCaptureImage: {
    width: "100%",
    height: "100%",
  },
});
