"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, X, Plus, Trash2, RefreshCw, Copy, Check, Shield, AlertTriangle, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface ApiKey {
    id: string;
    name: string;
    prefix: string;
    rateLimit: number;
    lastUsedAt: string | null;
    createdAt: string;
    revokedAt: string | null;
}

interface ApiKeyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ApiKeyDialog({ open, onOpenChange }: ApiKeyDialogProps) {
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [newKeyName, setNewKeyName] = useState("");
    const [createdKey, setCreatedKey] = useState<{ key: string, name: string } | null>(null);
    const [copied, setCopied] = useState(false);

    // Revoke/Rotate State
    const [actionKey, setActionKey] = useState<ApiKey | null>(null);
    const [confirmRevokeOpen, setConfirmRevokeOpen] = useState(false);
    const [confirmRotateOpen, setConfirmRotateOpen] = useState(false);

    useEffect(() => {
        if (open) {
            fetchKeys();
        }
    }, [open]);

    const fetchKeys = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/auth/api-keys");
            if (res.ok) {
                const data = await res.json();
                setKeys(data);
            } else {
                toast.error("Failed to load API keys");
            }
        } catch (error) {
            toast.error("Error loading API keys");
        } finally {
            setLoading(false);
        }
    };

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newKeyName.trim()) return;

        setGenerating(true);
        try {
            const res = await fetch("/api/auth/api-keys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newKeyName }),
            });

            if (res.ok) {
                const data = await res.json();
                setCreatedKey({ key: data.key, name: data.record.name });
                setKeys([data.record, ...keys]);
                setNewKeyName("");
                toast.success("API Key generated successfully");
            } else {
                toast.error("Failed to generate API key");
            }
        } catch (error) {
            toast.error("Error generating API key");
        } finally {
            setGenerating(false);
        }
    };

    const handleRevoke = async () => {
        if (!actionKey) return;
        try {
            const res = await fetch(`/api/auth/api-keys/${actionKey.id}`, {
                method: "DELETE",
            });

            if (res.ok) {
                setKeys(keys.filter(k => k.id !== actionKey.id));
                toast.success("API Key revoked");
            } else {
                toast.error("Failed to revoke API key");
            }
        } catch (error) {
            toast.error("Error revoking API key");
        }
    };

    const handleRotate = async () => {
        if (!actionKey) return;
        try {
            const res = await fetch(`/api/auth/api-keys/${actionKey.id}/rotate`, {
                method: "POST",
            });

            if (res.ok) {
                const data = await res.json();
                setCreatedKey({ key: data.key, name: data.record.name });
                // Replace old key with new one in list
                setKeys(keys.map(k => k.id === actionKey.id ? data.record : k));
                toast.success("API Key rotated successfully");
            } else {
                toast.error("Failed to rotate API key");
            }
        } catch (error) {
            toast.error("Error rotating API key");
        }
    };

    const copyToClipboard = () => {
        if (createdKey) {
            navigator.clipboard.writeText(createdKey.key);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            toast.success("Copied to clipboard");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100%-2rem)] max-w-2xl max-h-[85vh] p-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl [&>button]:hidden">
                <div className="flex flex-col h-full min-h-[500px]">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                                <Shield className="h-5 w-5 text-blue-500" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">API Keys</h2>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    Manage access tokens for your applications.
                                    <a href="/api-doc" target="_blank" className="text-blue-500 hover:text-blue-600 ml-1 inline-flex items-center hover:underline">
                                        View Documentation
                                    </a>
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => onOpenChange(false)}
                            className="p-2 -mr-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6">
                        {/* New Key Display (Modal-like overlay or inline) */}
                        {createdKey && (
                            <div className="mb-8 p-6 bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/20 rounded-2xl">
                                <div className="flex items-start gap-4">
                                    <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                                        <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                                    </div>
                                    <div className="flex-1 space-y-4">
                                        <div>
                                            <h3 className="font-semibold text-green-900 dark:text-green-100">API Key Generated</h3>
                                            <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                                                Please copy your key now. You won't be able to see it again!
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 bg-white dark:bg-slate-950 border border-green-200 dark:border-green-900/30 rounded-xl px-4 py-3 font-mono text-sm text-slate-700 dark:text-slate-300 break-all">
                                                {createdKey.key}
                                            </code>
                                            <Button
                                                onClick={copyToClipboard}
                                                variant="outline"
                                                className="h-12 shrink-0 border-green-200 dark:border-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/20 text-green-700 dark:text-green-300"
                                            >
                                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                        <Button
                                            onClick={() => setCreatedKey(null)}
                                            className="bg-green-600 hover:bg-green-700 text-white border-none shadow-none"
                                        >
                                            I've saved it
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Generate Section */}
                        <div className="mb-8">
                            <form onSubmit={handleGenerate} className="flex gap-3">
                                <Input
                                    value={newKeyName}
                                    onChange={(e) => setNewKeyName(e.target.value)}
                                    placeholder="Enter a name (e.g., 'Mobile App')"
                                    className="h-11 flex-1 rounded-xl bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 focus:ring-blue-500/20 transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                                />
                                <Button
                                    type="submit"
                                    disabled={generating || !newKeyName.trim() || !!createdKey}
                                    className="h-11 px-6 rounded-xl bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20 font-medium"
                                >
                                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                                    Generate Key
                                </Button>
                            </form>
                        </div>

                        {/* Keys List */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider">Active Keys</h3>
                            {loading ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                                </div>
                            ) : keys.length === 0 ? (
                                <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                                    <p className="text-slate-500 dark:text-slate-400">No API keys found.</p>
                                </div>
                            ) : (
                                keys.map((key) => (
                                    <div key={key.id} className="group flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl hover:shadow-md transition-all">
                                        <div className="flex items-start gap-4">
                                            <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500">
                                                <KeyRound className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-medium text-slate-900 dark:text-slate-100">{key.name}</h4>
                                                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-mono text-slate-500">
                                                        {key.prefix}...
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                    <span>Created {format(new Date(key.createdAt), "MMM d, yyyy")}</span>
                                                    <span>•</span>
                                                    <span>Last used {key.lastUsedAt ? format(new Date(key.lastUsedAt), "MMM d, HH:mm") : "Never"}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => { setActionKey(key); setConfirmRotateOpen(true); }}
                                                className="h-9 w-9 p-0 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                                title="Rotate Key"
                                            >
                                                <RefreshCw className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => { setActionKey(key); setConfirmRevokeOpen(true); }}
                                                className="h-9 w-9 p-0 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                title="Revoke Key"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>

            <ConfirmDialog
                open={confirmRevokeOpen}
                onOpenChange={setConfirmRevokeOpen}
                title="Revoke API Key?"
                description="This action cannot be undone. Any applications using this key will immediately lose access."
                onConfirm={handleRevoke}
                confirmText="Revoke"
                variant="destructive"
            />

            <ConfirmDialog
                open={confirmRotateOpen}
                onOpenChange={setConfirmRotateOpen}
                title="Rotate API Key?"
                description="The old key will be revoked immediately and a new one will be generated. You must update your applications with the new key."
                onConfirm={handleRotate}
                confirmText="Rotate Key"
            />
        </Dialog>
    );
}
