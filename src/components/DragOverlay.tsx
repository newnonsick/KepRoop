"use client";

import { useEffect, useRef } from "react";
import { Upload } from "lucide-react";
import { useAlbumDetailStore } from "@/stores/useAlbumDetailStore";

interface DragOverlayProps {
    canEdit: boolean;
    onUpload: (files: FileList) => void;
}

export function DragOverlay({ canEdit, onUpload }: DragOverlayProps) {
    const isDragging = useAlbumDetailStore((state) => state.isDragging);
    const setIsDragging = useAlbumDetailStore((state) => state.setIsDragging);
    const dragCounter = useRef(0);

    useEffect(() => {
        if (!canEdit) return;

        const handleDragEnter = (e: DragEvent) => {
            e.preventDefault();
            // Check if it's a file drag
            if (e.dataTransfer?.types?.includes("Files")) {
                dragCounter.current += 1;
                if (dragCounter.current === 1) {
                    setIsDragging(true);
                }
            }
        };

        const handleDragLeave = (e: DragEvent) => {
            e.preventDefault();
            if (e.dataTransfer?.types?.includes("Files")) {
                dragCounter.current -= 1;
                // Only disable if counter reaches 0 (left the window completely)
                if (dragCounter.current <= 0) {
                    dragCounter.current = 0;
                    setIsDragging(false);
                }
            }
        };

        const handleDragOver = (e: DragEvent) => {
            e.preventDefault();
            // Ensure we stay in dragging state if something reset it wrongly
            // But with counter logic, this is less critical. 
            // Primarily needed to allow the drop (preventDefault is key).
        };

        const handleDrop = (e: DragEvent) => {
            e.preventDefault();
            dragCounter.current = 0;
            setIsDragging(false);

            if (e.dataTransfer?.files?.length) {
                onUpload(e.dataTransfer.files);
            }
        };

        window.addEventListener("dragenter", handleDragEnter, true);
        window.addEventListener("dragleave", handleDragLeave, true);
        window.addEventListener("dragover", handleDragOver, true);
        window.addEventListener("drop", handleDrop, true);

        return () => {
            window.removeEventListener("dragenter", handleDragEnter, true);
            window.removeEventListener("dragleave", handleDragLeave, true);
            window.removeEventListener("dragover", handleDragOver, true);
            window.removeEventListener("drop", handleDrop, true);
        };
    }, [canEdit, setIsDragging, onUpload]);

    if (!isDragging) return null;

    return (
        <div className="fixed inset-0 bg-blue-500/10 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-none">
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-12 shadow-2xl border-2 border-dashed border-blue-400 dark:border-blue-500 text-center animate-in fade-in zoom-in-95 duration-200">
                <Upload className="h-16 w-16 text-blue-500 mx-auto mb-4" />
                <p className="text-xl font-semibold text-slate-800 dark:text-slate-100">Drop photos here</p>
                <p className="text-slate-500 dark:text-slate-400 mt-1">Release to upload</p>
            </div>
        </div>
    );
}
