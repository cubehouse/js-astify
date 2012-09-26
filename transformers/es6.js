var _ = require('astify').createNode;

function desugar(ast, selector){
  ast.find(selector).forEach(function(item){
    if ('desugar' in item)
      item.desugar();
  });
}

module.exports = function(ast){
  desugar(ast, 'class');
  desugar(ast, 'taggedquasi');
  desugar(ast, 'quasi');
  desugar(ast, 'arrow');
  desugar(ast, 'module');
  return ast;
}

