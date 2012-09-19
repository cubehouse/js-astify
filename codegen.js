var AST = require('./AST');

module.exports = {
  astify: require('./astify'),
  parseFile: function parseFile(file){
    return new AST(2, file)
  },
  parseFunction: function parseFunction(fn){
    return new AST(1, file);
  },
  AST: AST
};
