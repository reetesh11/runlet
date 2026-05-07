import Link from 'next/link'
import { Play, ArrowLeft } from 'lucide-react'

export default function NotFound() {
    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
            <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-8">
                    <div className="w-8 h-8 bg-brand-500 rounded-xl flex items-center justify-center">
                        <Play className="w-4 h-4 text-white fill-white" />
                    </div>
                    <span className="text-xl font-bold text-white">run<span className="text-brand-400">let</span></span>
                </div>
                <h1 className="text-6xl font-bold text-white mb-2">404</h1>
                <p className="text-gray-500 mb-8">Page not found</p>
                <Link href="/"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-400 text-white text-sm font-medium rounded-lg transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Dashboard
                </Link>
            </div>
        </div>
    )
}
