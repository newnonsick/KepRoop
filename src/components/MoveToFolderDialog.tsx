"use strict";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Folder, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface Folder {
    id: string;
    name: string;
}

interface MoveToFolderDialogProps {
    albumId: string;
    folders: Folder[];
    selectedIds: Set<string>;
    currentFolderId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export function MoveToFolderDialog({
    albumId,
    folders,
    selectedIds,
    currentFolderId,
    open,
    onOpenChange,
    onSuccess
}: MoveToFolderDialogProps) {
    const [loading, setLoading] = useState(false);
    const [targetFolderId, setTargetFolderId] = useState<string | null>(null);
    const router = useRouter();

    const handleMove = async () => {
        // Prevent moving to same folder if that's what's selected (though logic allows null correctly)
        // If currentFolderId is null (root) and target is null (root), or equal
        if (currentFolderId === targetFolderId) {
            toast.info("Images are already in this folder");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/images/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'move',
                    imageIds: Array.from(selectedIds),
                    albumId,
                    targetFolderId,
                }),
            });

            if (!res.ok) throw new Error("Failed to move photos");

            const data = await res.json();
            toast.success(`Moved ${data.movedCount} photos`);
            onSuccess();
            onOpenChange(false);
            router.refresh();
        } catch (error) {
            console.error(error);
            toast.error("Failed to move photos");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md rounded-2xl bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-700 shadow-xl">
                <DialogHeader>
                    <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center mb-2">
                        <FolderOpen className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <DialogTitle className="text-center text-xl font-semibold text-slate-900 dark:text-zinc-100">
                        Move {selectedIds.size} {selectedIds.size === 1 ? 'Photo' : 'Photos'}
                    </DialogTitle>
                    <DialogDescription className="text-center text-slate-500 dark:text-slate-400">
                        Choose a destination folder for your selected photos.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-2 max-h-[300px] overflow-y-auto py-2 px-1">
                    {/* Root Option */}
                    <button
                        onClick={() => setTargetFolderId(null)}
                        className={cn(
                            "flex items-center gap-3 p-3 rounded-xl transition-all border text-left",
                            targetFolderId === null
                                ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                                : "hover:bg-slate-50 dark:hover:bg-slate-800 border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300"
                        )}
                    >
                        <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg">
                            <Folder className={cn("h-5 w-5", targetFolderId === null ? "text-blue-500" : "text-slate-400")} />
                        </div>
                        <span className="font-medium">Album Root (No Folder)</span>
                        {targetFolderId === null && <div className="ml-auto w-2 h-2 rounded-full bg-blue-500" />}
                    </button>

                    {/* Folder Options */}
                    {folders.map(folder => (
                        <button
                            key={folder.id}
                            onClick={() => setTargetFolderId(folder.id)}
                            disabled={folder.id === currentFolderId} // Can't move to *current* folder (already there), but logic handled in handleMove too
                            className={cn(
                                "flex items-center gap-3 p-3 rounded-xl transition-all border text-left",
                                targetFolderId === folder.id
                                    ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                                    : "hover:bg-slate-50 dark:hover:bg-slate-800 border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300",
                                folder.id === currentFolderId && "opacity-50 cursor-default"
                            )}
                        >
                            <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg">
                                <Folder className={cn("h-5 w-5", targetFolderId === folder.id ? "text-blue-500" : "text-slate-400")} />
                            </div>
                            <span className="font-medium">{folder.name}</span>
                            {folder.id === currentFolderId && <span className="ml-auto text-xs text-slate-400">(Current)</span>}
                            {targetFolderId === folder.id && <div className="ml-auto w-2 h-2 rounded-full bg-blue-500" />}
                        </button>
                    ))}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        className="rounded-xl"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleMove}
                        disabled={loading || (targetFolderId === currentFolderId)}
                        className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20"
                    >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Move Photos
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
