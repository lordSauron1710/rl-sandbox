import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0D0D0D] text-white p-6">
      <h1 className="text-4xl font-mono font-bold mb-2">404</h1>
      <p className="text-white/80 mb-6">This page could not be found.</p>
      <Link
        href="/"
        className="px-4 py-2 bg-white text-black font-mono text-sm rounded hover:bg-white/90"
      >
        Go to RL Sandbox
      </Link>
    </div>
  )
}
