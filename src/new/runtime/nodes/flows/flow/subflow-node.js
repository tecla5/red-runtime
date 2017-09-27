var Node = require('../node');

module.exports = class SubFlowNode extends Node {
  constructor(flow) {
    super(flow)
  }

  updateWires(newWires) {
    // Wire the subflow outputs
    if (sf.out) {
      var node, wires, i, j;
      // Restore the original wiring to the internal nodes
      subflowInstance.wires = clone(subflowInstance._originalWires);
      for (i = 0; i < sf.out.length; i++) {
        wires = sf.out[i].wires;
        for (j = 0; j < wires.length; j++) {
          if (wires[j].id != sf.id) {
            node = node_map[wires[j].id];
            if (node._originalWires) {
              node.wires = clone(node._originalWires);
            }
          }
        }
      }

      var modifiedNodes = {};
      var subflowInstanceModified = false;

      for (i = 0; i < sf.out.length; i++) {
        wires = sf.out[i].wires;
        for (j = 0; j < wires.length; j++) {
          if (wires[j].id === sf.id) {
            subflowInstance.wires[wires[j].port] = subflowInstance.wires[wires[j].port].concat(newWires[i]);
            subflowInstanceModified = true;
          } else {
            node = node_map[wires[j].id];
            node.wires[wires[j].port] = node.wires[wires[j].port].concat(newWires[i]);
            modifiedNodes[node.id] = node;
          }
        }
      }
      Object.keys(modifiedNodes).forEach(function (id) {
        var node = modifiedNodes[id];
        subflowNode.instanceNodes[id].updateWires(node.wires);
      });
      if (subflowInstanceModified) {
        subflowNode._updateWires(subflowInstance.wires);
      }
    }
  }
}
