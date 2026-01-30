'use client'

import { ButtonHTMLAttributes, forwardRef } from 'react'

interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean
  loadingText?: string
  variant?: 'primary' | 'secondary'
}

/**
 * Button component with circular progress spinner for loading states
 */
export const LoadingButton = forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ children, isLoading, loadingText, variant = 'primary', disabled, className = '', ...props }, ref) => {
    const baseClasses = 'btn relative'
    const variantClasses = variant === 'primary' ? 'btn-primary' : 'btn-secondary'
    const disabledClasses = (disabled || isLoading) ? 'opacity-60 cursor-not-allowed' : ''

    return (
      <button
        ref={ref}
        className={`${baseClasses} ${variantClasses} ${disabledClasses} ${className}`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <LoadingSpinner size={14} variant={variant} />
            <span>{loadingText || children}</span>
          </span>
        ) : (
          children
        )}
      </button>
    )
  }
)

LoadingButton.displayName = 'LoadingButton'

interface LoadingSpinnerProps {
  size?: number
  variant?: 'primary' | 'secondary'
}

/**
 * Circular progress spinner with animated ring
 */
export function LoadingSpinner({ size = 16, variant = 'primary' }: LoadingSpinnerProps) {
  const strokeColor = variant === 'primary' ? 'stroke-white' : 'stroke-black'
  const trackColor = variant === 'primary' ? 'stroke-white/30' : 'stroke-black/20'
  
  return (
    <svg
      className="animate-spin"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background track */}
      <circle
        className={trackColor}
        cx="12"
        cy="12"
        r="10"
        strokeWidth="2.5"
        fill="none"
      />
      {/* Animated arc */}
      <circle
        className={strokeColor}
        cx="12"
        cy="12"
        r="10"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeDasharray="31.4 31.4"
        strokeDashoffset="0"
      />
    </svg>
  )
}

interface LoadingRingProps {
  size?: number
  strokeWidth?: number
  className?: string
}

/**
 * Larger loading ring that can wrap around a button or element
 */
export function LoadingRing({ size = 48, strokeWidth = 3, className = '' }: LoadingRingProps) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background track */}
      <circle
        className="stroke-border"
        cx="24"
        cy="24"
        r="20"
        strokeWidth={strokeWidth}
        fill="none"
      />
      {/* Animated arc */}
      <circle
        className="stroke-black"
        cx="24"
        cy="24"
        r="20"
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeDasharray="62.8 62.8"
        strokeDashoffset="0"
      />
    </svg>
  )
}
