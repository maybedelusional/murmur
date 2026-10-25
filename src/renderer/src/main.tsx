import '@fontsource/schibsted-grotesk/400.css'
import '@fontsource/schibsted-grotesk/500.css'
import '@fontsource/schibsted-grotesk/600.css'
import '@fontsource/schibsted-grotesk/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTokens } from './theme'
import { DUSK } from '@shared/themes'

async function boot(): Promise<void> {
  // Outside Electron (designing in a browser) there is no bridge: use sample data.
  if (!window.murmur) (await import('./mock')).installMock()
  applyTokens(DUSK)
  const { App } = await import('./App')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

void boot()
