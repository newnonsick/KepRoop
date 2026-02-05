"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    onConfirm: () => Promise<void> | void;
    confirmText?: string;
    cancelText?: string;
    variant?: "default" | "destructive";
    icon?: React.ReactNode;
}

import { useState } from "react";

export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    onConfirm,
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "default",
    icon,
}: ConfirmDialogProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleConfirm = async () => {
        setIsLoading(true);
        try {
            await onConfirm();
            onOpenChange(false);
        } catch (error) {
            console.error("Confirmation action failed", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[440px] bg-white dark:bg-slate-900 rounded-[2rem] border-slate-100 dark:border-slate-700 shadow-2xl p-0 gap-0 overflow-hidden">
                <div className="p-8">
                    <div className="flex flex-col items-center text-center">
                        <div className={cn(
                            "w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-all duration-500 scale-100",
                            variant === "destructive" ? "bg-red-50 dark:bg-red-900/30 text-red-500" : "bg-blue-50 dark:bg-blue-900/30 text-blue-500"
                        )}>
                            {icon || <AlertTriangle className="h-8 w-8" strokeWidth={1.5} />}
                        </div>

                        <DialogHeader>
                            <DialogTitle className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                                {title}
                            </DialogTitle>
                            <DialogDescription className="text-slate-500 dark:text-slate-400 mt-3 text-base leading-relaxed px-2">
                                {description}
                            </DialogDescription>
                        </DialogHeader>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 mt-10">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="flex-1 h-12 rounded-2xl border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 order-2 sm:order-1 font-medium"
                            disabled={isLoading}
                        >
                            {cancelText}
                        </Button>
                        <Button
                            variant={variant === "destructive" ? "destructive" : "default"}
                            onClick={handleConfirm}
                            disabled={isLoading}
                            className={cn(
                                "flex-1 h-12 rounded-2xl shadow-lg order-1 sm:order-2 font-semibold",
                                variant === "destructive"
                                    ? "bg-red-500 hover:bg-red-600 shadow-red-500/20"
                                    : "bg-blue-500 hover:bg-blue-600 shadow-blue-500/20"
                            )}
                        >
                            {isLoading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                confirmText
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
