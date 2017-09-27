module.exports = class Flow {
  constructor(global, flow) {
    if (typeof flow === 'undefined') {
      flow = global;
    }
    var activeNodes = {};
    var subflowInstanceNodes = {};
    var catchNodeMap = {};
    var statusNodeMap = {};
  }

  start(diff) {
    var node;
    var newNode;
    var id;
    catchNodeMap = {};
    statusNodeMap = {};

    var configNodes = Object.keys(flow.configs);
    var configNodeAttempts = {};
    while (configNodes.length > 0) {
      id = configNodes.shift();
      node = flow.configs[id];
      if (!activeNodes[id]) {
        var readyToCreate = true;
        // This node doesn't exist.
        // Check it doesn't reference another non-existent config node
        for (var prop in node) {
          if (node.hasOwnProperty(prop) && prop !== 'id' && prop !== 'wires' && prop !== '_users' && flow.configs[node[prop]]) {
            if (!activeNodes[node[prop]]) {
              // References a non-existent config node
              // Add it to the back of the list to try again later
              configNodes.push(id);
              configNodeAttempts[id] = (configNodeAttempts[id] || 0) + 1;
              if (configNodeAttempts[id] === 100) {
                throw new Error("Circular config node dependency detected: " + id);
              }
              readyToCreate = false;
              break;
            }
          }
        }
        if (readyToCreate) {
          newNode = createNode(node.type, node);
          if (newNode) {
            activeNodes[id] = newNode;
          }
        }
      }
    }

    if (diff && diff.rewired) {
      for (var j = 0; j < diff.rewired.length; j++) {
        var rewireNode = activeNodes[diff.rewired[j]];
        if (rewireNode) {
          rewireNode.updateWires(flow.nodes[rewireNode.id].wires);
        }
      }
    }

    for (id in flow.nodes) {
      if (flow.nodes.hasOwnProperty(id)) {
        node = flow.nodes[id];
        if (!node.subflow) {
          if (!activeNodes[id]) {
            newNode = createNode(node.type, node);
            if (newNode) {
              activeNodes[id] = newNode;
            }
          }
        } else {
          if (!subflowInstanceNodes[id]) {
            try {
              var nodes = createSubflow(flow.subflows[node.subflow] || global.subflows[node.subflow], node, flow.subflows, global.subflows, activeNodes);
              subflowInstanceNodes[id] = nodes.map(function (n) {
                return n.id
              });
              for (var i = 0; i < nodes.length; i++) {
                if (nodes[i]) {
                  activeNodes[nodes[i].id] = nodes[i];
                }
              }
            } catch (err) {
              console.log(err.stack)
            }
          }
        }
      }
    }

    for (id in activeNodes) {
      if (activeNodes.hasOwnProperty(id)) {
        node = activeNodes[id];
        if (node.type === "catch") {
          catchNodeMap[node.z] = catchNodeMap[node.z] || [];
          catchNodeMap[node.z].push(node);
        } else if (node.type === "status") {
          statusNodeMap[node.z] = statusNodeMap[node.z] || [];
          statusNodeMap[node.z].push(node);
        }
      }
    }
  }

  stop(stopList, removedList) {
    return when.promise(function (resolve) {
      var i;
      if (stopList) {
        for (i = 0; i < stopList.length; i++) {
          if (subflowInstanceNodes[stopList[i]]) {
            // The first in the list is the instance node we already
            // know about
            stopList = stopList.concat(subflowInstanceNodes[stopList[i]].slice(1))
          }
        }
      } else {
        stopList = Object.keys(activeNodes);
      }
      // Convert the list to a map to avoid multiple scans of the list
      var removedMap = {};
      removedList = removedList || [];
      removedList.forEach(function (id) {
        removedMap[id] = true;
      });

      var promises = [];
      for (i = 0; i < stopList.length; i++) {
        var node = activeNodes[stopList[i]];
        if (node) {
          delete activeNodes[stopList[i]];
          if (subflowInstanceNodes[stopList[i]]) {
            delete subflowInstanceNodes[stopList[i]];
          }
          try {
            var removed = removedMap[stopList[i]];
            promises.push(
              when.promise(function (resolve, reject) {
                var start;
                var nt = node.type;
                var nid = node.id;
                var n = node;
                when.promise(function (resolve) {
                  Log.trace("Stopping node " + nt + ":" + nid + (removed ? " removed" : ""));
                  start = Date.now();
                  resolve(n.close(removed));
                }).timeout(nodeCloseTimeout).then(function () {
                  var delta = Date.now() - start;
                  Log.trace("Stopped node " + nt + ":" + nid + " (" + delta + "ms)");
                  resolve(delta);
                }, function (err) {
                  var delta = Date.now() - start;
                  n.error(Log._("nodes.flows.stopping-error", {
                    message: err
                  }));
                  Log.debug(err.stack);
                  reject(err);
                });
              })
            );
          } catch (err) {
            node.error(err);
          }
        }
      }
      when.settle(promises).then(function (results) {
        resolve();
      });
    });
  }

  update(_global, _flow) {
    global = _global;
    flow = _flow;
  }

  getNode(id) {
    return activeNodes[id];
  }

  getActiveNodes() {
    return activeNodes;
  }

  handleStatus(node, statusMessage) {
    var targetStatusNodes = null;
    var reportingNode = node;
    var handled = false;
    while (reportingNode && !handled) {
      targetStatusNodes = statusNodeMap[reportingNode.z];
      if (targetStatusNodes) {
        targetStatusNodes.forEach(function (targetStatusNode) {
          if (targetStatusNode.scope && targetStatusNode.scope.indexOf(node.id) === -1) {
            return;
          }
          var message = {
            status: {
              text: "",
              source: {
                id: node.id,
                type: node.type,
                name: node.name
              }
            }
          };
          if (statusMessage.hasOwnProperty("text")) {
            message.status.text = statusMessage.text.toString();
          }
          targetStatusNode.receive(message);
          handled = true;
        });
      }
      if (!handled) {
        reportingNode = activeNodes[reportingNode.z];
      }
    }
  }

  handleError(node, logMessage, msg) {
    var count = 1;
    if (msg && msg.hasOwnProperty("error")) {
      if (msg.error.hasOwnProperty("source")) {
        if (msg.error.source.id === node.id) {
          count = msg.error.source.count + 1;
          if (count === 10) {
            node.warn(Log._("nodes.flow.error-loop"));
            return false;
          }
        }
      }
    }
    var targetCatchNodes = null;
    var throwingNode = node;
    var handled = false;
    while (throwingNode && !handled) {
      targetCatchNodes = catchNodeMap[throwingNode.z];
      if (targetCatchNodes) {
        targetCatchNodes.forEach(function (targetCatchNode) {
          if (targetCatchNode.scope && targetCatchNode.scope.indexOf(throwingNode.id) === -1) {
            return;
          }
          var errorMessage;
          if (msg) {
            errorMessage = redUtil.cloneMessage(msg);
          } else {
            errorMessage = {};
          }
          if (errorMessage.hasOwnProperty("error")) {
            errorMessage._error = errorMessage.error;
          }
          errorMessage.error = {
            message: logMessage.toString(),
            source: {
              id: node.id,
              type: node.type,
              name: node.name,
              count: count
            }
          };
          if (logMessage.hasOwnProperty('stack')) {
            errorMessage.error.stack = logMessage.stack;
          }
          targetCatchNode.receive(errorMessage);
          handled = true;
        });
      }
      if (!handled) {
        throwingNode = activeNodes[throwingNode.z];
      }
    }
    return handled;
  }
}

function createNode(type, config) {
  var nn = null;
  var nt = typeRegistry.get(type);
  if (nt) {
    var conf = clone(config);
    delete conf.credentials;
    for (var p in conf) {
      if (conf.hasOwnProperty(p)) {
        flowUtil.mapEnvVarProperties(conf, p);
      }
    }
    try {
      nn = new nt(conf);
    } catch (err) {
      Log.log({
        level: Log.ERROR,
        id: conf.id,
        type: type,
        msg: err
      });
    }
  } else {
    Log.error(Log._("nodes.flow.unknown-type", {
      type: type
    }));
  }
  return nn;
}
