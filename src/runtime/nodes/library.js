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

var fs = require('fs');
var fspath = require('path');
var when = require('when');

const {
    log
} = console
class Library {
    constructor(_runtime) {
        this.runtime = _runtime;
        this.exampleRoots = {};
        this.exampleFlows = null;

        var events = this.runtime.events
        this.events = events

        // important: .bind(this)
        events.removeListener('node-examples-dir', this.addNodeExamplesDir.bind(this));
        events.on('node-examples-dir', this.addNodeExamplesDir.bind(this));
        events.removeListener('node-module-uninstalled', this.removeNodeExamplesDir.bind(this));
        events.on('node-module-uninstalled', this.removeNodeExamplesDir.bind(this));
    }

    getFlowsFromPath(path) {
        return when.promise((resolve, reject) => {
            var result = {};
            fs.readdir(path, (err, files) => {
                var promises = [];
                var validFiles = [];
                if (!files) {
                    throw `No files found in ${path}`
                }

                files.forEach(function (file) {
                    var fullPath = fspath.join(path, file);
                    var stats = fs.lstatSync(fullPath);
                    if (stats.isDirectory()) {
                        validFiles.push(file);
                        promises.push(getFlowsFromPath(fullPath));
                    } else if (/\.json$/.test(file)) {
                        validFiles.push(file);
                        promises.push(when.resolve(file.split('.')[0]))
                    }
                })
                var i = 0;
                when.all(promises).then(function (results) {
                    results.forEach(function (r) {
                        if (typeof r === 'string') {
                            result.f = result.f || [];
                            result.f.push(r);
                        } else {
                            result.d = result.d || {};
                            result.d[validFiles[i]] = r;
                        }
                        i++;
                    })

                    resolve(result);
                })
            });
        })
    }

    addNodeExamplesDir(module) {
        let {
            exampleFlows,
            exampleRoots
        } = this
        exampleRoots[module.name] = module.path;
        this.getFlowsFromPath(module.path).then(function (result) {
            exampleFlows = exampleFlows || {
                d: {}
            };
            exampleFlows.d[module.name] = result;
        });
    }

    removeNodeExamplesDir(module) {
        let {
            exampleFlows,
            exampleRoots
        } = this
        delete exampleRoots[module];
        if (exampleFlows && exampleFlows.d) {
            delete exampleFlows.d[module];
        }
        if (exampleFlows && Object.keys(exampleFlows.d).length === 0) {
            exampleFlows = null;
        }
    }


    getExampleFlows() {
        let {
            exampleFlows
        } = this

        return exampleFlows;
    }

    getExampleFlowPath(module, path) {
        let {
            exampleRoots
        } = this

        if (exampleRoots[module]) {
            return fspath.join(exampleRoots[module], path) + '.json';
        }
        return null;
    }
}

Library.init = function (runtime) {
    return new Library(runtime)
}

module.exports = Library
