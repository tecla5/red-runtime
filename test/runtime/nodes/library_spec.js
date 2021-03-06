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

var EventEmitter = require('events').EventEmitter;
var events = new EventEmitter();

var should = require("should");

var fs = require("fs");
var path = require("path");

var Library = require("../../../src/runtime/nodes/library")
let library

const {
    log
} = console

const basePath = __dirname + '/../../../test/'

describe("library api", function () {
    it('returns null list when no modules have been registered', function () {
        library = Library.init({
            events: events
        });
        should.not.exist(library.getExampleFlows());
    });
    it('returns null path when module is not known', function () {
        library = Library.init({
            events: events
        });
        should.not.exist(library.getExampleFlowPath('foo', 'bar'));
    });

    it('returns a valid example path', function (done) {
        library = Library.init({
            events: events
        });
        events.emit('node-examples-dir', {
            name: "test-module",
            path: path.resolve(basePath + 'resources/examples')
        });
        setTimeout(function () {
            try {
                var expectedFlow = {
                    "d": {
                        "test-module": {
                            "f": ["one"]
                        }
                    }
                }

                var flows = library.getExampleFlows();
                log('example flows', {
                    flows
                })
                should.deepEqual(flows, expectedFlow, 'example flows not found')
                // flows.should.deepEqual(expectedFlow);

                var examplePath = library.getExampleFlowPath('test-module', 'one');
                examplePath.should.eql(path.resolve(basePath + 'resources/examples/one.json'))


                events.emit('node-module-uninstalled', 'test-module');

                setTimeout(function () {
                    try {
                        should.not.exist(library.getExampleFlows());
                        should.not.exist(library.getExampleFlowPath('test-module', 'one'));
                        done();
                    } catch (err) {
                        done(err);
                    }
                }, 20);
            } catch (err) {
                done(err);
            }
        }, 20);

    })
});
