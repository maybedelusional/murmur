import type { MurmurApi, NowPlaying, ProjectInfo } from '@shared/types'

const WORD = 'murmur'

export function Wordmark() {
  return (
    <span className="wordmark" role="img" aria-label="Murmur">
      {WORD.split('').map((ch, i) => (
        <span key={i} aria-hidden="true" style={{ animationDelay: `${i * 0.11}s` }}>
          {ch}
        </span>
      ))}
    </span>
  )
}

function Player({ now, api }: { now: NowPlaying; api: MurmurApi }) {
  if (!now.available || !now.title) return null
  return (
    <div className="player no-drag">
      <div className="player-art" aria-hidden="true">
        <span />
        <span />
      </div>
      <span className="player-text">
        <span style={{ fontWeight: 600 }}>{now.title}</span>
        {now.artist ? <span className="muted"> — {now.artist}</span> : null}
      </span>
      <div style={{ display: 'flex' }}>
        <button className="icon-btn" aria-label="Previous track" onClick={() => void api.media.command('previous')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7 5h2v14H7zM20 5v14L10 12z" />
          </svg>
        </button>
        <button
          className="icon-btn"
          style={{ color: 'var(--text)' }}
          aria-label={now.playing ? 'Pause music' : 'Play music'}
          onClick={() => void api.media.command('toggle')}
        >
          {now.playing ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7 4l13 8-13 8z" />
            </svg>
          )}
        </button>
        <button className="icon-btn" aria-label="Next track" onClick={() => void api.media.command('next')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M15 5h2v14h-2zM4 5v14l10-7z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

interface Props {
  api: MurmurApi
  project: ProjectInfo | null
  nowPlaying: NowPlaying
  anyRunning: boolean
  onChooseProject(): void
  onPauseAll(): void
  onOpenSettings(): void
}

export function TitleBar({ api, project, nowPlaying, anyRunning, onChooseProject, onPauseAll, onOpenSettings }: Props) {
  return (
    <header className="titlebar">
      <Wordmark />
      <button className="project-btn" onClick={onChooseProject} title="Open another project">
        {project ? (
          <>
            <span style={{ fontWeight: 600 }}>{project.name}</span>
            <span className="muted">on</span>
            <span className="mono muted">{project.branch}</span>
          </>
        ) : (
          <span className="muted">Open a project</span>
        )}
      </button>

      <div className="titlebar-center">
        <Player now={nowPlaying} api={api} />
      </div>

      {project ? (
        <button className="btn" style={{ height: 30 }} disabled={!anyRunning} onClick={onPauseAll}>
          Pause all agents
        </button>
      ) : null}
      <button className="icon-btn" aria-label="Settings" onClick={onOpenSettings}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="10" cy="17" r="2" />
        </svg>
      </button>
      <div className="window-controls">
        <button aria-label="Minimize" onClick={api.window.minimize}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 5h10" stroke="currentColor" />
          </svg>
        </button>
        <button aria-label="Maximize" onClick={api.window.toggleMaximize}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
          </svg>
        </button>
        <button className="close" aria-label="Close" onClick={api.window.close}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" />
          </svg>
        </button>
      </div>
    </header>
  )
}
