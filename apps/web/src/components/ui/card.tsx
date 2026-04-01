import type { ComponentProps } from 'react'
import { cn } from "@/lib/utils"

function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-[--border] bg-background", className)} {...props} />
}

function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-4 pt-4 pb-2", className)} {...props} />
}

function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-4 pb-4", className)} {...props} />
}

export { Card, CardHeader, CardContent }
