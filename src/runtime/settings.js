/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

var when = require('when');
var clone = require('clone');
var assert = require('assert');
var log = require('./log');
var util = require('./util');

class Settings {
    constructor(settings) {
        // var userSettings = null;
        // var globalSettings = null;
        // var nodeSettings = null;
        // var disableNodeSettings = null;
        // var storage = null;

        this.userSettings = settings;
        let {
            persistentSettings
        } = this

        for (var i in settings) {
            /* istanbul ignore else */
            if (settings.hasOwnProperty(i) && i !== 'load' && i !== 'get' && i !== 'set' && i !== 'available' && i !== 'reset') {
                // Don't allow any of the core functions get replaced via settings
                (function () {
                    var j = i;
                    if (persistentSettings) {
                        persistentSettings.__defineGetter__(j, function () {
                            return userSettings[j];
                        });
                        persistentSettings.__defineSetter__(j, function () {
                            throw new Error(`Property ${j} is read-only`)
                        });
                    }
                })();
            }
        }
        this.globalSettings = null;
        this.nodeSettings = {};
        this.disableNodeSettings = {};
    }

    load(_storage) {
        storage = _storage;
        return storage.getSettings().then(function (_settings) {
            globalSettings = _settings;
        });
    }

    get(prop) {
        if (userSettings.hasOwnProperty(prop)) {
            return clone(userSettings[prop]);
        }
        if (globalSettings === null) {
            throw new Error(log._('settings.not-available'));
        }
        return clone(globalSettings[prop]);
    }

    set(prop, value) {
        if (userSettings.hasOwnProperty(prop)) {
            throw new Error(log._('settings.property-read-only', {
                prop: prop
            }));
        }
        if (globalSettings === null) {
            throw new Error(log._('settings.not-available'));
        }
        var current = globalSettings[prop];
        globalSettings[prop] = value;
        try {
            assert.deepEqual(current, value);
            return when.resolve();
        } catch (err) {
            return storage.saveSettings(globalSettings);
        }
    }
    delete(prop) {
        let {
            userSettings,
            globalSettings,
            storage
        } = this
        if (userSettings.hasOwnProperty(prop)) {
            throw new Error(log._('settings.property-read-only', {
                prop: prop
            }));
        }
        if (globalSettings === null) {
            throw new Error(log._('settings.not-available'));
        }
        if (globalSettings.hasOwnProperty(prop)) {
            delete globalSettings[prop];
            return storage.saveSettings(globalSettings);
        }
        return when.resolve();
    }

    available() {
        return (this.globalSettings !== null);
    }

    reset() {
        let {
            userSettings,
            globalSettings,
            storage
        } = this
        for (var i in userSettings) {
            /* istanbul ignore else */
            if (userSettings.hasOwnProperty(i)) {
                if (this.persistentSettings[i]) {
                    delete this.persistentSettings[i];
                }
            }
        }
        userSettings = null;
        globalSettings = null;
        storage = null;
    }
    registerNodeSettings(type, opts) {
        let {
            nodeSettings
        } = this
        var normalisedType = util.normaliseNodeTypeName(type);
        for (var property in opts) {
            if (opts.hasOwnProperty(property)) {
                if (!property.startsWith(normalisedType)) {
                    throw new Error(`Registered invalid property name ${property}. Properties for this node must start with ${normalisedType}`)
                }
            }
        }
        nodeSettings[type] = opts;
    }
    exportNodeSettings(safeSettings) {
        let {
            nodeSettings
        } = this

        for (var type in nodeSettings) {
            if (nodeSettings.hasOwnProperty(type) && !disableNodeSettings[type]) {
                var nodeTypeSettings = nodeSettings[type];
                for (var property in nodeTypeSettings) {
                    if (nodeTypeSettings.hasOwnProperty(property)) {
                        var setting = nodeTypeSettings[property];
                        if (setting.exportable) {
                            if (safeSettings.hasOwnProperty(property)) {
                                // Cannot overwrite existing setting
                            } else if (userSettings.hasOwnProperty(property)) {
                                safeSettings[property] = userSettings[property];
                            } else if (setting.hasOwnProperty('value')) {
                                safeSettings[property] = setting.value;
                            }
                        }
                    }
                }
            }
        }

        return safeSettings;
    }
    enableNodeSettings(types) {
        types.forEach(function (type) {
            disableNodeSettings[type] = false;
        });
    }
    disableNodeSettings(types) {
        types.forEach(function (type) {
            disableNodeSettings[type] = true;
        });
    }
}

Settings.init = function (settings) {
    return new Settings(settings)
}

module.exports = Settings
