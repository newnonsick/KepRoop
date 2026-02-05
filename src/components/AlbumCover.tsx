"use client";

import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlbumCoverProps {
    coverImageUrl?: string | null;
    previewImageUrls?: string[];
    imageCount?: number;
    title: string;
    className?: string;
}

export function AlbumCover({
    coverImageUrl,
    previewImageUrls = [],
    imageCount = 0,
    title,
    className
}: AlbumCoverProps) {
    const hasExplicitCover = !!coverImageUrl && !previewImageUrls.includes(coverImageUrl);

    // Determine if we should show the collage
    // We show collage if no explicit cover is set AND we have multiple images
    const showCollage = !coverImageUrl && previewImageUrls.length > 1;

    return (
        <div className={cn("aspect-[4/3] bg-slate-50 dark:bg-slate-800 relative overflow-hidden group/cover", className)}>
            {coverImageUrl && !showCollage ? (
                /* Single Cover Image */
                <img
                    src={coverImageUrl}
                    alt={title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
            ) : showCollage ? (
                /* Collage Fallback (2x2 Grid) */
                <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-0.5 bg-slate-100 dark:bg-slate-700">
                    {previewImageUrls.slice(0, 4).map((url, i) => (
                        <div key={i} className="relative w-full h-full overflow-hidden bg-slate-200 dark:bg-slate-600">
                            <img
                                src={url}
                                alt={`${title} preview ${i + 1}`}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            />
                            {/* Overlay for +X more on the 4th item if count > 4 */}
                            {i === 3 && imageCount > 4 && (
                                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center">
                                    <span className="text-white font-bold text-sm">+{imageCount - 3}</span>
                                </div>
                            )}
                        </div>
                    ))}
                    {/* Fill remaining slots with placeholders if < 4 images but showing collage */}
                    {[...Array(Math.max(0, 4 - previewImageUrls.length))].map((_, i) => (
                        <div key={`empty-${i}`} className="bg-slate-50 dark:bg-slate-700 flex items-center justify-center">
                            <ImageIcon className="h-4 w-4 text-slate-200 dark:text-slate-500" />
                        </div>
                    ))}
                </div>
            ) : (
                /* Empty State / Single Fallback (if only 1 image) */
                previewImageUrls.length === 1 ? (
                    <img
                        src={previewImageUrls[0]}
                        alt={title}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50/50 to-slate-50 dark:from-blue-900/20 dark:to-slate-800">
                        <ImageIcon className="h-12 w-12 text-blue-200 dark:text-blue-400/30" strokeWidth={1.5} />
                    </div>
                )
            )}
        </div>
    );
}
