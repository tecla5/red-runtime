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

var util = require('util');
var EventEmitter = require('events').EventEmitter;

var i18n = require('./i18n');

var levels = {
    off: 1,
    fatal: 10,
    error: 20,
    warn: 30,
    info: 40,
    debug: 50,
    trace: 60,
    audit: 98,
    metric: 99
};

var levelNames = {
    10: 'fatal',
    20: 'error',
    30: 'warn',
    40: 'info',
    50: 'debug',
    60: 'trace',
    98: 'audit',
    99: 'metric'
};

var logHandlers = [];
var metricsEnabled = false;

class LogHandler extends EventEmitter {

    constructor(log, settings) {
        super()
        this.log = log

        this.logLevel = settings ? levels[settings.level] || levels.info : levels.info;
        this.metricsOn = settings ? settings.metrics || false : false;
        this.auditOn = settings ? settings.audit || false : false;

        metricsEnabled = metricsEnabled || this.metricsOn;

        this.handler = (settings && settings.handler) ? settings.handler(settings) : this.consoleLogger.bind(this);
        this.on('log', function (msg) {
            if (this.shouldReportMessage(msg.level)) {
                this.handler(msg);
            }
        });
    }

    shouldReportMessage(msglevel) {
        const {
            log
        } = this
        return (msglevel == log.METRIC && this.metricsOn) ||
            (msglevel == log.AUDIT && this.auditOn) ||
            msglevel <= this.logLevel;
    }

    consoleLogger(msg) {
        const {
            log
        } = this
        const {
            verbose
        } = log

        if (msg.level == log.METRIC || msg.level == log.AUDIT) {
            util.log('[' + levelNames[msg.level] + '] ' + JSON.stringify(msg));
        } else {
            if (verbose && msg.msg.stack) {
                util.log('[' + levelNames[msg.level] + '] ' + (msg.type ? '[' + msg.type + ':' + (msg.name || msg.id) + '] ' : '') + msg.msg.stack);
            } else {
                var message = msg.msg;
                if (typeof message === 'object' && message.toString() === '[object Object]' && message.message) {
                    message = message.message;
                }
                util.log('[' + levelNames[msg.level] + '] ' + (msg.type ? '[' + msg.type + ':' + (msg.name || msg.id) + '] ' : '') + message);
            }
        }
    }
}

class Log {
    constructor(settings) {
        this.codes = {
            FATAL: 10,
            ERROR: 20,
            WARN: 30,
            INFO: 40,
            DEBUG: 50,
            TRACE: 60,
            AUDIT: 98,
            METRIC: 99
        }

        this.settings = settings
        this.metricsEnabled = false;
        this.logHandlers = [];
        this.loggerSettings = {};
        this.verbose = settings.verbose;

        if (settings.logging) {
            var keys = Object.keys(settings.logging);
            if (keys.length === 0) {
                this.addHandler(new LogHandler(this));
            } else {
                for (var i = 0, l = keys.length; i < l; i++) {
                    var config = settings.logging[keys[i]];
                    this.loggerSettings = config || {};
                    if ((keys[i] === 'console') || config.handler) {
                        this.addHandler(new LogHandler(this, this.loggerSettings));
                    }
                }
            }
        } else {
            this.addHandler(new LogHandler());
        }
    }

    addHandler(func) {
        logHandlers.push(func);
    }
    removeHandler(func) {
        var index = logHandlers.indexOf(func);
        if (index > -1) {
            logHandlers.splice(index, 1);
        }
    }
    log(msg) {
        msg.timestamp = Date.now();
        logHandlers.forEach(function (handler) {
            handler.emit('log', msg);
        });
    }
    info(msg) {
        this.log({
            level: this.codes.INFO,
            msg: msg
        });
    }
    warn(msg) {
        this.log({
            level: this.codes.WARN,
            msg: msg
        });
    }
    error(msg) {
        this.log({
            level: this.codes.ERROR,
            msg: msg
        });
    }
    trace(msg) {
        this.log({
            level: this.codes.TRACE,
            msg: msg
        });
    }
    debug(msg) {
        this.log({
            level: this.codes.DEBUG,
            msg: msg
        });
    }
    metric() {
        return metricsEnabled;
    }

    audit(msg, req) {
        msg.level = this.codes.AUDIT;
        if (req) {
            msg.user = req.user;
            msg.path = req.path;
            msg.ip = (req.headers && req.headers['x-forwarded-for']) || (req.connection && req.connection.remoteAddress) || undefined;
        }
        this.log(msg);
    }
}

Log.init = function (settings) {
    return new Log(settings)
}

module.exports = Log
