import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface TimelinePhoto {
    id: string;
    albumId: string;
    albumTitle?: string;
    url: string;
    thumbUrl: string | null;
    displayUrl: string | null;
    originalUrl: string | null;
    width: number | null;
    height: number | null;
    dateTaken: string | Date | null;
}

interface TimelineStore {
    photos: TimelinePhoto[];
    monthCounts: Record<string, number>;
    nextCursor: string | null;
    hasMore: boolean;
    isLoading: boolean;
    isLoadingMore: boolean;
    error: string | null;

    groupBy: 'month' | 'date';

    // Actions
    fetchTimeline: () => Promise<void>;
    loadMore: () => Promise<void>;
    setGroupBy: (groupBy: 'month' | 'date') => void;
    reset: () => void;
}

export const useTimelineStore = create<TimelineStore>()(
    persist(
        (set, get) => ({
            photos: [],
            monthCounts: {},
            nextCursor: null,
            hasMore: false,
            isLoading: false,
            isLoadingMore: false,
            error: null,
            groupBy: 'month',

            fetchTimeline: async () => {
                if (get().isLoading) return;
                set({ isLoading: true, error: null, photos: [], monthCounts: {}, nextCursor: null, hasMore: false });
                try {
                    const res = await fetch(`/api/timeline?limit=50`);
                    if (!res.ok) throw new Error("Failed to fetch timeline");

                    const data = await res.json();
                    set({
                        photos: data.photos,
                        monthCounts: data.monthCounts || {},
                        nextCursor: data.nextCursor,
                        hasMore: data.hasMore,
                        isLoading: false,
                    });
                } catch (error: any) {
                    console.error("Timeline error:", error);
                    set({ error: error.message, isLoading: false });
                }
            },

            loadMore: async () => {
                const { nextCursor, hasMore, isLoadingMore, photos } = get();

                // Prevent duplicate requests
                if (!hasMore || isLoadingMore || !nextCursor) return;

                set({ isLoadingMore: true, error: null });
                try {
                    const res = await fetch(`/api/timeline?limit=50&cursor=${encodeURIComponent(nextCursor)}`);
                    if (!res.ok) throw new Error("Failed to load more photos");

                    const data = await res.json();
                    set({
                        photos: [...photos, ...data.photos],
                        nextCursor: data.nextCursor,
                        hasMore: data.hasMore,
                    });
                    // Small delay so IntersectionObserver registers out-of-view before allowing next fetch
                    setTimeout(() => set({ isLoadingMore: false }), 150);
                } catch (error: any) {
                    console.error("Timeline load more error:", error);
                    set({ error: error.message, isLoadingMore: false });
                }
            },

            setGroupBy: (groupBy) => set({ groupBy }),

            reset: () => {
                set({
                    photos: [],
                    monthCounts: {},
                    nextCursor: null,
                    hasMore: false,
                    isLoading: false,
                    isLoadingMore: false,
                    error: null,
                });
            }
        }),
        {
            name: 'timeline-store',
            partialize: (state) => ({ groupBy: state.groupBy }),
        }
    )
);
