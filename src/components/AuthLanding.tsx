"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, Loader2, Eye, EyeOff, Shield, Sparkles, Users } from "lucide-react";

interface AuthLandingProps {
    googleClientId: string;
}

declare global {
    interface Window {
        google?: any;
    }
}

export default function AuthLanding({ googleClientId }: AuthLandingProps) {
    const router = useRouter();
    const { user, isLoading, mutate } = useAuth();
    const googleButtonRef = useRef<HTMLDivElement>(null);

    // Redirect if already logged in
    useEffect(() => {
        if (!isLoading && user) {
            router.push("/dashboard");
        }
    }, [user, isLoading, router]);

    const [mode, setMode] = useState<"login" | "register">("login");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);

    // Form State
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [name, setName] = useState("");

    // Validation State
    const [passValidities, setPassValidities] = useState({
        minChar: false,
        upper: false,
        lower: false,
        number: false,
        special: false,
    });

    // Real-time Validation
    useEffect(() => {
        setPassValidities({
            minChar: password.length >= 8,
            upper: /[A-Z]/.test(password),
            lower: /[a-z]/.test(password),
            number: /[0-9]/.test(password),
            special: /[\W_]/.test(password),
        });
    }, [password]);

    const isFormValid = () => {
        if (mode === "login") return email && password;
        return (
            Object.values(passValidities).every(Boolean) &&
            password === confirmPassword &&
            name.length >= 2 &&
            email
        );
    };

    const handleGoogleSignIn = async (response: any) => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/auth/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken: response.credential }),
            });

            if (res.ok) {
                await mutate(); // Refresh auth state
                router.push("/dashboard");
            } else {
                const data = await res.json();
                setError(data.error || "Google sign-in failed");
                setLoading(false);
            }
        } catch (err) {
            console.error("Google Auth Error:", err);
            setError("An unexpected error occurred");
            setLoading(false);
        }
    };

    const initializeGoogleParams = () => {
        if (window.google && googleButtonRef.current) {
            window.google.accounts.id.initialize({
                client_id: googleClientId,
                callback: handleGoogleSignIn,
                auto_select: false,
                cancel_on_tap_outside: true,
            });
            window.google.accounts.id.renderButton(googleButtonRef.current, {
                theme: "outline",
                size: "large",
                width: googleButtonRef.current.offsetWidth,
                type: "standard",
                text: "continue_with",
                shape: "rectangular",
                logo_alignment: "center"
            });
        }
    };

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!isFormValid()) return;

        setError("");
        setLoading(true);

        const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
        const body = mode === "login"
            ? { email, password, remember: rememberMe }
            : { email, password, name };

        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                await mutate(); // Refresh auth state
                router.push("/dashboard");
            } else {
                const data = await res.json();
                if (Array.isArray(data.error)) {
                    setError(data.error.map((err: any) => err.message).join(", "));
                } else {
                    setError(data.error || "Authentication failed");
                }
                setLoading(false);
            }
        } catch (err) {
            setError("Network error. Please try again.");
            setLoading(false);
        }
    }

    const allValid = Object.values(passValidities).every(Boolean);
    const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex">
            <Script
                src="https://accounts.google.com/gsi/client"
                strategy="lazyOnload"
                onLoad={initializeGoogleParams}
            />

            {/* Left Side - Branding */}
            <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-50 via-blue-100/50 to-sky-50 relative overflow-hidden">
                {/* Decorative Elements */}
                <div className="absolute top-20 left-20 w-72 h-72 bg-blue-200/40 rounded-full blur-3xl" />
                <div className="absolute bottom-32 right-16 w-96 h-96 bg-sky-200/30 rounded-full blur-3xl" />
                <div className="absolute top-1/2 left-1/3 w-48 h-48 bg-blue-300/20 rounded-full blur-2xl" />

                <div className="relative z-10 flex flex-col justify-center px-16 xl:px-24">
                    {/* Logo */}
                    <div className="mb-12 flex items-center gap-3">
                        <div className="w-12 h-12 relative overflow-hidden rounded-2xl shadow-xl shadow-blue-500/10 border border-white">
                            <img src="/logo.png" alt="KepRoop Logo" className="w-full h-full object-cover" />
                        </div>
                        <h2 className="text-3xl font-bold text-slate-800 tracking-tight">KepRoop</h2>
                    </div>

                    <h1 className="text-5xl xl:text-6xl font-bold text-slate-800 tracking-tight leading-[1.1] mb-6">
                        Your memories,<br />
                        <span className="text-blue-500">
                            beautifully organized
                        </span>
                    </h1>

                    <p className="text-lg text-slate-600 max-w-md leading-relaxed mb-12">
                        Create albums, upload photos, and share moments with the people who matter. Simple, secure, beautiful.
                    </p>

                    {/* Features */}
                    <div className="flex gap-6">
                        <div className="flex items-center gap-3 bg-white/60 backdrop-blur-sm rounded-2xl px-5 py-4 shadow-sm">
                            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
                                <Shield className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <p className="font-semibold text-slate-800">100% Private</p>
                                <p className="text-sm text-slate-500">Your data is yours</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 bg-white/60 backdrop-blur-sm rounded-2xl px-5 py-4 shadow-sm">
                            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
                                <Users className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <p className="font-semibold text-slate-800">Easy Sharing</p>
                                <p className="text-sm text-slate-500">Invite anyone</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Side - Auth Form */}
            <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-16 xl:px-24 bg-white">
                <div className="w-full max-w-[400px] mx-auto">
                    {/* Mobile Logo */}
                    <div className="lg:hidden mb-10 flex items-center gap-3">
                        <div className="w-10 h-10 relative overflow-hidden rounded-2xl shadow-xl shadow-blue-500/10 border border-white">
                            <img src="/logo.png" alt="KepRoop Logo" className="w-full h-full object-cover" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800">KepRoop</h2>
                    </div>

                    {/* Header */}
                    <div className="mb-8">
                        <h1 className="text-2xl font-semibold text-slate-800 mb-2">
                            {mode === "login" ? "Welcome back" : "Create your account"}
                        </h1>
                        <p className="text-slate-500">
                            {mode === "login"
                                ? "Enter your credentials to continue"
                                : "Start organizing your photos today"}
                        </p>
                    </div>

                    {/* Error Display */}
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl">
                            <p className="text-sm text-red-600">{error}</p>
                        </div>
                    )}

                    {/* Google Sign In */}
                    <div className="mb-6">
                        <div ref={googleButtonRef} className="w-full h-[44px]" />
                    </div>

                    <div className="relative mb-6">
                        <Separator className="bg-slate-200" />
                        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-4 text-xs text-slate-400 uppercase tracking-wide">
                            or
                        </span>
                    </div>

                    {/* Auth Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {mode === "register" && (
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-sm font-medium text-slate-700">
                                    Full name
                                </Label>
                                <Input
                                    id="name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="John Doe"
                                    disabled={loading}
                                    className="h-12 bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-blue-500/20 transition-all rounded-xl"
                                />
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                                Email address
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                disabled={loading}
                                className="h-12 bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-blue-500/20 transition-all rounded-xl"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                                Password
                            </Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    disabled={loading}
                                    className="h-12 bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-blue-500/20 transition-all pr-12 rounded-xl"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>

                            {/* Password Requirements */}
                            {mode === "register" && password.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {[
                                        { key: "minChar", label: "8+ chars" },
                                        { key: "upper", label: "Uppercase" },
                                        { key: "lower", label: "Lowercase" },
                                        { key: "number", label: "Number" },
                                        { key: "special", label: "Symbol" },
                                    ].map((req) => (
                                        <span
                                            key={req.key}
                                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${passValidities[req.key as keyof typeof passValidities]
                                                ? "bg-blue-50 text-blue-600"
                                                : "bg-slate-100 text-slate-400"
                                                }`}
                                        >
                                            {passValidities[req.key as keyof typeof passValidities] && (
                                                <Check className="h-3 w-3" />
                                            )}
                                            {req.label}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {mode === "login" && (
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="remember"
                                    checked={rememberMe}
                                    onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                                />
                                <Label
                                    htmlFor="remember"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-slate-600"
                                >
                                    Remember me
                                </Label>
                            </div>
                        )}

                        {mode === "register" && (
                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">
                                    Confirm password
                                </Label>
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="••••••••"
                                    disabled={loading}
                                    className={`h-12 bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-blue-500/20 transition-all rounded-xl ${confirmPassword && !passwordsMatch ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" : ""
                                        }`}
                                />
                                {confirmPassword && !passwordsMatch && (
                                    <p className="text-xs text-red-500">Passwords don&apos;t match</p>
                                )}
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full h-12 text-base font-medium mt-2 bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/35 transition-all rounded-xl"
                            disabled={loading || !isFormValid()}
                        >
                            {loading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                mode === "login" ? "Sign in" : "Create account"
                            )}
                        </Button>
                    </form>

                    {/* Toggle Mode */}
                    <p className="text-center text-sm text-slate-500 mt-8">
                        {mode === "login" ? (
                            <>
                                Don&apos;t have an account?{" "}
                                <button
                                    type="button"
                                    onClick={() => { setMode("register"); setError(""); }}
                                    className="text-blue-500 font-medium hover:text-blue-600 transition-colors"
                                >
                                    Sign up
                                </button>
                            </>
                        ) : (
                            <>
                                Already have an account?{" "}
                                <button
                                    type="button"
                                    onClick={() => { setMode("login"); setError(""); }}
                                    className="text-blue-500 font-medium hover:text-blue-600 transition-colors"
                                >
                                    Sign in
                                </button>
                            </>
                        )}
                    </p>
                </div>
            </div>
        </div>
    );
}
