var AST = require('./AST'),
    ASTNode = require('./ASTNode');

module.exports = {
  install: require('./toAst'),
  parse: function parse(code){
    return new AST(0, null, code);
  },
  parseFile: function parseFile(file){
    return new AST(2, file)
  },
  createNode: ASTNode.createNode,
  AST: AST,
  ASTNode: ASTNode,
  ASTArray: ASTNode.ASTArray
};
