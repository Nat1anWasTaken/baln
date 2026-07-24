import type { HTMLAttributes } from 'react'; import { cn } from '@/lib/cn'
export function Card({className,...p}:HTMLAttributes<HTMLDivElement>){return <div className={cn('rounded-xl border bg-card text-card-foreground shadow-sm',className)} {...p}/>}
export function CardHeader({className,...p}:HTMLAttributes<HTMLDivElement>){return <div className={cn('p-5 pb-2',className)} {...p}/>}
export function CardTitle({className,...p}:HTMLAttributes<HTMLHeadingElement>){return <h2 className={cn('font-semibold tracking-tight',className)} {...p}/>}
export function CardContent({className,...p}:HTMLAttributes<HTMLDivElement>){return <div className={cn('p-5 pt-3',className)} {...p}/>}
