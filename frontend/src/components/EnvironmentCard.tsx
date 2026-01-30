'use client'

import { ApiEnvironment } from '@/services/api'

interface EnvironmentCardProps {
  environment: ApiEnvironment
  isSelected: boolean
  onSelect: (envId: string) => void
}

/**
 * Environment selection card showing metadata
 */
export function EnvironmentCard({ environment, isSelected, onSelect }: EnvironmentCardProps) {
  const actionSpaceLabel = environment.action_space_type === 'Discrete' ? 'DISCRETE' : 'CONTINUOUS'
  
  return (
    <div
      className={`env-card ${isSelected ? 'active' : ''}`}
      onClick={() => onSelect(environment.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(environment.id)
        }
      }}
    >
      {/* Header: Name + ID Badge */}
      <div className="flex justify-between items-start mb-2">
        <span className="font-semibold text-sm">{environment.name}</span>
        <span className="env-badge">{environment.display_id}</span>
      </div>
      
      {/* Space info */}
      <div className="flex items-center gap-2">
        <span className={`space-badge ${environment.action_space_type === 'Discrete' ? 'discrete' : 'continuous'}`}>
          {actionSpaceLabel}
        </span>
        <span className="label m-0 text-[9px]">
          {environment.obs_space_type.toUpperCase()}({environment.obs_space_dims})
        </span>
      </div>
      
      {/* Description (subtle) */}
      {isSelected && environment.description && (
        <p className="text-[10px] text-text-secondary mt-2 leading-relaxed">
          {environment.description}
        </p>
      )}
    </div>
  )
}

interface EnvironmentCardSkeletonProps {
  count?: number
}

/**
 * Skeleton loader for environment cards
 */
export function EnvironmentCardSkeleton({ count = 3 }: EnvironmentCardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="env-card animate-pulse">
          <div className="flex justify-between items-start mb-2">
            <div className="h-4 w-24 bg-border rounded" />
            <div className="h-4 w-10 bg-border rounded" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-16 bg-border rounded" />
            <div className="h-3 w-12 bg-border rounded" />
          </div>
        </div>
      ))}
    </>
  )
}
