import { create } from "zustand";

export interface MapPoint {
    id: string;
    lat: number;
    lng: number;
    c: number;
    d: string;
}

interface MapState {
    // Data
    points: MapPoint[];
    isLoading: boolean;
    error: string | null;

    // Viewport
    zoom: number;
    bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;

    // Timeline
    dateRange: { min: string | null; max: string | null };
    timeFilter: { since?: string; until?: string };

    // Selected
    selectedPointId: string | null;

    // Actions
    setPoints: (points: MapPoint[]) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    setZoom: (zoom: number) => void;
    setBounds: (bounds: MapState["bounds"]) => void;
    setDateRange: (range: MapState["dateRange"]) => void;
    setTimeFilter: (filter: MapState["timeFilter"]) => void;
    setSelectedPointId: (id: string | null) => void;

    // Async
    fetchPoints: (abortSignal?: AbortSignal) => Promise<void>;
    fetchDateRange: () => Promise<void>;
}

export const useMapStore = create<MapState>((set, get) => ({
    points: [],
    isLoading: false,
    error: null,
    zoom: 3,
    bounds: null,
    dateRange: { min: null, max: null },
    timeFilter: {},
    selectedPointId: null,

    setPoints: (points) => set({ points }),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
    setZoom: (zoom) => set({ zoom }),
    setBounds: (bounds) => set({ bounds }),
    setDateRange: (dateRange) => set({ dateRange }),
    setTimeFilter: (timeFilter) => set({ timeFilter }),
    setSelectedPointId: (selectedPointId) => set({ selectedPointId }),

    fetchPoints: async (abortSignal) => {
        const { bounds, zoom, timeFilter } = get();
        if (!bounds) return;

        set({ isLoading: true, error: null });

        try {
            const params = new URLSearchParams({
                minLat: String(bounds.minLat),
                maxLat: String(bounds.maxLat),
                minLng: String(bounds.minLng),
                maxLng: String(bounds.maxLng),
                zoom: String(Math.round(zoom)),
            });

            if (timeFilter.since) params.set("since", timeFilter.since);
            if (timeFilter.until) params.set("until", timeFilter.until);

            const res = await fetch(`/api/map/points?${params}`, {
                signal: abortSignal,
            });

            if (!res.ok) throw new Error("Failed to fetch map points");

            const data = await res.json();
            set({ points: data.points, isLoading: false });
        } catch (err: any) {
            if (err?.name === "AbortError") return; // Cancelled, don't update
            set({ error: err.message, isLoading: false });
        }
    },

    fetchDateRange: async () => {
        try {
            const res = await fetch("/api/map/date-range");
            if (!res.ok) return;
            const data = await res.json();
            set({ dateRange: data });
        } catch {
            // Non-critical, silently fail
        }
    },
}));
