import type { OttyApi } from '../shared/types'

declare global {
  interface Window {
    otty: OttyApi
  }
}

export {}
