module.exports = class SubFlow {
  constructor(sf, sfn, subflows, globalSubflows, activeNodes) {
    //console.log('CREATE SUBFLOW',sf.id,sfn.id);
    var nodes = [];
    var node_map = {};
    var newNodes = [];
    var node;
    var wires;
    var i, j, k;

    // Clone all of the subflow node definitions and give them new IDs
    for (i in sf.configs) {
      if (sf.configs.hasOwnProperty(i)) {
        createNodeInSubflow(sf.configs[i]);
      }
    }
    // Clone all of the subflow node definitions and give them new IDs
    for (i in sf.nodes) {
      if (sf.nodes.hasOwnProperty(i)) {
        createNodeInSubflow(sf.nodes[i]);
      }
    }

    // Look for any catch/status nodes and update their scope ids
    // Update all subflow interior wiring to reflect new node IDs
    for (i = 0; i < newNodes.length; i++) {
      node = newNodes[i];
      if (node.wires) {
        var outputs = node.wires;
        for (j = 0; j < outputs.length; j++) {
          wires = outputs[j];
          for (k = 0; k < wires.length; k++) {
            outputs[j][k] = node_map[outputs[j][k]].id
          }
        }
        if ((node.type === 'catch' || node.type === 'status') && node.scope) {
          node.scope = node.scope.map(function (id) {
            return node_map[id] ? node_map[id].id : ''
          })
        } else {
          for (var prop in node) {
            if (node.hasOwnProperty(prop) && prop !== '_alias') {
              if (node_map[node[prop]]) {
                //console.log('Mapped',node.type,node.id,prop,node_map[node[prop]].id);
                node[prop] = node_map[node[prop]].id;
              }
            }
          }
        }
      }
    }

    // Create a subflow node to accept inbound messages and route appropriately

    var subflowInstance = {
      id: sfn.id,
      type: sfn.type,
      z: sfn.z,
      name: sfn.name,
      wires: []
    }
    if (sf.in) {
      subflowInstance.wires = sf.in.map(function (n) {
        return n.wires.map(function (w) {
          return node_map[w.id].id;
        })
      })
      subflowInstance._originalWires = clone(subflowInstance.wires);
    }
    var subflowNode = new SubFlowNode(subflowInstance);

    subflowNode.on('input', function (msg) {
      this.send(msg);
    });

    subflowNode._updateWires = subflowNode.updateWires;

    nodes.push(subflowNode);

    // Wire the subflow outputs
    if (sf.out) {
      var modifiedNodes = {};
      for (i = 0; i < sf.out.length; i++) {
        wires = sf.out[i].wires;
        for (j = 0; j < wires.length; j++) {
          if (wires[j].id === sf.id) {
            // A subflow input wired straight to a subflow output
            subflowInstance.wires[wires[j].port] = subflowInstance.wires[wires[j].port].concat(sfn.wires[i])
            subflowNode._updateWires(subflowInstance.wires);
          } else {
            node = node_map[wires[j].id];
            modifiedNodes[node.id] = node;
            if (!node._originalWires) {
              node._originalWires = clone(node.wires);
            }
            node.wires[wires[j].port] = (node.wires[wires[j].port] || []).concat(sfn.wires[i]);
          }
        }
      }
    }

    // Instantiate the nodes
    for (i = 0; i < newNodes.length; i++) {
      node = newNodes[i];
      var type = node.type;

      var m = /^subflow:(.+)$/.exec(type);
      if (!m) {
        var newNode = createNode(type, node);
        if (newNode) {
          activeNodes[node.id] = newNode;
          nodes.push(newNode);
        }
      } else {
        var subflowId = m[1];
        nodes = nodes.concat(createSubflow(subflows[subflowId] || globalSubflows[subflowId], node, subflows, globalSubflows, activeNodes));
      }
    }

    subflowNode.instanceNodes = {};

    nodes.forEach(function (node) {
      subflowNode.instanceNodes[node.id] = node;
    });
    return nodes;
  }

  createNodeInSubflow(def) {
    node = clone(def);
    var nid = redUtil.generateId();
    node_map[node.id] = node;
    node._alias = node.id;
    node.id = nid;
    node.z = sfn.id;
    newNodes.push(node);
  }
}
