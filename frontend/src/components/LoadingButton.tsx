'use client'

import { ButtonHTMLAttributes, forwardRef } from 'react'

interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean
  loadingText?: string
  variant?: 'primary' | 'secondary'
  progress?: number // 0-100 for progress ring
}

/**
 * Button component with circular progress ring around the border
 */
export const LoadingButton = forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ children, isLoading, loadingText, variant = 'primary', disabled, className = '', progress, ...props }, ref) => {
    const baseClasses = 'btn relative overflow-visible'
    const variantClasses = variant === 'primary' ? 'btn-primary' : 'btn-secondary'
    const disabledClasses = (disabled || isLoading) ? 'cursor-not-allowed' : ''

    return (
      <div className="relative">
        {/* Glowing progress ring around button */}
        {isLoading && (
          <div className="absolute inset-0 -m-[3px] rounded-full pointer-events-none">
            <svg
              className="w-full h-full"
              viewBox="0 0 100 100"
              style={{ transform: 'rotate(-90deg)' }}
            >
              {/* Background track */}
              <rect
                x="2"
                y="2"
                width="96"
                height="96"
                rx="48"
                ry="48"
                fill="none"
                stroke="rgba(0,0,0,0.1)"
                strokeWidth="3"
              />
              {/* Animated progress arc */}
              <rect
                x="2"
                y="2"
                width="96"
                height="96"
                rx="48"
                ry="48"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                className="text-black animate-border-progress"
                style={{
                  strokeDasharray: '300 300',
                  filter: 'drop-shadow(0 0 6px rgba(0,0,0,0.5))',
                }}
              />
            </svg>
          </div>
        )}
        <button
          ref={ref}
          className={`${baseClasses} ${variantClasses} ${disabledClasses} ${className} ${isLoading ? 'opacity-90' : ''}`}
          disabled={disabled || isLoading}
          {...props}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span>{loadingText || children}</span>
            </span>
          ) : (
            children
          )}
        </button>
      </div>
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
