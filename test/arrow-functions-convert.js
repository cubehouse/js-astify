var astify = require('astify'),
    ASTArray = astify.ASTArray,
    _ = astify.createNode;

var ast = astify.parseFile('./arrow-functions.js').ast;
ast.find('arrow').forEach(function(f){
  f.becomeExpression();
});
console.log(ast.toSource());
