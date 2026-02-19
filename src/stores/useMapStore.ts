import { create } from "zustand";

export interface MapPoint {
    id: string;
    lat: number;
    lng: number;
    c: number;
    d: string;
    thumbs: string[];  // signed thumbnail URLs (up to 3)
}

export interface SidebarPhoto {
    id: string;
    lat: number;
    lng: number;
    thumbUrl: string;
    displayUrl: string;
    dateTaken: string | null;
    filename: string | null;
    width: number;
    height: number;
    albumId: string;
    albumTitle: string;
}

const PAGE_SIZE = 20;

interface MapState {
    // Map points data
    points: MapPoint[];
    isLoading: boolean;
    error: string | null;

    // Sidebar photos data (paginated)
    sidebarPhotos: SidebarPhoto[];
    sidebarTotal: number;
    sidebarLoading: boolean;
    sidebarLoadingMore: boolean;
    sidebarOpen: boolean;

    // Viewport
    zoom: number;
    bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;

    // Timeline
    dateRange: { min: string | null; max: string | null };
    timeFilter: { since?: string; until?: string };

    // Selection (shared between map markers and sidebar)
    selectedPointId: string | null;
    highlightedPhotoId: string | null;
    highlightSource: "map" | "sidebar" | null;

    // Actions
    setPoints: (points: MapPoint[]) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    setZoom: (zoom: number) => void;
    setBounds: (bounds: MapState["bounds"]) => void;
    setDateRange: (range: MapState["dateRange"]) => void;
    setTimeFilter: (filter: MapState["timeFilter"]) => void;
    setSelectedPointId: (id: string | null) => void;
    setHighlightedPhotoId: (id: string | null, source?: "map" | "sidebar") => void;
    setSidebarOpen: (open: boolean) => void;

    // Async
    fetchPoints: (abortSignal?: AbortSignal) => Promise<void>;
    fetchDateRange: () => Promise<void>;
    fetchSidebarPhotos: (abortSignal?: AbortSignal) => Promise<void>;
    fetchMoreSidebarPhotos: () => Promise<void>;
}

export const useMapStore = create<MapState>((set, get) => ({
    points: [],
    isLoading: false,
    error: null,
    sidebarPhotos: [],
    sidebarTotal: 0,
    sidebarLoading: false,
    sidebarLoadingMore: false,
    sidebarOpen: true,
    zoom: 3,
    bounds: null,
    dateRange: { min: null, max: null },
    timeFilter: {},
    selectedPointId: null,
    highlightedPhotoId: null,
    highlightSource: null,

    setPoints: (points) => set({ points }),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
    setZoom: (zoom) => set({ zoom }),
    setBounds: (bounds) => set({ bounds }),
    setDateRange: (dateRange) => set({ dateRange }),
    setTimeFilter: (timeFilter) => set({ timeFilter }),
    setSelectedPointId: (selectedPointId) => set({ selectedPointId }),
    setHighlightedPhotoId: (highlightedPhotoId, source) => set({ highlightedPhotoId, highlightSource: source || null }),
    setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

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
            if (err?.name === "AbortError") return;
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

    // Fetch first page of sidebar photos (called on viewport change)
    fetchSidebarPhotos: async (abortSignal) => {
        const { bounds } = get();
        if (!bounds) return;

        set({ sidebarLoading: true, sidebarPhotos: [], sidebarTotal: 0 });

        try {
            const params = new URLSearchParams({
                minLat: String(bounds.minLat),
                maxLat: String(bounds.maxLat),
                minLng: String(bounds.minLng),
                maxLng: String(bounds.maxLng),
                offset: "0",
            });

            const res = await fetch(`/api/map/photos?${params}`, {
                signal: abortSignal,
            });

            if (!res.ok) throw new Error("Failed to fetch sidebar photos");

            const data = await res.json();
            set({
                sidebarPhotos: data.photos,
                sidebarTotal: data.total,
                sidebarLoading: false,
            });
        } catch (err: any) {
            if (err?.name === "AbortError") return;
            set({ sidebarLoading: false });
        }
    },

    // Load next page — appends to existing photos
    fetchMoreSidebarPhotos: async () => {
        const { bounds, sidebarPhotos, sidebarTotal, sidebarLoadingMore } = get();
        if (!bounds || sidebarLoadingMore) return;
        if (sidebarPhotos.length >= sidebarTotal) return; // nothing left

        set({ sidebarLoadingMore: true });

        try {
            const params = new URLSearchParams({
                minLat: String(bounds.minLat),
                maxLat: String(bounds.maxLat),
                minLng: String(bounds.minLng),
                maxLng: String(bounds.maxLng),
                offset: String(sidebarPhotos.length),
            });

            const res = await fetch(`/api/map/photos?${params}`);
            if (!res.ok) throw new Error("Failed to load more photos");

            const data = await res.json();
            set({
                sidebarPhotos: [...sidebarPhotos, ...data.photos],
                sidebarTotal: data.total, // refresh total in case viewport changed
                sidebarLoadingMore: false,
            });
        } catch {
            set({ sidebarLoadingMore: false });
        }
    },
}));
