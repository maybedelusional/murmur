// IPC channel names, shared so main and preload can't drift apart.
export const IPC = {
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',

  projectCurrent: 'project:current',
  projectChoose: 'project:choose',

  agentsList: 'agents:list',
  agentsCreate: 'agents:create',
  agentsSend: 'agents:send',
  agentsPause: 'agents:pause',
  agentsResume: 'agents:resume',
  agentsPauseAll: 'agents:pause-all',
  agentsSetMode: 'agents:set-mode',
  agentsMerge: 'agents:merge',
  agentsDiscard: 'agents:discard',
  agentsOpenTerminal: 'agents:open-terminal',
  agentsAnswer: 'agents:answer',
  agentsUpdated: 'agents:updated',
  agentsMessage: 'agents:message',

  pluginsState: 'plugins:state',
  pluginsRefresh: 'plugins:refresh',
  pluginsInstall: 'plugins:install',
  pluginsUpdate: 'plugins:update',
  pluginsUninstall: 'plugins:uninstall',
  pluginsSetEnabled: 'plugins:set-enabled',
  pluginsAddMarketplace: 'plugins:add-marketplace',
  pluginsRemoveMarketplace: 'plugins:remove-marketplace',
  pluginsSaveSkill: 'plugins:save-skill',
  pluginsDeleteSkill: 'plugins:delete-skill',
  pluginsChanged: 'plugins:changed',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set',

  mediaChanged: 'media:changed',
  mediaCommand: 'media:command',

  updateChanged: 'update:changed',
  updateRestart: 'update:restart'
} as const
