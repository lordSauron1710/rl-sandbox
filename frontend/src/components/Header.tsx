'use client'

interface HeaderProps {
  version?: string
}

export function Header({ version = 'v0.0' }: HeaderProps) {
  return (
    <header className="h-[60px] border-b border-border flex items-center justify-between px-4 flex-shrink-0 bg-white">
      {/* Logo */}
      <div className="flex items-baseline gap-2">
        <span className="text-outline text-xl">RL SANDBOX</span>
        <span className="text-[10px] font-mono text-black font-normal">
          // GYM LAB
        </span>
      </div>

      {/* Version indicator */}
      <div className="flex items-center gap-4">
        <span className="label m-0">{version}</span>
        <div className="w-2 h-2 bg-accent-success rounded-full" />
      </div>
    </header>
  )
}
