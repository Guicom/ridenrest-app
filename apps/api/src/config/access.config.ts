import { registerAs } from '@nestjs/config'
import { z } from 'zod'

const schema = z.object({
  BROUTER_BASE_URL: z.string().url().default('http://localhost:17777'),
  BROUTER_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  BROUTER_DEFAULT_PROFILE: z.string().min(1).default('trekking'),
  ACCESS_EAGER_THRESHOLD_M: z.coerce.number().int().positive().default(1500),
  ACCESS_TRACE_BUFFER_M: z.coerce.number().int().nonnegative().default(10),
  ACCESS_CACHE_TTL_LIVE_SECONDS: z.coerce.number().int().positive().default(900),
  ACCESS_ENGINE_VERSION: z.string().min(1).default('brouter-1.7.9+trekking'),
})

const accessConfig = registerAs('access', () => {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid access routing env vars:\n${issues}`)
  }
  return {
    brouterBaseUrl: parsed.data.BROUTER_BASE_URL,
    brouterTimeoutMs: parsed.data.BROUTER_TIMEOUT_MS,
    brouterDefaultProfile: parsed.data.BROUTER_DEFAULT_PROFILE,
    eagerThresholdM: parsed.data.ACCESS_EAGER_THRESHOLD_M,
    traceBufferM: parsed.data.ACCESS_TRACE_BUFFER_M,
    cacheTtlLiveSeconds: parsed.data.ACCESS_CACHE_TTL_LIVE_SECONDS,
    engineVersion: parsed.data.ACCESS_ENGINE_VERSION,
  }
})

export default accessConfig
