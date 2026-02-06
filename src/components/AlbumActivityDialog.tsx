"use client";

import { useMemo, useState, useEffect } from "react";
import useSWRInfinite from "swr/infinite";
import { formatDistanceToNow } from "date-fns";
import { useInView } from "react-intersection-observer";
import {
    History,
    Loader2,
    Upload,
    Trash2,
    Settings,
    UserPlus,
    UserMinus,
    Shield,
    FolderPlus,
    Folder,
    FileImage
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fetcher } from "@/lib/fetcher";

interface ActivityLog {
    id: string;
    action: string;
    metadata: string | null; // JSON string
    createdAt: string;
    user: {
        id: string;
        name: string;
        avatarUrl: string | null;
        email: string;
    } | null;
}

interface ActivityResponse {
    logs: ActivityLog[];
    nextCursor: string | null;
}

interface AlbumActivityDialogProps {
    albumId: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: React.ReactNode;
}

export function AlbumActivityDialog({ albumId, open: ControlledOpen, onOpenChange: setControlledOpen, trigger }: AlbumActivityDialogProps) {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);

    // Handle controlled vs uncontrolled state
    const isControlled = ControlledOpen !== undefined;
    const open = isControlled ? ControlledOpen : uncontrolledOpen;
    const setOpen = isControlled ? setControlledOpen : setUncontrolledOpen;

    const { ref, inView } = useInView();

    const getKey = (pageIndex: number, previousPageData: ActivityResponse | null) => {
        if (!open) return null; // Don't fetch if closed
        if (previousPageData && !previousPageData.nextCursor) return null; // Reached the end

        const cursor = previousPageData ? previousPageData.nextCursor : "";
        return `/api/albums/${albumId}/activity?limit=20&cursor=${cursor}`;
    };

    const { data, error, size, setSize, isValidating } = useSWRInfinite<ActivityResponse>(getKey, fetcher);

    // Flatten logs
    const logs = useMemo(() => {
        return data ? data.flatMap(page => page.logs) : [];
    }, [data]);

    const isLoadingInitialData = !data && !error;
    const isLoadingMore = isLoadingInitialData || (size > 0 && data && typeof data[size - 1] === "undefined");
    const isEmpty = data?.[0]?.logs.length === 0;
    const isReachingEnd = isEmpty || (data && !data[data.length - 1]?.nextCursor);

    // Load more when sentinel comes into view
    useEffect(() => {
        if (inView && !isReachingEnd && !isValidating) {
            setSize(size + 1);
        }
    }, [inView, isReachingEnd, isValidating, setSize, size]);

    const getActionIcon = (action: string) => {
        switch (action) {
            case "image_upload": return <Upload className="h-4 w-4 text-blue-500" />;
            case "image_delete": return <Trash2 className="h-4 w-4 text-red-500" />;
            case "image_update": return <FileImage className="h-4 w-4 text-amber-500" />;
            case "album_update": return <Settings className="h-4 w-4 text-slate-500" />;
            case "member_join": return <UserPlus className="h-4 w-4 text-green-500" />;
            case "member_leave": return <UserMinus className="h-4 w-4 text-orange-500" />;
            case "member_role_change": return <Shield className="h-4 w-4 text-purple-500" />;
            case "folder_create": return <FolderPlus className="h-4 w-4 text-yellow-500" />;
            case "folder_update": return <Folder className="h-4 w-4 text-yellow-500" />;
            case "folder_delete": return <Trash2 className="h-4 w-4 text-red-500" />;
            default: return <History className="h-4 w-4 text-slate-400" />;
        }
    };

    const formatActionMessage = (log: ActivityLog) => {
        const meta = log.metadata ? JSON.parse(log.metadata) : {};

        switch (log.action) {
            case "image_upload":
                return <span>Uploaded <strong>{meta.filename || "a photo"}</strong></span>;
            case "image_delete":
                return <span>Deleted a photo</span>;
            case "image_update":
                if (meta.move) {
                    return <span>Moved a photo</span>;
                }
                return <span>Updated a photo</span>;
            case "album_update":
                return <span>Updated album settings</span>;
            case "member_join":
                return <span>Joined the album</span>;
            case "member_leave":
                return <span>{meta.isKick ? "Was removed from the album" : "Left the album"}</span>;
            case "member_role_change":
                return <span>Changed a member's role to <strong>{meta.newRole}</strong></span>;
            case "folder_create":
                return <span>Created folder <strong>{meta.name || meta.folderName || "Untitled"}</strong></span>;
            case "folder_update":
                return <span>Updated folder <strong>{meta.name || meta.folderName || "Untitled"}</strong></span>;
            case "folder_delete":
                return <span>Deleted folder <strong>{meta.name || meta.folderName || "Untitled"}</strong></span>;
            default:
                return <span>Performed {log.action.replace(/_/g, " ")}</span>;
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="ghost" size="icon">
                        <History className="h-4 w-4" />
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md rounded-2xl border-slate-100 dark:border-slate-700 shadow-xl bg-white dark:bg-slate-900 max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-xl text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <History className="h-5 w-5 text-slate-500" />
                        Activity Log
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-hidden mt-2">
                    {isLoadingInitialData ? (
                        <div className="flex flex-col items-center justify-center h-40 space-y-2 text-slate-400">
                            <Loader2 className="h-8 w-8 animate-spin" />
                            <span className="text-sm">Loading activity...</span>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-40 space-y-2 text-red-500">
                            <span className="text-sm">Failed to load activity logs</span>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 space-y-2 text-slate-400">
                            <History className="h-8 w-8 opacity-20" />
                            <span className="text-sm">No activity recorded yet</span>
                        </div>
                    ) : (
                        <ScrollArea className="h-[50vh] pr-4" type="always">
                            <div className="space-y-4 pl-1 pb-4">
                                {logs.map((log) => (
                                    <div key={log.id} className="flex gap-3 group">
                                        <div className="flex-shrink-0 mt-1">
                                            <Avatar className="h-8 w-8 border border-slate-100 dark:border-slate-700">
                                                <AvatarImage src={log.user?.avatarUrl || undefined} />
                                                <AvatarFallback className="bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs">
                                                    {log.user?.name?.charAt(0) || "?"}
                                                </AvatarFallback>
                                            </Avatar>
                                        </div>
                                        <div className="flex-1 space-y-0.5">
                                            <div className="flex items-center justify-between">
                                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                    {log.user?.name || "Unknown User"}
                                                </p>
                                                <span className="text-xs text-slate-400 whitespace-nowrap ml-2">
                                                    {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                                <div className="p-1 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex-shrink-0">
                                                    {getActionIcon(log.action)}
                                                </div>
                                                <div className="line-clamp-2">
                                                    {formatActionMessage(log)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {/* Loading Sentinel */}
                                <div ref={ref} className="h-10 flex items-center justify-center">
                                    {isValidating && !isReachingEnd && (
                                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                                    )}
                                </div>
                            </div>
                        </ScrollArea>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
