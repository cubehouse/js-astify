var Visitor       = require('./Visitor'),
    ASTNode       = require('./ASTNode'),
    ASTArray      = ASTNode.ASTArray,
    isNode        = ASTNode.isNode,
    parseSelector = require('./parse-selector');

module.exports = compileSelector;



var combinators = {
  ' ': function(filter, nodes){
    var out = new ASTArray,
        seen = new Set;

    function check(node){
      if (!seen.has(node) && filter(node)) {
        out.push(node);
        seen.add(node);
      }
    }

    check(nodes);
    nodes.visit(function(node){
      check(node);
      return Visitor.RECURSE;
    });
    return out;
  },
  '>': function(filter, nodes){
    var out = new ASTArray;
    nodes.forEach(function(node){
      node.forEach(function(child){
        if (filter(child))
          out.push(child);
      })
    });
    return out;
  }
};

var modifiers = {
  ':': {
    scope: function(nodes){
      var out = new ASTArray;
      nodes.visit(function(node, p){
        if (ASTNode.isFunction(node))
          return Visitor.CONTINUE;
        out.push(node);
        return Visitor.RECURSE;
      });
      return out;
    },
    first: function(nodes){
      return nodes[0];
    },
    last: function(nodes){
      return nodes[nodes.length - 1];
    },
    'first-child': function(nodes){
      var firsts = new ASTArray;

      nodes.forEach(function(node){
        var parent = node.getParent();
        if (ASTNode.isNode(parent) && parent.firstChild() === node)
          firsts.push(node);
      })

      return firsts;
    },
    'last-child': function(nodes){
      var lasts = new ASTArray;

      nodes.forEach(function(node){
        var parent = node.getParent();
        if (ASTNode.isNode(parent) && parent.lastChild() === node)
          lasts.push(node);
      })

      return lasts;
    }
  },
  '.': { }
};


var comparators = {
  isSame: function(a, b){
    return a === b;
  },
  isSimilar: function(a, b){
    return a == b;
  },
  startsWith: function(a, b){
    return (a+'').lastIndexOf(b+'') === 0;
  },
  endsWith: function(a, b){
   return (a+'').substring(-(b+='').length, 0) === b;
  },
  contains: function(a, b){
    return (a+'').indexOf(b+'') > -1;
  },
  isDifferent: function(a, b){
    return a != b;
  }
};

function compileSelector(selector){
  var subselectors = parseSelector(selector);
  //console.log(subselectors);
  subselectors = subselectors.selectors[0].map(function(subselector){
    if (subselector.modifiers || subselector.keys) {
      var modifier = function(){
        var mods = [];
        if (subselector.keys) {
          var keymods = []
          subselector.keys.forEach(function(key){
            if (key in modifiers['.']) {
              keymods.push(modifiers['.'][key]);
            } else {
              keymods.push(function(node){
                if (key in node && node[key] !== null)
                  return node[key];
              });
            }
          });
          mods.push(function(nodes){
            var out = new ASTArray;

            function check(node){
              var set = new ASTArray;
              for (var i=0; i < keymods.length; i++) {
                var val = keymods[i](node);
                if (val) set.push(val);
              }
              if (set.length === 1)
                out.push(set[0]);
              else if (set.length > 1)
                out.push(set);
            }

            check(nodes);
            nodes.forEach(check);
            return out;
          });
        }
        if (subselector.modifiers) {
          subselector.modifiers.forEach(function(mod){
            if (mod.operator in modifiers)
              mods.push(modifiers[mod.operator][mod.name]);
            else
              throw new Error('Unknown modifier operator "'+mod.operator+'"');
          });
        }
        return function(nodes){
          for (var i=0; i < mods.length; i++)
            nodes = mods[i](nodes);
          return nodes;
        };
      }();
    } else {
      var modifier = function(o){ return o };
    }
    var combinator = combinators[subselector.combinator];
    var filters = [];

    if (subselector.name !== '*') {
      filters.push(function(node){
        if (node && node.matches)
          return node.matches(subselector.name);
        else
          return false;
      });
    }

    if (subselector.filters) {
      subselector.filters.forEach(function(filter){
        filters.push(function(node){
          var value = node[filter.key];
          if (isNode(value) && filter.test in value)
            return value[filter.test](filter.value);
          else
            return comparators[filter.test](value, filter.value);
        });
      });
    }

    function filter(node){
      for (var i=0; i < filters.length; i++)
        if (!filters[i](node))
          return false;
      return true;
    }

    return function(nodes){
      return modifier(combinator(filter, nodes))
    };
  });

  return function(node){
    for (var i=0; i < subselectors.length; i++)
      node = subselectors[i](node);
    return node;
  };
}



