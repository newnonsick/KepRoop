"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Lock, Globe, Image as ImageIcon, Menu, Search, X, Calendar, ChevronDown, ChevronUp, Filter, LayoutGrid, Loader2, ArrowUpDown, ArrowDown, ArrowUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { cn } from "@/lib/utils";
import { DashboardNavbar } from "@/components/DashboardNavbar";
import { CreateAlbumDialog } from "@/components/CreateAlbumDialog";
import { DashboardSidebar, type FilterType } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlbumCover } from "@/components/AlbumCover";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Album {
    id: string;
    title: string;
    description?: string;
    visibility: "public" | "private";
    taskRole: "owner" | "editor" | "viewer";
    coverImageUrl?: string;
    previewImageUrls?: string[];
    imageCount?: number;
    albumDate: string;
}

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { useAuth } from "@/components/providers/AuthProvider";

// Build API URL with query params
function buildAlbumsUrl(params: {
    cursor?: string | null;
    filter: FilterType;
    visibility: "all" | "public" | "private";
    startDate: string;
    endDate: string;
    search: string;
    sortBy: string;
    sortDir: string;
}) {
    // Use a dummy base for URL construction to avoid 'window is not defined' on server
    const url = new URL("/api/albums", "http://base.url");

    if (params.cursor) url.searchParams.set("cursor", params.cursor);
    if (params.filter !== "all") url.searchParams.set("filter", params.filter);
    if (params.visibility !== "all") url.searchParams.set("visibility", params.visibility);
    if (params.startDate) url.searchParams.set("startDate", params.startDate);
    if (params.endDate) url.searchParams.set("endDate", params.endDate);
    if (params.search) url.searchParams.set("search", params.search);
    if (params.sortBy !== "joinedAt") url.searchParams.set("sortBy", params.sortBy);
    if (params.sortDir !== "desc") url.searchParams.set("sortDir", params.sortDir);

    // Return path + query string (relative URL)
    return url.pathname + url.search;
}

export default function DashboardPage() {
    const { user } = useAuth();
    const [filter, setFilter] = useState<FilterType>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [visibilityFilter, setVisibilityFilter] = useState<"all" | "public" | "private">("all");
    const [sortBy, setSortBy] = useState<"albumDate" | "createdAt">("albumDate");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const [showFilters, setShowFilters] = useState(false);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const router = useRouter();

    // Pagination state
    const [albums, setAlbums] = useState<Album[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Build URL for initial fetch (no cursor)
    const initialUrl = buildAlbumsUrl({
        cursor: null,
        filter,
        visibility: visibilityFilter,
        startDate,
        endDate,
        search: searchQuery,
        sortBy,
        sortDir,
    });

    const { data, error, isLoading: loading, mutate } = useSWR(initialUrl, fetcher);

    // Update albums when data changes (initial load or filter change)
    useEffect(() => {
        if (data) {
            setAlbums(data.albums || []);
            setCursor(data.nextCursor || null);
            setHasMore(data.hasMore || false);
        }
    }, [data]);

    // Note: We don't reset albums on filter change anymore
    // SWR automatically handles refetching when initialUrl changes
    // The loading state from SWR will show the skeleton

    const loadMore = async () => {
        if (!cursor || isLoadingMore) return;

        setIsLoadingMore(true);
        try {
            const url = buildAlbumsUrl({
                cursor,
                filter,
                visibility: visibilityFilter,
                startDate,
                endDate,
                search: searchQuery,
                sortBy,
                sortDir,
            });
            const res = await fetch(url);
            const moreData = await res.json();

            if (moreData.albums) {
                setAlbums(prev => [...prev, ...moreData.albums]);
                setCursor(moreData.nextCursor || null);
                setHasMore(moreData.hasMore || false);
            }
        } catch (err) {
            console.error("Failed to load more albums:", err);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const refreshAlbums = () => mutate();

    const formatLocalDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    // Albums are now server-filtered, no client filtering needed
    const filteredAlbums = albums;

    const getPageTitle = () => {
        switch (filter) {
            case "mine":
                return "My Albums";
            case "shared":
                return "Shared with me";
            default:
                return "All Albums";
        }
    };

    return (
        <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950">
            <DashboardNavbar />

            <div className="flex">
                {/* Desktop Sidebar */}
                <DashboardSidebar
                    currentFilter={filter}
                    onFilterChange={setFilter}
                    onAlbumCreated={refreshAlbums}
                    className="hidden lg:flex"
                />

                <main className="flex-1 min-w-0">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                {/* Mobile Menu Trigger */}
                                <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
                                    <SheetTrigger asChild>
                                        <Button variant="ghost" size="icon" className="lg:hidden">
                                            <Menu className="h-5 w-5 text-slate-600" />
                                        </Button>
                                    </SheetTrigger>
                                    <SheetContent side="left" className="p-0 w-72 dark:bg-slate-900 dark:border-slate-800">
                                        <DashboardSidebar
                                            currentFilter={filter}
                                            onFilterChange={(f) => {
                                                setFilter(f);
                                                setIsMobileSidebarOpen(false);
                                            }}
                                            onAlbumCreated={() => {
                                                refreshAlbums();
                                                setIsMobileSidebarOpen(false);
                                            }}
                                            className="w-full border-none h-full sticky top-0"
                                        />
                                    </SheetContent>
                                </Sheet>

                                <div>
                                    <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{getPageTitle()}</h1>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                        {(loading || (!loading && data?.albums?.length && albums.length === 0)) ? "Loading albums..." : (
                                            filteredAlbums.length === 0
                                                ? (searchQuery ? "No matches found" : "No albums found")
                                                : `${filteredAlbums.length} album${filteredAlbums.length === 1 ? "" : "s"}`
                                        )}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                {/* Desktop Toolbar - Clean layout like mobile */}
                                <div className="hidden lg:flex items-center gap-2">
                                    <div className="relative group w-[320px]">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                        <Input
                                            placeholder="Search albums..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-11 pr-10 h-11 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm font-medium placeholder:text-slate-400 dark:placeholder:text-slate-500 dark:text-slate-100"
                                        />
                                        {searchQuery && (
                                            <button
                                                onClick={() => setSearchQuery("")}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-slate-100 rounded-xl transition-colors"
                                            >
                                                <X className="h-4 w-4 text-slate-400" />
                                            </button>
                                        )}
                                    </div>

                                    {/* Sort Dropdown - Compact with single direction arrow */}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="outline"
                                                className="h-11 px-3 gap-1.5 rounded-2xl transition-all border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700"
                                            >
                                                {sortDir === "desc" ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                                                <span className="text-sm">
                                                    {sortBy === "albumDate" ? "Album Date" : "Created"}
                                                </span>
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border-slate-100 dark:border-slate-700 p-1">
                                            <DropdownMenuItem
                                                onClick={() => { setSortBy("albumDate"); setSortDir("desc"); }}
                                                className="rounded-xl px-3 py-2 cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-700 dark:text-slate-200"
                                            >
                                                <ArrowDown className="mr-2 h-4 w-4 text-slate-400" />
                                                Album Date (Newest)
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => { setSortBy("albumDate"); setSortDir("asc"); }}
                                                className="rounded-xl px-3 py-2 cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-700 dark:text-slate-200"
                                            >
                                                <ArrowUp className="mr-2 h-4 w-4 text-slate-400" />
                                                Album Date (Oldest)
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => { setSortBy("createdAt"); setSortDir("desc"); }}
                                                className="rounded-xl px-3 py-2 cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-700 dark:text-slate-200"
                                            >
                                                <ArrowDown className="mr-2 h-4 w-4 text-slate-400" />
                                                Created (Newest)
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => { setSortBy("createdAt"); setSortDir("asc"); }}
                                                className="rounded-xl px-3 py-2 cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-700 dark:text-slate-200"
                                            >
                                                <ArrowUp className="mr-2 h-4 w-4 text-slate-400" />
                                                Created (Oldest)
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>

                                    {/* Filter Button */}
                                    <Button
                                        variant="outline"
                                        onClick={() => setShowFilters(!showFilters)}
                                        className={cn(
                                            "h-11 px-3 gap-1.5 rounded-2xl transition-all border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700",
                                            (startDate || endDate || visibilityFilter !== "all" || showFilters) && "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400 shadow-sm"
                                        )}
                                    >
                                        <Filter className="h-4 w-4" />
                                        <span className="text-sm">Filters</span>
                                        {(visibilityFilter !== "all" || startDate || endDate) && (
                                            <span className="w-2 h-2 bg-blue-500 rounded-full" />
                                        )}
                                    </Button>
                                </div>

                                <CreateAlbumDialog onSuccess={refreshAlbums} />
                            </div>
                        </div>

                        {/* Collapsible Filters (Desktop) */}
                        <div className={cn(
                            "hidden lg:block overflow-hidden transition-all duration-300 ease-in-out",
                            showFilters ? "max-h-32 mb-6" : "max-h-0"
                        )}>
                            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-4 shadow-sm">
                                <div className="flex items-center justify-between gap-6">
                                    {/* Visibility Filter */}
                                    <div className="flex items-center gap-3">
                                        <Label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Visibility:</Label>
                                        <div className="flex items-center gap-1.5">
                                            {(["all", "public", "private"] as const).map((vis) => (
                                                <button
                                                    key={vis}
                                                    onClick={() => setVisibilityFilter(vis)}
                                                    className={cn(
                                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border",
                                                        visibilityFilter === vis
                                                            ? "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400"
                                                            : "bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600"
                                                    )}
                                                >
                                                    {vis === "all" && <LayoutGrid className="h-3.5 w-3.5" />}
                                                    {vis === "public" && <Globe className="h-3.5 w-3.5" />}
                                                    {vis === "private" && <Lock className="h-3.5 w-3.5" />}
                                                    <span className="capitalize">{vis}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Date Range Filter */}
                                    <div className="flex items-center gap-3">
                                        <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Date Range:</Label>
                                        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl px-3 h-10 focus-within:bg-white dark:focus-within:bg-slate-800 focus-within:border-blue-500 transition-all">
                                            <Calendar className="h-4 w-4 text-slate-400" />
                                            <input
                                                type="date"
                                                value={startDate}
                                                onChange={(e) => setStartDate(e.target.value)}
                                                className="bg-transparent border-none text-sm text-slate-600 dark:text-slate-300 focus:ring-0 p-0 w-28 font-medium"
                                            />
                                            <span className="text-slate-300 font-light">to</span>
                                            <input
                                                type="date"
                                                value={endDate}
                                                onChange={(e) => setEndDate(e.target.value)}
                                                className="bg-transparent border-none text-sm text-slate-600 dark:text-slate-300 focus:ring-0 p-0 w-28 font-medium"
                                            />
                                            {(startDate || endDate) && (
                                                <button
                                                    onClick={() => { setStartDate(""); setEndDate(""); }}
                                                    className="p-1 hover:bg-slate-200 rounded-full transition-colors"
                                                >
                                                    <X className="h-3 w-3 text-slate-400" />
                                                </button>
                                            )}
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                const start = new Date();
                                                start.setDate(start.getDate() - 7);
                                                setStartDate(start.toISOString().split('T')[0]);
                                                setEndDate(new Date().toISOString().split('T')[0]);
                                            }}
                                            className="h-8 px-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                                        >
                                            7 Days
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                const start = new Date();
                                                start.setDate(start.getDate() - 30);
                                                setStartDate(start.toISOString().split('T')[0]);
                                                setEndDate(new Date().toISOString().split('T')[0]);
                                            }}
                                            className="h-8 px-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                                        >
                                            30 Days
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Active Filter Chips (Desktop) */}
                        <div className="hidden lg:flex flex-wrap items-center gap-2 mb-8">
                            {searchQuery && (
                                <div className="flex items-center gap-1.5 pl-3 pr-1 py-1 bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-800 rounded-full text-xs font-semibold text-blue-600 dark:text-blue-400 shadow-sm animate-in fade-in zoom-in duration-300">
                                    <span>Search: &quot;{searchQuery}&quot;</span>
                                    <button onClick={() => setSearchQuery("")} className="p-1 hover:bg-blue-50 rounded-full transition-colors">
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            )}
                            {visibilityFilter !== "all" && (
                                <div className="flex items-center gap-1.5 pl-3 pr-1 py-1 bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-800 rounded-full text-xs font-semibold text-blue-600 dark:text-blue-400 shadow-sm animate-in fade-in zoom-in duration-300">
                                    <span className="capitalize">Visibility: {visibilityFilter}</span>
                                    <button onClick={() => setVisibilityFilter("all")} className="p-1 hover:bg-blue-50 rounded-full transition-colors">
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            )}
                            {(startDate || endDate) && (
                                <div className="flex items-center gap-1.5 pl-3 pr-1 py-1 bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-800 rounded-full text-xs font-semibold text-blue-600 dark:text-blue-400 shadow-sm animate-in fade-in zoom-in duration-300">
                                    <span>Date: {startDate || '...'} to {endDate || '...'}</span>
                                    <button onClick={() => { setStartDate(""); setEndDate(""); }} className="p-1 hover:bg-blue-50 rounded-full transition-colors">
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Mobile Search & Filters */}
                        <div className="lg:hidden flex flex-col gap-4 mb-8">
                            <div className="flex gap-2">
                                <div className="relative group flex-1">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                    <Input
                                        placeholder="Search albums..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-11 pr-10 h-12 bg-white border-slate-200 rounded-2xl shadow-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm font-medium"
                                    />
                                    {searchQuery && (
                                        <button
                                            onClick={() => setSearchQuery("")}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-slate-100 rounded-xl transition-colors"
                                        >
                                            <X className="h-4 w-4 text-slate-400" />
                                        </button>
                                    )}
                                </div>

                                {/* Mobile Sort Dropdown */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-12 w-12 rounded-2xl transition-all border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0 dark:text-slate-300"
                                        >
                                            {sortDir === "desc" ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border-slate-100 dark:border-slate-700 p-1">
                                        <DropdownMenuItem
                                            onClick={() => { setSortBy("albumDate"); setSortDir("desc"); }}
                                            className="rounded-xl px-3 py-2 cursor-pointer focus:bg-slate-50"
                                        >
                                            <ArrowDown className="mr-2 h-4 w-4 text-slate-400" />
                                            Album Date (Newest)
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => { setSortBy("albumDate"); setSortDir("asc"); }}
                                            className="rounded-xl px-3 py-2 cursor-pointer focus:bg-slate-50"
                                        >
                                            <ArrowUp className="mr-2 h-4 w-4 text-slate-400" />
                                            Album Date (Oldest)
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => { setSortBy("createdAt"); setSortDir("desc"); }}
                                            className="rounded-xl px-3 py-2 cursor-pointer focus:bg-slate-50"
                                        >
                                            <ArrowDown className="mr-2 h-4 w-4 text-slate-400" />
                                            Created (Newest)
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => { setSortBy("createdAt"); setSortDir("asc"); }}
                                            className="rounded-xl px-3 py-2 cursor-pointer focus:bg-slate-50"
                                        >
                                            <ArrowUp className="mr-2 h-4 w-4 text-slate-400" />
                                            Created (Oldest)
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setShowFilters(!showFilters)}
                                    className={cn(
                                        "h-12 w-12 rounded-2xl transition-all border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0",
                                        (startDate || endDate || visibilityFilter !== "all" || showFilters) && "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400 shadow-sm"
                                    )}
                                >
                                    <Filter className="h-4 w-4" />
                                </Button>
                            </div>

                            <div className={cn(
                                "overflow-hidden transition-all duration-300 ease-in-out bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl shadow-sm",
                                showFilters ? "max-h-[300px] p-4 opacity-100" : "max-h-0 opacity-0 p-0"
                            )}>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] ml-1">Visibility</Label>
                                        <div className="flex p-1 bg-slate-50 dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600">
                                            {["all", "public", "private"].map((v) => (
                                                <button
                                                    key={v}
                                                    onClick={() => setVisibilityFilter(v as any)}
                                                    className={cn(
                                                        "flex-1 py-2 text-xs font-semibold rounded-lg transition-all capitalize",
                                                        visibilityFilter === v
                                                            ? "bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm border border-blue-100 dark:border-blue-800"
                                                            : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                                                    )}
                                                >
                                                    {v}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] ml-1">Date Range</Label>
                                        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 h-11 focus-within:bg-white dark:focus-within:bg-slate-800 focus-within:border-blue-500 transition-all">
                                            <Calendar className="h-4 w-4 text-slate-400" />
                                            <input
                                                type="date"
                                                value={startDate}
                                                onChange={(e) => setStartDate(e.target.value)}
                                                className="bg-transparent border-none text-[13px] text-slate-600 focus:ring-0 p-0 flex-1 min-w-0 font-medium"
                                            />
                                            <span className="text-slate-300 font-light">/</span>
                                            <input
                                                type="date"
                                                value={endDate}
                                                onChange={(e) => setEndDate(e.target.value)}
                                                className="bg-transparent border-none text-[13px] text-slate-600 focus:ring-0 p-0 flex-1 min-w-0 font-medium"
                                            />
                                            {(startDate || endDate) && (
                                                <button
                                                    onClick={() => { setStartDate(""); setEndDate(""); }}
                                                    className="p-1 hover:bg-slate-200 rounded-full transition-colors"
                                                >
                                                    <X className="h-3 w-3 text-slate-400" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Mobile Chips */}
                            {!showFilters && (searchQuery || visibilityFilter !== "all" || startDate || endDate) && (
                                <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                    {searchQuery && (
                                        <div className="flex items-center gap-1 pl-2 pr-1 py-1 bg-blue-50 border border-blue-100 rounded-full text-[10px] font-bold text-blue-600">
                                            <span>Search: {searchQuery}</span>
                                            <X className="h-2 w-2 cursor-pointer" onClick={() => setSearchQuery("")} />
                                        </div>
                                    )}
                                    {visibilityFilter !== "all" && (
                                        <div className="flex items-center gap-1 pl-2 pr-1 py-1 bg-blue-50 border border-blue-100 rounded-full text-[10px] font-bold text-blue-600 capitalize">
                                            <span>{visibilityFilter}</span>
                                            <X className="h-2 w-2 cursor-pointer" onClick={() => setVisibilityFilter("all")} />
                                        </div>
                                    )}
                                    {(startDate || endDate) && (
                                        <div className="flex items-center gap-1 pl-2 pr-1 py-1 bg-blue-50 border border-blue-100 rounded-full text-[10px] font-bold text-blue-600">
                                            <span>Date: {startDate || '...'} - {endDate || '...'}</span>
                                            <X className="h-2 w-2 cursor-pointer" onClick={() => { setStartDate(""); setEndDate(""); }} />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Album Grid */}
                        {
                            (loading || (!loading && data?.albums?.length && albums.length === 0)) ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {[...Array(6)].map((_, i) => (
                                        <div key={i} className="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-700">
                                            <Skeleton className="aspect-[4/3] rounded-none" />
                                            <div className="p-5 space-y-3">
                                                <Skeleton className="h-5 w-2/3 rounded-lg" />
                                                <Skeleton className="h-4 w-1/2 rounded-lg" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : filteredAlbums.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm border-dashed">
                                    <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
                                        <ImageIcon className="h-10 w-10 text-blue-400" strokeWidth={1.5} />
                                    </div>
                                    <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
                                        {searchQuery ? "No matches found" : "No albums here"}
                                    </h3>
                                    <p className="text-slate-500 dark:text-slate-400 mb-8 text-center max-w-xs">
                                        {searchQuery
                                            ? `We couldn't find any albums matching "${searchQuery}"`
                                            : (filter === "all"
                                                ? "Create your first album to start organizing your photos"
                                                : filter === "mine"
                                                    ? "You haven't created any albums yet"
                                                    : "No one has shared any albums with you yet")
                                        }
                                    </p>
                                    {searchQuery ? (
                                        <Button
                                            variant="outline"
                                            onClick={() => setSearchQuery("")}
                                            className="rounded-2xl px-6 h-12 border-slate-200 text-slate-600 hover:bg-slate-50"
                                        >
                                            Clear search
                                        </Button>
                                    ) : filter !== "shared" && (
                                        <CreateAlbumDialog
                                            trigger={
                                                <Button className="gap-2 bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20 rounded-2xl px-6 h-12">
                                                    <Plus className="h-4 w-4" />
                                                    Create album
                                                </Button>
                                            }
                                            onSuccess={refreshAlbums}
                                        />
                                    )}
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                        {filteredAlbums.map((album: Album) => (
                                            <Link
                                                href={`/albums/${album.id}`}
                                                key={album.id}
                                                className="group bg-white dark:bg-slate-800 rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-700 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 flex flex-col"
                                            >
                                                {/* Cover */}
                                                <div className="relative">
                                                    <AlbumCover
                                                        coverImageUrl={album.coverImageUrl}
                                                        previewImageUrls={album.previewImageUrls}
                                                        imageCount={album.imageCount}
                                                        title={album.title}
                                                    />

                                                    {/* Visibility Badge */}
                                                    <div className="absolute top-4 left-4">
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur-md rounded-xl text-xs font-semibold text-slate-600 shadow-sm border border-white/50">
                                                            {album.visibility === "private" ? (
                                                                <Lock className="h-3.5 w-3.5 text-blue-500" strokeWidth={2.5} />
                                                            ) : (
                                                                <Globe className="h-3.5 w-3.5 text-blue-500" strokeWidth={2.5} />
                                                            )}
                                                            <span className="capitalize">{album.visibility}</span>
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Info */}
                                                <div className="p-6">
                                                    <div className="flex items-center gap-2 text-xs font-medium text-slate-400/80 mt-1">
                                                        <Calendar className="h-3.5 w-3.5" />
                                                        {formatLocalDate(album.albumDate)}
                                                    </div>
                                                    <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-100 mt-2 truncate group-hover:text-blue-600 transition-colors">
                                                        {album.title}
                                                    </h3>
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-1">
                                                        {album.description || "No description provided"}
                                                    </p>

                                                    <div className="flex items-center justify-between mt-5 pt-5 border-t border-slate-50 dark:border-slate-700">
                                                        <span className={cn(
                                                            "text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg",
                                                            album.taskRole === "owner"
                                                                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                                                : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                                                        )}>
                                                            {album.taskRole}
                                                        </span>

                                                        <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                                                            <ImageIcon className="h-3.5 w-3.5" />
                                                            {album.imageCount || 0}
                                                        </span>
                                                    </div>
                                                </div>
                                            </Link>
                                        ))}

                                        {/* New Album Card */}
                                        {filter !== "shared" && (
                                            <CreateAlbumDialog
                                                trigger={
                                                    <button className="aspect-auto min-h-[320px] bg-white dark:bg-slate-800 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/20 dark:hover:bg-blue-900/10 transition-all flex flex-col items-center justify-center gap-4 cursor-pointer group">
                                                        <div className="w-16 h-16 bg-slate-50 group-hover:bg-blue-100/50 rounded-2xl flex items-center justify-center transition-all group-hover:scale-110">
                                                            <Plus className="h-8 w-8 text-slate-400 group-hover:text-blue-500" strokeWidth={2.5} />
                                                        </div>
                                                        <div className="text-center">
                                                            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 block">Create Album</span>
                                                            <span className="text-xs text-slate-400 mt-1">Start a new collection</span>
                                                        </div>
                                                    </button>
                                                }
                                                onSuccess={refreshAlbums}
                                            />
                                        )}
                                    </div>

                                    {/* Load More Button */}
                                    {hasMore && (
                                        <div className="flex justify-center mt-8">
                                            <Button
                                                variant="outline"
                                                onClick={loadMore}
                                                disabled={isLoadingMore}
                                                className="rounded-2xl px-8 h-12 border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-blue-300 transition-all"
                                            >
                                                {isLoadingMore ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                        Loading...
                                                    </>
                                                ) : (
                                                    "Load more albums"
                                                )}
                                            </Button>
                                        </div>
                                    )}
                                </>
                            )
                        }
                    </div >
                </main >
            </div >
        </div >
    );
}
