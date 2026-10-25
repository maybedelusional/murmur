import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateState } from '@shared/types'

const { autoUpdater } = electronUpdater

/**
 * Checks GitHub Releases for a newer Murmur, downloads it in the background
 * and tells the UI when it's ready. Installing happens on restart.
 */
export function startUpdater(onChange: (s: UpdateState) => void): () => void {
  if (!app.isPackaged) return () => undefined

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('download-progress', (p) => {
    onChange({ kind: 'downloading', version: '', percent: Math.round(p.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    onChange({ kind: 'ready', version: info.version })
  })
  autoUpdater.on('error', (e) => {
    console.error('Update check failed:', e?.message ?? e)
  })

  const check = (): void => {
    autoUpdater.checkForUpdates().catch(() => undefined)
  }
  check()
  const timer = setInterval(check, 4 * 60 * 60 * 1000)
  return () => clearInterval(timer)
}

export function restartToUpdate(): void {
  autoUpdater.quitAndInstall(true, true)
}
