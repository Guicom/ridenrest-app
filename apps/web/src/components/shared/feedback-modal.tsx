'use client'

import { z } from 'zod'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { submitFeedback } from '@/lib/api-client'

const feedbackSchema = z.object({
  category: z.enum(['bug', 'improvement', 'idea'], {
    error: 'Sélectionnez une catégorie',
  }),
  screen: z.string().optional(),
  description: z.string().min(10, 'La description doit faire au moins 10 caractères'),
})

type FeedbackFormValues = z.infer<typeof feedbackSchema>

const CATEGORY_LABELS: Record<string, string> = {
  bug: '🐛 Bug',
  improvement: '✨ Amélioration',
  idea: '💡 Idée',
}

interface FeedbackModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userEmail: string
}

export function FeedbackModal({ open, onOpenChange, userEmail }: FeedbackModalProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackSchema),
  })

  async function onSubmit(values: FeedbackFormValues) {
    try {
      await submitFeedback({
        category: values.category,
        screen: values.screen,
        description: values.description,
      })
      toast.success('Merci pour votre retour !')
      onOpenChange(false)
      reset()
    } catch {
      toast.error("Impossible d'envoyer le feedback.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Envoyer un feedback</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="category">Catégorie *</Label>
            <Controller
              name="category"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value ?? ''}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Sélectionnez une catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.category && (
              <p className="text-xs text-destructive">{errors.category.message}</p>
            )}
          </div>

          {/* Screen */}
          <div className="space-y-1.5">
            <Label htmlFor="screen">Page ou fonctionnalité</Label>
            <Input
              id="screen"
              placeholder="Sur quelle page ou fonctionnalité ?"
              {...register('screen')}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              placeholder="Décrivez votre retour en détail..."
              rows={4}
              {...register('description')}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>

          {/* Email (read-only) */}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              value={userEmail}
              disabled
              className="opacity-60"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? 'Envoi…' : 'Envoyer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
