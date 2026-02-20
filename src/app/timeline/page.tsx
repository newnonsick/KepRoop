"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { DashboardNavbar } from "@/components/DashboardNavbar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { TimelineGrid } from "@/components/TimelineGrid";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function TimelinePage() {
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

    return (
        <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950">
            <DashboardNavbar />

            <div className="flex">
                {/* Desktop Sidebar */}
                <DashboardSidebar
                    onAlbumCreated={() => { }}
                    className="hidden lg:flex"
                />

                <main className="flex-1 min-w-0">
                    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
                        {/* Header for Mobile alignment */}
                        <div className="flex items-center gap-4 mb-4 lg:hidden">
                            <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
                                <SheetTrigger asChild>
                                    <Button variant="ghost" size="icon" className="lg:hidden">
                                        <Menu className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="left" className="p-0 w-72 dark:bg-slate-900 dark:border-slate-800">
                                    <DashboardSidebar
                                        onAlbumCreated={() => setIsMobileSidebarOpen(false)}
                                        className="w-full border-none h-full sticky top-0"
                                    />
                                </SheetContent>
                            </Sheet>
                            <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 lg:hidden">
                                Timeline
                            </h1>
                        </div>

                        {/* Global Timeline View */}
                        <TimelineGrid />
                    </div>
                </main>
            </div>
        </div>
    );
}
