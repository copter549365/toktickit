import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-zg-primary',
  secondary: 'btn-zg-secondary',
  tertiary: 'btn-zg-tertiary',
  destructive: 'btn-zg-destructive',
};

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  busy?: boolean;
  busyLabel?: ReactNode;
  children: ReactNode;
}

/**
 * Zen Green button wrapper over Bootstrap's `.btn` (ui-spec.md §3 "Buttons").
 * Text is always shown; icons may accompany but never replace the label.
 */
export function Button({
  variant = 'primary',
  busy = false,
  busyLabel,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn ${VARIANT_CLASS[variant]}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy && (
        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
      )}
      {busy ? busyLabel ?? children : children}
    </button>
  );
}

export default Button;
