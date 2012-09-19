var AST = require('./AST');

module.exports = {
  toAstify: require('./toAst'),
  parseFile: function parseFile(file){
    return new AST(2, file)
  },
  parseFunction: function parseFunction(fn){
    return new AST(1, file);
  },
  AST: AST,
  ASTNode: require('./ASTNode')
};
