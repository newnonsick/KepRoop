"use client";

import { useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Map, { Source, Layer, Marker, NavigationControl } from "react-map-gl/mapbox";
import type { MapRef, ViewStateChangeEvent, MapMouseEvent } from "react-map-gl/mapbox";
import { ArrowLeft, MapPin, Loader2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/AuthProvider";
import { useMapStore, type MapPoint } from "@/stores/useMapStore";
import { PhotoMarker } from "@/components/map/PhotoMarker";
import { DashboardNavbar } from "@/components/DashboardNavbar";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// Safety valve: above this count, fall back to WebGL circles for 60fps
const MARKER_THRESHOLD = 150;

// WebGL fallback layers (used when too many points for HTML markers)
const clusterLayer: any = {
    id: "clusters",
    type: "circle",
    source: "photos",
    filter: ["has", "point_count"],
    paint: {
        "circle-color": [
            "step", ["get", "point_count"],
            "#60a5fa", 10, "#3b82f6", 50, "#2563eb", 200, "#1d4ed8",
        ],
        "circle-radius": [
            "step", ["get", "point_count"],
            18, 10, 22, 50, 28, 200, 36,
        ],
        "circle-stroke-width": 3,
        "circle-stroke-color": "rgba(255, 255, 255, 0.8)",
        "circle-opacity": 0.9,
    },
};

const clusterCountLayer: any = {
    id: "cluster-count",
    type: "symbol",
    source: "photos",
    filter: ["has", "point_count"],
    layout: {
        "text-field": "{point_count_abbreviated}",
        "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
        "text-size": 13,
    },
    paint: { "text-color": "#ffffff" },
};

const unclusteredPointLayer: any = {
    id: "unclustered-point",
    type: "circle",
    source: "photos",
    filter: ["!", ["has", "point_count"]],
    paint: {
        "circle-color": "#3b82f6",
        "circle-radius": 8,
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.95,
    },
};

function pointsToGeoJson(points: MapPoint[]) {
    return {
        type: "FeatureCollection" as const,
        features: points.map((p) => ({
            type: "Feature" as const,
            properties: { id: p.id, count: p.c, date: p.d },
            geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        })),
    };
}

export default function PhotoMapPage() {
    const { user } = useAuth();
    const router = useRouter();
    const mapRef = useRef<MapRef>(null);
    const abortRef = useRef<AbortController | null>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    const {
        points, isLoading, zoom, selectedPointId,
        setZoom, setBounds, setSelectedPointId,
        fetchPoints, fetchDateRange,
    } = useMapStore();

    const useWebGLFallback = points.length > MARKER_THRESHOLD;
    const geoJsonData = useMemo(() => pointsToGeoJson(points), [points]);

    // Fetch date range on mount
    useEffect(() => { fetchDateRange(); }, []);

    // Debounced fetch on viewport change
    const debouncedFetch = useCallback(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (abortRef.current) abortRef.current.abort();
        debounceRef.current = setTimeout(() => {
            abortRef.current = new AbortController();
            fetchPoints(abortRef.current.signal);
        }, 300);
    }, [fetchPoints]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            if (abortRef.current) abortRef.current.abort();
        };
    }, []);

    const onMapMove = useCallback(
        (e: ViewStateChangeEvent) => {
            const map = mapRef.current?.getMap();
            if (!map) return;
            setZoom(e.viewState.zoom);
            const b = map.getBounds();
            if (b) {
                setBounds({
                    minLat: b.getSouth(), maxLat: b.getNorth(),
                    minLng: b.getWest(), maxLng: b.getEast(),
                });
            }
            debouncedFetch();
        },
        [setZoom, setBounds, debouncedFetch]
    );

    const onMapLoad = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;
        const b = map.getBounds();
        if (b) {
            setBounds({
                minLat: b.getSouth(), maxLat: b.getNorth(),
                minLng: b.getWest(), maxLng: b.getEast(),
            });
        }
        abortRef.current = new AbortController();
        fetchPoints(abortRef.current.signal);
    }, [setBounds, fetchPoints]);

    // Handle click on WebGL cluster -> zoom in
    const onClusterClick = useCallback((e: MapMouseEvent) => {
        const features = e.features;
        if (!features?.length) return;
        const clusterId = features[0].properties?.cluster_id;
        const map = mapRef.current?.getMap();
        if (!map || !clusterId) return;
        const source = map.getSource("photos") as any;
        source.getClusterExpansionZoom(clusterId, (err: any, z: number) => {
            if (err) return;
            const coords = (features[0].geometry as any).coordinates;
            map.flyTo({ center: coords, zoom: z, duration: 500, essential: true });
        });
    }, []);

    // Handle marker click -> fly to and select
    const handleMarkerClick = useCallback(
        (point: MapPoint) => {
            setSelectedPointId(point.id);
            const map = mapRef.current?.getMap();
            if (map && zoom < 14) {
                map.flyTo({
                    center: [point.lng, point.lat],
                    zoom: Math.min(zoom + 3, 18),
                    duration: 600,
                    essential: true,
                });
            }
        },
        [setSelectedPointId, zoom]
    );

    // Click on empty map -> deselect
    const onMapClick = useCallback(
        (e: MapMouseEvent) => {
            const map = mapRef.current?.getMap();
            if (!map) return;
            // In WebGL mode, check for features under click
            if (useWebGLFallback) {
                const features = map.queryRenderedFeatures(e.point, {
                    layers: ["clusters", "unclustered-point"],
                });
                if (features.length > 0) return;
            }
            setSelectedPointId(null);
        },
        [setSelectedPointId, useWebGLFallback]
    );

    // Cursor styling for WebGL mode
    const onMouseEnter = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (map) map.getCanvas().style.cursor = "pointer";
    }, []);
    const onMouseLeave = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (map) map.getCanvas().style.cursor = "";
    }, []);

    // Missing token state
    if (!MAPBOX_TOKEN) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
                <DashboardNavbar />
                <div className="flex items-center justify-center h-[calc(100vh-64px)]">
                    <div className="text-center max-w-md p-8">
                        <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
                            <MapPin className="h-8 w-8 text-amber-500" />
                        </div>
                        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
                            Mapbox Token Required
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Add <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs font-mono">NEXT_PUBLIC_MAPBOX_TOKEN</code> to your environment variables.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <DashboardNavbar />

            <div className="relative h-[calc(100vh-64px)]">
                {/* Back button */}
                <div className="absolute top-4 left-4 z-10">
                    <Button
                        variant="outline"
                        onClick={() => router.push("/dashboard")}
                        className="gap-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md shadow-lg border-white/50 dark:border-slate-700 rounded-2xl h-11 px-4 hover:bg-white dark:hover:bg-slate-800 transition-all"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Dashboard
                    </Button>
                </div>

                {/* Loading indicator */}
                {isLoading && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                        <div className="flex items-center gap-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md shadow-lg rounded-full px-4 py-2 border border-white/50 dark:border-slate-700">
                            <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Loading photos...</span>
                        </div>
                    </div>
                )}

                {/* Stats overlay */}
                <div className="absolute bottom-6 left-4 z-10">
                    <div className="flex items-center gap-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md shadow-lg rounded-2xl px-4 py-2.5 border border-white/50 dark:border-slate-700">
                        <ImageIcon className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            {points.reduce((sum, p) => sum + p.c, 0).toLocaleString()} photos
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
                            in {points.length} locations
                        </span>
                    </div>
                </div>

                {/* The Map */}
                <Map
                    ref={mapRef}
                    mapboxAccessToken={MAPBOX_TOKEN}
                    initialViewState={{ longitude: 100.5, latitude: 13.75, zoom: 3 }}
                    style={{ width: "100%", height: "100%" }}
                    mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
                    onMoveEnd={onMapMove}
                    onLoad={onMapLoad}
                    onClick={onMapClick}
                    interactiveLayerIds={useWebGLFallback ? ["clusters", "unclustered-point"] : []}
                    onMouseEnter={useWebGLFallback ? onMouseEnter : undefined}
                    onMouseLeave={useWebGLFallback ? onMouseLeave : undefined}
                >
                    <NavigationControl position="top-right" />

                    {/* WebGL fallback when too many points */}
                    {useWebGLFallback && (
                        <Source
                            id="photos"
                            type="geojson"
                            data={geoJsonData}
                            cluster={true}
                            clusterMaxZoom={16}
                            clusterRadius={50}
                        >
                            <Layer {...clusterLayer} onClick={onClusterClick} />
                            <Layer {...clusterCountLayer} />
                            <Layer {...unclusteredPointLayer} />
                        </Source>
                    )}

                    {/* Photo thumbnail markers when point count is manageable */}
                    {!useWebGLFallback &&
                        points.map((point) => (
                            <Marker
                                key={point.id}
                                longitude={point.lng}
                                latitude={point.lat}
                                anchor="bottom"
                                onClick={(e) => {
                                    e.originalEvent.stopPropagation();
                                    handleMarkerClick(point);
                                }}
                            >
                                <PhotoMarker
                                    count={point.c}
                                    thumbs={point.thumbs}
                                    isSelected={selectedPointId === point.id}
                                />
                            </Marker>
                        ))
                    }
                </Map>
            </div>
        </div>
    );
}
