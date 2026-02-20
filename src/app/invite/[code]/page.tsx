"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, X, Image as ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AcceptInvitePage({ params }: { params: Promise<{ code: string }> }) {
    const router = useRouter();
    const resolvedParams = use(params);
    const code = resolvedParams.code;

    const [status, setStatus] = useState<"loading" | "success" | "error" | "already_member" | "public_redirect">("loading");
    const [error, setError] = useState("");
    const [albumId, setAlbumId] = useState("");

    useEffect(() => {
        async function acceptInvite() {
            try {
                const res = await fetch("/api/invites/accept", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code }),
                });

                const data = await res.json();

                if (res.ok) {
                    // Check if it's public access (no sign-in needed)
                    if (data.publicAccess) {
                        setStatus("public_redirect");
                        setAlbumId(data.albumId);
                        // Auto redirect after short delay
                        setTimeout(() => router.push(`/albums/${data.albumId}`), 1500);
                    } else {
                        setStatus("success");
                        setAlbumId(data.albumId);
                    }
                } else if (data.error === "Already a member") {
                    setStatus("already_member");
                    setAlbumId(data.albumId);
                } else {
                    setStatus("error");
                    setError(data.error || "Failed to accept invite");
                }
            } catch (err) {
                setStatus("error");
                setError("Network error. Please try again.");
            }
        }

        acceptInvite();
    }, [code, router]);

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50/30 flex items-center justify-center p-6">
            <div className="w-full max-w-sm text-center">
                {status === "loading" && (
                    <>
                        <div className="w-20 h-20 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-blue-500/25">
                            <Loader2 className="h-10 w-10 text-white animate-spin" />
                        </div>
                        <h1 className="text-2xl font-semibold text-slate-800 mb-2">Joining album...</h1>
                        <p className="text-slate-500">Please wait while we add you</p>
                    </>
                )}

                {status === "public_redirect" && (
                    <>
                        <div className="w-20 h-20 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-blue-500/25">
                            <Check className="h-10 w-10 text-white" />
                        </div>
                        <h1 className="text-2xl font-semibold text-slate-800 mb-2">Welcome!</h1>
                        <p className="text-slate-500 mb-4">This is a public album. Redirecting you now...</p>
                        <div className="flex justify-center">
                            <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                        </div>
                    </>
                )}

                {status === "success" && (
                    <>
                        <div className="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-emerald-500/25">
                            <Check className="h-10 w-10 text-white" />
                        </div>
                        <h1 className="text-2xl font-semibold text-slate-800 mb-2">You&apos;re in!</h1>
                        <p className="text-slate-500 mb-10">You&apos;ve been added to the album</p>
                        <div className="space-y-3">
                            <Button
                                className="w-full bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25 rounded-xl h-12"
                                onClick={() => router.push(`/albums/${albumId}`)}
                            >
                                View album
                            </Button>
                            <Button
                                variant="ghost"
                                className="w-full text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl h-12"
                                onClick={() => router.push("/albums")}
                            >
                                Go to dashboard
                            </Button>
                        </div>
                    </>
                )}

                {status === "already_member" && (
                    <>
                        <div className="w-20 h-20 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-8">
                            <ImageIcon className="h-10 w-10 text-blue-500" />
                        </div>
                        <h1 className="text-2xl font-semibold text-slate-800 mb-2">Already a member</h1>
                        <p className="text-slate-500 mb-10">You already have access to this album</p>
                        <div className="space-y-3">
                            <Button
                                className="w-full bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25 rounded-xl h-12"
                                onClick={() => router.push(`/albums/${albumId}`)}
                            >
                                View album
                            </Button>
                            <Button
                                variant="ghost"
                                className="w-full text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl h-12"
                                onClick={() => router.push("/albums")}
                            >
                                Go to dashboard
                            </Button>
                        </div>
                    </>
                )}

                {status === "error" && (
                    <>
                        <div className="w-20 h-20 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-8">
                            <X className="h-10 w-10 text-red-500" />
                        </div>
                        <h1 className="text-2xl font-semibold text-slate-800 mb-2">Couldn&apos;t join</h1>
                        <p className="text-red-500 mb-10">{error}</p>
                        <div className="space-y-3">
                            <Button
                                className="w-full bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25 rounded-xl h-12"
                                onClick={() => window.location.reload()}
                            >
                                Try again
                            </Button>
                            <Button variant="ghost" className="w-full text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl h-12" asChild>
                                <Link href="/">Go to home</Link>
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
