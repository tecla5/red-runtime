# Runtime

The (global) runtime object.

- `init(userSettings,_adminApi)`
- `start()`
- `stop()`
- `version()`
- `log` - api
- `i18n` - api
- `settings` - api
- `storage` - api
- `events` - api (default: node `EventEmitter`)
- `nodes` - api
- `util` - api
- `isStarted()`
- `.adminApi`
- `.nodeApp`

Private utility functions

- `getVersion()`
- `reportMetrics()`
- `reinstallModules(moduleList)`
