import { z } from 'zod'

export const createStageSchema = z.object({
  name: z.string().min(1).max(100),
  endKm: z.number().min(0),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})

export const updateStageSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

export type CreateStageInput = z.infer<typeof createStageSchema>
export type UpdateStageInput = z.infer<typeof updateStageSchema>
