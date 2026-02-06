"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, Globe, Plus, Upload, Loader2, Image as ImageIcon, Trash2, Star, Download, MoreVertical, LogOut, UserMinus, Camera, X, CheckSquare, Square, XCircle, ArrowUpDown, Folder, FolderOpen, ChevronRight, FolderPlus, Edit2, History } from "lucide-react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { useAuth } from "@/components/providers/AuthProvider";
import { useAlbumDetailStore } from "@/stores/useAlbumDetailStore";
import { DragOverlay } from "@/components/DragOverlay";

import { DashboardNavbar } from "@/components/DashboardNavbar";
import { ShareAlbumDialog } from "@/components/ShareAlbumDialog";
import { EditAlbumDialog } from "@/components/EditAlbumDialog";
import { TrashDialog } from "@/components/TrashDialog";
import { CreateFolderDialog } from "@/components/CreateFolderDialog";
import { EditFolderDialog } from "@/components/EditFolderDialog";
import { DeleteFolderDialog } from "@/components/DeleteFolderDialog";
import { MoveToFolderDialog } from "@/components/MoveToFolderDialog";
import { AlbumActivityDialog } from "@/components/AlbumActivityDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
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
    thumbUrl?: string;
    displayUrl?: string;
    originalUrl?: string;
    originalFilename?: string;
    width?: number;
    height?: number;
    createdAt: string;
    dateTaken?: string;
    folderId?: string | null;
}

interface Folder {
    id: string;
    name: string;
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
    folders?: Folder[];
}

type UserRole = "owner" | "editor" | "viewer" | null;


// Allow longer timeout (60s) for uploads on this page
export const maxDuration = 60;

export default function AlbumDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const resolvedParams = use(params);
    const albumId = resolvedParams.id;

    // Use Global Store
    const store = useAlbumDetailStore();

    const {
        currentFolderId, setCurrentFolderId,
        sortBy, setSort,
        selectMode, selectedIds,
        toggleSelectMode, toggleSelection: toggleImageSelection, selectAll: selectAllStore, deselectAll,
        bulkOperating, setBulkOperating,
        uploading, setUploading,
        uploadProgress, setUploadProgress,
        reset
    } = store;

    const sortDir = store.sortDir;

    // Local UI State
    const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
    const [deletingFolder, setDeletingFolder] = useState<Folder | null>(null);
    const [movingPhotosOpen, setMovingPhotosOpen] = useState(false);

    // Reset store on mount/unmount and when albumId changes
    useEffect(() => {
        reset();
        return () => reset();
    }, [albumId, reset]);

    const { data: albumData, error: albumError, isLoading: albumLoading, mutate: mutateAlbum } = useSWR(
        `/api/albums/${albumId}?sortBy=${sortBy}&sortDir=${sortDir}`,
        fetcher,
        { revalidateOnFocus: false }
    );
    const { user, isLoading: authLoading } = useAuth();

    const [deletingImageId, setDeletingImageId] = useState<string | null>(null);

    // Handle Access Denial & Race Conditions
    useEffect(() => {
        // If we have an auth error (401/403) but the user IS logged in, 
        // it's likely a token expiration race condition where the auth hook refreshed it.
        // Retry the album fetch.
        // @ts-ignore
        if (user && (albumError?.status === 401 || albumError?.status === 403)) {
            console.log("User is logged in but Album returned 401/403. Retrying...");
            mutateAlbum();
        }
    }, [user, albumError, mutateAlbum]);
    const [deletingAlbum, setDeletingAlbum] = useState(false);
    const [editingAlbum, setEditingAlbum] = useState(false);

    const [trashOpen, setTrashOpen] = useState(false);
    const [deleteAlbumConfirmOpen, setDeleteAlbumConfirmOpen] = useState(false);
    const [leaveAlbumConfirmOpen, setLeaveAlbumConfirmOpen] = useState(false);
    const [activityLogOpen, setActivityLogOpen] = useState(false);
    const [deleteImageConfirmId, setDeleteImageConfirmId] = useState<string | null>(null);

    // Photo Navigation State
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

    // Multi-select state for bulk operations


    const folders = (albumData?.album?.folders || []) as Folder[];

    // Filter images by current folder
    const images = (albumData?.album?.images || []).filter((img: Image) => {
        if (currentFolderId) return img.folderId === currentFolderId;
        return !img.folderId; // Root View: Only show images NOT in any folder
    });

    const imageCount = images.length;

    const album = albumData?.album || null;
    const userRole = albumData?.userRole || null;
    const loading = albumLoading || authLoading;

    const canEdit = userRole === "owner" || userRole === "editor";
    const isOwner = userRole === "owner";

    // Navigation Handlers
    const handleNext = () => {
        if (selectedImageIndex === null) return;
        setSelectedImageIndex((prev) => (prev === null || prev === images.length - 1 ? 0 : prev + 1));
    };

    const handlePrev = () => {
        if (selectedImageIndex === null) return;
        setSelectedImageIndex((prev) => (prev === null || prev === 0 ? images.length - 1 : prev - 1));
    };



    // Keyboard Navigation
    useEffect(() => {
        if (selectedImageIndex === null) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight") handleNext();
            if (e.key === "ArrowLeft") handlePrev();
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedImageIndex, images.length]);




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
                toast.success("You left the album");
                router.push("/dashboard");
                router.refresh();
            } else {
                const data = await res.json();
                toast.error(data.error || "Failed to leave album");
            }
        } catch (err) {
            toast.error("Error leaving album");
        }
    }

    // Bulk operation handlers
    // Bulk operation handlers - using store actions directly

    // Wrapper for selectAll to pass image IDs
    const selectAll = () => {
        selectAllStore(images.map((img: Image) => img.id));
    };

    async function handleBulkDelete() {
        if (selectedIds.size === 0) return;

        setBulkOperating(true);
        try {
            const res = await fetch('/api/images/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'delete',
                    imageIds: Array.from(selectedIds),
                    albumId,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                toast.success(`Deleted ${data.deletedCount} photos`);
                deselectAll();
                toggleSelectMode();
                refreshAlbum();
            } else {
                const error = await res.json();
                toast.error(error.error || 'Failed to delete photos');
            }
        } catch (err) {
            toast.error('Error deleting photos');
        } finally {
            setBulkOperating(false);
        }
    }

    async function handleBulkDownload() {
        if (selectedIds.size === 0) return;

        setBulkOperating(true);
        try {
            toast.info('Preparing download...');
            const res = await fetch('/api/images/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'download',
                    imageIds: Array.from(selectedIds),
                    albumId,
                }),
            });

            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `photos-${albumId.slice(0, 8)}.zip`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
                toast.success('Download started');
            } else {
                const error = await res.json();
                toast.error(error.error || 'Failed to download');
            }
        } catch (err) {
            toast.error('Error downloading photos');
        } finally {
            setBulkOperating(false);
        }
    }

    const refreshAlbum = () => mutateAlbum();


    async function uploadSingleFile(file: File, index: number, total: number, folderId?: string) {
        const filename = file.name;

        // Update progress
        const updateProgress = (percent: number) => {
            setUploadProgress({ current: index + 1, total, fileName: filename, percent });
        };

        try {
            updateProgress(5);

            // 1. Extract EXIF (Client-side)
            const exifr = (await import("exifr")).default;
            let exifData = null;
            try {
                const parsed = await exifr.parse(file, {
                    pick: ['DateTimeOriginal', 'Make', 'Model', 'GPSLatitude', 'GPSLongitude']
                });
                if (parsed) {
                    exifData = {
                        dateTaken: parsed.DateTimeOriginal,
                        cameraMake: parsed.Make,
                        cameraModel: parsed.Model,
                        gpsLatitude: parsed.GPSLatitude,
                        gpsLongitude: parsed.GPSLongitude
                    };
                }
            } catch (e) {
                console.warn("EXIF extraction failed:", e);
            }

            updateProgress(10);

            // 2. Resize Images (Client-side)
            const { resizeImage } = await import("@/lib/client-image");

            // Original (Keep original type, Quality 95%, Original Size)
            // Display (2000px, 90% quality - WebP)
            // Thumb (400px, 70% quality - WebP)
            const [originalVariant, displayVariant, thumbVariant] = await Promise.all([
                resizeImage(file, 0, 0.95, file.type),
                resizeImage(file, 2000, 0.90),
                resizeImage(file, 400, 0.70)
            ]);

            updateProgress(20);

            // 3. Get Presigned URLs (for all 3)
            const urlRes = await fetch("/api/images/upload-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    filename,
                    contentType: originalVariant.blob.type, // Use actual type (original or webp)
                    albumId
                }),
            });

            if (!urlRes.ok) throw new Error("Failed to get upload URL");
            const { urls, keys } = await urlRes.json();

            updateProgress(30);

            // 4. Upload to S3 directly (Parallel)
            await Promise.all([
                // Original
                fetch(urls.original, {
                    method: "PUT",
                    headers: { "Content-Type": originalVariant.blob.type },
                    body: originalVariant.blob,
                }),
                // Display (WebP)
                fetch(urls.display, {
                    method: "PUT",
                    headers: { "Content-Type": "image/webp" },
                    body: displayVariant.blob,
                }),
                // Thumb (WebP)
                fetch(urls.thumb, {
                    method: "PUT",
                    headers: { "Content-Type": "image/webp" },
                    body: thumbVariant.blob,
                })
            ]);

            updateProgress(80);

            // 5. Register Image in DB
            const regRes = await fetch("/api/images/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    albumId,
                    keys, // { original, display, thumb }
                    mimeType: originalVariant.blob.type, // Use actual type
                    size: originalVariant.blob.size, // Use the new blob size
                    filename: filename,
                    folderId,
                    width: originalVariant.width,
                    height: originalVariant.height,
                    exif: exifData
                }),
            });

            if (!regRes.ok) throw new Error("Failed to register image");

            updateProgress(100);

        } catch (err) {
            console.error(`Failed to upload ${filename}:`, err);
            toast.error(`Failed to upload ${filename}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }


    async function handleFilesUpload(files: FileList | File[]) {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        setUploading(true);
        setUploadProgress({ current: 0, total: imageFiles.length, fileName: '', percent: 0 });

        // Upload files sequentially to avoid overwhelming the server
        for (let i = 0; i < imageFiles.length; i++) {
            await uploadSingleFile(imageFiles[i], i, imageFiles.length, currentFolderId || undefined);
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

    async function downloadImage(imageId: string, fallbackUrl?: string, fallbackFilename?: string) {
        try {
            // Try to get a fresh URL first
            let url = fallbackUrl;
            let filename = fallbackFilename || `photo-${imageId}.webp`;

            try {
                const res = await fetch(`/api/images/${imageId}/download-url`);
                if (res.ok) {
                    const data = await res.json();
                    url = data.url;
                    filename = data.filename;
                }
            } catch (e) {
                console.warn("Failed to get fresh download URL, trying fallback", e);
            }

            if (!url) {
                toast.error("Could not get download URL");
                return;
            }

            const res = await fetch(url);
            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
        } catch (err) {
            console.error('Download failed', err);
            if (fallbackUrl) {
                window.open(fallbackUrl, '_blank');
            } else {
                toast.error("Download failed");
            }
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
            <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50/30 dark:from-slate-950 dark:to-slate-900">
                <DashboardNavbar />
                <main className="max-w-6xl mx-auto px-6 py-10">
                    {/* Back Nav Skeleton */}
                    <Skeleton className="h-4 w-24 mb-8 rounded-full" />

                    {/* Header Skeleton */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
                        <div className="space-y-3 w-full max-w-lg">
                            <div className="flex items-center gap-3">
                                <Skeleton className="h-8 w-64 rounded-xl" />
                                <Skeleton className="h-6 w-20 rounded-lg" />
                            </div>
                            <Skeleton className="h-4 w-96 max-w-full rounded-lg" />
                            <Skeleton className="h-4 w-32 rounded-lg" />
                        </div>
                        <div className="flex gap-3">
                            <Skeleton className="h-10 w-24 rounded-xl" />
                            <Skeleton className="h-10 w-10 rounded-xl" />
                        </div>
                    </div>

                    {/* Grid Skeleton */}
                    <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-4">
                        {[...Array(12)].map((_, i) => (
                            <Skeleton
                                key={i}
                                className="mb-4 rounded-2xl w-full"
                                style={{ height: `${150 + Math.random() * 200}px` }}
                            />
                        ))}
                    </div>
                </main>
            </div>
        );
    }

    // Error State Handling (Access Denied / Not Found)
    if (albumError || (!album && !loading)) {
        // @ts-ignore
        const status = albumError?.status;
        const isAccessDenied = status === 401 || status === 403;
        const isNotFound = status === 404 || (!album && !loading); // Fallback for null data

        if (isAccessDenied) {
            // If we are currently retrying (user is logged in), show loading skeleton instead of error
            if (user && !albumData) {
                return (
                    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50/30 dark:from-slate-950 dark:to-slate-900">
                        <DashboardNavbar />
                        <main className="max-w-6xl mx-auto px-6 py-10">
                            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 animate-pulse">
                                <div className="h-16 w-16 bg-slate-200 dark:bg-slate-800 rounded-full" />
                                <div className="h-6 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                                <div className="h-4 w-64 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                            </div>
                        </main>
                    </div>
                );
            }

            return (
                <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50/30 dark:from-slate-950 dark:to-slate-900">
                    <DashboardNavbar />
                    <main className="max-w-6xl mx-auto px-6 py-10 flex flex-col items-center justify-center min-h-[60vh] text-center">
                        <div className="bg-white dark:bg-slate-800 p-4 rounded-full shadow-lg mb-6 ring-1 ring-slate-100 dark:ring-slate-700">
                            <Lock className="h-10 w-10 text-slate-400 dark:text-slate-500" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Private Album</h1>
                        <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md">
                            This album is private or you don't have permission to view it.
                            Please sign in with an account that has access.
                        </p>
                        <div className="flex gap-4">
                            <Link href="/dashboard">
                                <Button variant="outline" className="gap-2">
                                    <ArrowLeft className="h-4 w-4" />
                                    Back to Dashboard
                                </Button>
                            </Link>
                            {!user && (
                                <Link href="/">
                                    <Button className="gap-2 bg-blue-500 hover:bg-blue-600 text-white">
                                        Sign In
                                    </Button>
                                </Link>
                            )}
                        </div>
                    </main>
                </div>
            );
        }

        if (isNotFound) {
            return (
                <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50/30 dark:from-slate-950 dark:to-slate-900">
                    <DashboardNavbar />
                    <main className="max-w-6xl mx-auto px-6 py-10 flex flex-col items-center justify-center min-h-[60vh] text-center">
                        <div className="bg-white dark:bg-slate-800 p-4 rounded-full shadow-lg mb-6 ring-1 ring-slate-100 dark:ring-slate-700">
                            <FolderOpen className="h-10 w-10 text-slate-400 dark:text-slate-500" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Album Not Found</h1>
                        <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md">
                            The album you are looking for does not exist or has been deleted.
                        </p>
                        <Link href="/dashboard">
                            <Button className="gap-2">
                                <ArrowLeft className="h-4 w-4" />
                                Back to Dashboard
                            </Button>
                        </Link>
                    </main>
                </div>
            );
        }
    }






    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50/30 dark:from-slate-950 dark:to-slate-900 relative">
            <DragOverlay canEdit={canEdit} onUpload={handleFilesUpload} />

            <DashboardNavbar />

            <main className="max-w-6xl mx-auto px-6 py-10">
                {/* Back Navigation */}
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors mb-8 group"
                >
                    <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                    Back to albums
                </Link>

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{album.title}</h1>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400">
                                {album.visibility === 'private' ? (
                                    <Lock className="h-3 w-3" />
                                ) : (
                                    <Globe className="h-3 w-3" />
                                )}
                                {album.visibility}
                            </span>
                        </div>
                        {album.description && (
                            <p className="text-slate-500 dark:text-slate-400">{album.description}</p>
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

                        {/* Activity Log Dialog */}
                        {isOwner && (
                            <AlbumActivityDialog
                                albumId={album.id}
                                open={activityLogOpen}
                                onOpenChange={setActivityLogOpen}
                                trigger={<span className="hidden" />}
                            />
                        )}

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
                                <input
                                    id="upload-input"
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    multiple
                                    onChange={handleUpload}
                                    disabled={uploading}
                                />
                            </label>
                        )}


                        {/* Kebab Menu - Owner, Editor, or Viewer */}
                        {userRole && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="icon" className="rounded-xl border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 dark:bg-slate-800">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-white dark:bg-slate-800 rounded-xl w-48 shadow-lg border-slate-100 dark:border-slate-700 p-1">
                                    {(isOwner || userRole === "editor") && (
                                        <>
                                            <DropdownMenuItem onClick={() => setTrashOpen(true)} className="cursor-pointer rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 focus:text-slate-800 dark:focus:text-slate-100 focus:bg-slate-50 dark:focus:bg-slate-700">
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Recycle Bin
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                    {isOwner && (
                                        <DropdownMenuItem onClick={() => setActivityLogOpen(true)} className="cursor-pointer rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 focus:text-slate-800 dark:focus:text-slate-100 focus:bg-slate-50 dark:focus:bg-slate-700">
                                            <History className="mr-2 h-4 w-4" />
                                            Activity Log
                                        </DropdownMenuItem>
                                    )}

                                    {!isOwner && (
                                        <>
                                            {(isOwner || userRole === "editor") && <DropdownMenuSeparator className="bg-slate-100 dark:bg-slate-700 my-1" />}
                                            <DropdownMenuItem
                                                onClick={() => setLeaveAlbumConfirmOpen(true)}
                                                className="text-red-500 focus:text-red-600 focus:bg-red-50 cursor-pointer rounded-lg px-3 py-2"
                                            >
                                                <LogOut className="mr-2 h-4 w-4" />
                                                Leave Album
                                            </DropdownMenuItem>
                                        </>
                                    )}

                                    {isOwner && (
                                        <>
                                            <DropdownMenuSeparator className="bg-slate-100 dark:bg-slate-700 my-1" />
                                            <DropdownMenuItem
                                                onClick={() => document.getElementById('cover-update-input')?.click()}
                                                className="cursor-pointer rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 focus:text-slate-800 dark:focus:text-slate-100 focus:bg-slate-50 dark:focus:bg-slate-700"
                                            >
                                                <Camera className="mr-2 h-4 w-4" />
                                                Change Album Cover
                                            </DropdownMenuItem>

                                            <DropdownMenuItem
                                                onClick={() => setEditingAlbum(true)}
                                                className="cursor-pointer rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 focus:text-slate-800 dark:focus:text-slate-100 focus:bg-slate-50 dark:focus:bg-slate-700"
                                            >
                                                <MoreVertical className="mr-2 h-4 w-4" />
                                                Edit Details
                                            </DropdownMenuItem>

                                            {album.coverImageId && (
                                                <DropdownMenuItem
                                                    onClick={() => handleSetCover(null)}
                                                    className="cursor-pointer rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 hover:text-red-500 focus:bg-slate-50 dark:focus:bg-slate-700"
                                                >
                                                    <X className="mr-2 h-4 w-4 text-slate-400" />
                                                    Remove Album Cover
                                                </DropdownMenuItem>
                                            )}

                                            <DropdownMenuSeparator className="bg-slate-100 dark:bg-slate-700 my-1" />
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

                {/* Folder Navigation & Actions */}
                <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-lg font-medium text-slate-900 dark:text-white">
                        {currentFolderId ? (
                            <>
                                <button
                                    onClick={() => setCurrentFolderId(null)}
                                    className="hover:text-blue-500 transition-colors flex items-center gap-1 hover:underline decoration-blue-500/30"
                                >
                                    <Folder className="h-5 w-5 text-slate-400 group-hover:text-blue-500" />
                                    {album?.title || "Album"}
                                </button>
                                <ChevronRight className="h-4 w-4 text-slate-400" />
                                <span>{folders.find(f => f.id === currentFolderId)?.name || 'Folder'}</span>
                            </>
                        ) : (
                            folders.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <Folder className="h-5 w-5 text-slate-400" />
                                    Folders
                                </div>
                            )
                        )}
                    </div>

                    {canEdit && !currentFolderId && (
                        <CreateFolderDialog albumId={albumId} onFolderCreated={() => mutateAlbum()}>
                            <Button variant="outline" className="gap-2 rounded-xl border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-slate-600 dark:text-slate-300">
                                <FolderPlus className="h-4 w-4" />
                                New Folder
                            </Button>
                        </CreateFolderDialog>
                    )}
                </div>

                {/* Folder Grid (Root View Only) */}
                {!currentFolderId && folders.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-8">
                        {folders.map(folder => (
                            <div
                                key={folder.id}
                                className="relative group"
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation(); // Stop page-level drag handler
                                    e.currentTarget.classList.add('ring-2', 'ring-blue-500', 'scale-[1.02]');
                                }}
                                onDragLeave={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.currentTarget.classList.remove('ring-2', 'ring-blue-500', 'scale-[1.02]');
                                }}
                                onDrop={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation(); // Stop page-level drop handler (no upload)
                                    e.currentTarget.classList.remove('ring-2', 'ring-blue-500', 'scale-[1.02]');

                                    // Handle drop (single image or bulk if I implement dragging a selection)
                                    // For now, let's assume we drag a single image ID
                                    const draggedImageId = e.dataTransfer.getData("text/plain");
                                    if (!draggedImageId) return;

                                    // Check if it's the current folder (move to self)
                                    if (folder.id === currentFolderId) return;

                                    try {
                                        toast.info("Moving photo...");
                                        const res = await fetch('/api/images/bulk', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                action: 'move',
                                                imageIds: [draggedImageId],
                                                albumId,
                                                targetFolderId: folder.id,
                                            }),
                                        });
                                        if (res.ok) {
                                            toast.success(`Moved to ${folder.name}`);
                                            refreshAlbum();
                                        } else {
                                            toast.error("Failed to move photo");
                                        }
                                    } catch (err) {
                                        toast.error("Error moving photo");
                                    }
                                }}
                            >
                                <button
                                    onClick={() => setCurrentFolderId(folder.id)}
                                    className="w-full flex flex-col items-center justify-center p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 transition-all text-center relative overflow-hidden"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-br from-transparent to-slate-50 dark:to-slate-800/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <Folder className="h-10 w-10 text-blue-300 dark:text-blue-600 mb-3 group-hover:scale-110 transition-transform relative z-10 fill-current" />
                                    <span className="font-medium text-slate-700 dark:text-slate-200 truncate w-full group-hover:text-blue-600 dark:group-hover:text-blue-400 relative z-10">
                                        {folder.name}
                                    </span>
                                    <span className="text-xs text-slate-400 mt-1 relative z-10">
                                        {albumData?.album?.images?.filter((img: Image) => img.folderId === folder.id).length || 0} photos
                                    </span>
                                </button>

                                {canEdit && (
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 shadow-sm backdrop-blur-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-600 transition-all">
                                                    <MoreVertical className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-40 rounded-xl bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 shadow-lg p-1">
                                                <DropdownMenuItem
                                                    onClick={() => setEditingFolder(folder)}
                                                    className="gap-2 cursor-pointer rounded-lg text-slate-700 dark:text-slate-200 focus:bg-slate-50 dark:focus:bg-slate-700 focus:text-slate-900 dark:focus:text-white"
                                                >
                                                    <Edit2 className="h-4 w-4" /> Rename
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator className="bg-slate-100 dark:bg-slate-700 my-1" />
                                                <DropdownMenuItem
                                                    onClick={() => setDeletingFolder(folder)}
                                                    className="gap-2 cursor-pointer rounded-lg text-red-600 dark:text-red-400 focus:text-red-700 dark:focus:text-red-300 focus:bg-red-50 dark:focus:bg-red-900/20"
                                                >
                                                    <Trash2 className="h-4 w-4" /> Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Folder Dialogs */}
                {editingFolder && (
                    <EditFolderDialog
                        albumId={albumId}
                        folder={editingFolder}
                        open={!!editingFolder}
                        onOpenChange={(open) => !open && setEditingFolder(null)}
                        onFolderUpdated={() => mutateAlbum()}
                    />
                )}
                {deletingFolder && (
                    <DeleteFolderDialog
                        albumId={albumId}
                        folder={deletingFolder}
                        open={!!deletingFolder}
                        onOpenChange={(open) => !open && setDeletingFolder(null)}
                        onFolderDeleted={() => mutateAlbum()}
                    />
                )}

                {movingPhotosOpen && (
                    <MoveToFolderDialog
                        albumId={albumId}
                        folders={folders}
                        selectedIds={selectedIds}
                        currentFolderId={currentFolderId}
                        open={movingPhotosOpen}
                        onOpenChange={setMovingPhotosOpen}
                        onSuccess={() => {
                            deselectAll();
                            if (selectMode) toggleSelectMode();
                            refreshAlbum();
                        }}
                    />
                )}

                {/* Bulk Action Toolbar */}
                {canEdit && imageCount > 0 && (
                    <div className="mb-6 flex items-center gap-2 flex-wrap">
                        {!selectMode ? (
                            <>
                                {/* Select Button */}
                                <button
                                    onClick={toggleSelectMode}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all shadow-sm"
                                >
                                    <CheckSquare className="h-4 w-4" />
                                    <span>Select</span>
                                </button>

                                {/* Sort Dropdown */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all shadow-sm">
                                            <ArrowUpDown className="h-4 w-4" />
                                            <span>
                                                {sortBy === 'dateTaken' ? 'Date Taken' : 'Uploaded'}
                                                <span className="ml-1 text-slate-400 dark:text-slate-500">
                                                    {sortDir === 'asc' ? '↑' : '↓'}
                                                </span>
                                            </span>
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-52 rounded-xl p-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg">
                                        <DropdownMenuItem
                                            onClick={() => setSort('createdAt', 'desc')}
                                            className={`rounded-lg cursor-pointer ${sortBy === 'createdAt' && sortDir === 'desc' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : ''}`}
                                        >
                                            <span className="flex items-center gap-2">
                                                <span>Newest First</span>
                                                {sortBy === 'createdAt' && sortDir === 'desc' && <span className="ml-auto">✓</span>}
                                            </span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => setSort('createdAt', 'asc')}
                                            className={`rounded-lg cursor-pointer ${sortBy === 'createdAt' && sortDir === 'asc' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : ''}`}
                                        >
                                            <span className="flex items-center gap-2">
                                                <span>Oldest First</span>
                                                {sortBy === 'createdAt' && sortDir === 'asc' && <span className="ml-auto">✓</span>}
                                            </span>
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator className="my-1" />
                                        <DropdownMenuItem
                                            onClick={() => setSort('dateTaken', 'desc')}
                                            className={`rounded-lg cursor-pointer ${sortBy === 'dateTaken' && sortDir === 'desc' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : ''}`}
                                        >
                                            <span className="flex items-center gap-2">
                                                <Camera className="h-4 w-4" />
                                                <span>Date Taken (New)</span>
                                                {sortBy === 'dateTaken' && sortDir === 'desc' && <span className="ml-auto">✓</span>}
                                            </span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => setSort('dateTaken', 'asc')}
                                            className={`rounded-lg cursor-pointer ${sortBy === 'dateTaken' && sortDir === 'asc' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : ''}`}
                                        >
                                            <span className="flex items-center gap-2">
                                                <Camera className="h-4 w-4" />
                                                <span>Date Taken (Old)</span>
                                                {sortBy === 'dateTaken' && sortDir === 'asc' && <span className="ml-auto">✓</span>}
                                            </span>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </>
                        ) : (
                            <>
                                {/* Selection Count Badge */}
                                <div className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full shadow-sm">
                                    <CheckSquare className="h-4 w-4" />
                                    {selectedIds.size} selected
                                </div>

                                {/* Select/Deselect All */}
                                <button
                                    onClick={selectedIds.size === images.length ? deselectAll : selectAll}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm"
                                >
                                    {selectedIds.size === images.length ? 'Deselect All' : 'Select All'}
                                </button>

                                {/* Move Photos */}
                                <button
                                    onClick={() => setMovingPhotosOpen(true)}
                                    disabled={selectedIds.size === 0 || bulkOperating}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <FolderOpen className="h-4 w-4" />
                                    <span className="hidden sm:inline">Move</span>
                                </button>

                                {/* Download ZIP */}
                                <button
                                    onClick={handleBulkDownload}
                                    disabled={selectedIds.size === 0 || bulkOperating}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {bulkOperating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                    <span className="hidden sm:inline">Download</span>
                                </button>

                                {/* Delete */}
                                <button
                                    onClick={handleBulkDelete}
                                    disabled={selectedIds.size === 0 || bulkOperating}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-500 dark:text-red-400 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900/50 rounded-full hover:bg-red-50 dark:hover:bg-red-900/30 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {bulkOperating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    <span className="hidden sm:inline">Delete</span>
                                </button>

                                {/* Cancel */}
                                <button
                                    onClick={toggleSelectMode}
                                    className="inline-flex items-center justify-center w-9 h-9 text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 transition-all shadow-sm"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* Upload Progress */}
                {uploading && uploadProgress.total > 0 && (
                    <div className="mb-8 bg-white dark:bg-slate-800 rounded-2xl p-5 border border-blue-100 dark:border-blue-800 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex-1 min-w-0 mr-4">
                                <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
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
                    <div className="flex flex-col items-center justify-center py-24 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm">
                        <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mb-6">
                            <ImageIcon className="h-10 w-10 text-blue-400" strokeWidth={1.5} />
                        </div>
                        <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">No photos yet</h3>
                        <p className="text-slate-500 dark:text-slate-400 mb-8 text-center max-w-xs">
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
                        {images.map((image: Image, index: number) => {
                            const isCover = album.coverImageId === image.id;
                            const isDeleting = deletingImageId === image.id;
                            const isSelected = selectedIds.has(image.id);

                            return (
                                <div key={image.id} className="relative group mb-4 break-inside-avoid">
                                    {/* Selection checkbox */}
                                    {selectMode && (
                                        <button
                                            onClick={() => toggleImageSelection(image.id)}
                                            className={`absolute top-2 right-2 z-10 w-7 h-7 rounded-lg flex items-center justify-center transition-all shadow-lg ${isSelected
                                                ? 'bg-blue-500 text-white'
                                                : 'bg-white/90 dark:bg-slate-700/90 text-slate-400 hover:text-blue-500'
                                                }`}
                                        >
                                            {isSelected ? (
                                                <CheckSquare className="h-4 w-4" />
                                            ) : (
                                                <Square className="h-4 w-4" />
                                            )}
                                        </button>
                                    )}

                                    <button
                                        onClick={() => selectMode ? toggleImageSelection(image.id) : setSelectedImageIndex(index)}
                                        className={`w-full overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-700 ${selectMode ? 'cursor-pointer' : 'cursor-zoom-in'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-sm hover:shadow-lg transition-shadow ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''
                                            }`}
                                        disabled={isDeleting}
                                        draggable={canEdit && !selectMode} // Enable dragging if editor and not selecting
                                        onDragStart={(e) => {
                                            if (canEdit && !selectMode) {
                                                e.dataTransfer.setData("text/plain", image.id);
                                                e.dataTransfer.effectAllowed = "move";
                                            }
                                        }}
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

                                    {/* Cover indicator */}
                                    {isCover && !selectMode && (
                                        <div className="absolute top-2 left-2 px-2 py-1 bg-blue-500 text-white text-xs font-medium rounded-lg flex items-center gap-1 shadow-lg">
                                            <Star className="h-3 w-3 fill-current" />
                                            Cover
                                        </div>
                                    )}

                                    {/* Download button (visible on hover for everyone) */}
                                    {/* Download button (visible on hover for everyone) */}
                                    {(image.originalUrl || image.url) && (
                                        <button
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                const url = image.originalUrl || image.url;
                                                // Always call downloadImage even if URL is potentially expired
                                                await downloadImage(image.id, url, image.originalFilename);
                                            }}
                                            className="absolute bottom-2 right-2 p-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-lg shadow-lg hover:bg-white dark:hover:bg-slate-800 transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <Download className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                                        </button>
                                    )}

                                    {/* Select button (visible on hover when NOT in select mode) */}
                                    {canEdit && !selectMode && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (!selectMode) toggleSelectMode();
                                                toggleImageSelection(image.id);
                                            }}
                                            className="absolute top-2 left-2 p-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-lg shadow-lg hover:bg-white dark:hover:bg-slate-800 transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <Square className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                                        </button>
                                    )}

                                    {/* Edit actions (visible on hover for editors - only show menu and delete) */}
                                    {canEdit && !selectMode && (
                                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <button className="p-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-lg shadow-lg hover:bg-white dark:hover:bg-slate-800 transition-colors">
                                                        <ImageIcon className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                                                    </button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="rounded-xl bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700">
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
                                <div className="aspect-square rounded-2xl border-2 border-dashed border-blue-200 dark:border-blue-700 hover:border-blue-400 dark:hover:border-blue-500 bg-white dark:bg-slate-800 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-all flex flex-col items-center justify-center gap-2 group">
                                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/50 group-hover:bg-blue-200 dark:group-hover:bg-blue-900 rounded-xl flex items-center justify-center transition-colors">
                                        <Plus className="h-6 w-6 text-blue-500" />
                                    </div>
                                    <span className="text-xs font-medium text-blue-500">{uploading ? "Uploading..." : "Add photo"}</span>
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

            {/* Centralized Photo Viewer Dialog */}
            <Dialog open={selectedImageIndex !== null} onOpenChange={(open) => !open && setSelectedImageIndex(null)}>
                <DialogContent className="max-w-7xl p-0 border-0 bg-transparent shadow-none focus:outline-none h-screen w-screen flex flex-col justify-center pointer-events-none">
                    <VisuallyHidden>
                        <DialogTitle>Photo Viewer</DialogTitle>
                    </VisuallyHidden>
                    <div className="relative w-full h-full flex items-center justify-center pointer-events-auto">
                        {/* Top Right Controls */}
                        <div className="absolute right-4 top-4 z-50 flex items-center gap-2">
                            {/* Delete Button */}
                            {canEdit && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (selectedImageIndex !== null) {
                                            setDeleteImageConfirmId(images[selectedImageIndex].id);
                                        }
                                    }}
                                    className="p-3 bg-black/20 hover:bg-black/40 hover:text-red-400 backdrop-blur-md rounded-full text-white transition-all shadow-lg border border-white/20 group"
                                    title="Delete photo"
                                >
                                    <Trash2 className="h-5 w-5" />
                                </button>
                            )}

                            {/* Download Button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (selectedImageIndex !== null) {
                                        const img = images[selectedImageIndex];
                                        downloadImage(img.id, img.originalUrl || img.url, img.originalFilename);
                                    }
                                }}
                                className="p-3 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white transition-all shadow-lg border border-white/20 group"
                                title="Download original"
                            >
                                <Download className="h-5 w-5" />
                            </button>

                            {/* Close Button */}
                            <button
                                onClick={() => setSelectedImageIndex(null)}
                                className="p-3 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white transition-all shadow-lg border border-white/20 group hover:rotate-90"
                                aria-label="Close viewer"
                            >
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        {/* Previous Button */}
                        <button
                            onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                            className="absolute left-4 top-1/2 -translate-y-1/2 z-50 p-4 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white transition-all shadow-lg border border-white/20 group"
                            aria-label="Previous photo"
                        >
                            <ArrowLeft className="h-8 w-8 group-hover:scale-110 transition-transform" />
                        </button>

                        {/* Next Button */}
                        <button
                            onClick={(e) => { e.stopPropagation(); handleNext(); }}
                            className="absolute right-4 top-1/2 -translate-y-1/2 z-50 p-4 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white transition-all shadow-lg border border-white/20 group"
                            aria-label="Next photo"
                        >
                            <ArrowLeft className="h-8 w-8 rotate-180 group-hover:scale-110 transition-transform" />
                        </button>

                        {/* Image Display */}
                        {selectedImageIndex !== null && images[selectedImageIndex] && (
                            <div className="relative w-full h-full flex items-center justify-center p-4 md:p-12">
                                <img
                                    src={images[selectedImageIndex].displayUrl || images[selectedImageIndex].url}
                                    alt=""
                                    className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
                                />
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/50 backdrop-blur-md rounded-full text-white text-sm flex items-center gap-3">
                                    <span>{selectedImageIndex + 1} / {images.length}</span>
                                    {images[selectedImageIndex].dateTaken && (
                                        <span className="text-white/70">
                                            {new Date(images[selectedImageIndex].dateTaken!).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

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
                title="Leave Album?"
                description="Are you sure you want to leave this album? You will lose access until you are invited back by the owner."
                onConfirm={handleLeaveAlbum}
                confirmText="Leave Album"
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
