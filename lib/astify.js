var AST = require('./AST'),
	ASTNode = require('./asts');

module.exports = {
	install: require('./toAST'),
	parse: function parse(code) {
		return new AST(0, null, code);
	},
	parseFile: function parseFile(file) {
		return new AST(2, file)
	},
	matches: ASTNode.matches,
	isNode: ASTNode.isNode,
	createNode: ASTNode.createNode,
	AST: AST,
	ASTNode: ASTNode,
	ASTArray: require('./ASTArray')
};
