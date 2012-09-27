var ASTNode = require('astify').ASTNode,
    ASTArray = ASTNode.ASTArray;

var funcs = {},
    runtimeNames = Object.create(null);

function get(type){
  var ops = ASTNode.types[type][0].operators;
  Object.keys(ops).forEach(function(key){
    funcs[key] = ASTNode.parse(ops[key]);
    runtimeNames[funcs[key].id.name] = key;
  });
}

get('binary');
get('logical');
get('unary');
get('update');
get('assign');

module.exports = overload;

function overload(ast){
  ast.find('class').forEach(function(subject){
    var overloads = {};
    subject.find('method').forEach(function(method){
      if (method.key.name in runtimeNames) {
        overloads[method.key.name] = true;
      }
    });

      console.log(overloads)
  });
  return ast;
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

var operators = {
// numeric
function ADD(r){ return this + r }
function SUBTRACT(r){ return this - r }
function DIVIDE(r){ return this / r }
function MULTIPLY(r){ return this * r }
function MOD(r){ return this % r }
// bitwise
function BIT_XOR(r){ return this ^ r }
function BIT_AND(r){ return this & r }
function BIT_OR(r){ return this | r }
function RIGHT_SHIFT(r){ return this >> r }
function LEFT_SHIFT(r){ return this << r }
function SIGNED_RIGHT_SHIFT(r){ return this >>> r }
function BIT_NOT(){ return ~this }
function TO_NUMBER(){ return +this }
function NEGATE(){ return -this }
// boolean
function IS_EQUAL(r){ return this === r }
function IS_SIMILAR(r){ return this == r }
function IS_GREATER(r){ return this > r }
function IS_LESS(r){ return this < r }
function IS_INEQUAL(r){ return this !== r }
function IS_DIFFERENT(r){ return this != r }
function IS_EQ_OR_GREATER(r){ return this >= r }
function IS_EQ_OR_LESS(r){ return this <= r }
// logical
function NOT(){ return !this }
function OR(r){ return this || r }
function AND(r){ return this && r }
// mutate
function SET(r){ return this = r }
function SET_MULTIPLY(r){ return this *= r }
function SET_DIVIDE(r){ return this /= r }
function SET_MOD(r){ return this %= r }
function SET_ADD(r){ return this += r }
function SET_SUBTRACT(r){ return this -= r }
function SET_LEFT_SHIFT(r){ return this <<= r }
function SET_RIGHT_SHIFT(r){ return this >>= r }
function SET_SIGNED_RIGHT_SHIFT(r){ return this >>>= r }
function SET_AND(r){ return this &= r }
function SET_XOR(r){ return this ^= r }
function SET_OR(r){ return this |= r }
function PRE_INCREMENT(){ return this.SET(this.ADD(1)) }
function PRE_DECREMENT(){ return this.SET(this.SUBTRACT(1)) }
function POST_INCREMENT(){ var c = this.CLONE(); this.PRE_INCREMENT(); return c; }
function POST_DECREMENT(){ var c = this.CLONE(); this.PRE_DECREMENT(); return c; }
// other
function VOID(){ return void this }
function TYPEOF(){ return typeof this }
function IS_IN(r) { return this in r }
function IS_INSTANCE(r) { return this instanceof r }
function DELETE(r) { return delete this[r] }





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
