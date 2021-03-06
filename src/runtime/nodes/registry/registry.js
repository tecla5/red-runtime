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

//var UglifyJS = require('uglify-js');
var util = require('util');
var when = require('when');
var path = require('path');
var fs = require('fs');
var Node = require('../node');
var events = require('../../events');
var icon_paths = {
    'node-red': [path.resolve(__dirname + '/../../../../public/icons')]
};
var defaultIcon = path.resolve(__dirname + '/../../../../public/icons/arrow-in.png');

class Registry {
    constructor(_settings, _loader) {
        this.settings = _settings;
        this.loader = _loader;
        this.moduleNodes = {};
        this.nodeTypeToId = {};
        this.nodeConstructors = {};
        this.nodeList = [];
        this.nodeConfigCache = null;
        this.moduleConfigs = {};
        this.iconCache = {};
        events.removeListener('node-icon-dir', nodeIconDir);
        events.on('node-icon-dir', nodeIconDir);

    }

    load() {
        if (settings.available()) {
            moduleConfigs = loadNodeConfigs();
        } else {
            moduleConfigs = {};
        }
    }

    filterNodeInfo(n) {
        var r = {
            id: n.id || n.module + '/' + n.name,
            name: n.name,
            types: n.types,
            enabled: n.enabled,
            local: n.local || false
        };
        if (n.hasOwnProperty('module')) {
            r.module = n.module;
        }
        if (n.hasOwnProperty('err')) {
            r.err = n.err.toString();
        }
        return r;
    }

    getModule(id) {
        var parts = id.split('/');
        return parts.slice(0, parts.length - 1).join('/');
    }

    getNode(id) {
        var parts = id.split('/');
        return parts[parts.length - 1];
    }

    saveNodeList() {
        var moduleList = {};
        var hadPending = false;
        var hasPending = false;
        for (var module in moduleConfigs) {
            /* istanbul ignore else */
            if (moduleConfigs.hasOwnProperty(module)) {
                if (Object.keys(moduleConfigs[module].nodes).length > 0) {
                    if (!moduleList[module]) {
                        moduleList[module] = {
                            name: module,
                            version: moduleConfigs[module].version,
                            local: moduleConfigs[module].local || false,
                            nodes: {}
                        };
                        if (moduleConfigs[module].hasOwnProperty('pending_version')) {
                            hadPending = true;
                            if (moduleConfigs[module].pending_version !== moduleConfigs[module].version) {
                                moduleList[module].pending_version = moduleConfigs[module].pending_version;
                                hasPending = true;
                            } else {
                                delete moduleConfigs[module].pending_version;
                            }
                        }
                    }
                    var nodes = moduleConfigs[module].nodes;
                    for (var node in nodes) {
                        /* istanbul ignore else */
                        if (nodes.hasOwnProperty(node)) {
                            var config = nodes[node];
                            var n = filterNodeInfo(config);
                            delete n.err;
                            delete n.file;
                            delete n.id;
                            n.file = config.file;
                            moduleList[module].nodes[node] = n;
                        }
                    }
                }
            }
        }
        if (hadPending && !hasPending) {
            events.emit('runtime-event', {
                id: 'restart-required',
                retain: true
            });
        }
        if (settings.available()) {
            return settings.set('nodes', moduleList);
        } else {
            return when.reject('Settings unavailable');
        }
    }

    loadNodeConfigs() {
        var configs = settings.get('nodes');

        if (!configs) {
            return {};
        } else if (configs['node-red']) {
            return configs;
        } else {
            // Migrate from the 0.9.1 format of settings
            var newConfigs = {};
            for (var id in configs) {
                /* istanbul ignore else */
                if (configs.hasOwnProperty(id)) {
                    var nodeConfig = configs[id];
                    var moduleName;
                    var nodeSetName;

                    if (nodeConfig.module) {
                        moduleName = nodeConfig.module;
                        nodeSetName = nodeConfig.name.split(':')[1];
                    } else {
                        moduleName = 'node-red';
                        nodeSetName = nodeConfig.name.replace(/^\d+-/, '').replace(/\.js$/, '');
                    }

                    if (!newConfigs[moduleName]) {
                        newConfigs[moduleName] = {
                            name: moduleName,
                            nodes: {}
                        };
                    }
                    newConfigs[moduleName].nodes[nodeSetName] = {
                        name: nodeSetName,
                        types: nodeConfig.types,
                        enabled: nodeConfig.enabled,
                        module: moduleName
                    };
                }
            }
            settings.set('nodes', newConfigs);
            return newConfigs;
        }
    }

    addNodeSet(id, set, version) {
        if (!set.err) {
            set.types.forEach(function (t) {
                nodeTypeToId[t] = id;
            });
        }
        moduleNodes[set.module] = moduleNodes[set.module] || [];
        moduleNodes[set.module].push(set.name);

        if (!moduleConfigs[set.module]) {
            moduleConfigs[set.module] = {
                name: set.module,
                nodes: {}
            };
        }

        if (version) {
            moduleConfigs[set.module].version = version;
        }
        moduleConfigs[set.module].local = set.local;

        moduleConfigs[set.module].nodes[set.name] = set;
        nodeList.push(id);
        nodeConfigCache = null;
    }

    removeNode(id) {
        var config = moduleConfigs[getModule(id)].nodes[getNode(id)];
        if (!config) {
            throw new Error('Unrecognised id: ' + id);
        }
        delete moduleConfigs[getModule(id)].nodes[getNode(id)];
        var i = nodeList.indexOf(id);
        if (i > -1) {
            nodeList.splice(i, 1);
        }
        config.types.forEach(function (t) {
            var typeId = nodeTypeToId[t];
            if (typeId === id) {
                delete nodeConstructors[t];
                delete nodeTypeToId[t];
            }
        });
        config.enabled = false;
        config.loaded = false;
        nodeConfigCache = null;
        return filterNodeInfo(config);
    }

    removeModule(module) {
        if (!settings.available()) {
            throw new Error('Settings unavailable');
        }
        var nodes = moduleNodes[module];
        if (!nodes) {
            throw new Error('Unrecognised module: ' + module);
        }
        var infoList = [];
        for (var i = 0; i < nodes.length; i++) {
            infoList.push(removeNode(module + '/' + nodes[i]));
        }
        delete moduleNodes[module];
        delete moduleConfigs[module];
        saveNodeList();
        return infoList;
    }

    getNodeInfo(typeOrId) {
        var id = typeOrId;
        if (nodeTypeToId.hasOwnProperty(typeOrId)) {
            id = nodeTypeToId[typeOrId];
        }
        /* istanbul ignore else */
        if (id) {
            var module = moduleConfigs[getModule(id)];
            if (module) {
                var config = module.nodes[getNode(id)];
                if (config) {
                    var info = filterNodeInfo(config);
                    if (config.hasOwnProperty('loaded')) {
                        info.loaded = config.loaded;
                    }
                    info.version = module.version;
                    return info;
                }
            }
        }
        return null;
    }

    getFullNodeInfo(typeOrId) {
        // Used by index.enableNodeSet so that .file can be retrieved to pass
        // to loader.loadNodeSet
        var id = typeOrId;
        if (nodeTypeToId.hasOwnProperty(typeOrId)) {
            id = nodeTypeToId[typeOrId];
        }
        /* istanbul ignore else */
        if (id) {
            var module = moduleConfigs[getModule(id)];
            if (module) {
                return module.nodes[getNode(id)];
            }
        }
        return null;
    }

    getNodeList(filter) {
        var list = [];
        for (var module in moduleConfigs) {
            /* istanbul ignore else */
            if (moduleConfigs.hasOwnProperty(module)) {
                var nodes = moduleConfigs[module].nodes;
                for (var node in nodes) {
                    /* istanbul ignore else */
                    if (nodes.hasOwnProperty(node)) {
                        var nodeInfo = filterNodeInfo(nodes[node]);
                        nodeInfo.version = moduleConfigs[module].version;
                        if (moduleConfigs[module].pending_version) {
                            nodeInfo.pending_version = moduleConfigs[module].pending_version;
                        }
                        if (!filter || filter(nodes[node])) {
                            list.push(nodeInfo);
                        }
                    }
                }
            }
        }
        return list;
    }

    getModuleList() {
        //var list = [];
        //for (var module in moduleNodes) {
        //    /* istanbul ignore else */
        //    if (moduleNodes.hasOwnProperty(module)) {
        //        list.push(registry.getModuleInfo(module));
        //    }
        //}
        //return list;
        return moduleConfigs;

    }

    getModuleInfo(module) {
        if (moduleNodes[module]) {
            var nodes = moduleNodes[module];
            var m = {
                name: module,
                version: moduleConfigs[module].version,
                local: moduleConfigs[module].local,
                nodes: []
            };
            for (var i = 0; i < nodes.length; ++i) {
                var nodeInfo = filterNodeInfo(moduleConfigs[module].nodes[nodes[i]]);
                nodeInfo.version = m.version;
                m.nodes.push(nodeInfo);
            }
            return m;
        } else {
            return null;
        }
    }

    getCaller() {
        var orig = Error.prepareStackTrace;
        Error.prepareStackTrace = function (_, stack) {
            return stack;
        };
        var err = new Error();
        Error.captureStackTrace(err, arguments.callee);
        var stack = err.stack;
        Error.prepareStackTrace = orig;
        stack.shift();
        stack.shift();
        return stack[0].getFileName();
    }

    inheritNode(constructor) {
        if (Object.getPrototypeOf(constructor.prototype) === Object.prototype) {
            util.inherits(constructor, Node);
        } else {
            var proto = constructor.prototype;
            while (Object.getPrototypeOf(proto) !== Object.prototype) {
                proto = Object.getPrototypeOf(proto);
            }
            //TODO: This is a partial implementation of util.inherits >= node v5.0.0
            //      which should be changed when support for node < v5.0.0 is dropped
            //      see: https://github.com/nodejs/node/pull/3455
            proto.constructor.super_ = Node;
            if (Object.setPrototypeOf) {
                Object.setPrototypeOf(proto, Node.prototype);
            } else {
                // hack for node v0.10
                proto.__proto__ = Node.prototype;
            }
        }
    }

    registerNodeConstructor(nodeSet, type, constructor) {
        if (nodeConstructors.hasOwnProperty(type)) {
            throw new Error(type + ' already registered');
        }
        //TODO: Ensure type is known - but doing so will break some tests
        //      that don't have a way to register a node template ahead
        //      of registering the constructor
        if (!(constructor.prototype instanceof Node)) {
            inheritNode(constructor);
        }

        var nodeSetInfo = getFullNodeInfo(nodeSet);
        if (nodeSetInfo) {
            if (nodeSetInfo.types.indexOf(type) === -1) {
                // A type is being registered for a known set, but for some reason
                // we didn't spot it when parsing the HTML file.
                // Registered a type is the definitive action - not the presence
                // of an edit template. Ensure it is on the list of known types.
                nodeSetInfo.types.push(type);
            }
        }

        nodeConstructors[type] = constructor;
        events.emit('type-registered', type);
    }

    getAllNodeConfigs(lang) {
        if (!nodeConfigCache) {
            var result = '';
            var script = '';
            for (var i = 0; i < nodeList.length; i++) {
                var id = nodeList[i];
                var config = moduleConfigs[getModule(id)].nodes[getNode(id)];
                if (config.enabled && !config.err) {
                    result += config.config;
                    result += loader.getNodeHelp(config, lang || 'en-US') || '';
                    //script += config.script;
                }
            }
            //if (script.length > 0) {
            //    result += '<script type='text/javascript'>';
            //    result += UglifyJS.minify(script, {fromString: true}).code;
            //    result += '</script>';
            //}
            nodeConfigCache = result;
        }
        return nodeConfigCache;
    }

    getNodeConfig(id, lang) {
        var config = moduleConfigs[getModule(id)];
        if (!config) {
            return null;
        }
        config = config.nodes[getNode(id)];
        if (config) {
            var result = config.config;
            result += loader.getNodeHelp(config, lang || 'en-US')

            //if (config.script) {
            //    result += '<script type='text/javascript'>'+config.script+'</script>';
            //}
            return result;
        } else {
            return null;
        }
    }

    getNodeConstructor(type) {
        var id = nodeTypeToId[type];

        var config;
        if (typeof id === 'undefined') {
            config = undefined;
        } else {
            config = moduleConfigs[getModule(id)].nodes[getNode(id)];
        }

        if (!config || (config.enabled && !config.err)) {
            return nodeConstructors[type];
        }
        return null;
    }

    clear() {
        nodeConfigCache = null;
        moduleConfigs = {};
        nodeList = [];
        nodeConstructors = {};
        nodeTypeToId = {};
    }

    getTypeId(type) {
        if (nodeTypeToId.hasOwnProperty(type)) {
            return nodeTypeToId[type];
        } else {
            return null;
        }
    }

    enableNodeSet(typeOrId) {
        if (!settings.available()) {
            throw new Error('Settings unavailable');
        }

        var id = typeOrId;
        if (nodeTypeToId.hasOwnProperty(typeOrId)) {
            id = nodeTypeToId[typeOrId];
        }
        var config;
        try {
            config = moduleConfigs[getModule(id)].nodes[getNode(id)];
            delete config.err;
            config.enabled = true;
            nodeConfigCache = null;
            settings.enableNodeSettings(config.types);
            return saveNodeList().then(function () {
                return filterNodeInfo(config);
            });
        } catch (err) {
            throw new Error('Unrecognised id: ' + typeOrId);
        }
    }

    disableNodeSet(typeOrId) {
        if (!settings.available()) {
            throw new Error('Settings unavailable');
        }
        var id = typeOrId;
        if (nodeTypeToId.hasOwnProperty(typeOrId)) {
            id = nodeTypeToId[typeOrId];
        }
        var config;
        try {
            config = moduleConfigs[getModule(id)].nodes[getNode(id)];
            // TODO: persist setting
            config.enabled = false;
            nodeConfigCache = null;
            settings.disableNodeSettings(config.types);
            return saveNodeList().then(function () {
                return filterNodeInfo(config);
            });
        } catch (err) {
            throw new Error('Unrecognised id: ' + id);
        }
    }

    cleanModuleList() {
        var removed = false;
        for (var mod in moduleConfigs) {
            /* istanbul ignore else */
            if (moduleConfigs.hasOwnProperty(mod)) {
                var nodes = moduleConfigs[mod].nodes;
                var node;
                if (mod == 'node-red') {
                    // For core nodes, look for nodes that are enabled, !loaded and !errored
                    for (node in nodes) {
                        /* istanbul ignore else */
                        if (nodes.hasOwnProperty(node)) {
                            var n = nodes[node];
                            if (n.enabled && !n.err && !n.loaded) {
                                removeNode(mod + '/' + node);
                                removed = true;
                            }
                        }
                    }
                } else {
                    if (moduleConfigs[mod] && !moduleNodes[mod]) {
                        // For node modules, look for missing ones
                        for (node in nodes) {
                            /* istanbul ignore else */
                            if (nodes.hasOwnProperty(node)) {
                                removeNode(mod + '/' + node);
                                removed = true;
                            }
                        }
                        delete moduleConfigs[mod];
                    }
                }
            }
        }
        if (removed) {
            saveNodeList();
        }
    }
    setModulePendingUpdated(module, version) {
        moduleConfigs[module].pending_version = version;
        return saveNodeList().then(function () {
            return getModuleInfo(module);
        });
    }

    nodeIconDir(dir) {
        icon_paths[dir.name] = icon_paths[dir.name] || [];
        icon_paths[dir.name].push(path.resolve(dir.path));
    }

    getNodeIconPath(module, icon) {
        var iconName = module + '/' + icon;
        if (iconCache[iconName]) {
            return iconCache[iconName];
        } else {
            var paths = icon_paths[module];
            if (paths) {
                for (var p = 0; p < paths.length; p++) {
                    var iconPath = path.join(paths[p], icon);
                    try {
                        fs.statSync(iconPath);
                        iconCache[iconName] = iconPath;
                        return iconPath;
                    } catch (err) {
                        // iconPath doesn't exist
                    }
                }
            }
            if (module !== 'node-red') {
                return getNodeIconPath('node-red', icon);
            }

            return defaultIcon;
        }
    }
};

Registry.init = function (_settings, _loader) {
    return new Credentials(_settings, _loader)
}

module.exports = Registry
