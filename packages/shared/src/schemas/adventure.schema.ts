import { z } from 'zod'

export const createAdventureSchema = z.object({
  name: z.string().min(1).max(100),
})

export const updateAdventureSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z.enum(['planning', 'active', 'completed']).optional(),
})

export const reorderSegmentsSchema = z.object({
  segmentIds: z.array(z.string().uuid()).min(1),
})

export type CreateAdventureInput = z.infer<typeof createAdventureSchema>
export type UpdateAdventureInput = z.infer<typeof updateAdventureSchema>
export type ReorderSegmentsInput = z.infer<typeof reorderSegmentsSchema>
