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

var when = require("when");
var path = require("path");
var fs = require("fs");
var clone = require("clone");

var registry = require("./registry");
var credentials = require("./credentials");
var flows = require("./flows");
var flowUtil = require("./flows/util")
var context = require("./context");
var Node = require("./Node");
var library = require("./library");
var events = require("../events");

module.exports = class Nodes {
    // Lifecycle
    constructor(runtime) {
        this.settings = runtime.settings;
        this.log = runtime.log;

        credentials.init(runtime);
        flows.init(runtime);
        registry.init(runtime);
        context.init(runtime.settings);
        library.init(runtime);

        this.load = registry.load; // delegate load method

        this.configDelegates()
    }

    configDelegates() {
        this.getNode = flows.get
        this.eachNode = flows.eachNode;
        this.paletteEditorEnabled = registry.paletteEditorEnabled;
        this.installModule = registry.installModule;
        this.enableNode = registry.enableNode;
        this.getType = registry.get;
        this.getNodeInfo = registry.getNodeInfo;
        this.getNodeList = registry.getNodeList;
        this.getModuleInfo = registry.getModuleInfo;
        this.getNodeConfigs = registry.getNodeConfigs;
        this.getNodeConfig = registry.getNodeConfig;
        this.getNodeIconPath = registry.getNodeIconPath;
        this.getNodeExampleFlows = library.getExampleFlows;
        this.getNodeExampleFlowPath = library.getExampleFlowPath;
        this.clearRegistry = registry.clear;
        this.cleanModuleList = registry.cleanModuleList;

        // Flow handling
        this.loadFlows = flows.load;
        this.startFlows = flows.startFlows;
        this.stopFlows = flows.stopFlows;
        this.setFlows = flows.setFlows;
        this.getFlows = flows.getFlows;

        this.addFlow = flows.addFlow;
        this.getFlow = flows.getFlow;
        this.updateFlow = flows.updateFlow;
        this.removeFlow = flows.removeFlow;
        // disableFlow = flows.disableFlow;
        // enableFlow =  flows.enableFlow;

        // Credentials
        this.addCredentials = credentials.add;
        this.getCredentials = credentials.get;
        this.deleteCredentials = credentials.delete;
        this.getCredentialDefinition = credentials.getDefinition
    }

    // Node registry

    /**
     * Called from a Node's constructor function, invokes the super-class
     * constructor and attaches any credentials to the node.
     * @param node the node object being created
     * @param def the instance definition for the node
     */
    createNode(node, def) {
        Node.call(node, def);
        var id = node.id;
        if (def._alias) {
            id = def._alias;
        }
        var creds = credentials.get(id);
        if (creds) {
            creds = clone(creds);
            //console.log("Attaching credentials to ",node.id);
            // allow $(foo) syntax to substitute env variables for credentials also...
            for (var p in creds) {
                if (creds.hasOwnProperty(p)) {
                    flowUtil.mapEnvVarProperties(creds, p);
                }
            }
            node.credentials = creds;
        } else if (credentials.getDefinition(node.type)) {
            node.credentials = {};
        }
    }

    /**
     * Registers a node constructor
     * @param nodeSet - the nodeSet providing the node (module/set)
     * @param type - the string type name
     * @param constructor - the constructor function for this node type
     * @param opts - optional additional options for the node
     */
    registerType(nodeSet, type, constructor, opts) {
        if (typeof type !== "string") {
            // This is someone calling the api directly, rather than via the
            // RED object provided to a node. Log a warning
            this.log.warn("[" + nodeSet + "] Deprecated call to RED.runtime.nodes.registerType - node-set name must be provided as first argument");
            opts = constructor;
            constructor = type;
            type = nodeSet;
            nodeSet = "";
        }
        if (opts) {
            if (opts.credentials) {
                credentials.register(type, opts.credentials);
            }
            if (opts.settings) {
                try {
                    this.settings.registerNodeSettings(type, opts.settings);
                } catch (err) {
                    log.warn("[" + type + "] " + err.message);
                }
            }
        }
        registry.registerType(nodeSet, type, constructor);
    }

    disableNode(id) {
        flows.checkTypeInUse(id);
        return registry.disableNode(id);
    }

    uninstallModule(module) {
        var info = registry.getModuleInfo(module);
        if (!info) {
            throw new Error(log._("nodes.index.unrecognised-module", {
                module: module
            }));
        } else {
            for (var i = 0; i < info.nodes.length; i++) {
                flows.checkTypeInUse(module + "/" + info.nodes[i].name);
            }
            return registry.uninstallModule(module);
        }
    }
};
