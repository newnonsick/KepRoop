"use client";

import { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";
import { Loader2, Settings, User, Lock, KeyRound, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type SettingsSection = "general" | "account" | "security";

const navItems = [
    { id: "general" as const, label: "General", icon: Settings },
    { id: "account" as const, label: "Account", icon: User },
    { id: "security" as const, label: "Security", icon: Lock },
];

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
    const { user, mutate } = useAuth();
    const { theme } = useTheme();
    const [activeSection, setActiveSection] = useState<SettingsSection>("general");
    const [loading, setLoading] = useState(false);

    // Profile State
    const [name, setName] = useState(user?.name || "");

    // Password State
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch("/api/user/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });

            const data = await res.json();
            if (res.ok) {
                toast.success("Profile updated successfully");
                await mutate();
            } else {
                toast.error(data.error || "Failed to update profile");
            }
        } catch (err) {
            toast.error("An error occurred");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword !== confirmPassword) {
            toast.error("New passwords do not match");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/user/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    currentPassword: user?.hasPassword ? currentPassword : undefined,
                    newPassword,
                }),
            });

            const data = await res.json();
            if (res.ok) {
                toast.success(user?.hasPassword ? "Password changed successfully" : "Password set successfully");
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
                await mutate();
            } else {
                toast.error(data.error || "Failed to update password");
            }
        } catch (err) {
            toast.error("An error occurred");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl">
                <div className="flex min-h-[400px]">
                    {/* Sidebar Navigation */}
                    <div className="w-48 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2">
                        {/* Close Button */}
                        <button
                            onClick={() => onOpenChange(false)}
                            className="p-2 mb-4 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        {/* Nav Items */}
                        <nav className="space-y-1">
                            {navItems.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveSection(item.id)}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer",
                                        activeSection === item.id
                                            ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm"
                                            : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
                                    )}
                                >
                                    <item.icon className="w-4 h-4" />
                                    {item.label}
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 p-6">
                        {/* General Section */}
                        {activeSection === "general" && (
                            <div className="space-y-6">
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">General</h2>

                                {/* Appearance */}
                                <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800">
                                    <div>
                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Appearance</span>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                            {theme === "dark" ? "Dark" : "Light"} mode
                                        </p>
                                    </div>
                                    <ThemeToggle />
                                </div>
                            </div>
                        )}

                        {/* Account Section */}
                        {activeSection === "account" && (
                            <div className="space-y-6">
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Account</h2>

                                <form onSubmit={handleUpdateProfile} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="name" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Display Name
                                        </Label>
                                        <Input
                                            id="name"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="h-11 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 transition-all text-slate-900 dark:text-slate-100"
                                            placeholder="Your name"
                                        />
                                        <p className="text-[11px] text-slate-400 dark:text-slate-500 px-1">
                                            This is how your name will appear to other users.
                                        </p>
                                    </div>
                                    <Button
                                        type="submit"
                                        disabled={loading || name === user?.name}
                                        className="w-full rounded-xl h-11 bg-blue-500 hover:bg-blue-600 shadow-lg shadow-blue-500/20 font-medium disabled:shadow-none"
                                    >
                                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Save Changes
                                    </Button>
                                </form>
                            </div>
                        )}

                        {/* Security Section */}
                        {activeSection === "security" && (
                            <div className="space-y-6">
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Security</h2>

                                <form onSubmit={handleUpdatePassword} className="space-y-4">
                                    {!user?.hasPassword ? (
                                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl p-4">
                                            <div className="flex items-start gap-3">
                                                <KeyRound className="h-5 w-5 text-amber-500 mt-0.5" />
                                                <div>
                                                    <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400">Set a Password</h4>
                                                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                                                        You signed in via Google. Set a password to log in with your email address as well.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <Label htmlFor="current" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                Current Password
                                            </Label>
                                            <Input
                                                id="current"
                                                type="password"
                                                value={currentPassword}
                                                onChange={(e) => setCurrentPassword(e.target.value)}
                                                className="h-11 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 transition-all text-slate-900 dark:text-slate-100"
                                            />
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <Label htmlFor="new" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                            {user?.hasPassword ? "New Password" : "Create Password"}
                                        </Label>
                                        <Input
                                            id="new"
                                            type="password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            className="h-11 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 transition-all text-slate-900 dark:text-slate-100"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="confirm" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Confirm Password
                                        </Label>
                                        <Input
                                            id="confirm"
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="h-11 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 transition-all text-slate-900 dark:text-slate-100"
                                        />
                                    </div>

                                    <Button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full rounded-xl h-11 bg-blue-500 hover:bg-blue-600 shadow-lg shadow-blue-500/20 font-medium"
                                    >
                                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        {user?.hasPassword ? "Update Password" : "Set Password"}
                                    </Button>
                                </form>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
