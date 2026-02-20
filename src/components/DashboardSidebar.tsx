"use client";

import { LayoutGrid, User, Users, Plus, Heart, MapPin } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CreateAlbumDialog } from "@/components/CreateAlbumDialog";

import { useAlbumStore } from "@/stores/useAlbumStore";

interface DashboardSidebarProps {
    onAlbumCreated: () => void;
    className?: string;
}

export function DashboardSidebar({
    onAlbumCreated,
    className,
}: DashboardSidebarProps) {
    const { filter: currentFilter, setFilter: onFilterChange } = useAlbumStore();
    const navItems = [
        {
            id: "all" as const,
            label: "All albums",
            icon: LayoutGrid,
        },
        {
            id: "mine" as const,
            label: "My albums",
            icon: User,
        },
        {
            id: "shared" as const,
            label: "Shared with me",
            icon: Users,
        },
        {
            id: "favorites" as const,
            label: "My favorites",
            icon: Heart,
        },
    ];

    const pathname = usePathname();
    const isTimelineActive = pathname === '/timeline';

    return (
        <aside className={cn("w-64 flex flex-col gap-6 py-6 px-4 border-r border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 backdrop-blur-sm sticky top-16 h-[calc(100vh-64px)] overflow-y-auto", className)}>
            {/* New Album Button */}
            <div className="px-2">
                <CreateAlbumDialog
                    onSuccess={onAlbumCreated}
                    trigger={
                        <Button className="w-full justify-start gap-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 shadow-sm rounded-2xl h-12 px-4 transition-all hover:shadow-md hover:border-blue-200 dark:hover:border-blue-500 group">
                            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-900/50 group-hover:bg-blue-100 dark:group-hover:bg-blue-900 transition-colors">
                                <Plus className="h-4 w-4 text-blue-500" />
                            </div>
                            <span className="font-medium">Create album</span>
                        </Button>
                    }
                />
            </div>

            {/* Navigation items */}
            <nav className="flex flex-col gap-1">
                {navItems.map((item) => {
                    // Force dashboard nav items to be inactive if we're on the timeline or map pages
                    const isActive = currentFilter === item.id && pathname === '/albums';
                    const Icon = item.icon;

                    return (
                        <Link
                            href="/albums"
                            key={item.id}
                            onClick={() => onFilterChange(item.id)}
                            className={cn(
                                "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all group",
                                isActive
                                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm shadow-blue-500/5"
                                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
                            )}
                        >
                            <Icon
                                className={cn(
                                    "h-4 w-4 transition-colors",
                                    isActive ? "text-blue-500 dark:text-blue-400" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                                )}
                            />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            {/* Timeline Link */}
            <div className="px-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Link href="/timeline">
                    <Button
                        variant="ghost"
                        className={cn(
                            "w-full justify-start gap-3 rounded-xl h-10 px-4 transition-all group",
                            isTimelineActive
                                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm shadow-blue-500/5"
                                : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
                        )}
                    >
                        <LayoutGrid className={cn(
                            "h-4 w-4 transition-colors",
                            isTimelineActive ? "text-blue-500 dark:text-blue-400" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                        )} />
                        <span className="font-medium">Timeline View</span>
                    </Button>
                </Link>
            </div>

            {/* Map Link */}
            <div className="px-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Link href="/map">
                    <Button
                        variant="ghost"
                        className="w-full justify-start gap-3 text-slate-500 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 rounded-xl h-10 px-4 transition-all group"
                    >
                        <MapPin className="h-4 w-4 text-slate-400 dark:text-slate-500 group-hover:text-blue-500 transition-colors" />
                        <span className="font-medium">Photo Map</span>
                    </Button>
                </Link>
            </div>

        </aside>
    );
}
