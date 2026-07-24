import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
const variants = cva('inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', { variants: { variant: { default: 'bg-primary text-primary-foreground hover:opacity-90', secondary: 'bg-secondary text-secondary-foreground hover:bg-accent', outline: 'border bg-background hover:bg-accent', ghost: 'hover:bg-accent', destructive: 'bg-destructive text-white hover:opacity-90' }, size: { default: 'h-9 px-4 py-2', sm: 'h-8 px-3', icon: 'size-9' } }, defaultVariants: { variant: 'default', size: 'default' } })
export function Button({ className, variant, size, asChild, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants> & { asChild?: boolean }) { const Comp = asChild ? Slot : 'button'; return <Comp className={cn(variants({ variant, size }), className)} {...props} /> }
