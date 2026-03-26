'use client'
import { useEffect } from 'react'
import { toast } from 'sonner'

export function PlanningMobileToast() {
  useEffect(() => {
    if (window.innerWidth < 1024) {
      toast('Mode Planning optimisé pour desktop — certaines fonctionnalités sont réduites sur mobile', {
        duration: 6000,
      })
    }
  }, [])
  return null
}
