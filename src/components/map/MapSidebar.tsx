"use client";

import { useEffect, useRef, memo, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Image as ImageIcon, Loader2, ExternalLink, Calendar, Folder, X } from "lucide-react";
import { useMapStore, type SidebarPhoto } from "@/stores/useMapStore";

/**
 * Collapsible sidebar panel that displays photos in the current map viewport.
 * 
 * Responsive layout:
 * - Desktop (≥1024px): 380px sidebar on the right edge
 * - Tablet (768–1023px): 320px sidebar on the right edge 
 * - Mobile (<768px): Bottom sheet, full-width, 55vh tall
 */

// Breakpoint constants matching Tailwind defaults
const MOBILE_BP = 768;

function useIsMobile() {
    // SSR-safe: default to false, then check on mount
    const ref = useRef(false);
    const getIsMobile = useCallback(() => {
        if (typeof window === "undefined") return false;
        return window.innerWidth < MOBILE_BP;
    }, []);

    // We use a ref + force update pattern for performance (avoids re-renders on every resize).
    // The component re-renders on sidebarOpen changes anyway, which re-checks.
    ref.current = getIsMobile();
    return ref.current;
}

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
    const isMobile = useIsMobile();

    // Auto-scroll sidebar ONLY when highlight comes from the map (marker click)
    useEffect(() => {
        if (!highlightedPhotoId || highlightSource !== "map" || !scrollRef.current) return;
        const timeout = setTimeout(() => {
            const el = scrollRef.current?.querySelector(`[data-photo-id="${highlightedPhotoId}"]`);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }, 100);
        return () => clearTimeout(timeout);
    }, [highlightedPhotoId, highlightSource]);

    const toggleSidebar = useCallback(() => setSidebarOpen(!isOpen), [isOpen, setSidebarOpen]);

    const handlePhotoClick = useCallback((photo: SidebarPhoto) => {
        setHighlightedPhotoId(photo.id, "sidebar");
    }, [setHighlightedPhotoId]);

    // --- Mobile layout: bottom sheet ---
    if (isMobile) {
        return (
            <>
                {/* Mobile toggle — bottom-right pill */}
                <button
                    onClick={toggleSidebar}
                    className="absolute bottom-4 right-4 z-20 flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 shadow-lg active:scale-95 transition-transform"
                    style={{
                        display: isOpen ? "none" : "flex",
                    }}
                    aria-label="Show photos"
                >
                    <ImageIcon className="h-4 w-4 text-blue-500" />
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {photos.length} photos
                    </span>
                    <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                </button>

                {/* Bottom sheet */}
                <div
                    className="absolute inset-x-0 bottom-0 z-30 flex flex-col bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-t-3xl shadow-2xl border-t border-slate-200/60 dark:border-slate-700/60"
                    style={{
                        height: "55vh",
                        transform: isOpen ? "translateY(0)" : "translateY(100%)",
                        transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                >
                    {/* Drag handle + header */}
                    <div className="flex flex-col items-center pt-2 pb-1">
                        <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mb-2" />
                    </div>
                    <div className="flex items-center gap-3 px-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/30">
                            <ImageIcon className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                Photos in View
                            </h2>
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                                {loading ? "Loading..." : `${photos.length} photo${photos.length !== 1 ? "s" : ""}`}
                            </p>
                        </div>
                        <button
                            onClick={toggleSidebar}
                            className="flex items-center justify-center w-8 h-8 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            aria-label="Close"
                        >
                            <X className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                        </button>
                    </div>

                    {/* Photo grid — horizontal scroll on mobile */}
                    <div
                        ref={scrollRef}
                        className="flex-1 overflow-y-auto overscroll-contain"
                        style={{ scrollbarWidth: "thin", WebkitOverflowScrolling: "touch" }}
                    >
                        {loading && photos.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-40 gap-2">
                                <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                                <span className="text-xs text-slate-400 dark:text-slate-500">Loading photos...</span>
                            </div>
                        )}

                        {!loading && photos.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-40 gap-2 px-6 text-center">
                                <ImageIcon className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                                <p className="text-xs text-slate-400 dark:text-slate-500">
                                    No geotagged photos in this area
                                </p>
                            </div>
                        )}

                        {/* 2-column grid for mobile */}
                        <div className="p-3 grid grid-cols-2 gap-2">
                            {photos.map((photo) => (
                                <PhotoCard
                                    key={photo.id}
                                    photo={photo}
                                    isHighlighted={highlightedPhotoId === photo.id}
                                    onClick={handlePhotoClick}
                                    compact
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </>
        );
    }

    // --- Desktop / Tablet layout: right sidebar ---
    return (
        <>
            {/* Toggle button (always visible) */}
            <button
                onClick={toggleSidebar}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-7 h-14 rounded-l-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border border-r-0 border-slate-200/60 dark:border-slate-700/60 shadow-lg hover:bg-white dark:hover:bg-slate-800 transition-all group"
                style={{
                    right: isOpen ? "var(--sidebar-width)" : 0,
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

            {/* Sidebar panel — width adapts: 320px tablet, 380px desktop */}
            <div
                className="absolute top-0 right-0 h-full z-10 flex flex-col bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-l border-slate-200/60 dark:border-slate-700/60 shadow-2xl"
                style={{
                    width: "var(--sidebar-width)",
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

                {/* Photo list */}
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
 * compact=true: smaller card for mobile grid layout.
 */
const PhotoCard = memo(function PhotoCard({
    photo,
    isHighlighted,
    onClick,
    compact = false,
}: {
    photo: SidebarPhoto;
    isHighlighted: boolean;
    onClick: (photo: SidebarPhoto) => void;
    compact?: boolean;
}) {
    const formattedDate = photo.dateTaken
        ? new Date(photo.dateTaken).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: compact ? undefined : "numeric",
        })
        : null;

    return (
        <div
            data-photo-id={photo.id}
            className={`
                group relative overflow-hidden border transition-all duration-200 cursor-pointer
                ${compact ? "rounded-xl" : "rounded-2xl"}
                ${isHighlighted
                    ? "border-blue-400 dark:border-blue-500 ring-2 ring-blue-400/30 dark:ring-blue-500/20 shadow-lg shadow-blue-500/10"
                    : "border-slate-200/70 dark:border-slate-700/70 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md"
                }
                bg-white dark:bg-slate-800/80
            `}
            onClick={() => onClick(photo)}
        >
            {/* Photo preview — aspect-ratio preserved */}
            <div
                className="relative w-full"
                style={{
                    aspectRatio: compact
                        ? "1"
                        : Math.max(photo.width / photo.height, 0.75).toString(),
                }}
            >
                <img
                    src={compact ? photo.thumbUrl : (photo.displayUrl || photo.thumbUrl)}
                    alt={photo.filename || "Photo"}
                    loading="lazy"
                    className="w-full h-full object-cover"
                />

                {/* Gradient overlay */}
                <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none ${compact ? "h-12" : "h-20"}`} />

                {/* Date badge */}
                {formattedDate && (
                    <div className={`absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-lg bg-black/40 backdrop-blur-sm ${compact ? "px-1.5 py-0.5" : "px-2 py-1"}`}>
                        <Calendar className={compact ? "h-2.5 w-2.5 text-white/80" : "h-3 w-3 text-white/80"} />
                        <span className={`font-medium text-white/90 ${compact ? "text-[9px]" : "text-[11px]"}`}>{formattedDate}</span>
                    </div>
                )}
            </div>

            {/* Info strip */}
            <div className={`flex items-center justify-between gap-1 ${compact ? "px-2 py-1.5" : "px-3 py-2.5 gap-2"}`}>
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <Folder className={`text-slate-400 dark:text-slate-500 flex-shrink-0 ${compact ? "h-3 w-3" : "h-3.5 w-3.5"}`} />
                    <span className={`font-medium text-slate-600 dark:text-slate-300 truncate ${compact ? "text-[10px]" : "text-xs"}`}>
                        {photo.albumTitle}
                    </span>
                </div>
                <Link
                    href={`/albums/${photo.albumId}`}
                    onClick={(e) => e.stopPropagation()}
                    className={`flex items-center gap-1 font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors flex-shrink-0 ${compact ? "text-[10px] opacity-100" : "text-[11px] opacity-100 lg:opacity-0 lg:group-hover:opacity-100"}`}
                >
                    Open
                    <ExternalLink className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
                </Link>
            </div>
        </div>
    );
});
