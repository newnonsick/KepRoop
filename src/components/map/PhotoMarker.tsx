"use client";

import { memo, useState } from "react";

interface PhotoMarkerProps {
    count: number;
    thumbs: string[];
    isSelected?: boolean;
    onClick?: () => void;
}

/**
 * Photo thumbnail marker for the map.
 * - Single photo: shows thumbnail with white border + shadow
 * - Group (2+): shows stacked thumbnails with count badge
 * Includes hover/press animations and dark mode support.
 */
export const PhotoMarker = memo(function PhotoMarker({
    count,
    thumbs,
    isSelected,
    onClick,
}: PhotoMarkerProps) {
    const [hovered, setHovered] = useState(false);

    const mainThumb = thumbs[0];
    const stackThumbs = thumbs.slice(1, 3); // max 2 stacked behind
    const hasMultiple = count > 1;

    // Format count for badge
    const badgeText = count >= 10000 ? `${(count / 1000).toFixed(0)}k` : count.toLocaleString();

    if (!mainThumb) return null;

    return (
        <div
            className="photo-marker-root"
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                position: "relative",
                cursor: "pointer",
                transform: `scale(${hovered ? 1.12 : isSelected ? 1.05 : 1}) translateY(${hovered ? -4 : 0}px)`,
                transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.2s ease",
                filter: hovered ? "drop-shadow(0 8px 20px rgba(0,0,0,0.35))" : "drop-shadow(0 3px 8px rgba(0,0,0,0.25))",
                zIndex: hovered ? 100 : isSelected ? 50 : "auto",
                willChange: "transform",
            }}
        >
            {/* Stacked thumbnails behind (for groups) */}
            {hasMultiple && stackThumbs.length > 0 && (
                <>
                    {stackThumbs.length >= 2 && (
                        <div
                            style={{
                                position: "absolute",
                                top: -4,
                                left: -4,
                                width: 56,
                                height: 56,
                                borderRadius: 10,
                                overflow: "hidden",
                                border: "2px solid rgba(255,255,255,0.7)",
                                transform: "rotate(-8deg)",
                                background: "#1e293b",
                            }}
                        >
                            <img
                                src={stackThumbs[1]}
                                alt=""
                                loading="lazy"
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    display: "block",
                                }}
                            />
                        </div>
                    )}
                    <div
                        style={{
                            position: "absolute",
                            top: -2,
                            left: -2,
                            width: 56,
                            height: 56,
                            borderRadius: 10,
                            overflow: "hidden",
                            border: "2px solid rgba(255,255,255,0.8)",
                            transform: "rotate(-4deg)",
                            background: "#1e293b",
                        }}
                    >
                        <img
                            src={stackThumbs[0]}
                            alt=""
                            loading="lazy"
                            style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                display: "block",
                            }}
                        />
                    </div>
                </>
            )}

            {/* Stacked placeholder behind when only 1 thumb but multiple photos */}
            {hasMultiple && stackThumbs.length === 0 && (
                <div
                    style={{
                        position: "absolute",
                        top: -3,
                        left: -3,
                        width: 56,
                        height: 56,
                        borderRadius: 10,
                        border: "2px solid rgba(255,255,255,0.6)",
                        background: "rgba(30,41,59,0.5)",
                        transform: "rotate(-6deg)",
                    }}
                />
            )}

            {/* Main thumbnail */}
            <div
                style={{
                    position: "relative",
                    width: 56,
                    height: 56,
                    borderRadius: 10,
                    overflow: "hidden",
                    border: isSelected
                        ? "2.5px solid #3b82f6"
                        : "2px solid rgba(255,255,255,0.9)",
                    boxShadow: isSelected
                        ? "0 0 0 3px rgba(59,130,246,0.3)"
                        : "none",
                    background: "#1e293b",
                }}
            >
                <img
                    src={mainThumb}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                    }}
                />
            </div>

            {/* Pointer triangle at bottom */}
            <div
                style={{
                    position: "absolute",
                    bottom: -6,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 0,
                    height: 0,
                    borderLeft: "6px solid transparent",
                    borderRight: "6px solid transparent",
                    borderTop: isSelected
                        ? "6px solid #3b82f6"
                        : "6px solid rgba(255,255,255,0.9)",
                }}
            />

            {/* Count badge (only for groups) */}
            {hasMultiple && (
                <div
                    style={{
                        position: "absolute",
                        top: -8,
                        right: -8,
                        minWidth: 22,
                        height: 22,
                        padding: "0 6px",
                        borderRadius: 11,
                        background: "#3b82f6",
                        color: "#ffffff",
                        fontSize: 11,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "2px solid rgba(255,255,255,0.9)",
                        lineHeight: 1,
                        fontFamily: "system-ui, -apple-system, sans-serif",
                        letterSpacing: "-0.01em",
                        boxShadow: "0 2px 6px rgba(59,130,246,0.4)",
                    }}
                >
                    {badgeText}
                </div>
            )}
        </div>
    );
});
