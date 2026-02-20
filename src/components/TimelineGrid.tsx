"use client";

import { useEffect, useCallback, useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { useInView } from "react-intersection-observer";
import { Loader2, Calendar, ArrowLeft, X, Download, LayoutGrid, CalendarDays, ExternalLink } from "lucide-react";

import { useTimelineStore, TimelinePhoto } from "@/stores/useTimelineStore";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import Link from 'next/link';

// Helper to group photos
function groupPhotos(photos: TimelinePhoto[], groupBy: 'month' | 'date') {
    const groups: { [key: string]: { label: string; photos: TimelinePhoto[] } } = {};

    photos.forEach(photo => {
        let key = "unknown";
        let label = "Unknown Date";

        if (photo.dateTaken) {
            const date = new Date(photo.dateTaken);
            if (groupBy === 'month') {
                key = format(date, "yyyy-MM");
                label = format(date, "MMMM yyyy");
            } else {
                key = format(date, "yyyy-MM-dd");
                label = format(date, "MMM dd, yyyy");
            }
        }

        if (!groups[key]) {
            groups[key] = { label, photos: [] };
        }
        groups[key].photos.push(photo);
    });

    return groups;
}

export function TimelineGrid() {
    const {
        photos,
        monthCounts,
        hasMore,
        isLoading,
        isLoadingMore,
        fetchTimeline,
        loadMore,
        groupBy,
        setGroupBy,
        reset
    } = useTimelineStore();

    // Intersection Observer for Infinite Scroll trigger
    const { ref: observerRef, inView } = useInView({
        threshold: 0,
        rootMargin: "400px", // Trigger earlier before hitting the actual bottom
    });

    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

    // Keyboard Navigation & Auto Load More
    useEffect(() => {
        if (selectedImageIndex === null) return;

        // Auto load more if we are near the end of the list
        if (selectedImageIndex >= photos.length - 5 && hasMore && !isLoadingMore) {
            loadMore();
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight") {
                setSelectedImageIndex((prev) => {
                    if (prev === null) return 0;
                    if (prev === photos.length - 1) {
                        return hasMore ? prev : 0; // Don't loop if we might be loading more
                    }
                    return prev + 1;
                });
            }
            if (e.key === "ArrowLeft") {
                setSelectedImageIndex((prev) => (prev === null || prev === 0 ? photos.length - 1 : prev - 1));
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedImageIndex, photos.length, hasMore, isLoadingMore, loadMore]);

    async function handleDownload(imageId: string, fallbackUrl: string | null) {
        try {
            let url = fallbackUrl;
            let filename = `photo-${imageId}.webp`;

            try {
                const res = await fetch(`/api/images/${imageId}/download-url`);
                if (res.ok) {
                    const data = await res.json();
                    url = data.url;
                    filename = data.filename;
                }
            } catch (e) {
                console.warn("Failed to get fresh download URL, trying fallback", e);
            }

            if (!url) return;

            const res = await fetch(url);
            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
        } catch (err) {
            if (fallbackUrl) window.open(fallbackUrl, '_blank');
        }
    }

    // Handle initial fetch
    useEffect(() => {
        if (photos.length === 0) {
            fetchTimeline();
        }
    }, [fetchTimeline, photos.length]);

    // Handle infinite scroll loading
    useEffect(() => {
        if (inView && hasMore && !isLoading && !isLoadingMore) {
            loadMore();
        }
    }, [inView, hasMore, isLoading, isLoadingMore, loadMore]);


    if (isLoading && photos.length === 0) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!isLoading && photos.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 dark:text-slate-400">
                <Calendar className="h-12 w-12 mb-4 text-slate-300 dark:text-slate-600" />
                <h3 className="text-xl font-medium text-slate-800 dark:text-slate-200">No photos found</h3>
                <p>Upload some photos to see your timeline!</p>
            </div>
        );
    }

    const groupedPhotos = groupPhotos(photos, groupBy);

    return (
        <div className="space-y-12 pb-20">
            {/* View Toggle */}
            <div className="flex justify-end mb-4">
                <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                    <button
                        onClick={() => setGroupBy('month')}
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                            groupBy === 'month'
                                ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        )}
                        title="Group by Month"
                    >
                        <LayoutGrid className="h-4 w-4" />
                        <span className="hidden sm:inline">Month</span>
                    </button>
                    <button
                        onClick={() => setGroupBy('date')}
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                            groupBy === 'date'
                                ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        )}
                        title="Group by Date"
                    >
                        <CalendarDays className="h-4 w-4" />
                        <span className="hidden sm:inline">Day</span>
                    </button>
                </div>
            </div>

            {Object.entries(groupedPhotos).map(([key, group]) => (
                <div key={key} className="space-y-4">
                    {/* Sticky Date Header */}
                    <div className="sticky top-16 z-20 backdrop-blur-md bg-white/80 dark:bg-slate-950/80 py-4 -mx-4 px-4 sm:mx-0 sm:px-0 border-b border-transparent flex justify-between items-end">
                        <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            {group.label}
                            <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
                                {groupBy === 'month' ? (monthCounts[key] || group.photos.length) : group.photos.length} {(groupBy === 'month' ? (monthCounts[key] || group.photos.length) : group.photos.length) === 1 ? 'photo' : 'photos'}
                            </span>
                        </h2>
                    </div>

                    {/* Justified Grid Layout roughly approximated with flex wrap */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4 auto-rows-[200px]">
                        {group.photos.map((photo) => (
                            <button
                                key={photo.id}
                                onClick={() => {
                                    // Find index in global photos array
                                    const index = photos.findIndex(p => p.id === photo.id);
                                    if (index !== -1) setSelectedImageIndex(index);
                                }}
                                className="relative rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 group hover:ring-4 hover:ring-blue-500/50 transition-all cursor-zoom-in h-full outline-none"
                            >
                                <img
                                    src={photo.url}
                                    alt="Timeline photo"
                                    loading="lazy"
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                                {/* Optional Overlay on hover */}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
                            </button>
                        ))}
                    </div>
                </div>
            ))}

            {/* Loading / End Trigger */}
            <div
                ref={observerRef}
                className={cn(
                    "flex justify-center items-center py-8",
                    !hasMore && "text-slate-400 text-sm"
                )}
            >
                {isLoadingMore ? (
                    <div className="flex items-center gap-2 text-blue-500">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-sm font-medium">Loading more memories...</span>
                    </div>
                ) : !hasMore && photos.length > 0 ? (
                    "You've reached the end of your timeline."
                ) : null}
            </div>

            {/* Centralized Photo Viewer Dialog */}
            <Dialog open={selectedImageIndex !== null} onOpenChange={(open) => !open && setSelectedImageIndex(null)}>
                <DialogContent className="max-w-7xl p-0 border-0 bg-transparent shadow-none focus:outline-none h-screen w-screen flex flex-col justify-center pointer-events-none">
                    <VisuallyHidden>
                        <DialogTitle>Photo Viewer</DialogTitle>
                    </VisuallyHidden>
                    <div className="relative w-full h-full flex items-center justify-center pointer-events-auto">
                        {/* Top Right Controls */}
                        <div className="absolute right-4 top-4 z-50 flex items-center gap-2">
                            {/* Go to Album Button */}
                            {selectedImageIndex !== null && photos[selectedImageIndex]?.albumId && (
                                <Link
                                    href={`/albums/${photos[selectedImageIndex].albumId}`}
                                    className="p-3 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white transition-all shadow-lg border border-white/20 group flex items-center gap-2"
                                    title="View in Album"
                                >
                                    <ExternalLink className="h-5 w-5" />
                                </Link>
                            )}

                            {/* Download Button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (selectedImageIndex !== null) {
                                        const img = photos[selectedImageIndex];
                                        handleDownload(img.id, img.originalUrl || img.displayUrl || img.url);
                                    }
                                }}
                                className="p-3 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white transition-all shadow-lg border border-white/20 group"
                                title="Download original"
                            >
                                <Download className="h-5 w-5" />
                            </button>

                            {/* Close Button */}
                            <button
                                onClick={() => setSelectedImageIndex(null)}
                                className="p-3 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white transition-all shadow-lg border border-white/20 group hover:rotate-90"
                                aria-label="Close viewer"
                            >
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        {/* Previous Button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedImageIndex((prev) => (prev === null || prev === 0 ? photos.length - 1 : prev - 1));
                            }}
                            className="absolute left-4 top-1/2 -translate-y-1/2 z-50 p-4 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white transition-all shadow-lg border border-white/20 group"
                            aria-label="Previous photo"
                        >
                            <ArrowLeft className="h-8 w-8 group-hover:scale-110 transition-transform" />
                        </button>

                        {/* Next Button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedImageIndex((prev) => {
                                    if (prev === null) return 0;
                                    if (prev === photos.length - 1) {
                                        return hasMore ? prev : 0;
                                    }
                                    return prev + 1;
                                });
                            }}
                            className="absolute right-4 top-1/2 -translate-y-1/2 z-50 p-4 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white transition-all shadow-lg border border-white/20 group"
                            aria-label="Next photo"
                        >
                            <ArrowLeft className="h-8 w-8 rotate-180 group-hover:scale-110 transition-transform" />
                        </button>

                        {/* Image Display */}
                        {selectedImageIndex !== null && photos[selectedImageIndex] && (
                            <div className="relative w-full h-full flex items-center justify-center p-4 md:p-12">
                                <img
                                    src={photos[selectedImageIndex].displayUrl || photos[selectedImageIndex].url}
                                    alt=""
                                    className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
                                />
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/50 backdrop-blur-md rounded-full text-white text-sm flex items-center gap-3">
                                    <span>{selectedImageIndex + 1} / {photos.length}</span>
                                    {photos[selectedImageIndex].dateTaken && (
                                        <span className="text-white/70">
                                            {new Date(photos[selectedImageIndex].dateTaken!).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
