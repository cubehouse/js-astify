var astify = require('astify'),
    ASTArray = astify.ASTArray,
    _ = astify.createNode;

var output = astify.parseFile('./classes.js').ast;

function desugar(selector){
  output.find(selector).forEach(function(item){
    if ('desugar' in item)
      item.desugar();
  });
}

desugar('class');
desugar('taggedquasi');
desugar('quasi');



console.log(output.toSource());
