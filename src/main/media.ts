import { spawn, type ChildProcess } from 'node:child_process'
import type { NowPlaying } from '@shared/types'

/**
 * Reads "now playing" from Windows' media controls (the same source as the
 * volume-key popup), so it works with Spotify, browsers and any other player
 * without logging in anywhere. Uses PowerShell's WinRT bridge so no native
 * module has to be compiled.
 */

const PREAMBLE = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
`

const WATCH = `${PREAMBLE}
$last = ''
while ($true) {
  $s = $mgr.GetCurrentSession()
  if ($s) {
    $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $info = $s.GetPlaybackInfo()
    $o = @{ available = $true; title = $p.Title; artist = $p.Artist; playing = ($info.PlaybackStatus.ToString() -eq 'Playing'); app = $s.SourceAppUserModelId }
  } else { $o = @{ available = $false } }
  $j = $o | ConvertTo-Json -Compress
  if ($j -ne $last) { [Console]::Out.WriteLine($j); [Console]::Out.Flush(); $last = $j }
  Start-Sleep -Milliseconds 900
}
`

const COMMANDS = {
  toggle: 'TryTogglePlayPauseAsync',
  next: 'TrySkipNextAsync',
  previous: 'TrySkipPreviousAsync'
} as const

function encode(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

function powershell(script: string): ChildProcess {
  return spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encode(script)], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore']
  })
}

export class MediaWatcher {
  private proc: ChildProcess | null = null
  private current: NowPlaying = { available: false }
  private stopped = false

  constructor(private onChange: (now: NowPlaying) => void) {}

  start(): void {
    if (process.platform !== 'win32' || this.proc) return
    this.stopped = false
    const proc = powershell(WATCH)
    this.proc = proc
    let buf = ''
    proc.stdout?.setEncoding('utf8')
    proc.stdout?.on('data', (chunk: string) => {
      buf += chunk
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        try {
          this.current = JSON.parse(line) as NowPlaying
          this.onChange(this.current)
        } catch {
          /* partial line */
        }
      }
    })
    proc.on('exit', () => {
      this.proc = null
      if (!this.stopped) setTimeout(() => this.start(), 5000)
    })
    proc.on('error', () => {
      this.proc = null
    })
  }

  get now(): NowPlaying {
    return this.current
  }

  async command(cmd: keyof typeof COMMANDS): Promise<void> {
    if (process.platform !== 'win32') return
    if (cmd === 'toggle' && this.current.available) {
      // Show the change right away; the watcher confirms it a moment later.
      this.current = { ...this.current, playing: !this.current.playing }
      this.onChange(this.current)
    }
    const script = `${PREAMBLE}
$s = $mgr.GetCurrentSession()
if ($s) { Await ($s.${COMMANDS[cmd]}()) ([bool]) | Out-Null }`
    await new Promise<void>((resolve) => {
      const p = powershell(script)
      p.on('exit', () => resolve())
      p.on('error', () => resolve())
    })
  }

  stop(): void {
    this.stopped = true
    this.proc?.kill()
    this.proc = null
  }
}
