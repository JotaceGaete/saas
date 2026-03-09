import React from 'react';
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "../../utils/cn";
import Icon from '../AppIcon';

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap font-semibold ring-offset-background transition-all duration-150 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 disabled:saturate-50 select-none",
    {
        variants: {
            variant: {
                default: "bg-primary text-primary-foreground hover:bg-[#6D28D9] hover:-translate-y-px active:scale-[0.97] active:translate-y-0 shadow-sm hover:shadow-violet",
                destructive: "bg-destructive text-destructive-foreground hover:bg-red-600 hover:-translate-y-px active:scale-[0.97] active:translate-y-0 shadow-sm",
                outline: "border border-border bg-white text-foreground hover:bg-muted hover:border-border hover:-translate-y-px active:scale-[0.97] active:translate-y-0 shadow-xs",
                secondary: "bg-muted text-foreground hover:bg-[#E2E8F0] hover:-translate-y-px active:scale-[0.97] active:translate-y-0",
                ghost: "text-foreground hover:bg-muted active:scale-[0.97]",
                link: "text-primary underline-offset-4 hover:underline",
                success: "bg-success text-success-foreground hover:opacity-90 hover:-translate-y-px active:scale-[0.97] active:translate-y-0 shadow-sm",
                warning: "bg-warning text-warning-foreground hover:opacity-90 hover:-translate-y-px active:scale-[0.97] active:translate-y-0 shadow-sm",
                danger: "bg-error text-error-foreground hover:bg-red-600 hover:-translate-y-px active:scale-[0.97] active:translate-y-0 shadow-sm",
                'violet-soft': "bg-violet-50 text-primary border border-violet-100 hover:bg-violet-100 hover:-translate-y-px active:scale-[0.97] active:translate-y-0",
            },
            size: {
                default: "h-10 px-4 py-2 rounded-lg text-sm gap-2",
                sm: "h-9 px-3.5 rounded-lg text-sm gap-1.5",
                lg: "h-11 px-5 rounded-xl text-sm gap-2",
                xl: "h-12 px-6 rounded-xl text-base gap-2",
                icon: "h-9 w-9 rounded-lg",
                'icon-sm': "h-8 w-8 rounded-md",
                xs: "h-7 px-2.5 rounded-md text-xs gap-1.5",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, children, loading = false, iconName = null, iconPosition = 'left', iconSize = null, fullWidth = false, disabled = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    const iconSizeMap = { xs: 12, sm: 13, default: 15, lg: 15, xl: 16, icon: 15, 'icon-sm': 13 };
    const calculatedIconSize = iconSize || iconSizeMap?.[size] || 15;

    const LoadingSpinner = () => (
        <svg className="animate-spin h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
    );

    const renderIcon = () => {
        if (!iconName) return null;
        try {
            return <Icon name={iconName} size={calculatedIconSize} className="flex-shrink-0" />;
        } catch { return null; }
    };

    const renderFallbackButton = () => (
        <button className={cn(buttonVariants({ variant, size, className }), fullWidth && "w-full")} ref={ref} disabled={disabled || loading} {...props}>
            {loading ? <LoadingSpinner /> : (iconName && iconPosition === 'left' && renderIcon())}
            {children}
            {!loading && iconName && iconPosition === 'right' && renderIcon()}
        </button>
    );

    if (asChild) {
        try {
            if (!children || React.Children?.count(children) !== 1) return renderFallbackButton();
            const child = React.Children?.only(children);
            if (!React.isValidElement(child)) return renderFallbackButton();
            const content = (<>{loading ? <LoadingSpinner /> : (iconName && iconPosition === 'left' && renderIcon())}{child?.props?.children}{!loading && iconName && iconPosition === 'right' && renderIcon()}</>);
            const clonedChild = React.cloneElement(child, { className: cn(buttonVariants({ variant, size, className }), fullWidth && "w-full", child?.props?.className), disabled: disabled || loading || child?.props?.disabled, children: content });
            return <Comp ref={ref} {...props}>{clonedChild}</Comp>;
        } catch { return renderFallbackButton(); }
    }

    return (
        <Comp className={cn(buttonVariants({ variant, size, className }), fullWidth && "w-full")} ref={ref} disabled={disabled || loading} {...props}>
            {loading ? <LoadingSpinner /> : (iconName && iconPosition === 'left' && renderIcon())}
            {children}
            {!loading && iconName && iconPosition === 'right' && renderIcon()}
        </Comp>
    );
});

Button.displayName = "Button";
export default Button;