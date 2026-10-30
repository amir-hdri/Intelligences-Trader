import React, { useEffect, useId, useRef } from 'react';

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

/**
 * Animated shimmering skeleton loader for async data states
 */
export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div
    className={cn(
      "rounded-xl shimmer bg-white/[0.04] border border-white/[0.04] animate-pulse",
      className
    )}
    style={{ backgroundSize: '400% 100%' }}
    aria-hidden="true"
  />
);

/**
 * Cybernetic Glassmorphic Card Container
 */
export const Card: React.FC<React.PropsWithChildren<{
  className?: string;
  elevated?: boolean;
  glow?: boolean;
  onClick?: () => void;
}>> = ({ children, className, elevated, glow, onClick }) => (
  <div
    onClick={onClick}
    className={cn(
      "rounded-2xl transition-all duration-300",
      elevated
        ? "bg-[#131B2E]/90 border border-white/[0.1] shadow-2xl backdrop-blur-xl"
        : "bg-[#0B1326]/80 border border-white/[0.07] backdrop-blur-md shadow-lg",
      glow && "shadow-[0_0_20px_rgba(0,240,255,0.12)] border-[#00F0FF]/30",
      onClick && "cursor-pointer hover:border-white/20 active:scale-[0.99]",
      className
    )}
  >
    {children}
  </div>
);

/**
 * Cybernetic Badge with semantic tones and glowing indicators
 */
export type BadgeTone = 'cyan' | 'emerald' | 'crimson' | 'amber' | 'purple' | 'slate' | 'violet' | 'red';

export const Badge: React.FC<{
  tone?: BadgeTone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}> = ({ tone = 'slate', children, dot, className }) => {
  const map: Record<BadgeTone, { bg: string; text: string; border: string; dotColor: string }> = {
    cyan: {
      bg: 'bg-[#00F0FF]/10',
      text: 'text-[#00F0FF]',
      border: 'border-[#00F0FF]/30',
      dotColor: 'bg-[#00F0FF]'
    },
    emerald: {
      bg: 'bg-[#10B981]/10',
      text: 'text-[#10B981]',
      border: 'border-[#10B981]/30',
      dotColor: 'bg-[#10B981]'
    },
    crimson: {
      bg: 'bg-[#EF4444]/10',
      text: 'text-[#EF4444]',
      border: 'border-[#EF4444]/30',
      dotColor: 'bg-[#EF4444]'
    },
    red: {
      bg: 'bg-[#EF4444]/10',
      text: 'text-[#EF4444]',
      border: 'border-[#EF4444]/30',
      dotColor: 'bg-[#EF4444]'
    },
    amber: {
      bg: 'bg-[#F59E0B]/10',
      text: 'text-[#F59E0B]',
      border: 'border-[#F59E0B]/30',
      dotColor: 'bg-[#F59E0B]'
    },
    purple: {
      bg: 'bg-[#8B5CF6]/10',
      text: 'text-[#A78BFA]',
      border: 'border-[#8B5CF6]/30',
      dotColor: 'bg-[#8B5CF6]'
    },
    violet: {
      bg: 'bg-[#8B5CF6]/10',
      text: 'text-[#A78BFA]',
      border: 'border-[#8B5CF6]/30',
      dotColor: 'bg-[#8B5CF6]'
    },
    slate: {
      bg: 'bg-white/[0.05]',
      text: 'text-[#94A3B8]',
      border: 'border-white/10',
      dotColor: 'bg-[#94A3B8]'
    }
  };

  const current = map[tone] || map.slate;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider border uppercase transition-colors",
        current.bg,
        current.text,
        current.border,
        className
      )}
    >
      {dot && <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", current.dotColor)} />}
      {children}
    </span>
  );
};

/**
 * Accessible Button with Cybernetic Quant styling and micro-interactions
 */
export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}> = ({
  variant = 'ghost',
  size = 'md',
  loading,
  children,
  className,
  disabled,
  ...props
}) => {
  const sizeStyles = {
    sm: "min-h-[36px] px-3 py-1.5 text-xs",
    md: "min-h-[44px] px-4 py-2.5 text-sm",
    lg: "min-h-[50px] px-6 py-3.5 text-base"
  };

  const variantStyles = {
    primary: "bg-[#00F0FF] text-[#060E20] hover:bg-[#7DF4FF] border border-[#00F0FF] font-bold shadow-[0_0_15px_rgba(0,240,255,0.25)] active:scale-[0.98]",
    secondary: "bg-[#171F33] text-[#DAE2FD] hover:bg-[#222A3D] border border-white/10 active:scale-[0.98]",
    ghost: "bg-white/[0.04] hover:bg-white/[0.09] text-[#DAE2FD] border border-white/10 active:scale-[0.98]",
    danger: "bg-[#EF4444]/15 hover:bg-[#EF4444]/25 text-[#EF4444] border border-[#EF4444]/40 hover:shadow-[0_0_15px_rgba(239,68,68,0.25)] active:scale-[0.98]",
    success: "bg-[#10B981]/15 hover:bg-[#10B981]/25 text-[#10B981] border border-[#10B981]/40 hover:shadow-[0_0_15px_rgba(16,185,129,0.25)] active:scale-[0.98]",
    outline: "bg-transparent hover:bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/50 active:scale-[0.98]"
  };

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-bold tracking-tight transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1326] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
        sizeStyles[size],
        variantStyles[variant],
        className
      )}
    >
      {loading && (
        <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />
      )}
      {children}
    </button>
  );
};

/**
 * Status Dot with pulse glow
 */
export const StatusDot: React.FC<{
  state: 'ok' | 'warn' | 'bad' | 'live' | 'syncing';
  className?: string;
}> = ({ state, className }) => {
  const styles = {
    ok: "bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.6)]",
    live: "bg-[#10B981] shadow-[0_0_10px_rgba(16,185,129,0.8)] animate-pulse",
    warn: "bg-[#F59E0B] shadow-[0_0_8px_rgba(245,158,11,0.6)]",
    bad: "bg-[#EF4444] shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-ping",
    syncing: "bg-[#00F0FF] shadow-[0_0_8px_rgba(0,240,255,0.6)] animate-pulse"
  };

  return (
    <span
      className={cn("w-2 h-2 rounded-full inline-block shrink-0", styles[state] || styles.ok, className)}
      aria-hidden="true"
    />
  );
};

/**
 * Cybernetic Linear Progress Gauge
 */
export const Gauge: React.FC<{
  value: number;
  label: string;
  subLabel?: string;
  tone?: 'cyan' | 'emerald' | 'crimson' | 'amber';
}> = ({ value, label, subLabel, tone = 'cyan' }) => {
  const pct = Math.max(0, Math.min(100, value));

  const colorMap = {
    cyan: "from-[#00F0FF] to-[#00A5B5] shadow-[0_0_10px_rgba(0,240,255,0.3)]",
    emerald: "from-[#10B981] to-[#059669] shadow-[0_0_10px_rgba(16,185,129,0.3)]",
    crimson: "from-[#EF4444] to-[#DC2626] shadow-[0_0_10px_rgba(239,68,68,0.3)]",
    amber: "from-[#F59E0B] to-[#D97706] shadow-[0_0_10px_rgba(245,158,11,0.3)]"
  };

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center text-[10px] uppercase font-mono font-bold tracking-wider text-[#849495]">
        <span>{label}</span>
        <div className="flex items-center gap-1.5">
          {subLabel && <span className="text-[#B9CACB]">{subLabel}</span>}
          <span className="text-[#DAE2FD]">{pct.toFixed(1)}%</span>
        </div>
      </div>
      <div className="h-2 bg-[#060E20] border border-white/[0.06] rounded-full overflow-hidden p-[1px]">
        <div
          className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", colorMap[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

/**
 * Empty State Container
 */
export const Empty: React.FC<{
  title: string;
  desc: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, desc, icon, action, className }) => (
  <div className={cn("text-center py-12 px-6 flex flex-col items-center justify-center", className)}>
    <div className="w-14 h-14 rounded-2xl bg-[#131B2E] border border-white/10 flex items-center justify-center text-[#00F0FF] mb-3 shadow-inner">
      {icon || <span className="text-xl font-mono">∅</span>}
    </div>
    <h4 className="text-sm font-mono font-bold text-[#DAE2FD] tracking-tight">{title}</h4>
    <p className="text-xs text-[#849495] mt-1 max-w-[36ch] leading-relaxed">{desc}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);

/**
 * Alert Box with high-contrast accessibility
 */
export const Alert: React.FC<{
  tone?: 'amber' | 'crimson' | 'cyan' | 'emerald' | 'red' | 'violet';
  title?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ tone = 'amber', title, children, className }) => {
  const m: Record<string, { bg: string; border: string; text: string; iconColor: string }> = {
    amber: {
      bg: "bg-[#F59E0B]/10",
      border: "border-[#F59E0B]/30",
      text: "text-[#FCD34D]",
      iconColor: "text-[#F59E0B]"
    },
    crimson: {
      bg: "bg-[#EF4444]/10",
      border: "border-[#EF4444]/30",
      text: "text-[#FCA5A5]",
      iconColor: "text-[#EF4444]"
    },
    red: {
      bg: "bg-[#EF4444]/10",
      border: "border-[#EF4444]/30",
      text: "text-[#FCA5A5]",
      iconColor: "text-[#EF4444]"
    },
    cyan: {
      bg: "bg-[#00F0FF]/10",
      border: "border-[#00F0FF]/30",
      text: "text-[#7DF4FF]",
      iconColor: "text-[#00F0FF]"
    },
    violet: {
      bg: "bg-[#8B5CF6]/10",
      border: "border-[#8B5CF6]/30",
      text: "text-[#C4B5FD]",
      iconColor: "text-[#8B5CF6]"
    },
    emerald: {
      bg: "bg-[#10B981]/10",
      border: "border-[#10B981]/30",
      text: "text-[#6EE7B7]",
      iconColor: "text-[#10B981]"
    }
  };

  const current = m[tone] || m.amber;

  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border p-3.5 text-xs flex gap-3 backdrop-blur-md",
        current.bg,
        current.border,
        current.text,
        className
      )}
    >
      <div className="flex-1 space-y-1">
        {title && <div className="font-mono font-bold uppercase tracking-wider text-white">{title}</div>}
        <div className="leading-relaxed">{children}</div>
      </div>
    </div>
  );
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const useModalFocus = (
  isOpen: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
) => {
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    openerRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusableItems = () =>
      Array.from(containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);

    const focusFrame = window.requestAnimationFrame(() => {
      const [first] = focusableItems();
      (first ?? containerRef.current)?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = focusableItems();
      if (items.length === 0) {
        e.preventDefault();
        containerRef.current?.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === containerRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus?.();
    };
  }, [isOpen, containerRef]);
};

/**
 * Accessible Modal Dialog with keyboard trap (Esc) and focus management
 */
export const Modal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}> = ({ isOpen, onClose, title, children, maxWidth = 'md' }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useModalFocus(isOpen, modalRef, onClose);

  if (!isOpen) return null;

  const widthClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-2xl"
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "w-full bg-[#0B1326] border border-white/[0.12] rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 text-[#DAE2FD] focus:outline-none",
          widthClasses[maxWidth]
        )}
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <h3 id={titleId} className="font-mono font-bold text-base text-white tracking-tight">
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-[#849495] hover:text-white hover:bg-white/[0.08] transition-colors focus-visible:ring-2 focus-visible:ring-[#00F0FF]"
          >
            ✕
          </button>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
};
