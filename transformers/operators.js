var ASTNode = require('astify').ASTNode;

function get(type, arr){
  var ops = ASTNode.types[type][0].operators;
  Object.keys(ops).forEach(function(key){
    arr.append(ASTNode.parse(ops[key]));
  });
  return arr;
}

var funcs = new ASTNode.ASTArray;
get('binary', funcs);
get('logical', funcs);
get('unary', funcs);
get('update', funcs);
get('assign', funcs);

module.exports = function(ast){
  ['binary', 'logical', 'unary', 'update', 'assign'].forEach(function(type){
    ast.find(type).forEach(function(expr){ expr.becomeCall() });
  });
  ast.prepend(funcs);
  return ast;
}

