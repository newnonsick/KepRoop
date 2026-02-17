"use strict";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Edit2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface EditFolderDialogProps {
    albumId: string;
    folder: { id: string; name: string };
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onFolderUpdated: () => void;
}

export function EditFolderDialog({ albumId, folder, open, onOpenChange, onFolderUpdated }: EditFolderDialogProps) {
    const [name, setName] = useState(folder.name);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setLoading(true);
        try {
            const res = await fetch(`/api/albums/${albumId}/folders/${folder.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim() }),
            });

            if (!res.ok) throw new Error("Failed to update folder");

            toast.success("Folder renamed successfully");
            onOpenChange(false);
            onFolderUpdated();
            router.refresh();
        } catch (error) {
            console.error(error);
            toast.error("Failed to rename folder");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md rounded-2xl bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-xl">
                <DialogHeader className="space-y-3">
                    <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center mb-2">
                        <Edit2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <DialogTitle className="text-center text-xl font-semibold text-slate-900 dark:text-zinc-100">Rename Folder</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6 pt-2">
                    <div className="space-y-2">
                        <Label htmlFor="edit-name" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Folder Name
                        </Label>
                        <Input
                            id="edit-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Folder Name"
                            className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:ring-blue-500 rounded-xl"
                            autoFocus
                        />
                    </div>
                    <div className="flex gap-3">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            className="flex-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={loading || !name.trim() || name === folder.name}
                            className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
                        >
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Save Changes
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
