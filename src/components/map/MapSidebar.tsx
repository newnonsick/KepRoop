"use client";

import { useEffect, useRef, memo, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Loader2, ExternalLink, Calendar, Folder } from "lucide-react";
import { useMapStore, type SidebarPhoto } from "@/stores/useMapStore";

/**
 * Collapsible sidebar panel that displays photos in the current map viewport.
 * Features:
 * - Smooth slide-in/out animation
 * - Photo preview cards with album deep-links
 * - Click a photo → map flies to it + marker highlights
 * - Map marker click → sidebar scrolls to matching photo
 * - Dark mode support
 * - Only scrolls via explicit user input (wheel/touch), no hover-scroll
 */
export function MapSidebar() {
    const {
        sidebarPhotos: photos,
        sidebarLoading: loading,
        sidebarOpen: isOpen,
        highlightedPhotoId,
        highlightSource,
        setSidebarOpen,
        setHighlightedPhotoId,
    } = useMapStore();

    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll sidebar ONLY when highlight comes from the map (marker click)
    // Never scroll when highlight comes from sidebar click (user is already looking at it)
    useEffect(() => {
        if (!highlightedPhotoId || highlightSource !== "map" || !scrollRef.current) return;
        // Small delay to ensure the DOM has rendered
        const timeout = setTimeout(() => {
            const el = scrollRef.current?.querySelector(`[data-photo-id="${highlightedPhotoId}"]`);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }, 100);
        return () => clearTimeout(timeout);
    }, [highlightedPhotoId, highlightSource]);

    const toggleSidebar = useCallback(() => setSidebarOpen(!isOpen), [isOpen, setSidebarOpen]);

    // Handle photo click in sidebar → fly map to location
    const handlePhotoClick = useCallback((photo: SidebarPhoto) => {
        setHighlightedPhotoId(photo.id, "sidebar");
    }, [setHighlightedPhotoId]);

    return (
        <>
            {/* Toggle button (always visible) */}
            <button
                onClick={toggleSidebar}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-7 h-14 rounded-l-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border border-r-0 border-slate-200/60 dark:border-slate-700/60 shadow-lg hover:bg-white dark:hover:bg-slate-800 transition-all group"
                style={{
                    right: isOpen ? 380 : 0,
                    transition: "right 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
                aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
                {isOpen ? (
                    <ChevronRight className="h-4 w-4 text-slate-500 dark:text-slate-400 group-hover:text-blue-500 transition-colors" />
                ) : (
                    <ChevronLeft className="h-4 w-4 text-slate-500 dark:text-slate-400 group-hover:text-blue-500 transition-colors" />
                )}
            </button>

            {/* Sidebar panel */}
            <div
                className="absolute top-0 right-0 h-full z-10 flex flex-col bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-l border-slate-200/60 dark:border-slate-700/60 shadow-2xl"
                style={{
                    width: 380,
                    transform: isOpen ? "translateX(0)" : "translateX(100%)",
                    transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
            >
                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30">
                        <ImageIcon className="h-5 w-5 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                            Photos in View
                        </h2>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                            {loading ? "Loading..." : `${photos.length} photo${photos.length !== 1 ? "s" : ""}`}
                        </p>
                    </div>
                </div>

                {/* Photo list — only scrolls via user input (wheel / touch) */}
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto overscroll-contain"
                    style={{ scrollbarWidth: "thin" }}
                >
                    {loading && photos.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-64 gap-3">
                            <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
                            <span className="text-sm text-slate-400 dark:text-slate-500">Loading photos...</span>
                        </div>
                    )}

                    {!loading && photos.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-64 gap-3 px-6 text-center">
                            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                <ImageIcon className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                            </div>
                            <p className="text-sm text-slate-400 dark:text-slate-500">
                                No geotagged photos in this area
                            </p>
                            <p className="text-xs text-slate-300 dark:text-slate-600">
                                Try zooming out or panning to a different location
                            </p>
                        </div>
                    )}

                    <div className="p-3 space-y-2">
                        {photos.map((photo) => (
                            <PhotoCard
                                key={photo.id}
                                photo={photo}
                                isHighlighted={highlightedPhotoId === photo.id}
                                onClick={handlePhotoClick}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}

/**
 * Individual photo card in the sidebar.
 * Click to fly the map to this photo's location and highlight its marker.
 * No hover-based auto-scroll — only explicit click interaction.
 */
const PhotoCard = memo(function PhotoCard({
    photo,
    isHighlighted,
    onClick,
}: {
    photo: SidebarPhoto;
    isHighlighted: boolean;
    onClick: (photo: SidebarPhoto) => void;
}) {
    const formattedDate = photo.dateTaken
        ? new Date(photo.dateTaken).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        })
        : null;

    return (
        <div
            data-photo-id={photo.id}
            className={`
                group relative rounded-2xl overflow-hidden border transition-all duration-200 cursor-pointer
                ${isHighlighted
                    ? "border-blue-400 dark:border-blue-500 ring-2 ring-blue-400/30 dark:ring-blue-500/20 shadow-lg shadow-blue-500/10"
                    : "border-slate-200/70 dark:border-slate-700/70 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md"
                }
                bg-white dark:bg-slate-800/80
            `}
            onClick={() => onClick(photo)}
        >
            {/* Photo preview — aspect-ratio preserved */}
            <div className="relative w-full" style={{ aspectRatio: Math.max(photo.width / photo.height, 0.75).toString() }}>
                <img
                    src={photo.displayUrl || photo.thumbUrl}
                    alt={photo.filename || "Photo"}
                    loading="lazy"
                    className="w-full h-full object-cover"
                />

                {/* Gradient overlay at bottom for text readability */}
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />

                {/* Date badge */}
                {formattedDate && (
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/40 backdrop-blur-sm">
                        <Calendar className="h-3 w-3 text-white/80" />
                        <span className="text-[11px] font-medium text-white/90">{formattedDate}</span>
                    </div>
                )}
            </div>

            {/* Info strip */}
            <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Folder className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
                        {photo.albumTitle}
                    </span>
                </div>
                <Link
                    href={`/albums/${photo.albumId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-[11px] font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                >
                    Open
                    <ExternalLink className="h-3 w-3" />
                </Link>
            </div>
        </div>
    );
});
