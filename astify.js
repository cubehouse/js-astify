var AST = require('./AST');

module.exports = {
  install: require('./toAst'),
  parseFile: function parseFile(file){
    return new AST(2, file)
  },
  createNode: require('./ASTNode').createNode,
  AST: AST,
  ASTNode: require('./ASTNode'),
  ASTArray: require('./ASTNode').ASTArray
};
