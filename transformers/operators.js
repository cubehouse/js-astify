var ASTNode = require('astify').ASTNode,
    $ = ASTNode.createNode,
    ASTArray = ASTNode.ASTArray;

var handlers = {};

function register(type, callback){
  handlers[type] = callback;
}

register('update', function(node){
  var name = node.prefix ? '_' + node.operator : node.operator + '_';
  var call = $(names.update[name]).call([node.argument]);
  node.replaceWith(node.argument.get('#assign', '=', call));
});

register('unary', function(node){
  node.replaceWith(node.argument.get(names.unary[node.operator]).call([]));
});

register('logical', function(node){
  node.replaceWith(node.left.get(names.logical[node.operator]).call([node.right]));
});

register('binary', function(node){
  node.replaceWith(node.left.get(names.binary[node.operator]).call([node.right]));
});

register('assign', function(node){
  var call = node.left.get(names.assign[node.operator]).call([node.right]);
  node.replaceWith($('#assign', '=', node.left.clone(), call));
});


module.exports = function(ast){
  for (var type in handlers) {
    ast.find(type).forEach(function(expr){
      var scope = expr.parentScope();
      if (scope) {
        name = scope.id || scope.key;
        if (name && name.name in ops)
          return;
      }
      handlers[type](expr);
    });
  }

  return ast;
}

var ops = {
  SET: true,
  SET_MULTIPLY: true,
  SET_DIVIDE: true,
  SET_MOD: true,
  SET_ADD: true,
  SET_SUBTRACT: true,
  SET_LEFT_SHIFT: true,
  SET_RIGHT_SHIFT: true,
  SET_SIGNED_RIGHT_SHIFT: true,
  SET_AND: true,
  SET_XOR: true,
  SET_OR: true,
  ADD: true,
  SUBTRACT: true,
  DIVIDE: true,
  MULTIPLY: true,
  MOD: true,
  BIT_XOR: true,
  BIT_AND: true,
  BIT_OR: true,
  RIGHT_SHIFT: true,
  LEFT_SHIFT: true,
  SIGNED_RIGHT_SHIFT: true,
  IS_EQUAL: true,
  IS_SIMILAR: true,
  IS_GREATER: true,
  IS_LESS: true,
  IS_INEQUAL: true,
  IS_DIFFERENT: true,
  IS_EQ_OR_GREATER: true,
  IS_EQ_OR_LESS: true,
  IS_IN: true,
  DELETE: true,
  IS_INSTANCE: true,
  OR: true,
  AND: true,
  NOT: true,
  NEGATE: true,
  TO_NUMBER: true,
  BIT_NOT: true,
  VOID: true,
  TYPEOF: true,
  INCREMENT: true,
  DECREMENT: true,
  PRE_INCREMENT: true,
  PRE_DECREMENT: true,
  POST_INCREMENT: true,
  POST_DECREMENT: true,
};

var names = {
  assign: {
    '='           : 'SET',
    '*='          : 'SET_MULTIPLY',
    '/='          : 'SET_DIVIDE',
    '%='          : 'SET_MOD',
    '+='          : 'SET_ADD',
    '-='          : 'SET_SUBTRACT',
    '<<='         : 'SET_LEFT_SHIFT',
    '>>='         : 'SET_RIGHT_SHIFT',
    '>>>='        : 'SET_SIGNED_RIGHT_SHIFT',
    '&='          : 'SET_AND',
    '^='          : 'SET_XOR',
    '|='          : 'SET_OR',
  },
  binary: {
    '+'           : 'ADD',
    '-'           : 'SUBTRACT',
    '/'           : 'DIVIDE',
    '*'           : 'MULTIPLY',
    '%'           : 'MOD',
    '^'           : 'BIT_XOR',
    '&'           : 'BIT_AND',
    '|'           : 'BIT_OR',
    '>>'          : 'RIGHT_SHIFT',
    '<<'          : 'LEFT_SHIFT',
    '>>>'         : 'SIGNED_RIGHT_SHIFT',
    '==='         : 'IS_EQUAL',
    '=='          : 'IS_SIMILAR',
    '>'           : 'IS_GREATER',
    '<'           : 'IS_LESS',
    '!=='         : 'IS_INEQUAL',
    '!='          : 'IS_DIFFERENT',
    '>='          : 'IS_EQ_OR_GREATER',
    '<='          : 'IS_EQ_OR_LESS',
    'in'          : 'IS_IN',
    'delete'      : 'DELETE',
    'instanceof'  : 'IS_INSTANCE',
  },
  logical: {
    '||'          : 'OR',
    '&&'          : 'AND',
  },
  unary: {
    '!'           : 'NOT',
    '~'           : 'NEGATE',
    '+'           : 'TO_NUMBER',
    '-'           : 'BIT_NOT',
    'void'        : 'VOID',
    'typeof'      : 'TYPEOF',
  },
  update: {
    '++'          : 'INCREMENT',
    '--'          : 'DECREMENT',
    '_++'         : 'PRE_INCREMENT',
    '_--'         : 'PRE_DECREMENT',
    '++_'         : 'POST_INCREMENT',
    '--_'         : 'POST_DECREMENT',
  }
};


function install(){
  [ function ADD(r){ return this + r },
    function SUBTRACT(r){ return this - r },
    function DIVIDE(r){ return this / r },
    function MULTIPLY(r){ return this * r },
    function MOD(r){ return this % r },
    function BIT_XOR(r){ return this ^ r },
    function BIT_AND(r){ return this & r },
    function BIT_OR(r){ return this | r },
    function RIGHT_SHIFT(r){ return this >> r },
    function LEFT_SHIFT(r){ return this << r },
    function SIGNED_RIGHT_SHIFT(r){ return this >>> r },
    function BIT_NOT(){ return ~this },
    function TO_NUMBER(){ return +this },
    function NEGATE(){ return -this },
    function IS_EQUAL(r){ return this === r },
    function IS_SIMILAR(r){ return this == r },
    function IS_GREATER(r){ return this > r },
    function IS_LESS(r){ return this < r },
    function IS_INEQUAL(r){ return this !== r },
    function IS_DIFFERENT(r){ return this != r },
    function IS_EQ_OR_GREATER(r){ return this >= r },
    function IS_EQ_OR_LESS(r){ return this <= r },
    function NOT(){ return !this },
    function OR(r){ return this || r },
    function AND(r){ return this && r },
    function SET(r){ return r },
    function SET_MULTIPLY(r){ return this * r },
    function SET_DIVIDE(r){ return this / r },
    function SET_MOD(r){ return this % r },
    function SET_ADD(r){ return this + r },
    function SET_SUBTRACT(r){ return this - r },
    function SET_LEFT_SHIFT(r){ return this << r },
    function SET_RIGHT_SHIFT(r){ return this >> r },
    function SET_SIGNED_RIGHT_SHIFT(r){ return this >>> r },
    function SET_AND(r){ return this & r },
    function SET_XOR(r){ return this ^ r },
    function SET_OR(r){ return this | r },
    function PRE_INCREMENT(){ return this.SET(this.ADD(1)) },
    function PRE_DECREMENT(){ return this.SET(this.SUBTRACT(1)) },
    function POST_INCREMENT(){ var c = this.CLONE(); this.PRE_INCREMENT(); return c; },
    function POST_DECREMENT(){ var c = this.CLONE(); this.PRE_DECREMENT(); return c; },
    function VOID(){ return void this },
    function TYPEOF(){ return typeof this },
    function IS_IN(r) { return this in r },
    function IS_INSTANCE(r) { return this instanceof r },
    function DELETE(r) { return delete this[r] }
  ].forEach(function(operator){
    Object.defineProperty(Object.prototype, {
      value: operator,
      configurable: true
    });
  });
}
/*

// derived versions
function TO_NUMBER(){ return this.valueOf() }
function NEGATE(){ return this.MULTIPLY(-1).valueOf() }
function IS_INEQUAL(r){ return !this.IS_EQUAL(r) }
function IS_DIFFERENT(r){ return !this.IS_SIMILAR(r) }
function OR(r){ return !this.NOT() || !r.NOT() }
function AND(r){ return !(this.NOT() && r.NOT()) }
function IS_EQ_OR_GREATER(r){ return this.IS_GREATER(r) || this.IS_SIMILAR(r) }
function IS_EQ_OR_LESS(r){ return this.IS_LESS(r) || this.IS_SIMILAR(r) }
function SET_MULTIPLY(r){ return this.SET(this.MULTIPLY(r)) }
function SET_DIVIDE(r){ return this.SET(this.DIVIDE(r)) }
function SET_MOD(r){ return this.SET(this.MOD(r)) }
function SET_ADD(r){ return this.SET(this.ADD(r)) }
function SET_SUBTRACT(r){ return this.SET(this.SUBTRACT(r)) }
function SET_LEFT_SHIFT(r){ return this.SET(this.LEFT_SHIFT(r)) }
function SET_RIGHT_SHIFT(r){ return this.SET(this.RIGHT_SHIFT(r)) }
function SET_SIGNED_RIGHT_SHIFT(r){ return this.SET(this.SIGNED_RIGHT_SHIFT(r)) }
function SET_AND(r){ return this.SET(this.AND(r)) }
function SET_XOR(r){ return this.SET(this.XOR(r)) }
function SET_OR(r){ return this.SET(this.OR(r)) }
function PRE_INCREMENT(){ return this.SET(this.ADD(1)) }
function PRE_DECREMENT(){ return this.SET(this.SUBTRACT(1)) }
function POST_INCREMENT(){ var c = this.CLONE(); this.PRE_INCREMENT(); return c; }
function POST_DECREMENT(){ var c = this.CLONE(); this.PRE_DECREMENT(); return c; }
*/
