"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Check,
    Copy,
    Link as LinkIcon,
    Loader2,
    Trash2,
    RefreshCw,
    Globe,
    Users,
    UserMinus,
    MoreVertical,
    ChevronDown,
    LogOut
} from "lucide-react";

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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";

interface Member {
    userId: string;
    role: "owner" | "editor" | "viewer";
    joinedAt: string;
    user: {
        id: string;
        name: string;
        email: string;
        avatarUrl: string | null;
    };
}

interface ShareAlbumDialogProps {
    albumId: string;
    albumTitle: string;
    albumVisibility?: "public" | "private";
    userRole?: "owner" | "editor" | "viewer" | null;
    albumOwnerId?: string;
    trigger?: React.ReactNode;
}

export function ShareAlbumDialog({ albumId, albumTitle, albumVisibility = "private", userRole = null, albumOwnerId, trigger }: ShareAlbumDialogProps) {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [membersLoading, setMembersLoading] = useState(false);
    const [error, setError] = useState("");
    const [inviteLink, setInviteLink] = useState("");
    const [copied, setCopied] = useState(false);
    const [inviteRole, setInviteRole] = useState<"viewer" | "editor">("viewer");
    const [members, setMembers] = useState<Member[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const currentUserId = user?.id || null;
    const router = useRouter();

    const isOwner = userRole === "owner";
    const canShareAsEditor = userRole === "owner" || userRole === "editor";

    // Check if a user is the Original Owner (if albumOwnerId is provided)
    const isOriginalOwner = (userId: string) => albumOwnerId ? userId === albumOwnerId : false;
    const isCurrentUserOriginalOwner = currentUserId ? isOriginalOwner(currentUserId) : false;

    // Fetch members
    const fetchMembers = useCallback(async () => {
        setMembersLoading(true);
        try {
            const res = await fetch(`/api/albums/${albumId}/members`);
            if (res.ok) {
                const data = await res.json();
                setMembers(data.members);
            }
        } catch (err) {
            console.error("Failed to fetch members", err);
        } finally {
            setMembersLoading(false);
        }
    }, [albumId]);

    // Fetch existing invite
    const fetchInvite = async (currentRole: "viewer" | "editor") => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/albums/${albumId}/invite?role=${currentRole}`);
            if (res.ok) {
                const data = await res.json();
                if (data.url) {
                    setInviteLink(`${window.location.origin}${data.url}`);
                } else {
                    setInviteLink("");
                }
            } else {
                setInviteLink("");
            }
        } catch (err) {
            console.error("Failed to fetch invite", err);
        } finally {
            setLoading(false);
        }
    };

    // Fetch on role change or open
    useEffect(() => {
        if (open) {
            fetchInvite(inviteRole);
            fetchMembers();
        }
    }, [open, inviteRole, albumId, fetchMembers]);

    const filteredMembers = members.filter(m =>
        m.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.user.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const generateInvite = async () => {
        setLoading(true);
        setError("");

        try {
            const res = await fetch(`/api/albums/${albumId}/invite`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: inviteRole }),
            });

            if (res.ok) {
                const data = await res.json();
                const fullUrl = `${window.location.origin}/invite/${data.code}`;
                setInviteLink(fullUrl);
            } else {
                const data = await res.json();
                setError(data.error || "Failed to generate invite");
            }
        } catch (err) {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const deleteInvite = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/albums/${albumId}/invite`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: inviteRole }),
            });

            if (res.ok) {
                setInviteLink("");
            } else {
                setError("Failed to delete link");
            }
        } catch (err) {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const renewInvite = async () => {
        await deleteInvite();
        await generateInvite();
    };

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(inviteLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            toast.success("Link copied to clipboard");
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    const updateMemberRole = async (memberUserId: string, newRole: "viewer" | "editor" | "owner") => {
        try {
            const res = await fetch(`/api/albums/${albumId}/members/${memberUserId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: newRole }),
            });

            if (res.ok) {
                setMembers(prev => prev.map(m => m.userId === memberUserId ? { ...m, role: newRole } : m));
                toast.success("Role updated");
            } else {
                const data = await res.json();
                toast.error(data.error || "Failed to update role");
            }
        } catch (err) {
            toast.error("Network error");
        }
    };

    const removeMember = async (memberUserId: string) => {
        const isSelf = memberUserId === currentUserId;
        try {
            const res = await fetch(`/api/albums/${albumId}/members/${memberUserId}`, {
                method: "DELETE",
            });

            if (res.ok) {
                if (isSelf) {
                    toast.success("You left the album");
                    setOpen(false);
                    router.push("/dashboard");
                    router.refresh();
                } else {
                    setMembers(prev => prev.filter(m => m.userId !== memberUserId));
                    toast.success("Member removed");
                }
            } else {
                const data = await res.json();
                toast.error(data.error || "Failed to remove member");
            }
        } catch (err) {
            toast.error("Network error");
        }
    };

    const handleOpenChange = (v: boolean) => {
        setOpen(v);
        if (!v) {
            setError("");
            setCopied(false);
            setInviteLink("");
            setSearchQuery("");
        }
    };

    const getInitials = (name: string) => {
        return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" size="sm" className="border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 rounded-xl">
                        Share
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md rounded-3xl border-slate-100 shadow-2xl bg-white p-0 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 pb-0">
                    <DialogHeader>
                        <DialogTitle className="text-xl text-slate-800">Album Access</DialogTitle>
                        <DialogDescription className="text-slate-500">
                            Manage members and share links for &quot;{albumTitle}&quot;
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="flex-1 p-6 pt-4 min-h-0 flex flex-col gap-6">
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    {/* Member List Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between ml-1">
                            <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Members</Label>
                            {members.length > 3 && (
                                <span className="text-[10px] font-medium text-slate-400">{members.length} total</span>
                            )}
                        </div>

                        {/* Search Input */}
                        <div className="relative group">
                            <Input
                                placeholder="Search members by name or email..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-9 bg-slate-50 border-slate-100 rounded-xl text-xs px-3 focus:bg-white transition-all placeholder:text-slate-400"
                            />
                        </div>

                        <ScrollArea className="h-[180px] pr-3 -mr-3">
                            <div className="space-y-1">
                                {membersLoading && members.length === 0 ? (
                                    <div className="flex items-center justify-center py-10">
                                        <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                                    </div>
                                ) : filteredMembers.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-10 text-center">
                                        <Users className="h-8 w-8 text-slate-100 mb-2" />
                                        <p className="text-xs text-slate-400">No members found</p>
                                    </div>
                                ) : (
                                    filteredMembers.map((member) => (
                                        <div key={member.userId} className="flex items-center gap-3 p-2 rounded-2xl hover:bg-slate-50 transition-colors group">
                                            <Avatar className="h-8 w-8 border border-slate-100 shadow-sm">
                                                <AvatarImage src={member.user.avatarUrl || undefined} />
                                                <AvatarFallback className="bg-blue-500 text-white text-[9px] font-bold">
                                                    {getInitials(member.user.name)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-600">
                                                        {member.user.name} {member.userId === currentUserId && "(You)"}
                                                    </p>
                                                    {member.role === "owner" && (
                                                        <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-100 text-[9px] h-3.5 px-1 font-bold uppercase tracking-tight shrink-0 whitespace-nowrap">
                                                            {isOriginalOwner(member.userId) ? "Owner" : "Joint Owner"}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-500 truncate">{member.user.email}</p>
                                            </div>

                                            {isOwner && member.role !== "owner" ? (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] font-medium text-slate-600 gap-1 rounded-lg hover:bg-white border border-transparent hover:border-slate-100 shadow-none">
                                                            <span className="capitalize">{member.role}</span>
                                                            <ChevronDown className="h-3 w-3 text-slate-400" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="rounded-xl border-slate-100 shadow-lg min-w-32">
                                                        <DropdownMenuItem
                                                            onClick={() => updateMemberRole(member.userId, "viewer")}
                                                            className={cn("rounded-lg text-sm", member.role === "viewer" && "bg-slate-50 font-medium text-blue-600")}
                                                        >
                                                            Viewer
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => updateMemberRole(member.userId, "editor")}
                                                            className={cn("rounded-lg text-sm", member.role === "editor" && "bg-slate-50 font-medium text-blue-600")}
                                                        >
                                                            Editor
                                                        </DropdownMenuItem>

                                                        <DropdownMenuItem
                                                            onClick={() => updateMemberRole(member.userId, "owner")}
                                                            className="rounded-lg text-sm"
                                                        >
                                                            Joint Owner
                                                        </DropdownMenuItem>

                                                        <DropdownMenuSeparator className="bg-slate-50/50" />
                                                        <DropdownMenuItem
                                                            onClick={() => removeMember(member.userId)}
                                                            className="text-red-500 focus:text-red-600 focus:bg-red-50 rounded-lg text-sm"
                                                        >
                                                            <UserMinus className="h-4 w-4 mr-2" />
                                                            Remove
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            ) : <div></div>}

                                            {/* Allow Original Owner to Manage Joint Owners */}
                                            {isCurrentUserOriginalOwner && member.role === "owner" && !isOriginalOwner(member.userId) && (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] font-medium text-slate-600 gap-1 rounded-lg hover:bg-white border border-transparent hover:border-slate-100 shadow-none">
                                                            <span>Manage</span>
                                                            <ChevronDown className="h-3 w-3 text-slate-400" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="rounded-xl border-slate-100 shadow-lg min-w-32">
                                                        <DropdownMenuItem
                                                            onClick={() => updateMemberRole(member.userId, "editor")}
                                                            className="rounded-lg text-sm"
                                                        >
                                                            Demote to Editor
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => updateMemberRole(member.userId, "viewer")}
                                                            className="rounded-lg text-sm"
                                                        >
                                                            Demote to Viewer
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator className="bg-slate-50/50" />
                                                        <DropdownMenuItem
                                                            onClick={() => removeMember(member.userId)}
                                                            className="text-red-500 focus:text-red-600 focus:bg-red-50 rounded-lg text-sm"
                                                        >
                                                            <UserMinus className="h-4 w-4 mr-2" />
                                                            Remove
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </ScrollArea>
                    </div>

                    <Separator className="bg-slate-50" />

                    {/* Invite Links */}
                    {canShareAsEditor && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Invite Link</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setInviteRole("viewer")}
                                        className={cn(
                                            "p-3 rounded-2xl border-2 text-left transition-all",
                                            inviteRole === "viewer"
                                                ? "border-blue-500 bg-blue-50 text-blue-600"
                                                : "border-slate-100 hover:border-slate-200 bg-white text-slate-500"
                                        )}
                                    >
                                        <p className="text-sm font-bold">Viewer</p>
                                        <p className="text-[10px] opacity-70">Can view photos</p>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setInviteRole("editor")}
                                        className={cn(
                                            "p-3 rounded-2xl border-2 text-left transition-all",
                                            inviteRole === "editor"
                                                ? "border-blue-500 bg-blue-50 text-blue-600"
                                                : "border-slate-100 hover:border-slate-200 bg-white text-slate-500"
                                        )}
                                    >
                                        <p className="text-sm font-bold">Editor</p>
                                        <p className="text-[10px] opacity-70">Can add photos</p>
                                    </button>
                                </div>
                            </div>

                            {!inviteLink ? (
                                <Button
                                    onClick={generateInvite}
                                    disabled={loading}
                                    className="w-full bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20 rounded-[1.25rem] h-12 font-bold"
                                >
                                    {loading ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : (
                                        <LinkIcon className="h-4 w-4 mr-2" />
                                    )}
                                    Create {inviteRole} link
                                </Button>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <Input
                                            value={inviteLink}
                                            readOnly
                                            className="flex-1 h-12 bg-slate-50 border-slate-100 rounded-2xl text-[13px] font-mono text-slate-600 px-4"
                                        />
                                        <Button
                                            onClick={copyToClipboard}
                                            className={cn(
                                                "shrink-0 rounded-2xl w-24 h-12 font-bold transition-all",
                                                copied ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "bg-blue-500 hover:bg-blue-600 text-white"
                                            )}
                                        >
                                            {copied ? "Copied" : "Copy"}
                                        </Button>
                                    </div>

                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={renewInvite}
                                            disabled={loading}
                                            className="flex-1 h-10 rounded-xl border-slate-100 text-slate-500 hover:text-blue-600 hover:bg-blue-50 text-xs font-semibold gap-1.5"
                                        >
                                            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
                                            Renew
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={deleteInvite}
                                            disabled={loading}
                                            className="flex-1 h-10 rounded-xl border-slate-100 text-slate-500 hover:text-red-600 hover:bg-red-50 text-xs font-semibold gap-1.5"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                            Delete
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
