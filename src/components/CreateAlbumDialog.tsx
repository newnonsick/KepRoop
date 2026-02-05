"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Globe, Plus, Camera, Image as ImageIcon, X } from "lucide-react";

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

interface CreateAlbumDialogProps {
    trigger?: React.ReactNode;
    onSuccess?: () => void;
}

export function CreateAlbumDialog({ trigger, onSuccess }: CreateAlbumDialogProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [visibility, setVisibility] = useState<"private" | "public">("private");
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);

    const resetForm = () => {
        setTitle("");
        setDescription("");
        setDate(new Date().toISOString().split('T')[0]);
        setVisibility("private");
        setCoverFile(null);
        setCoverPreview(null);
        setError("");
    };

    const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setCoverFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setCoverPreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            setError("Please enter an album name");
            return;
        }

        setLoading(true);
        setError("");

        try {
            let coverImageKey = undefined;

            // 1. Upload cover if exists
            if (coverFile) {
                const resUrl = await fetch("/api/images/upload-url", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contentType: coverFile.type,
                        filename: coverFile.name
                    }),
                });
                const { url, key } = await resUrl.json();

                if (url) {
                    await fetch(url, {
                        method: "PUT",
                        headers: { "Content-Type": coverFile.type },
                        body: coverFile,
                    });
                    coverImageKey = key;
                }
            }

            // 2. Create album
            const res = await fetch("/api/albums", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim(),
                    visibility,
                    date: new Date(date).toISOString(),
                    coverImageKey,
                }),
            });

            if (res.ok) {
                setOpen(false);
                resetForm();
                if (onSuccess) {
                    onSuccess();
                } else {
                    router.refresh();
                }
            } else {
                const data = await res.json();
                setError(data.error || "Failed to create album");
            }
        } catch (err) {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button className="gap-2 bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/35 transition-all rounded-xl">
                        <Plus className="h-4 w-4" />
                        Create album
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md rounded-2xl border-slate-100 shadow-xl bg-white">
                <DialogHeader>
                    <DialogTitle className="text-xl text-slate-800">New album</DialogTitle>
                    <DialogDescription className="text-slate-500">
                        Create a new photo album
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-5 mt-4">
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="title" className="text-sm font-medium text-slate-700">
                            Album name
                        </Label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Summer 2024"
                            disabled={loading}
                            className="h-11 bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-blue-500/20 rounded-xl"
                            autoFocus
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Cover Image <span className="text-slate-400 font-normal">(optional)</span></Label>
                        <div className="relative group/cover aspect-[2/1] bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 transition-all overflow-hidden flex flex-col items-center justify-center cursor-pointer">
                            {coverPreview ? (
                                <>
                                    <img src={coverPreview} alt="Cover preview" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/cover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            className="rounded-xl h-9"
                                            onClick={() => document.getElementById('cover-upload')?.click()}
                                        >
                                            Change
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            size="icon"
                                            className="rounded-xl h-9 w-9"
                                            onClick={(e) => { e.stopPropagation(); setCoverFile(null); setCoverPreview(null); }}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <div
                                    className="flex flex-col items-center gap-2 text-slate-400 group-hover/cover:text-blue-500 w-full h-full justify-center"
                                    onClick={() => document.getElementById('cover-upload')?.click()}
                                >
                                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 shadow-sm flex items-center justify-center group-hover/cover:scale-110 transition-transform">
                                        <Camera className="h-5 w-5" />
                                    </div>
                                    <span className="text-xs font-medium">Upload album cover</span>
                                </div>
                            )}
                            <input
                                id="cover-upload"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleCoverChange}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description" className="text-sm font-medium text-slate-700">
                            Description <span className="text-slate-400 font-normal">(optional)</span>
                        </Label>
                        <Input
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="A collection of memories"
                            disabled={loading}
                            className="h-11 bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-blue-500/20 rounded-xl"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="date" className="text-sm font-medium text-slate-700">
                            Album date
                        </Label>
                        <Input
                            id="date"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            disabled={loading}
                            className="h-11 bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-blue-500/20 rounded-xl"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Visibility</Label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setVisibility("private")}
                                disabled={loading}
                                className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${visibility === "private"
                                    ? "border-blue-500 bg-blue-50"
                                    : "border-slate-200 hover:border-slate-300 bg-white"
                                    }`}
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${visibility === "private" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500"
                                    }`}>
                                    <Lock className="h-4 w-4" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-800">Private</p>
                                    <p className="text-xs text-slate-500">Invite only</p>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setVisibility("public")}
                                disabled={loading}
                                className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${visibility === "public"
                                    ? "border-blue-500 bg-blue-50"
                                    : "border-slate-200 hover:border-slate-300 bg-white"
                                    }`}
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${visibility === "public" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500"
                                    }`}>
                                    <Globe className="h-4 w-4" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-800">Public</p>
                                    <p className="text-xs text-slate-500">Anyone with link</p>
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
                            className="flex-1 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl"
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
                                "Create"
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
