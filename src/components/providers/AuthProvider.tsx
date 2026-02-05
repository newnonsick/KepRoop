"use client";

import React, { createContext, useContext, ReactNode } from "react";
import useSWR, { KeyedMutator } from "swr";
import { fetcher } from "@/lib/fetcher";

interface User {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
    hasPassword?: boolean;
}

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    error: any;
    mutate: KeyedMutator<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const { data, error, isLoading, mutate } = useSWR("/api/auth/me", fetcher, {
        revalidateOnFocus: false,
        shouldRetryOnError: false,
    });

    const user = data?.user || null;

    return (
        <AuthContext.Provider value={{ user, isLoading, error, mutate }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
