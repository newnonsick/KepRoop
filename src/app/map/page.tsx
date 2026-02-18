"use client";

import { useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Map, { Source, Layer, Popup, NavigationControl, useMap } from "react-map-gl/mapbox";
import type { MapRef, ViewStateChangeEvent, MapMouseEvent } from "react-map-gl/mapbox";
import type { GeoJSON } from "geojson";
import { ArrowLeft, MapPin, Loader2, Image as ImageIcon, Calendar, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/AuthProvider";
import { useMapStore, type MapPoint } from "@/stores/useMapStore";
import { DashboardNavbar } from "@/components/DashboardNavbar";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// Cluster layer styling
const clusterLayer: any = {
    id: "clusters",
    type: "circle",
    source: "photos",
    filter: ["has", "point_count"],
    paint: {
        "circle-color": [
            "step",
            ["get", "point_count"],
            "#60a5fa",   // Blue-400 for small clusters
            10,
            "#3b82f6",   // Blue-500
            50,
            "#2563eb",   // Blue-600
            200,
            "#1d4ed8",   // Blue-700 for large clusters
        ],
        "circle-radius": [
            "step",
            ["get", "point_count"],
            18,    // Small
            10, 22,
            50, 28,
            200, 36,
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
    paint: {
        "text-color": "#ffffff",
    },
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

// Convert API points to GeoJSON
function pointsToGeoJson(points: MapPoint[]): GeoJSON.FeatureCollection {
    return {
        type: "FeatureCollection",
        features: points.map((p) => ({
            type: "Feature" as const,
            properties: {
                id: p.id,
                count: p.c,
                date: p.d,
            },
            geometry: {
                type: "Point" as const,
                coordinates: [p.lng, p.lat],
            },
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
        points,
        isLoading,
        zoom,
        selectedPointId,
        setZoom,
        setBounds,
        setSelectedPointId,
        fetchPoints,
        fetchDateRange,
    } = useMapStore();

    const geoJsonData = useMemo(() => pointsToGeoJson(points), [points]);

    // Fetch date range on mount
    useEffect(() => {
        fetchDateRange();
    }, []);

    // Fetch points when bounds change (debounced)
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

            const z = e.viewState.zoom;
            setZoom(z);

            const b = map.getBounds();
            if (b) {
                setBounds({
                    minLat: b.getSouth(),
                    maxLat: b.getNorth(),
                    minLng: b.getWest(),
                    maxLng: b.getEast(),
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
                minLat: b.getSouth(),
                maxLat: b.getNorth(),
                minLng: b.getWest(),
                maxLng: b.getEast(),
            });
        }

        // Initial fetch
        const ac = new AbortController();
        abortRef.current = ac;
        fetchPoints(ac.signal);
    }, [setBounds, fetchPoints]);

    // Handle cluster click -> zoom in
    const onClusterClick = useCallback((e: MapMouseEvent) => {
        const features = e.features;
        if (!features?.length) return;

        const feature = features[0];
        const clusterId = feature.properties?.cluster_id;
        const map = mapRef.current?.getMap();
        if (!map || !clusterId) return;

        const source = map.getSource("photos") as any;
        source.getClusterExpansionZoom(clusterId, (err: any, z: number) => {
            if (err) return;
            const coords = (feature.geometry as any).coordinates;
            map.flyTo({
                center: coords,
                zoom: z,
                duration: 500,
                essential: true,
            });
        });
    }, []);

    // Handle point click -> select
    const onPointClick = useCallback(
        (e: MapMouseEvent) => {
            const features = e.features;
            if (!features?.length) return;
            const id = features[0].properties?.id;
            if (id) setSelectedPointId(id);
        },
        [setSelectedPointId]
    );

    // Handle click on map (deselect)
    const onClick = useCallback(
        (e: MapMouseEvent) => {
            // Check if clicked on any interactive layer
            const map = mapRef.current?.getMap();
            if (!map) return;

            const features = map.queryRenderedFeatures(e.point, {
                layers: ["clusters", "unclustered-point"],
            });

            if (features.length === 0) {
                setSelectedPointId(null);
            }
        },
        [setSelectedPointId]
    );

    // Cursor styling
    const onMouseEnter = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (map) map.getCanvas().style.cursor = "pointer";
    }, []);

    const onMouseLeave = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (map) map.getCanvas().style.cursor = "";
    }, []);

    // Selected point data for popup
    const selectedPoint = useMemo(
        () => points.find((p) => p.id === selectedPointId),
        [points, selectedPointId]
    );

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
                {/* Back button overlay */}
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
                    initialViewState={{
                        longitude: 100.5,
                        latitude: 13.75,
                        zoom: 3,
                    }}
                    style={{ width: "100%", height: "100%" }}
                    mapStyle="mapbox://styles/mapbox/light-v11"
                    onMoveEnd={onMapMove}
                    onLoad={onMapLoad}
                    onClick={onClick}
                    interactiveLayerIds={["clusters", "unclustered-point"]}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                >
                    <NavigationControl position="top-right" />

                    <Source
                        id="photos"
                        type="geojson"
                        data={geoJsonData}
                        cluster={true}
                        clusterMaxZoom={16}
                        clusterRadius={50}
                    >
                        <Layer
                            {...clusterLayer}
                            onClick={onClusterClick}
                        />
                        <Layer {...clusterCountLayer} />
                        <Layer
                            {...unclusteredPointLayer}
                            onClick={onPointClick}
                        />
                    </Source>

                    {/* Photo preview popup */}
                    {selectedPoint && (
                        <Popup
                            longitude={selectedPoint.lng}
                            latitude={selectedPoint.lat}
                            anchor="bottom"
                            onClose={() => setSelectedPointId(null)}
                            closeButton={false}
                            maxWidth="280px"
                            className="map-popup"
                        >
                            <div className="p-3 min-w-[200px]">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <ImageIcon className="h-4 w-4 text-blue-500" />
                                        <span className="text-sm font-semibold text-slate-800">
                                            {selectedPoint.c} photo{selectedPoint.c > 1 ? "s" : ""}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => setSelectedPointId(null)}
                                        className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                                    >
                                        <X className="h-3.5 w-3.5 text-slate-400" />
                                    </button>
                                </div>

                                {selectedPoint.d && (
                                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                        <Calendar className="h-3 w-3" />
                                        {new Date(selectedPoint.d).toLocaleDateString(undefined, {
                                            year: "numeric",
                                            month: "short",
                                            day: "numeric",
                                        })}
                                    </div>
                                )}

                                <div className="mt-2 text-[10px] font-mono text-slate-400">
                                    {selectedPoint.lat.toFixed(4)}, {selectedPoint.lng.toFixed(4)}
                                </div>
                            </div>
                        </Popup>
                    )}
                </Map>
            </div>
        </div>
    );
}
