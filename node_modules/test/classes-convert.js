var astify = require('astify'),
    ASTArray = astify.ASTArray,
    _ = astify.createNode;

var inherits = {},
    output = new ASTArray;

astify.parseFile('./classes.js').ast.find('class').forEach(function(classAST){
  var functionAST = classAST.toFunction();

  if (functionAST.identity in inherits) {
    inherits[functionAST.identity].inherits = functionAST;
    output.splice(inherits[functionAST.identity], 0, functionAST);
  } else {
    if (classAST.superClass)
      inherits[classAST.superClass.name] = output.length;
    output.push(functionAST);
  }
});

console.log(output.toSource());
