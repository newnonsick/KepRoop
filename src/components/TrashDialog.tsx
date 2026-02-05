
"use client";

import { useState, useEffect } from "react";
import { Loader2, Trash2, RotateCcw, AlertTriangle, User, History } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface TrashItem {
    id: string;
    url: string;
    deletedAt: string;
    deleterName: string | null;
    deleterAvatar: string | null;
}

interface TrashDialogProps {
    albumId: string;
    userRole: "owner" | "editor" | "viewer" | null;
    onRestore: () => void;
    trigger?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function TrashDialog({ albumId, userRole, onRestore, trigger, open: controlledOpen, onOpenChange }: TrashDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false);

    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = isControlled ? onOpenChange : setInternalOpen;

    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<TrashItem[]>([]);
    const [restoringId, setRestoringId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [emptyTrashConfirmOpen, setEmptyTrashConfirmOpen] = useState(false);

    const isOwner = userRole === "owner";
    const canRestore = userRole === "owner" || userRole === "editor";

    // Safety check for setOpen
    const handleOpenChange = (newOpen: boolean) => {
        if (setOpen) setOpen(newOpen);
    };

    const fetchTrash = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/albums/${albumId}/trash`);
            if (res.ok) {
                const data = await res.json();
                setItems(data.images);
            }
        } catch (error) {
            console.error("Failed to fetch trash", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            fetchTrash();
        }
    }, [open, albumId]);

    const handleRestore = async (imageId: string) => {
        setRestoringId(imageId);
        try {
            const res = await fetch(`/api/images/${imageId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "restore" }),
            });

            if (res.ok) {
                setItems((prev) => prev.filter((item) => item.id !== imageId));
                toast.success("Photo restored");
                onRestore(); // Refresh album view
            } else {
                toast.error("Failed to restore photo");
            }
        } catch (error) {
            toast.error("Error restoring photo");
            console.error("Failed to restore", error);
        } finally {
            setRestoringId(null);
        }
    };

    const handlePermanentDelete = async (imageId: string) => {
        setDeletingId(imageId);
        try {
            const res = await fetch(`/api/albums/${albumId}/trash`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ imageIds: [imageId] }),
            });

            if (res.ok) {
                setItems((prev) => prev.filter((item) => item.id !== imageId));
                toast.success("Photo deleted permanently");
            } else {
                toast.error("Failed to delete photo");
            }
        } catch (error) {
            toast.error("Error deleting photo");
            console.error("Failed to delete", error);
        } finally {
            setDeletingId(null);
        }
    };

    const handleEmptyTrash = async () => {
        if (!isOwner || items.length === 0) return;
        setLoading(true);
        try {
            const ids = items.map(i => i.id);
            const res = await fetch(`/api/albums/${albumId}/trash`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ imageIds: ids }),
            });

            if (res.ok) {
                setItems([]);
                toast.success("Trash emptied");
            } else {
                toast.error("Failed to empty trash");
            }
        } catch (error) {
            toast.error("Error emptying trash");
            console.error("Failed to empty trash", error);
        } finally {
            setLoading(false);
        }
    };

    const getInitials = (name: string) => {
        return name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "??";
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" size="icon">
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl border-slate-100 dark:border-slate-700 shadow-xl p-0 gap-0 overflow-hidden">
                <div className="p-6 pb-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                    <div>
                        <DialogTitle className="text-xl font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <Trash2 className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                            Recycle Bin
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 dark:text-slate-400 mt-1">
                            Manage deleted photos. {items.length} item{items.length !== 1 && 's'} in trash.
                        </DialogDescription>
                    </div>

                    {isOwner && items.length > 0 && (
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setEmptyTrashConfirmOpen(true)}
                            className="bg-red-50 text-red-600 hover:bg-red-100 border-red-100 shadow-none"
                        >
                            Empty Trash
                        </Button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {loading && items.length === 0 ? (
                        <div className="flex justify-center items-center py-20">
                            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
                            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
                                <Trash2 className="h-8 w-8 text-slate-300" />
                            </div>
                            <p className="text-lg font-medium text-slate-600 dark:text-slate-300">Trash is empty</p>
                            <p className="text-sm">Deleted photos will appear here</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {items.map((item) => (
                                <div key={item.id} className="flex gap-4 p-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-100 dark:hover:border-blue-800 hover:shadow-sm transition-all group">
                                    {/* Thumbnail */}
                                    <div className="relative w-20 h-20 shrink-0 bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-600">
                                        <img
                                            src={item.url}
                                            alt="Deleted"
                                            className="w-full h-full object-cover"
                                        />
                                    </div>

                                    {/* Info & Actions */}
                                    <div className="flex-1 flex flex-col justify-between min-w-0">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                                <History className="h-3 w-3" />
                                                <span>{formatDistanceToNow(new Date(item.deletedAt), { addSuffix: true })}</span>
                                            </div>

                                            {item.deleterName && (
                                                <div className="flex items-center gap-1.5">
                                                    <Avatar className="h-4 w-4">
                                                        <AvatarImage src={item.deleterAvatar || undefined} />
                                                        <AvatarFallback className="text-[8px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                                                            {getInitials(item.deleterName)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                                                        {item.deleterName}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 mt-2">
                                            {canRestore && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 px-2 text-xs border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                                                    onClick={() => handleRestore(item.id)}
                                                    disabled={restoringId === item.id}
                                                >
                                                    {restoringId === item.id ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <RotateCcw className="h-3 w-3 mr-1.5" />
                                                            Restore
                                                        </>
                                                    )}
                                                </Button>
                                            )}

                                            {isOwner && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 px-2 text-xs text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 ml-auto"
                                                    onClick={() => handlePermanentDelete(item.id)}
                                                    disabled={deletingId === item.id}
                                                >
                                                    {deletingId === item.id ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-3 w-3" />
                                                    )}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 rounded-b-2xl flex justify-end">
                    <Button variant="outline" onClick={() => setOpen?.(false)} className="rounded-xl border-slate-200 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
                        Close
                    </Button>
                </div>

                <ConfirmDialog
                    open={emptyTrashConfirmOpen}
                    onOpenChange={setEmptyTrashConfirmOpen}
                    title="Empty Trash?"
                    description={`This will permanently delete ${items.length} items. This action cannot be undone.`}
                    variant="destructive"
                    onConfirm={handleEmptyTrash}
                    confirmText="Empty Trash"
                />
            </DialogContent>
        </Dialog>
    );
}
