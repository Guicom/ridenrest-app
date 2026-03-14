import { z } from 'zod'

export const createSegmentSchema = z.object({
  name: z.string().min(1).max(100),
  // File upload is multipart — handled separately by NestJS @UploadedFile()
})

export const replaceSegmentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
})

export type CreateSegmentInput = z.infer<typeof createSegmentSchema>
export type ReplaceSegmentInput = z.infer<typeof replaceSegmentSchema>
