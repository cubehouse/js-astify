var AST = require('./AST'),
    ASTNode = require('./ASTNode');

module.exports = {
  install: require('./toAst'),
  parseFile: function parseFile(file){
    return new AST(2, file)
  },
  createNode: ASTNode.createNode,
  AST: AST,
  ASTNode: ASTNode,
  ASTArray: ASTNode.ASTArray
};
