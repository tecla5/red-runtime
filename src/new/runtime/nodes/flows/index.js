/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

var clone = require("clone");
var when = require("when");

var Flow = require('./Flow');

var typeRegistry = require("../registry");
var context = require("../context")
var credentials = require("../credentials");

var flowUtil = require("./util");
var log = require("../../log");
var events = require("../../events");
var redUtil = require("../../util");
var deprecated = require("../registry/deprecated");

module.exports = class Flows {
    constructor(runtime) {
        this.settings = runtime.settings;
        this.storage = runtime.storage;
        this.started = false;
        this.activeConfig = null;
        this.activeFlowConfig = null;
        this.activeFlows = {};

        this.activeNodesToFlow = {};
        this.subflowInstanceNodeMap = {};

        this.typeEventRegistered = false;

        if (!this.typeEventRegistered) {
            events.on('type-registered', function (type) {
                if (activeFlowConfig && activeFlowConfig.missingTypes.length > 0) {
                    var i = activeFlowConfig.missingTypes.indexOf(type);
                    if (i != -1) {
                        log.info(log._("nodes.flows.registered-missing", {
                            type: type
                        }));
                        activeFlowConfig.missingTypes.splice(i, 1);
                        if (activeFlowConfig.missingTypes.length === 0 && started) {
                            events.emit("runtime-event", {
                                id: "runtime-state",
                                retain: true
                            });
                            start();
                        }
                    }
                }
            });
            typeEventRegistered = true;
        }
        Flow.init(settings);
    }

    /**
     * Load the current flow configuration from storage
     * @return a promise for the loading of the config
     */
    loadFlows() {
        return storage.getFlows().then(function (config) {
            log.debug("loaded flow revision: " + config.rev);
            return credentials.load(config.credentials).then(function () {
                return config;
            });
        }).otherwise(function (err) {
            log.warn(log._("nodes.flows.error", {
                message: err.toString()
            }));
            console.log(err.stack);
        });
    }
    load() {
        return this.setFlows(null, "load", false);
    }


    /**
     * Sets the current active config.
     * @param config the configuration to enable
     * @param type the type of deployment to do: full (default), nodes, flows, load
     * @return a promise for the saving/starting of the new flow
     */
    /*
     * _config - new node array configuration
     * type - full/nodes/flows/load (default full)
     * muteLog - don't emit the standard log messages (used for individual flow api)
     */
    setFlows(_config, type, muteLog) {
        type = type || "full";

        var configSavePromise = null;
        var config = null;
        var diff;
        var newFlowConfig;
        var isLoad = false;
        if (type === "load") {
            isLoad = true;
            configSavePromise = this.loadFlows().then(function (_config) {
                config = clone(_config.flows);
                newFlowConfig = flowUtil.parseConfig(clone(config));
                type = "full";
                return _config.rev;
            });
        } else {
            config = clone(_config);
            newFlowConfig = flowUtil.parseConfig(clone(config));
            diff = flowUtil.diffConfigs(activeFlowConfig, newFlowConfig);
            credentials.clean(config);
            var credsDirty = credentials.dirty();
            configSavePromise = credentials.export().then(function (creds) {
                var saveConfig = {
                    flows: config,
                    credentialsDirty: credsDirty,
                    credentials: creds
                }
                return storage.saveFlows(saveConfig);
            });
        }

        return configSavePromise
            .then(function (flowRevision) {
                if (!isLoad) {
                    log.debug("saved flow revision: " + flowRevision);
                }
                activeConfig = {
                    flows: config,
                    rev: flowRevision
                };
                activeFlowConfig = newFlowConfig;
                if (started) {
                    return stop(type, diff, muteLog).then(function () {
                        context.clean(activeFlowConfig);
                        start(type, diff, muteLog).then(function () {
                            events.emit("runtime-event", {
                                id: "runtime-deploy",
                                payload: {
                                    revision: flowRevision
                                },
                                retain: true
                            });
                        });
                        return flowRevision;
                    }).otherwise(function (err) {})
                } else {
                    events.emit("runtime-event", {
                        id: "runtime-deploy",
                        payload: {
                            revision: flowRevision
                        },
                        retain: true
                    });
                }
            });
    }

    getNode(id) {
        var node;
        if (activeNodesToFlow[id] && activeFlows[activeNodesToFlow[id]]) {
            return activeFlows[activeNodesToFlow[id]].getNode(id);
        }
        for (var flowId in activeFlows) {
            if (activeFlows.hasOwnProperty(flowId)) {
                node = activeFlows[flowId].getNode(id);
                if (node) {
                    return node;
                }
            }
        }
        return null;
    }

    eachNode(cb) {
        for (var id in activeFlowConfig.allNodes) {
            if (activeFlowConfig.allNodes.hasOwnProperty(id)) {
                cb(activeFlowConfig.allNodes[id]);
            }
        }
    }

    delegateError(node, logMessage, msg) {
        var handled = false;
        if (activeFlows[node.z]) {
            handled = activeFlows[node.z].handleError(node, logMessage, msg);
        } else if (activeNodesToFlow[node.z] && activeFlows[activeNodesToFlow[node.z]]) {
            handled = activeFlows[activeNodesToFlow[node.z]].handleError(node, logMessage, msg);
        } else if (activeFlowConfig.subflows[node.z] && subflowInstanceNodeMap[node.id]) {
            subflowInstanceNodeMap[node.id].forEach(function (n) {
                handled = handled || delegateError(getNode(n), logMessage, msg);
            });
        }
        return handled;
    }

    handleError(node, logMessage, msg) {
        var handled = false;
        if (node.z) {
            handled = delegateError(node, logMessage, msg);
        } else {
            if (activeFlowConfig.configs[node.id]) {
                activeFlowConfig.configs[node.id]._users.forEach(function (id) {
                    var userNode = activeFlowConfig.allNodes[id];
                    handled = handled || delegateError(userNode, logMessage, msg);
                })
            }
        }
        return handled;
    }

    delegateStatus(node, statusMessage) {
        if (activeFlows[node.z]) {
            activeFlows[node.z].handleStatus(node, statusMessage);
        } else if (activeNodesToFlow[node.z] && activeFlows[activeNodesToFlow[node.z]]) {
            activeFlows[activeNodesToFlow[node.z]].handleStatus(node, statusMessage);
        }
    }

    handleStatus(node, statusMessage) {
        events.emit("node-status", {
            id: node.id,
            status: statusMessage
        });
        if (node.z) {
            delegateStatus(node, statusMessage);
        } else {
            if (activeFlowConfig.configs[node.id]) {
                activeFlowConfig.configs[node.id]._users.forEach(function (id) {
                    var userNode = activeFlowConfig.allNodes[id];
                    delegateStatus(userNode, statusMessage);
                })
            }
        }
    }

    checkTypeInUse(id) {
        var nodeInfo = typeRegistry.getNodeInfo(id);
        if (!nodeInfo) {
            throw new Error(log._("nodes.index.unrecognised-id", {
                id: id
            }));
        } else {
            var inUse = {};
            var config = getFlows();
            config.flows.forEach(function (n) {
                inUse[n.type] = (inUse[n.type] || 0) + 1;
            });
            var nodesInUse = [];
            nodeInfo.types.forEach(function (t) {
                if (inUse[t]) {
                    nodesInUse.push(t);
                }
            });
            if (nodesInUse.length > 0) {
                var msg = nodesInUse.join(", ");
                var err = new Error(log._("nodes.index.type-in-use", {
                    msg: msg
                }));
                err.code = "type_in_use";
                throw err;
            }
        }
    }

    updateMissingTypes() {
        var subflowInstanceRE = /^subflow:(.+)$/;
        activeFlowConfig.missingTypes = [];

        for (var id in activeFlowConfig.allNodes) {
            if (activeFlowConfig.allNodes.hasOwnProperty(id)) {
                var node = activeFlowConfig.allNodes[id];
                if (node.type !== 'tab' && node.type !== 'subflow') {
                    var subflowDetails = subflowInstanceRE.exec(node.type);
                    if ((subflowDetails && !activeFlowConfig.subflows[subflowDetails[1]]) || (!subflowDetails && !typeRegistry.get(node.type))) {
                        if (activeFlowConfig.missingTypes.indexOf(node.type) === -1) {
                            activeFlowConfig.missingTypes.push(node.type);
                        }
                    }
                }
            }
        }
    }


    /**
     * Gets the current flow configuration
     */
    getFlows() {
        return this.activeConfig;
    }

    /**
     * Starts the current flow configuration
     */
    startFlows(type, diff, muteLog) {
        //dumpActiveNodes();
        type = type || "full";
        started = true;
        var i;
        if (activeFlowConfig.missingTypes.length > 0) {
            log.info(log._("nodes.flows.missing-types"));
            var knownUnknowns = 0;
            for (i = 0; i < activeFlowConfig.missingTypes.length; i++) {
                var nodeType = activeFlowConfig.missingTypes[i];
                var info = deprecated.get(nodeType);
                if (info) {
                    log.info(log._("nodes.flows.missing-type-provided", {
                        type: activeFlowConfig.missingTypes[i],
                        module: info.module
                    }));
                    knownUnknowns += 1;
                } else {
                    log.info(" - " + activeFlowConfig.missingTypes[i]);
                }
            }
            if (knownUnknowns > 0) {
                log.info(log._("nodes.flows.missing-type-install-1"));
                log.info("  npm install <module name>");
                log.info(log._("nodes.flows.missing-type-install-2"));
                log.info("  " + settings.userDir);
            }
            events.emit("runtime-event", {
                id: "runtime-state",
                payload: {
                    type: "warning",
                    text: "notification.warnings.missing-types"
                },
                retain: true
            });
            return when.resolve();
        }
        if (!muteLog) {
            if (type !== "full") {
                log.info(log._("nodes.flows.starting-modified-" + type));
            } else {
                log.info(log._("nodes.flows.starting-flows"));
            }
        }
        var id;
        if (type === "full") {
            if (!activeFlows['global']) {
                log.debug("red/nodes/flows.start : starting flow : global");
                activeFlows['global'] = Flow.create(activeFlowConfig);
            }
            for (id in activeFlowConfig.flows) {
                if (activeFlowConfig.flows.hasOwnProperty(id)) {
                    if (!activeFlowConfig.flows[id].disabled && !activeFlows[id]) {
                        activeFlows[id] = Flow.create(activeFlowConfig, activeFlowConfig.flows[id]);
                        log.debug("red/nodes/flows.start : starting flow : " + id);
                    } else {
                        log.debug("red/nodes/flows.start : not starting disabled flow : " + id);
                    }
                }
            }
        } else {
            activeFlows['global'].update(activeFlowConfig, activeFlowConfig);
            for (id in activeFlowConfig.flows) {
                if (activeFlowConfig.flows.hasOwnProperty(id)) {
                    if (!activeFlowConfig.flows[id].disabled) {
                        if (activeFlows[id]) {
                            activeFlows[id].update(activeFlowConfig, activeFlowConfig.flows[id]);
                        } else {
                            activeFlows[id] = Flow.create(activeFlowConfig, activeFlowConfig.flows[id]);
                            log.debug("red/nodes/flows.start : starting flow : " + id);
                        }
                    } else {
                        log.debug("red/nodes/flows.start : not starting disabled flow : " + id);
                    }
                }
            }
        }

        for (id in activeFlows) {
            if (activeFlows.hasOwnProperty(id)) {
                activeFlows[id].start(diff);
                var activeNodes = activeFlows[id].getActiveNodes();
                Object.keys(activeNodes).forEach(function (nid) {
                    activeNodesToFlow[nid] = id;
                    if (activeNodes[nid]._alias) {
                        subflowInstanceNodeMap[activeNodes[nid]._alias] = subflowInstanceNodeMap[activeNodes[nid]._alias] || [];
                        subflowInstanceNodeMap[activeNodes[nid]._alias].push(nid);
                    }
                });

            }
        }
        events.emit("nodes-started");
        events.emit("runtime-event", {
            id: "runtime-state",
            retain: true
        });

        if (!muteLog) {
            if (type !== "full") {
                log.info(log._("nodes.flows.started-modified-" + type));
            } else {
                log.info(log._("nodes.flows.started-flows"));
            }
        }
        return when.resolve();
    }

    /**
     * Stops the current flow configuration
     * @return a promise for the stopping of the flow
     */
    stopFlows(type, diff, muteLog) {
        type = type || "full";
        diff = diff || {
            added: [],
            changed: [],
            removed: [],
            rewired: [],
            linked: []
        };
        if (!muteLog) {
            if (type !== "full") {
                log.info(log._("nodes.flows.stopping-modified-" + type));
            } else {
                log.info(log._("nodes.flows.stopping-flows"));
            }
        }

        this.started = false;
        this.promises = [];
        var stopList;
        var removedList = diff.removed;

        if (type === 'nodes') {
            stopList = diff.changed.concat(diff.removed);
        } else if (type === 'flows') {
            stopList = diff.changed.concat(diff.removed).concat(diff.linked);
        }

        for (var id in activeFlows) {
            if (activeFlows.hasOwnProperty(id)) {
                var flowStateChanged = diff && (diff.added.indexOf(id) !== -1 || diff.removed.indexOf(id) !== -1);
                log.debug("red/nodes/flows.stop : stopping flow : " + id);
                promises = promises.concat(activeFlows[id].stop(flowStateChanged ? null : stopList, removedList));
                if (type === "full" || flowStateChanged || diff.removed.indexOf(id) !== -1) {
                    delete activeFlows[id];
                }
            }
        }

        return when.promise(function (resolve, reject) {
            when.settle(promises).then(function () {
                for (id in activeNodesToFlow) {
                    if (activeNodesToFlow.hasOwnProperty(id)) {
                        if (!activeFlows[activeNodesToFlow[id]]) {
                            delete activeNodesToFlow[id];
                        }
                    }
                }
                if (stopList) {
                    stopList.forEach(function (id) {
                        delete activeNodesToFlow[id];
                    });
                }
                // Ideally we'd prune just what got stopped - but mapping stopList
                // id to the list of subflow instance nodes is something only Flow
                // can do... so cheat by wiping the map knowing it'll be rebuilt
                // in start()
                subflowInstanceNodeMap = {};
                if (!muteLog) {
                    if (type !== "full") {
                        log.info(log._("nodes.flows.stopped-modified-" + type));
                    } else {
                        log.info(log._("nodes.flows.stopped-flows"));
                    }
                }
                resolve();
            });
        });
    }

    addFlow(flow) {
        var i, node;
        if (!flow.hasOwnProperty('nodes')) {
            throw new Error('missing nodes property');
        }
        flow.id = redUtil.generateId();

        var nodes = [{
            type: 'tab',
            label: flow.label,
            id: flow.id
        }];

        for (i = 0; i < flow.nodes.length; i++) {
            node = flow.nodes[i];
            if (activeFlowConfig.allNodes[node.id]) {
                // TODO nls
                return when.reject(new Error('duplicate id'));
            }
            if (node.type === 'tab' || node.type === 'subflow') {
                return when.reject(new Error('invalid node type: ' + node.type));
            }
            node.z = flow.id;
            nodes.push(node);
        }
        if (flow.configs) {
            for (i = 0; i < flow.configs.length; i++) {
                node = flow.configs[i];
                if (activeFlowConfig.allNodes[node.id]) {
                    // TODO nls
                    return when.reject(new Error('duplicate id'));
                }
                if (node.type === 'tab' || node.type === 'subflow') {
                    return when.reject(new Error('invalid node type: ' + node.type));
                }
                node.z = flow.id;
                nodes.push(node);
            }
        }
        var newConfig = clone(activeConfig.flows);
        newConfig = newConfig.concat(nodes);

        return setFlows(newConfig, 'flows', true).then(function () {
            log.info(log._("nodes.flows.added-flow", {
                label: (flow.label ? flow.label + " " : "") + "[" + flow.id + "]"
            }));
            return flow.id;
        });
    }

    getFlow(id) {
        var flow;
        if (id === 'global') {
            flow = activeFlowConfig;
        } else {
            flow = activeFlowConfig.flows[id];
        }
        if (!flow) {
            return null;
        }
        var result = {
            id: id
        };
        if (flow.label) {
            result.label = flow.label;
        }
        if (id !== 'global') {
            result.nodes = [];
        }
        if (flow.nodes) {
            var nodeIds = Object.keys(flow.nodes);
            if (nodeIds.length > 0) {
                result.nodes = nodeIds.map(function (nodeId) {
                    var node = clone(flow.nodes[nodeId]);
                    if (node.type === 'link out') {
                        delete node.wires;
                    }
                    return node;
                })
            }
        }
        if (flow.configs) {
            var configIds = Object.keys(flow.configs);
            result.configs = configIds.map(function (configId) {
                return clone(flow.configs[configId]);
            })
            if (result.configs.length === 0) {
                delete result.configs;
            }
        }
        if (flow.subflows) {
            var subflowIds = Object.keys(flow.subflows);
            result.subflows = subflowIds.map(function (subflowId) {
                var subflow = clone(flow.subflows[subflowId]);
                var nodeIds = Object.keys(subflow.nodes);
                subflow.nodes = nodeIds.map(function (id) {
                    return subflow.nodes[id];
                });
                if (subflow.configs) {
                    var configIds = Object.keys(subflow.configs);
                    subflow.configs = configIds.map(function (id) {
                        return subflow.configs[id];
                    })
                }
                delete subflow.instances;
                return subflow;
            });
            if (result.subflows.length === 0) {
                delete result.subflows;
            }
        }
        return result;
    }

    updateFlow(id, newFlow) {
        var label = id;
        if (id !== 'global') {
            if (!activeFlowConfig.flows[id]) {
                var e = new Error();
                e.code = 404;
                throw e;
            }
            label = activeFlowConfig.flows[id].label;
        }
        var newConfig = clone(activeConfig.flows);
        var nodes;

        if (id === 'global') {
            // Remove all nodes whose z is not a known flow
            // When subflows can be owned by a flow, this logic will have to take
            // that into account
            newConfig = newConfig.filter(function (node) {
                return node.type === 'tab' || (node.hasOwnProperty('z') && activeFlowConfig.flows.hasOwnProperty(node.z));
            })

            // Add in the new config nodes
            nodes = newFlow.configs || [];
            if (newFlow.subflows) {
                // Add in the new subflows
                newFlow.subflows.forEach(function (sf) {
                    nodes = nodes.concat(sf.nodes || []).concat(sf.configs || []);
                    delete sf.nodes;
                    delete sf.configs;
                    nodes.push(sf);
                });
            }
        } else {
            newConfig = newConfig.filter(function (node) {
                return node.z !== id && node.id !== id;
            });
            var tabNode = {
                type: 'tab',
                label: newFlow.label,
                id: id
            }
            nodes = [tabNode].concat(newFlow.nodes || []).concat(newFlow.configs || []);
            nodes.forEach(function (n) {
                n.z = id;
            });
        }

        newConfig = newConfig.concat(nodes);
        return this.setFlows(newConfig, 'flows', true).then(function () {
            log.info(log._("nodes.flows.updated-flow", {
                label: (label ? label + " " : "") + "[" + id + "]"
            }));
        })
    }

    removeFlow(id) {
        if (id === 'global') {
            // TODO: nls + error code
            throw new Error('not allowed to remove global');
        }
        var flow = activeFlowConfig.flows[id];
        if (!flow) {
            var e = new Error();
            e.code = 404;
            throw e;
        }

        var newConfig = clone(activeConfig.flows);
        newConfig = newConfig.filter(function (node) {
            return node.z !== id && node.id !== id;
        });

        return this.setFlows(newConfig, 'flows', true).then(function () {
            log.info(log._("nodes.flows.removed-flow", {
                label: (flow.label ? flow.label + " " : "") + "[" + flow.id + "]"
            }));
        });
    }
};
