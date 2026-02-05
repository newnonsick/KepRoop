"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, Globe, Plus, Upload, Loader2, Image as ImageIcon, Trash2, Star, Download, MoreVertical, LogOut, UserMinus, Camera, X } from "lucide-react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { useAuth } from "@/components/providers/AuthProvider";

import { DashboardNavbar } from "@/components/DashboardNavbar";
import { ShareAlbumDialog } from "@/components/ShareAlbumDialog";
import { EditAlbumDialog } from "@/components/EditAlbumDialog";
import { TrashDialog } from "@/components/TrashDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface Image {
    id: string;
    s3Key: string;
    url?: string;
    width?: number;
    height?: number;
    createdAt: string;
}

interface Album {
    id: string;
    title: string;
    description?: string;
    visibility: "public" | "private";
    ownerId: string;
    coverImageId?: string;
    images?: Image[];
}

type UserRole = "owner" | "editor" | "viewer" | null;

export default function AlbumDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const resolvedParams = use(params);
    const albumId = resolvedParams.id;

    const { data: albumData, error: albumError, isLoading: albumLoading, mutate: mutateAlbum } = useSWR(`/api/albums/${albumId}`, fetcher);
    const { user, isLoading: authLoading } = useAuth();

    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, fileName: '', percent: 0 });
    const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
    const [deletingAlbum, setDeletingAlbum] = useState(false);
    const [editingAlbum, setEditingAlbum] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [trashOpen, setTrashOpen] = useState(false);
    const [deleteAlbumConfirmOpen, setDeleteAlbumConfirmOpen] = useState(false);
    const [leaveAlbumConfirmOpen, setLeaveAlbumConfirmOpen] = useState(false);
    const [deleteImageConfirmId, setDeleteImageConfirmId] = useState<string | null>(null);

    const album = albumData?.album || null;
    const userRole = albumData?.userRole || null;
    const loading = albumLoading || authLoading;

    const canEdit = userRole === "owner" || userRole === "editor";
    const isOwner = userRole === "owner";

    async function handleDeleteAlbum() {
        setDeletingAlbum(true);
        try {
            const res = await fetch(`/api/albums/${albumId}`, { method: "DELETE" });
            if (res.ok) {
                toast.success("Album deleted");
                router.push("/dashboard");
            } else {
                toast.error("Failed to delete album");
            }
        } catch (err) {
            toast.error("Error deleting album");
        } finally {
            setDeletingAlbum(false);
        }
    }

    async function handleLeaveAlbum() {
        try {
            const currentUserId = user?.id;

            if (!currentUserId) {
                toast.error("Failed to identify user");
                return;
            }

            const res = await fetch(`/api/albums/${albumId}/members/${currentUserId}`, {
                method: "DELETE",
            });

            if (res.ok) {
                toast.success("You left the gallery");
                router.push("/dashboard");
                router.refresh();
            } else {
                const data = await res.json();
                toast.error(data.error || "Failed to leave gallery");
            }
        } catch (err) {
            toast.error("Error leaving gallery");
        }
    }

    const refreshAlbum = () => mutateAlbum();


    async function uploadSingleFile(file: File, index: number, total: number) {
        const filename = file.name;
        const contentType = file.type;

        // Update progress
        const updateProgress = (percent: number) => {
            setUploadProgress({ current: index + 1, total, fileName: filename, percent });
        };

        try {
            updateProgress(20);
            const resUrl = await fetch("/api/images/upload-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ albumId, contentType, filename }),
            });
            const { url, key } = await resUrl.json();

            if (!url) throw new Error("Failed to get upload URL");

            updateProgress(50);
            await fetch(url, {
                method: "PUT",
                headers: { "Content-Type": contentType },
                body: file,
            });

            updateProgress(80);

            // Get image dimensions
            const img = new window.Image();
            img.src = URL.createObjectURL(file);
            await new Promise((resolve) => { img.onload = resolve; });

            await fetch("/api/images", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    albumId,
                    s3Key: key,
                    mimeType: contentType,
                    size: file.size,
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                }),
            });

            updateProgress(100);
            URL.revokeObjectURL(img.src);
        } catch (err) {
            console.error(`Failed to upload ${filename}:`, err);
        }
    }

    async function handleFilesUpload(files: FileList | File[]) {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        setUploading(true);
        setUploadProgress({ current: 0, total: imageFiles.length, fileName: '', percent: 0 });

        // Upload files sequentially to avoid overwhelming the server
        for (let i = 0; i < imageFiles.length; i++) {
            await uploadSingleFile(imageFiles[i], i, imageFiles.length);
        }

        setUploading(false);
        setUploadProgress({ current: 0, total: 0, fileName: '', percent: 0 });
        refreshAlbum();
    }

    function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
        if (!e.target.files?.length) return;
        handleFilesUpload(e.target.files);
        e.target.value = ''; // Reset input
    }

    function handleDragOver(e: React.DragEvent) {
        e.preventDefault();
        if (canEdit) setIsDragging(true);
    }

    function handleDragLeave(e: React.DragEvent) {
        e.preventDefault();
        setIsDragging(false);
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        setIsDragging(false);
        if (!canEdit || uploading) return;

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFilesUpload(files);
        }
    }

    async function handleDeleteImage(imageId: string) {
        setDeletingImageId(imageId);
        try {
            const res = await fetch(`/api/images/${imageId}`, { method: "DELETE" });
            if (res.ok) {
                toast.success("Photo moved to trash");
                refreshAlbum();
            } else {
                toast.error("Failed to delete image");
            }
        } catch (err) {
            toast.error("Error deleting image");
        } finally {
            setDeletingImageId(null);
        }
    }

    async function handleSetCover(imageId: string | null) {
        try {
            const res = await fetch(`/api/albums/${albumId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ coverImageId: imageId }),
            });
            if (res.ok) {
                toast.success(imageId ? "Cover updated" : "Cover removed");
                refreshAlbum();
            }
        } catch (err) {
            toast.error("Failed to update cover");
        }
    }

    async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            // 1. Get upload URL for this specific album
            const resUrl = await fetch("/api/images/upload-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ albumId, contentType: file.type, filename: file.name }),
            });
            const { url, key } = await resUrl.json();

            if (!url) throw new Error("Failed to get upload URL");

            // 2. Upload to S3
            await fetch(url, {
                method: "PUT",
                headers: { "Content-Type": file.type },
                body: file,
            });

            // 3. Register image in DB
            const resImg = await fetch("/api/images", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    albumId,
                    s3Key: key,
                    mimeType: file.type,
                    size: file.size,
                    width: 0, // Simplified for cover upload
                    height: 0,
                }),
            });
            const { image: newImage } = await resImg.json();

            // 4. Set as cover
            if (newImage?.id) {
                await handleSetCover(newImage.id);
            }
        } catch (err) {
            toast.error("Failed to upload cover");
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50/30">
                <DashboardNavbar />
                <main className="max-w-6xl mx-auto px-6 py-10">
                    <Skeleton className="h-4 w-32 mb-8" />
                    <div className="space-y-2 mb-10">
                        <Skeleton className="h-8 w-64" />
                        <Skeleton className="h-4 w-96" />
                    </div>
                    <div className="columns-2 sm:columns-3 md:columns-4 gap-4">
                        {[...Array(8)].map((_, i) => (
                            <Skeleton key={i} className="mb-4 rounded-2xl" style={{ height: `${150 + Math.random() * 150}px` }} />
                        ))}
                    </div>
                </main>
            </div>
        );
    }

    if (!album) return null;

    const imageCount = album.images?.length || 0;

    return (
        <div
            className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50/30 relative"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Drag overlay */}
            {isDragging && canEdit && (
                <div className="fixed inset-0 bg-blue-500/10 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-none">
                    <div className="bg-white rounded-3xl p-12 shadow-2xl border-2 border-dashed border-blue-400 text-center">
                        <Upload className="h-16 w-16 text-blue-500 mx-auto mb-4" />
                        <p className="text-xl font-semibold text-slate-800">Drop photos here</p>
                        <p className="text-slate-500 mt-1">Release to upload</p>
                    </div>
                </div>
            )}

            <DashboardNavbar />

            <main className="max-w-6xl mx-auto px-6 py-10">
                {/* Back Navigation */}
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-blue-500 transition-colors mb-8 group"
                >
                    <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                    Back to albums
                </Link>

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-2xl font-semibold text-slate-800">{album.title}</h1>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 rounded-lg text-xs font-medium text-blue-600">
                                {album.visibility === 'private' ? (
                                    <Lock className="h-3 w-3" />
                                ) : (
                                    <Globe className="h-3 w-3" />
                                )}
                                {album.visibility}
                            </span>
                        </div>
                        {album.description && (
                            <p className="text-slate-500">{album.description}</p>
                        )}
                        <p className="text-sm text-slate-400 mt-1">
                            {imageCount} {imageCount === 1 ? "photo" : "photos"}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">


                        <ShareAlbumDialog
                            albumId={album.id}
                            albumTitle={album.title}
                            albumVisibility={album.visibility}
                            userRole={userRole}
                            albumOwnerId={album.ownerId}
                        />

                        {/* Edit Album Dialog */}
                        {isOwner && (
                            <EditAlbumDialog
                                album={{
                                    id: album.id,
                                    title: album.title,
                                    description: album.description,
                                    visibility: album.visibility,
                                    albumDate: album.albumDate || new Date().toISOString()
                                }}
                                open={editingAlbum}
                                onOpenChange={setEditingAlbum}
                                onSuccess={refreshAlbum}
                                trigger={<span className="hidden" />}
                            />
                        )}

                        {canEdit && (
                            <label htmlFor="upload-input">
                                <Button disabled={uploading} className="gap-2 bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25 cursor-pointer rounded-xl" asChild>
                                    <span>
                                        {uploading ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Upload className="h-4 w-4" />
                                        )}
                                        {uploading ? "Uploading..." : "Upload"}
                                    </span>
                                </Button>
                            </label>
                        )}
                        <input
                            id="upload-input"
                            type="file"
                            className="hidden"
                            accept="image/*"
                            multiple
                            onChange={handleUpload}
                            disabled={uploading || !canEdit}
                        />

                        {/* Kebab Menu - Owner or Editor */}
                        {(isOwner || userRole === "editor") && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="icon" className="rounded-xl border-slate-200 text-slate-500 hover:text-slate-800">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-white rounded-xl w-48 shadow-lg border-slate-100 p-1">
                                    <DropdownMenuItem onClick={() => setTrashOpen(true)} className="cursor-pointer rounded-lg px-3 py-2 text-slate-600 focus:text-slate-800 focus:bg-slate-50">
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Recycle Bin
                                    </DropdownMenuItem>

                                    {!isOwner && (
                                        <>
                                            <DropdownMenuSeparator className="bg-slate-100 my-1" />
                                            <DropdownMenuItem
                                                onClick={() => setLeaveAlbumConfirmOpen(true)}
                                                className="text-red-500 focus:text-red-600 focus:bg-red-50 cursor-pointer rounded-lg px-3 py-2"
                                            >
                                                <LogOut className="mr-2 h-4 w-4" />
                                                Leave Gallery
                                            </DropdownMenuItem>
                                        </>
                                    )}

                                    {isOwner && (
                                        <>
                                            <DropdownMenuSeparator className="bg-slate-100 my-1" />
                                            <DropdownMenuItem
                                                onClick={() => document.getElementById('cover-update-input')?.click()}
                                                className="cursor-pointer rounded-lg px-3 py-2 text-slate-600 focus:text-slate-800 focus:bg-slate-50"
                                            >
                                                <Camera className="mr-2 h-4 w-4" />
                                                Change Album Cover
                                            </DropdownMenuItem>

                                            <DropdownMenuItem
                                                onClick={() => setEditingAlbum(true)}
                                                className="cursor-pointer rounded-lg px-3 py-2 text-slate-600 focus:text-slate-800 focus:bg-slate-50"
                                            >
                                                <MoreVertical className="mr-2 h-4 w-4" />
                                                Edit Details
                                            </DropdownMenuItem>

                                            {album.coverImageId && (
                                                <DropdownMenuItem
                                                    onClick={() => handleSetCover(null)}
                                                    className="cursor-pointer rounded-lg px-3 py-2 text-slate-600 hover:text-red-500 focus:bg-slate-50"
                                                >
                                                    <X className="mr-2 h-4 w-4 text-slate-400" />
                                                    Remove Album Cover
                                                </DropdownMenuItem>
                                            )}

                                            <DropdownMenuSeparator className="bg-slate-100 my-1" />
                                            <DropdownMenuItem
                                                onClick={() => setDeleteAlbumConfirmOpen(true)}
                                                disabled={deletingAlbum}
                                                className=" text-red-500 focus:text-red-600 focus:bg-red-50 cursor-pointer rounded-lg px-3 py-2"
                                            >
                                                {deletingAlbum ? (
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                )}
                                                Delete Album
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                        <input
                            id="cover-update-input"
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={handleCoverUpload}
                            disabled={uploading || !isOwner}
                        />
                        {/* Trash Dialog (Controlled) */}
                        <TrashDialog
                            albumId={album.id}
                            userRole={userRole}
                            onRestore={refreshAlbum}
                            open={trashOpen}
                            onOpenChange={setTrashOpen}
                            trigger={<span className="hidden" />}
                        />
                    </div>
                </div>

                {/* Upload Progress */}
                {uploading && uploadProgress.total > 0 && (
                    <div className="mb-8 bg-white rounded-2xl p-5 border border-blue-100 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex-1 min-w-0 mr-4">
                                <p className="text-sm text-slate-600 font-medium">
                                    Uploading {uploadProgress.current} of {uploadProgress.total}
                                </p>
                                <p className="text-xs text-slate-400 truncate mt-0.5">{uploadProgress.fileName}</p>
                            </div>
                            <span className="text-blue-500 text-sm font-semibold">{uploadProgress.percent}%</span>
                        </div>
                        <Progress value={uploadProgress.percent} className="h-2 bg-blue-100" />
                    </div>
                )}

                {/* Gallery - Masonry Layout with Dynamic Aspect Ratios */}
                {imageCount === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border border-slate-100 shadow-sm">
                        <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
                            <ImageIcon className="h-10 w-10 text-blue-400" strokeWidth={1.5} />
                        </div>
                        <h3 className="text-xl font-semibold text-slate-800 mb-2">No photos yet</h3>
                        <p className="text-slate-500 mb-8 text-center max-w-xs">
                            Upload your first photo to start building this album
                        </p>
                        {canEdit && (
                            <label htmlFor="upload-empty">
                                <Button className="gap-2 bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25 cursor-pointer rounded-xl" asChild>
                                    <span>
                                        <Upload className="h-4 w-4" />
                                        Upload photo
                                    </span>
                                </Button>
                            </label>
                        )}
                        <input
                            id="upload-empty"
                            type="file"
                            className="hidden"
                            accept="image/*"
                            multiple
                            onChange={handleUpload}
                            disabled={uploading || !canEdit}
                        />
                    </div>
                ) : (
                    <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-4 [column-fill:_balance]">
                        {album.images?.map((image: Image) => {
                            const isCover = album.coverImageId === image.id;
                            const isDeleting = deletingImageId === image.id;

                            return (
                                <div key={image.id} className="relative group mb-4 break-inside-avoid">
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <button
                                                className="w-full overflow-hidden rounded-2xl bg-slate-100 cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-sm hover:shadow-lg transition-shadow"
                                                disabled={isDeleting}
                                            >
                                                {image.url ? (
                                                    <img
                                                        src={image.url}
                                                        alt=""
                                                        className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                                        style={{
                                                            aspectRatio: image.width && image.height
                                                                ? `${image.width}/${image.height}`
                                                                : 'auto'
                                                        }}
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div className="aspect-square flex items-center justify-center">
                                                        <ImageIcon className="h-8 w-8 text-blue-200" strokeWidth={1.5} />
                                                    </div>
                                                )}
                                            </button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-5xl p-0 border-0 bg-slate-900 shadow-2xl overflow-hidden rounded-2xl">
                                            <div className="flex items-center justify-center min-h-[60vh] max-h-[85vh] p-4">
                                                {image.url && (
                                                    <img
                                                        src={image.url}
                                                        alt=""
                                                        className="max-h-full max-w-full object-contain rounded-lg"
                                                    />
                                                )}
                                            </div>
                                        </DialogContent>
                                    </Dialog>

                                    {/* Cover indicator */}
                                    {isCover && (
                                        <div className="absolute top-2 left-2 px-2 py-1 bg-blue-500 text-white text-xs font-medium rounded-lg flex items-center gap-1 shadow-lg">
                                            <Star className="h-3 w-3 fill-current" />
                                            Cover
                                        </div>
                                    )}

                                    {/* Download button (visible on hover for everyone) */}
                                    {image.url && (
                                        <a
                                            href={image.url}
                                            download
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="absolute bottom-2 right-2 p-2 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg hover:bg-white transition-all opacity-0 group-hover:opacity-100"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <Download className="h-4 w-4 text-slate-600" />
                                        </a>
                                    )}

                                    {/* Edit actions (visible on hover for editors) */}
                                    {canEdit && (
                                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <button className="p-2 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg hover:bg-white transition-colors">
                                                        <ImageIcon className="h-4 w-4 text-slate-600" />
                                                    </button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="rounded-xl">
                                                    <DropdownMenuItem onClick={() => handleSetCover(image.id)} className="cursor-pointer">
                                                        <Star className="mr-2 h-4 w-4" />
                                                        Set as cover
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>

                                            <button
                                                onClick={() => setDeleteImageConfirmId(image.id)}
                                                disabled={isDeleting}
                                                className="p-2 bg-red-500/90 backdrop-blur-sm rounded-lg shadow-lg hover:bg-red-500 transition-colors text-white disabled:opacity-50"
                                            >
                                                {isDeleting ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-4 w-4" />
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Add Photo Placeholder */}
                        {canEdit && (
                            <label htmlFor="upload-grid" className="cursor-pointer mb-4 break-inside-avoid block">
                                <div className="aspect-square rounded-2xl border-2 border-dashed border-blue-200 hover:border-blue-400 bg-white hover:bg-blue-50/50 transition-all flex flex-col items-center justify-center gap-2 group">
                                    <div className="w-12 h-12 bg-blue-100 group-hover:bg-blue-200 rounded-xl flex items-center justify-center transition-colors">
                                        <Plus className="h-6 w-6 text-blue-500" />
                                    </div>
                                    <span className="text-xs font-medium text-blue-500">Add photo</span>
                                </div>
                                <input
                                    id="upload-grid"
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    multiple
                                    onChange={handleUpload}
                                    disabled={uploading}
                                />
                            </label>
                        )}
                    </div>
                )}
            </main>

            {/* Confirmation Dialogs */}
            <ConfirmDialog
                open={deleteAlbumConfirmOpen}
                onOpenChange={setDeleteAlbumConfirmOpen}
                title="Delete Album?"
                description="Are you sure you want to delete this album? This action cannot be undone and all photos will be permanently removed."
                variant="destructive"
                onConfirm={handleDeleteAlbum}
                confirmText="Delete Album"
            />

            <ConfirmDialog
                open={leaveAlbumConfirmOpen}
                onOpenChange={setLeaveAlbumConfirmOpen}
                title="Leave Gallery?"
                description="Are you sure you want to leave this gallery? You will lose access until you are invited back by the owner."
                onConfirm={handleLeaveAlbum}
                confirmText="Leave Gallery"
            />

            <ConfirmDialog
                open={deleteImageConfirmId !== null}
                onOpenChange={(open: boolean) => !open && setDeleteImageConfirmId(null)}
                title="Delete Photo?"
                description="This photo will be moved to the recycle bin and can be restored for 30 days."
                variant="destructive"
                onConfirm={() => {
                    if (deleteImageConfirmId) handleDeleteImage(deleteImageConfirmId);
                }}
                confirmText="Delete Photo"
            />
        </div>
    );
}
