"use client";

import { useTheme } from "@/components/providers/ThemeProvider";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === "dark";

    return (
        <button
            onClick={toggleTheme}
            className="relative w-14 h-7 rounded-full bg-slate-200 dark:bg-slate-700 transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 cursor-pointer"
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
            {/* Track Icons */}
            <div className="absolute inset-0 flex items-center justify-between px-1.5">
                {/* Sun icon (left side) */}
                <Sun
                    className={`w-4 h-4 transition-all duration-300 ${isDark
                            ? "text-slate-500 scale-75 opacity-50"
                            : "text-amber-500 scale-100 opacity-100"
                        }`}
                />
                {/* Moon icon (right side) */}
                <Moon
                    className={`w-4 h-4 transition-all duration-300 ${isDark
                            ? "text-blue-300 scale-100 opacity-100"
                            : "text-slate-400 scale-75 opacity-50"
                        }`}
                />
            </div>

            {/* Sliding Thumb */}
            <div
                className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-300 ease-in-out ${isDark ? "left-7" : "left-0.5"
                    }`}
            />
        </button>
    );
}
