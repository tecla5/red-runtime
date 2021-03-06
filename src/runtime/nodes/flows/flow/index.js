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

var typeRegistry = require('../../registry');
var Log = require('../../../log');
var redUtil = require('../../../util');
var flowUtil = require('../util');
var nodeCloseTimeout = 15000;

class FlowFactory {
    constructor(settings) {
        this.nodeCloseTimeout = settings.nodeCloseTimeout || 15000;
    }
}

FlowFactory.create = function (global, conf) {
    return new FlowFactory(global, conf);
}
FlowFactory.init = FlowFactory.create

module.exports = {
    FlowFactory
}
