"use strict";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface DeleteFolderDialogProps {
    albumId: string;
    folder: { id: string; name: string };
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onFolderDeleted: () => void;
}

export function DeleteFolderDialog({ albumId, folder, open, onOpenChange, onFolderDeleted }: DeleteFolderDialogProps) {
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleDelete = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/albums/${albumId}/folders/${folder.id}`, {
                method: "DELETE",
            });

            if (!res.ok) throw new Error("Failed to delete folder");

            toast.success("Folder deleted");
            onOpenChange(false);
            onFolderDeleted();
            router.refresh();
        } catch (error) {
            console.error(error);
            toast.error("Failed to delete folder");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md rounded-2xl bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-xl">
                <DialogHeader className="space-y-3">
                    <div className="mx-auto w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-2">
                        <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
                    </div>
                    <DialogTitle className="text-center text-xl font-semibold text-slate-900 dark:text-zinc-100">Delete Folder?</DialogTitle>
                    <DialogDescription className="text-center text-slate-500 dark:text-slate-400">
                        Are you sure you want to delete <span className="font-medium text-slate-900 dark:text-slate-200">"{folder.name}"</span>?
                    </DialogDescription>

                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 mt-2 flex gap-3 text-left">
                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                            Photos inside this folder will <strong>not be deleted</strong>. They will be moved to the main album view.
                        </p>
                    </div>
                </DialogHeader>
                <div className="flex gap-3 pt-4">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        className="flex-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={handleDelete}
                        disabled={loading}
                        className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20"
                    >
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Delete Folder
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
