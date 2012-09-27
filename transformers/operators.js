var ASTNode = require('astify').ASTNode,
    ASTArray = ASTNode.ASTArray;

var funcs = {},
    runtimeNames = {};

function get(type){
  var ops = ASTNode.types[type][0].operators;
  Object.keys(ops).forEach(function(key){
    funcs[key] = ASTNode.parse(ops[key]);
    runtimeNames[funcs[key].name] = key;
  });
}

get('binary');
get('logical');
get('unary');
get('update');
get('assign');

module.exports = convertAllOperators;

function overload(ast){
  ast.find('class').forEach(function(subject){
    var overloads = {};
    subject.find('method').forEach(function(method){
      if (method.key.name in runtimeNames) {
        overloads[method.key.name] = true;
      }
    });
  });
}

function convertAllOperators(ast){
  var used = {};

  ['binary', 'logical', 'unary', 'update', 'assign'].forEach(function(type){
    ast.find(type).forEach(function(expr){
      used[expr.operator] = true;
      expr.becomeCall();
    });
  });

  var functions = new ASTArray;
  Object.keys(used).sort().forEach(function(operator){
    if (operator in funcs)
      functions.append(funcs[operator]);
    else
      console.log(operator)
  });

  ast.prepend(functions);
  return ast;
}
/*
var operators = {
  // numeric
  ADD                    : (a,b) => a + b,
  SUBTRACT               : (a,b) => a - b,
  DIVIDE                 : (a,b) => a / b,
  MULTIPLY               : (a,b) => a * b,
  MOD                    : (a,b) => a % b,

  // bitwise
  BIT_XOR                : (a,b) => a ^ b,
  BIT_AND                : (a,b) => a & b,
  BIT_OR                 : (a,b) => a | b,
  RIGHT_SHIFT            : (a,b) => a >> b,
  LEFT_SHIFT             : (a,b) => a << b,
  SIGNED_RIGHT_SHIFT     : (a,b) => a >>> b,
  INVERSE                :     a => ~a,


  TO_NUMBER              :     a => +a, a.valueOf()
  NEGATE                 :     a => -a, MULTIPLY(a, -1).valueOf()

  // boolean
  IS_EQUAL               : (a,b) => a === b,
  IS_SIMILAR             : (a,b) => a == b,
  IS_GREATER             : (a,b) => a > b,
  IS_LESS                : (a,b) => a < b,
  IS_INEQUAL             : (a,b) => a !== b, !IS_EQUAL(a, b)
  IS_DIFFERENT           : (a,b) => a != b, !IS_SIMILAR(a, b)
  IS_EQ_OR_GREATER       : (a,b) => a >= b, IS_GREATER(a, b) || IS_SIMILAR(a, b)
  IS_EQ_OR_LESS          : (a,b) => a <= b, IS_LESS(a, b) || IS_SIMILAR(a, b)

  // logical
  NOT                    :     a => !a,
  OR                     : (a,b) => a || b, !NOT(a) || !NOT(b);
  AND                    : (a,b) => a && b, !(NOT(a) && NOT(b));

  // mutate
  SET                    : (a,b) => a = b,
  SET_MULTIPLY           : (a,b) => a *= b, SET(a, MULTIPLY(a, b))
  SET_DIVIDE             : (a,b) => a /= b, SET(a, DIVIDE(a, b))
  SET_MOD                : (a,b) => a %= b, SET(a, MOD(a, b))
  SET_ADD                : (a,b) => a += b, SET(a, ADD(a, b))
  SET_SUBTRACT           : (a,b) => a -= b, SET(a, SUBTRACT(a, b))
  SET_LEFT_SHIFT         : (a,b) => a <<= b, SET(a, LEFT_SHIFT(a, b))
  SET_RIGHT_SHIFT        : (a,b) => a >>= b, SET(a, RIGHT_SHIFT(a, b))
  SET_SIGNED_RIGHT_SHIFT : (a,b) => a >>>= b, SET(a, SIGNED_RIGHT_SHIFT(a, b))
  SET_AND                : (a,b) => a &= b, SET(a, AND(a, b))
  SET_XOR                : (a,b) => a ^= b, SET(a, XOR(a, b))
  SET_OR                 : (a,b) => a |= b, SET(a, XOR(a, b))
  PRE_INCREMENT          :     a => SET(a, ADD(a, 1)),
  PRE_DECREMENT          :     a => SET(a, SUBTRACT(a, 1)),
  POST_INCREMENT         :     a => [CLONE(a), PRE_INCREMENT(a)][0],
  POST_DECREMENT         :     a => [CLONE(a), PRE_DECREMENT(a)][0],

  // other
  VOID                   :     a => void a,
  TYPEOF                 :     a => typeof a,
  IS_IN                  : (a,b) => a in b,
  IS_INSTANCE            : (a,b) => a instanceof b,
};

a && b
!a || !b*/
