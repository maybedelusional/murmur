import type { MurmurApi } from '../shared/types'

declare global {
  interface Window {
    murmur: MurmurApi
  }
}

export {}
