"use client";

import { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, User, Lock, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
    const { user, mutate } = useAuth();
    const router = useRouter();
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
                await mutate(); // Refresh user data
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
                await mutate(); // Refresh user data to update hasPassword status
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
            <DialogContent className="sm:max-w-[425px] rounded-3xl p-0 overflow-hidden bg-white shadow-2xl border-slate-100">
                <div className="p-6 pb-0">
                    <DialogHeader>
                        <DialogTitle className="text-xl text-slate-800">Account Settings</DialogTitle>
                        <DialogDescription className="text-slate-500">
                            Manage your profile and security preferences.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <Tabs defaultValue="profile" className="w-full">
                    <div className="px-6 mt-4">
                        <TabsList className="grid w-full grid-cols-2 bg-slate-100/50 p-1 rounded-2xl">
                            <TabsTrigger
                                value="profile"
                                className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm transition-all"
                            >
                                <User className="w-4 h-4 mr-2" />
                                Profile
                            </TabsTrigger>
                            <TabsTrigger
                                value="security"
                                className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm transition-all"
                            >
                                <Lock className="w-4 h-4 mr-2" />
                                Security
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="p-6">
                        <TabsContent value="profile" className="mt-0 space-y-4 focus-visible:outline-none">
                            <form onSubmit={handleUpdateProfile} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name" className="text-sm font-medium text-slate-700">Display Name</Label>
                                    <Input
                                        id="name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="h-11 rounded-xl border-slate-200 bg-slate-50 focus:bg-white transition-all"
                                        placeholder="Your name"
                                    />
                                    <p className="text-[11px] text-slate-400 px-1">
                                        This is how your name will appear to other users.
                                    </p>
                                </div>
                                <div className="pt-2">
                                    <Button
                                        type="submit"
                                        disabled={loading || name === user?.name}
                                        className="w-full rounded-xl h-11 bg-blue-500 hover:bg-blue-600 shadow-lg shadow-blue-500/20 font-medium"
                                    >
                                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Save Changes
                                    </Button>
                                </div>
                            </form>
                        </TabsContent>

                        <TabsContent value="security" className="mt-0 space-y-4 focus-visible:outline-none">
                            <form onSubmit={handleUpdatePassword} className="space-y-4">
                                {!user?.hasPassword ? (
                                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-4">
                                        <div className="flex items-start gap-3">
                                            <KeyRound className="h-5 w-5 text-amber-500 mt-0.5" />
                                            <div>
                                                <h4 className="text-sm font-semibold text-amber-700">Set a Password</h4>
                                                <p className="text-xs text-amber-600 mt-1">
                                                    You signed in via Google. Set a password to log in with your email address as well.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <Label htmlFor="current" className="text-sm font-medium text-slate-700">Current Password</Label>
                                        <Input
                                            id="current"
                                            type="password"
                                            value={currentPassword}
                                            onChange={(e) => setCurrentPassword(e.target.value)}
                                            className="h-11 rounded-xl border-slate-200 bg-slate-50 focus:bg-white transition-all"
                                        />
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="new" className="text-sm font-medium text-slate-700">
                                        {user?.hasPassword ? "New Password" : "Create Password"}
                                    </Label>
                                    <Input
                                        id="new"
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="h-11 rounded-xl border-slate-200 bg-slate-50 focus:bg-white transition-all"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="confirm" className="text-sm font-medium text-slate-700">Confirm Password</Label>
                                    <Input
                                        id="confirm"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="h-11 rounded-xl border-slate-200 bg-slate-50 focus:bg-white transition-all"
                                    />
                                </div>

                                <div className="pt-2">
                                    <Button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full rounded-xl h-11 bg-blue-500 hover:bg-blue-600 shadow-lg shadow-blue-500/20 font-medium"
                                    >
                                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        {user?.hasPassword ? "Update Password" : "Set Password"}
                                    </Button>
                                </div>
                            </form>
                        </TabsContent>
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
