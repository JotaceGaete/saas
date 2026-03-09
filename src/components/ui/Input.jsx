import React from "react";
import { cn } from "../../utils/cn";

const Input = React.forwardRef(({ className, type = "text", label, description, error, required = false, id, prefix, suffix, ...props }, ref) => {
    const inputId = id || `input-${Math.random()?.toString(36)?.substr(2, 9)}`;

    const baseInputClasses = [
        "flex w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-foreground",
        "placeholder:text-muted-foreground/60",
        "transition-all duration-150",
        "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted",
        "min-h-[44px]",
    ]?.join(" ");

    if (type === "checkbox") {
        return (
            <input
                type="checkbox"
                className={cn("h-4 w-4 rounded border-input bg-background text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer", className)}
                ref={ref}
                id={inputId}
                {...props}
            />
        );
    }

    if (type === "radio") {
        return (
            <input
                type="radio"
                className={cn("h-4 w-4 rounded-full border-input bg-background text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer", className)}
                ref={ref}
                id={inputId}
                {...props}
            />
        );
    }

    return (
        <div className="space-y-1.5">
            {label && (
                <label
                    htmlFor={inputId}
                    className={cn(
                        "block text-sm font-medium leading-none",
                        error ? "text-destructive" : "text-foreground"
                    )}
                >
                    {label}
                    {required && <span className="text-destructive ml-1">*</span>}
                </label>
            )}
            <div className="relative">
                {prefix && (
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        {prefix}
                    </div>
                )}
                <input
                    type={type}
                    className={cn(
                        baseInputClasses,
                        error
                            ? "border-destructive focus:border-destructive focus:ring-destructive/10" :"border-border",
                        prefix && "pl-10",
                        suffix && "pr-10",
                        className
                    )}
                    ref={ref}
                    id={inputId}
                    {...props}
                />
                {suffix && (
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {suffix}
                    </div>
                )}
            </div>
            {description && !error && (
                <p className="text-xs text-muted-foreground">{description}</p>
            )}
            {error && (
                <p className="text-xs text-destructive flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1"/>
                        <path d="M6 3.5V6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        <circle cx="6" cy="8.5" r="0.6" fill="currentColor"/>
                    </svg>
                    {error}
                </p>
            )}
        </div>
    );
});

Input.displayName = "Input";
export default Input;