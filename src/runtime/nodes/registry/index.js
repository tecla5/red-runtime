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
var fs = require('fs');
var path = require('path');

var Events = require('../../events');
var Registry = require('./registry');
var Loader = require('./loader');
var Installer = require('./installer');

class RegistryFactory {
    constructor(runtime) {
        settings = runtime.settings;
        installer.init(runtime.settings);
        loader.init(runtime);
        registry.init(settings, loader);
        this.configDelegates()
    }

    configDelegates() {
        this.clear = registry.clear;
        this.registerType = registry.registerNodeConstructor;
        this.get = registry.getNodeConstructor;
        this.getNodeInfo = registry.getNodeInfo;
        this.getNodeList = registry.getNodeList;
        this.getModuleInfo = registry.getModuleInfo;
        this.getModuleList = registry.getModuleList;
        this.getNodeConfigs = registry.getAllNodeConfigs;
        this.getNodeConfig = registry.getNodeConfig;
        this.getNodeIconPath = registry.getNodeIconPath;
        this.disableNode = registry.disableNodeSet;
        this.removeModule = registry.removeModule;
        this.installModule = installer.installModule;
        this.uninstallModule = installer.uninstallModule;
        this.cleanModuleList = registry.cleanModuleList;
        this.paletteEditorEnabled = installer.paletteEditorEnabled
    }

    load() {
        registry.load();
        return installer.checkPrereq().then(loader.load);
    }

    addModule(module) {
        return loader.addModule(module).then(function () {
            return registry.getModuleInfo(module);
        });
    }

    enableNodeSet(typeOrId) {
        return registry.enableNodeSet(typeOrId).then(function () {
            var nodeSet = registry.getNodeInfo(typeOrId);
            if (!nodeSet.loaded) {
                return loader.loadNodeSet(registry.getFullNodeInfo(typeOrId)).then(function () {
                    return registry.getNodeInfo(typeOrId);
                });
            }
            return when.resolve(nodeSet);
        });
    }
};

RegistryFactory.init = function (runtime) {
    return new RegistryFactory(runtime)
}

module.exports = {
    RegistryFactory,
    Installer,
    Loader,
    Registry,
    // LocalFilesystem
}
