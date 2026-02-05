"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { toast } from "sonner";
import { Settings } from "lucide-react";

interface UserData {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
}

import { useAuth } from "@/components/providers/AuthProvider";

export function DashboardNavbar() {
    const router = useRouter();
    const { user, isLoading: loading, mutate } = useAuth();
    const [loggingOut, setLoggingOut] = useState(false);
    const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);

    const handleLogout = async () => {
        setLoggingOut(true);
        try {
            await fetch("/api/auth/logout", { method: "POST" });
            await mutate(null); // Clear user state immediately
            toast.success("Signed out successfully");
            router.push("/");
        } catch (error) {
            toast.error("Error signing out");
            router.push("/");
        }
    };

    const getInitials = (name: string) => {
        return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
    };

    return (
        <header className="sticky top-0 z-50 w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-100 dark:border-slate-800">
            <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
                {/* Logo */}
                <Link href="/dashboard" className="flex items-center gap-2 group">
                    <div className="w-9 h-9 relative overflow-hidden rounded-1xl shadow-xl shadow-blue-500/10">
                        <img src="/logo.png" alt="KepRoop Logo" className="w-full h-full object-cover" />
                    </div>
                    <span className="text-xl font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-500 transition-colors">KepRoop</span>
                </Link>

                {/* User Menu */}
                {loading ? (
                    <Skeleton className="h-9 w-9 rounded-full" />
                ) : user ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="flex items-center gap-2 p-1.5 pr-3 rounded-full hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={user.avatarUrl} alt={user.name} />
                                    <AvatarFallback className="bg-blue-500 text-white text-xs font-medium">
                                        {getInitials(user.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-200 hidden sm:inline">
                                    {user.name.split(" ")[0]}
                                </span>
                                <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white dark:bg-slate-900 w-56 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 border-slate-100 dark:border-slate-800">
                            <div className="px-3 py-3">
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{user.name}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                            </div>
                            <DropdownMenuSeparator className="bg-slate-100 dark:bg-slate-800" />
                            <DropdownMenuItem
                                onClick={() => setSettingsOpen(true)}
                                className="text-slate-700 dark:text-slate-300 focus:text-slate-800 dark:focus:text-slate-100 focus:bg-slate-50 dark:focus:bg-slate-800 rounded-lg mx-1 cursor-pointer"
                            >
                                <Settings className="mr-2 h-4 w-4" />
                                Settings
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-slate-100 dark:bg-slate-800" />
                            <DropdownMenuItem
                                onClick={() => setConfirmLogoutOpen(true)}
                                disabled={loggingOut}
                                className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/30 rounded-lg mx-1 cursor-pointer"
                            >
                                <LogOut className="mr-2 h-4 w-4" />
                                {loggingOut ? "Signing out..." : "Sign out"}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <Link
                        href="/"
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-xl shadow-lg shadow-blue-500/25 transition-colors"
                    >
                        Sign in
                    </Link>
                )}
            </div>
            <ConfirmDialog
                open={confirmLogoutOpen}
                onOpenChange={setConfirmLogoutOpen}
                title="Sign out?"
                description="Are you sure you want to sign out of your account?"
                onConfirm={handleLogout}
                confirmText="Sign out"
            />
            <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        </header>
    );
}
