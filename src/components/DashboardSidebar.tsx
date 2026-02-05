"use client";

import { LayoutGrid, User, Users, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CreateAlbumDialog } from "@/components/CreateAlbumDialog";

export type FilterType = "all" | "mine" | "shared";

interface DashboardSidebarProps {
    currentFilter: FilterType;
    onFilterChange: (filter: FilterType) => void;
    onAlbumCreated: () => void;
    className?: string;
}

export function DashboardSidebar({
    currentFilter,
    onFilterChange,
    onAlbumCreated,
    className,
}: DashboardSidebarProps) {
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
    ];

    return (
        <aside className={cn("w-64 flex flex-col gap-6 py-6 px-4 border-r border-slate-100 bg-white backdrop-blur-sm sticky top-16 h-[calc(100vh-64px)] overflow-y-auto", className)}>
            {/* New Album Button */}
            <div className="px-2">
                <CreateAlbumDialog
                    onSuccess={onAlbumCreated}
                    trigger={
                        <Button className="w-full justify-start gap-3 bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm rounded-2xl h-12 px-4 transition-all hover:shadow-md hover:border-blue-200 group">
                            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-blue-50 group-hover:bg-blue-100 transition-colors">
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
                    const isActive = currentFilter === item.id;
                    const Icon = item.icon;

                    return (
                        <button
                            key={item.id}
                            onClick={() => onFilterChange(item.id)}
                            className={cn(
                                "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all group",
                                isActive
                                    ? "bg-blue-50 text-blue-600 shadow-sm shadow-blue-500/5"
                                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                            )}
                        >
                            <Icon
                                className={cn(
                                    "h-4 w-4 transition-colors",
                                    isActive ? "text-blue-500" : "text-slate-400 group-hover:text-slate-600"
                                )}
                            />
                            {item.label}
                        </button>
                    );
                })}
            </nav>

        </aside>
    );
}
