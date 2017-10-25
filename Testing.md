# Testing

## Status

- `events` ✓
- `i18n` ✓
- `log` : 5/10 pass, fails on `it can raise a metric`
- `settings` : almost there, but 0/2 pass
- `util`: 55/57 pass
- `util_normalize`: fix `'` and `"` (see legacy test `normalisePropertyExpression`)

## storage

- `localfilesystem`: Error: `done() called multiple times (in spec)` 0/3 pass
- `index`: mostly configured, problem to mimic recursive init of legacy impl (ie. `storageModule`)

## nodes

- `node`: fix `_on` via `events` or `EventEmmitter` and fix `flows is not defined`

For events, see example in `Library`

```js
var events = this.runtime.events
this.events = events
events.removeListener('node-examples-dir', this.addNodeExamplesDir);
events.on('node-examples-dir', this.addNodeExamplesDir);
```

- `library` 2/3 pass, example flows not found in `test//resources/examples` folder

Taken from original [node-red test/resources/examples](https://github.com/node-red/node-red/blob/master/test/resources/examples/)

- `index`: `red.js` failed due to ENV variables not set (temporarily set now, but not correctly!)

```js
if (fs.existsSync(path.join(process.env.NODE_RED_HOME, '.config.json'))) {
    // NODE_RED_HOME contains user data - use its settings.js
    settingsFile = path.join(process.env.NODE_RED_HOME, 'settings.js');
} else if (process.env.HOMEPATH && fs.existsSync(path.join(process.env.HOMEPATH, '.node-red', '.config.json'))) {
    // Consider compatibility for older versions
    settingsFile = path.join(process.env.HOMEPATH, '.node-red', 'settings.js');
```

Error: `Cannot find module './api'`

We need to update [red-api](https://github.com/tecla5/red-api) to pass all tests, then install it via `npm link`, then import it.

```js
"dependencies": {
  "red-api": ">0",
  // ...
}
```

- `credentials`: 0/1 pass Error: `timeout of 3000ms exceeded. Ensure the done() callback is being called in this test.`

- `context`: 7/9 pass. Problem in `deletes context` test case (see legacy impl.)

### flows

### registry

### resources
