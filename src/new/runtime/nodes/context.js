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
var util = require("../util");

module.exports = class Context {
    constructor(settings) {
        this.contexts = {};
        this.globalContext = this.createContext("global", settings.functionGlobalContext || {});
    }

    createContext(id, seed) {
        var data = seed || {};
        var obj = seed || {};
        obj.get = function get(key) {
            return util.getMessageProperty(data, key);
        };
        obj.set = function set(key, value) {
            util.setMessageProperty(data, key, value);
        }
        obj.keys = function () {
            return Object.keys(data);
        }
        return obj;
    }

    getContext(localId, flowId) {
        var contextId = localId;
        if (flowId) {
            contextId = localId + ":" + flowId;
        }
        if (contexts.hasOwnProperty(contextId)) {
            return contexts[contextId];
        }
        var newContext = this.createContext(contextId);
        if (flowId) {
            newContext.flow = this.getContext(flowId);
        }
        if (globalContext) {
            newContext.global = globalContext;
        }
        contexts[contextId] = newContext;
        return newContext;
    }

    delete(id, flowId) {
        var contextId = id;
        if (flowId) {
            contextId = id + ":" + flowId;
        }
        delete contexts[contextId];
    }

    clean(flowConfig) {
        var activeIds = {};
        var contextId;
        var node;
        for (var id in contexts) {
            if (contexts.hasOwnProperty(id)) {
                var idParts = id.split(":");
                if (!flowConfig.allNodes.hasOwnProperty(idParts[0])) {
                    delete contexts[id];
                }
            }
        }
    }

};
