"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface EditAlbumDialogProps {
    album: {
        id: string;
        title: string;
        description?: string | null;
        visibility: "public" | "private";
        albumDate: string;
    };
    trigger?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onSuccess?: () => void;
}

export function EditAlbumDialog({ album, trigger, open: controlledOpen, onOpenChange: setControlledOpen, onSuccess }: EditAlbumDialogProps) {
    const router = useRouter();
    const [internalOpen, setInternalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [title, setTitle] = useState(album.title);
    const [description, setDescription] = useState(album.description || "");
    const [date, setDate] = useState(album.albumDate ? new Date(album.albumDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    const [visibility, setVisibility] = useState<"private" | "public">(album.visibility);

    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = (value: boolean) => {
        if (isControlled) {
            setControlledOpen?.(value);
        } else {
            setInternalOpen(value);
        }
    };

    useEffect(() => {
        if (open) {
            setTitle(album.title);
            setDescription(album.description || "");
            setDate(album.albumDate ? new Date(album.albumDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
            setVisibility(album.visibility);
        }
    }, [open, album]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            setError("Please enter an album name");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const res = await fetch(`/api/albums/${album.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim(),
                    visibility,
                    albumDate: new Date(date).toISOString(),
                }),
            });

            if (res.ok) {
                toast.success("Album updated");
                setOpen(false);
                if (onSuccess) {
                    onSuccess();
                } else {
                    router.refresh();
                }
            } else {
                const data = await res.json();
                setError(data.error || "Failed to update album");
            }
        } catch (err) {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md rounded-2xl border-slate-100 dark:border-slate-700 shadow-xl bg-white dark:bg-slate-900">
                <DialogHeader>
                    <DialogTitle className="text-xl text-slate-800 dark:text-slate-100">Edit Album</DialogTitle>
                    <DialogDescription className="text-slate-500 dark:text-slate-400">
                        Update album details
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-5 mt-4">
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="title" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Album name
                        </Label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            disabled={loading}
                            className="h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:ring-blue-500/20 rounded-xl dark:text-slate-100"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Description <span className="text-slate-400 font-normal">(optional)</span>
                        </Label>
                        <Input
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            disabled={loading}
                            className="h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:ring-blue-500/20 rounded-xl dark:text-slate-100"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="date" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Album date
                        </Label>
                        <Input
                            id="date"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            disabled={loading}
                            className="h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:ring-blue-500/20 rounded-xl dark:text-slate-100"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Visibility</Label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setVisibility("private")}
                                disabled={loading}
                                className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${visibility === "private"
                                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800"
                                    }`}
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${visibility === "private" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500"
                                    }`}>
                                    <Lock className="h-4 w-4" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Private</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Invite only</p>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setVisibility("public")}
                                disabled={loading}
                                className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${visibility === "public"
                                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800"
                                    }`}
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${visibility === "public" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500"
                                    }`}>
                                    <Globe className="h-4 w-4" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Public</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Anyone with link</p>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={loading}
                            className="flex-1 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={loading || !title.trim()}
                            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25 rounded-xl"
                        >
                            {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                "Save Changes"
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
