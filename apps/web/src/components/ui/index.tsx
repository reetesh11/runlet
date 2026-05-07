'use client'
import { cn, statusBg } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

// ── Button ─────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'md', loading, children, className, disabled, ...props }: ButtonProps) {
  const base = 'inline-flex items-center gap-2 font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-brand-500/50 disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-brand-500 hover:bg-brand-400 text-white',
    secondary: 'bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10',
    ghost: 'hover:bg-white/5 text-gray-400 hover:text-gray-200',
    danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20',
  }
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-base' }
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  )
}

// ── Badge ──────────────────────────────────────────────────────
interface BadgeProps { status: string; label?: string; className?: string }
export function Badge({ status, label, className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md border', statusBg(status), className)}>
      {label ?? status.replace(/_/g, ' ')}
    </span>
  )
}

// ── Card ───────────────────────────────────────────────────────
interface CardProps { children: React.ReactNode; className?: string; onClick?: () => void }
export function Card({ children, className, onClick }: CardProps) {
  return (
    <div onClick={onClick} className={cn('bg-white/3 border border-white/7 rounded-xl', onClick && 'cursor-pointer hover:border-white/12 transition-colors', className)}>
      {children}
    </div>
  )
}

// ── Input ──────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { label?: string; error?: string; hint?: string }
export function Input({ label, error, hint, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-gray-400">{label}</label>}
      <input
        className={cn('w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/20 transition-colors', error && 'border-red-500/50', className)}
        {...props}
      />
      {hint && !error && <p className="text-xs text-gray-600">{hint}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

// ── Textarea ───────────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { label?: string; error?: string; hint?: string }
export function Textarea({ label, error, hint, className, ...props }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-gray-400">{label}</label>}
      <textarea
        className={cn('w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/20 transition-colors resize-none', error && 'border-red-500/50', className)}
        {...props}
      />
      {hint && !error && <p className="text-xs text-gray-600">{hint}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

// ── Select ─────────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> { label?: string; error?: string; options: Array<{ value: string; label: string }> }
export function Select({ label, error, options, className, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-gray-400">{label}</label>}
      <select
        className={cn('w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/20 transition-colors', error && 'border-red-500/50', className)}
        {...props}
      >
        {options.map(o => <option key={o.value} value={o.value} className="bg-gray-900">{o.label}</option>)}
      </select>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

// ── Toggle ─────────────────────────────────────────────────────
interface ToggleProps { checked: boolean; onChange: (v: boolean) => void; label?: string; description?: string }
export function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      {(label || description) && (
        <div>
          {label && <p className="text-sm text-gray-200">{label}</p>}
          {description && <p className="text-xs text-gray-500">{description}</p>}
        </div>
      )}
      <button type="button" onClick={() => onChange(!checked)}
        className={cn('relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors', checked ? 'bg-brand-500' : 'bg-white/10')}>
        <span className={cn('pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform', checked ? 'translate-x-4' : 'translate-x-0')} />
      </button>
    </div>
  )
}

// ── Spinner ────────────────────────────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin text-gray-500', className)} />
}

// ── Empty state ────────────────────────────────────────────────
interface EmptyProps { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }
export function Empty({ icon, title, description, action }: EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && <div className="text-gray-600 mb-4">{icon}</div>}
      <h3 className="text-sm font-medium text-gray-300 mb-1">{title}</h3>
      {description && <p className="text-xs text-gray-600 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ── Page header ────────────────────────────────────────────────
interface PageHeaderProps { title: string; description?: string; action?: React.ReactNode }
export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">{title}</h1>
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// ── Section ────────────────────────────────────────────────────
interface SectionProps { title: string; description?: string; children: React.ReactNode; className?: string }
export function Section({ title, description, children, className }: SectionProps) {
  return (
    <div className={cn('mb-6', className)}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <span className="w-1 h-4 bg-brand-500 rounded-full inline-block" />
          {title}
        </h3>
        {description && <p className="text-xs text-gray-600 mt-0.5 ml-3">{description}</p>}
      </div>
      {children}
    </div>
  )
}

// ── Stat card ──────────────────────────────────────────────────
interface StatCardProps { label: string; value: string | number; sub?: string; icon?: React.ReactNode; color?: string }
export function StatCard({ label, value, sub, icon, color = 'text-brand-400' }: StatCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-1">{label}</p>
          <p className={cn('text-2xl font-bold', color)}>{value}</p>
          {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
        </div>
        {icon && <div className="text-gray-600">{icon}</div>}
      </div>
    </Card>
  )
}
