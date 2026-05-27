import { customType } from 'drizzle-orm/pg-core'

export const lineString = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(LINESTRING, 4326)'
  },
})
