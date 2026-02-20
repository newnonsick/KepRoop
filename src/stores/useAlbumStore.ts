
import { create } from 'zustand';

export type FilterType = "all" | "mine" | "shared" | "favorites";

export interface Album {
    id: string;
    title: string;
    description?: string;
    visibility: "public" | "private";
    taskRole: "owner" | "editor" | "viewer";
    coverImageUrl?: string;
    previewImageUrls?: string[];
    imageCount?: number;
    albumDate: string;
    isFavorite: boolean;
}

interface AlbumState {
    // State
    albums: Album[];
    filter: FilterType;
    searchQuery: string;
    visibilityFilter: "all" | "public" | "private";
    startDate: string;
    endDate: string;
    sortBy: "albumDate" | "createdAt";
    sortDir: "asc" | "desc";
    cursor: string | null;
    hasMore: boolean;
    isLoading: boolean;
    isLoadingMore: boolean;
    error: string | null;

    // Actions
    setFilter: (filter: FilterType) => void;
    setSearchQuery: (query: string) => void;
    setVisibilityFilter: (filter: "all" | "public" | "private") => void;
    setDateRange: (start: string, end: string) => void;
    setSort: (by: "albumDate" | "createdAt", dir: "asc" | "desc") => void;

    fetchAlbums: (reset?: boolean) => Promise<void>;
    loadMore: () => Promise<void>;
    toggleFavorite: (albumId: string) => Promise<void>;
    refreshAlbums: () => Promise<void>;
}

function buildAlbumsUrl(params: {
    cursor?: string | null;
    filter: FilterType;
    visibility: "all" | "public" | "private";
    startDate: string;
    endDate: string;
    search: string;
    sortBy: string;
    sortDir: string;
}) {
    const url = new URL("/api/albums", typeof window !== 'undefined' ? window.location.origin : "http://base.url");

    if (params.cursor) url.searchParams.set("cursor", params.cursor);
    if (params.filter !== "all") url.searchParams.set("filter", params.filter);
    if (params.visibility !== "all") url.searchParams.set("visibility", params.visibility);
    if (params.startDate) url.searchParams.set("startDate", params.startDate);
    if (params.endDate) url.searchParams.set("endDate", params.endDate);
    if (params.search) url.searchParams.set("search", params.search);
    if (params.sortBy !== "joinedAt") url.searchParams.set("sortBy", params.sortBy);
    if (params.sortDir !== "desc") url.searchParams.set("sortDir", params.sortDir);

    return url.toString();
}

export const useAlbumStore = create<AlbumState>((set, get) => ({
    // Initial State
    albums: [],
    filter: "all",
    searchQuery: "",
    visibilityFilter: "all",
    startDate: "",
    endDate: "",
    sortBy: "albumDate",
    sortDir: "desc",
    cursor: null,
    hasMore: false,
    isLoading: false,
    isLoadingMore: false,
    error: null,

    // Actions
    setFilter: (filter) => {
        set({ filter });
        get().fetchAlbums(true);
    },
    setSearchQuery: (searchQuery) => {
        set({ searchQuery });
        get().fetchAlbums(true);
    },
    setVisibilityFilter: (visibilityFilter) => {
        set({ visibilityFilter });
        get().fetchAlbums(true);
    },
    setDateRange: (startDate, endDate) => {
        set({ startDate, endDate });
        get().fetchAlbums(true);
    },
    setSort: (sortBy, sortDir) => {
        set({ sortBy, sortDir });
        get().fetchAlbums(true);
    },

    fetchAlbums: async (reset = false) => {
        if (get().isLoading) return;
        set({ isLoading: true, error: null });
        if (reset) {
            set({ albums: [], cursor: null, hasMore: false });
        }

        try {
            const { filter, visibilityFilter, startDate, endDate, searchQuery, sortBy, sortDir } = get();
            const url = buildAlbumsUrl({
                cursor: null, // Always fetch first page on reset/params change
                filter,
                visibility: visibilityFilter,
                startDate,
                endDate,
                search: searchQuery,
                sortBy,
                sortDir,
            });

            const res = await fetch(url);
            const data = await res.json();

            set({
                albums: data.albums || [],
                cursor: data.nextCursor || null,
                hasMore: data.hasMore || false,
                isLoading: false,
            });
        } catch (err: any) {
            console.error("Failed to fetch albums:", err);
            set({ isLoading: false, error: err.message });
        }
    },

    loadMore: async () => {
        const { cursor, isLoadingMore, hasMore } = get();
        if (!cursor || isLoadingMore || !hasMore) return;

        set({ isLoadingMore: true });

        try {
            const { filter, visibilityFilter, startDate, endDate, searchQuery, sortBy, sortDir } = get();
            const url = buildAlbumsUrl({
                cursor,
                filter,
                visibility: visibilityFilter,
                startDate,
                endDate,
                search: searchQuery,
                sortBy,
                sortDir,
            });

            const res = await fetch(url);
            const data = await res.json();

            if (data.albums) {
                set((state) => ({
                    albums: [...state.albums, ...data.albums],
                    cursor: data.nextCursor || null,
                    hasMore: data.hasMore || false,
                }));
            }
        } catch (err) {
            console.error("Failed to load more albums:", err);
        } finally {
            set({ isLoadingMore: false });
        }
    },

    toggleFavorite: async (albumId) => {
        const { albums, filter } = get();
        const album = albums.find(a => a.id === albumId);
        if (!album) return;

        // Optimistic update
        const newIsFav = !album.isFavorite;

        // If unfavoriting in favorites view, remove immediately
        if (filter === "favorites" && !newIsFav) {
            set({ albums: albums.filter(a => a.id !== albumId) });
        } else {
            set({
                albums: albums.map(a => a.id === albumId ? { ...a, isFavorite: newIsFav } : a)
            });
        }

        try {
            await fetch(`/api/albums/${albumId}/favorite`, {
                method: "POST",
            });
            // Success - state already updated optimistically
        } catch (error) {
            console.error("Failed to toggle favorite", error);
            // Revert on error
            const { albums: currentAlbums } = get();
            set({
                albums: currentAlbums.map(a => a.id === albumId ? { ...a, isFavorite: album.isFavorite } : a)
            });
            // If in favorites view and we removed it, we might want to refresh to get it back, 
            // but complex to revert "removal" without re-fetching.
            if (filter === "favorites") {
                get().fetchAlbums(true);
            }
        }
    },

    refreshAlbums: async () => {
        await get().fetchAlbums(true);
    }
}));
