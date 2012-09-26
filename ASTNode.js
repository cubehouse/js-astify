var esprima   = require('esprima'),
    escodegen = require('escodegen'),
    inspect   = require('util').inspect;

var Visitor       = require('./Visitor'),
    options       = require('./options'),
    utility       = require('./utility'),
    Registry      = utility.Registry,
    Mixin         = utility.Mixin,
    createStorage = utility.createStorage,
    isObject      = utility.isObject,
    define        = utility.define,
    inherit       = utility.inherit,
    gensym        = utility.gensym;


var _push    = [].push,
    _unshift = [].unshift,
    _slice   = [].slice,
    _pop     = [].pop,
    _shift   = [].shift;


var _ = createStorage();




function Location(loc, range){
  this.startColumn = loc.start.column;
  this.startLine = loc.start.line;
  this.endColumn = loc.end.column;
  this.endLine = loc.end.line;
  this.rangeStart = range[0];
  this.rangeEnd = range[1];
}

var skip = Object.create(null);
skip.loc = true;
skip.range = true;



module.exports = ASTNode;

// ###############
// ### ASTNode ###
// ###############


function ASTNode(json){
  if (!json) return json;

  if (typeof json === 'string')
    return ASTNode.createNode.apply(null, arguments);

  return jsonToAST(json);
}


function isNode(o){
  return o instanceof ASTNode || o instanceof ASTArray;
}

define(ASTNode, [
  function isFunction(o){
    return o instanceof FunctionExpression || o instanceof FunctionDeclaration;
  },
  isNode,
  function createNode(type){
    if (type instanceof ASTNode)
      return type;

    if (typeof type === 'string') {
      if (type[0] === '#' && type.slice(1) in ASTNode.types)
        var Ctor = ASTNode.types[type.slice(1)][0];
      else if (nodeTypes.lookup(type))
        var Ctor = nodeTypes.lookup(type);
      else
        return new Identifier(type);
    }

    if (Ctor)
      return new Ctor(arguments[1], arguments[2], arguments[3], arguments[4], arguments[5]);
    else if (isObject(type))
      return new ObjectExpression(type);
    else
      throw new TypeError('Unknown AST Node type "'+type+'"');
  },
  ASTArray
]);

var $ = ASTNode.createNode;

define(ASTNode.prototype, [
  function getParent(){
    return _(this).parent;
  },
  function toSource(){
    return escodegen.generate(this, options.codegen());
  },
  function toString(){
    return '[AST: '+this.constructor.name+']';
  },
  function toJSON(){
    var out = { type: this.type };
    Object.keys(this).forEach(function(key){
      if (this[key] && this[key].toJSON)
        out[key] = this[key].toJSON();
      else
        out[key] = this[key];
    }, this);
    return out;
  },
  function visit(callback){
    return new Visitor(this, callback, isNode).next();
  },
  function visitSome(filter, callback){
    return this.visit(function(node, parent){
      if (node.matches(filter))
        return callback.apply(this, arguments);
      else
        return Visitor.CONTINUE;
    });
  },
  function visitAll(callback){
    return this.visit(function(node, parent){
      if (callback.call(this, node, parent) !== Visitor.BREAK)
        return Visitor.RECURSE;
    });
  },
  function remove(child){
    for (var k in this) {
      if (this[k] === child) {
        unparent(child);
        this[k] = null;
        return k;
      }
    }
  },
  function firstChild(){
    var keys = Object.keys(this);
    for (var i=0; i < keys.length; i++) {
      var item = this[keys[i]];
      if (item instanceof Array) {
        for (var j=0; j < item.length; j++) {
          if (isNode(item[j]))
            return item[j];
        }
      } else if (item instanceof ASTNode) {
        return item;
      }
    }
  },
  function lastChild(){
    var keys = Object.keys(this);
    for (var i=keys.length - 1; i > -1; i--) {
      var item = this[keys[i]];
      if (item instanceof Array) {
        for (var j=item.length - 1; j > -1; j--) {
          if (isNode(item[j]))
            return item[j];
        }
      } else if (item instanceof ASTNode) {
        return item;
      }
    }
  },
  function forEach(callback, context){
    context = context || this;
    Object.keys(this).forEach(function(k){
      callback.call(context, this[k], k, this)
    }, this);
    return this;
  },
  function find(selector){
    var filter = compileSelector(selector);
    return filter(this);
  },
  function matches(filter){
    if (typeof filter === 'string') {
      var types = ASTNode.types[filter];
      if (types) {
        for (var i=0; i < types.length; i++)
          if (this instanceof types[i])
            return true;
      }
      if (filter.toLowerCase() === this.type.toLowerCase())
        return true;
    } else if (typeof filter === 'function') {
      if (this instanceof filter)
        return true;
    }
    return false;
  },
  function clone(){
    var out = Object.create(Object.getPrototypeOf(this));
    Object.keys(this).forEach(function(key){
      out[key] = this[key] instanceof ASTNode || this[key] instanceof ASTArray ? this[key].clone() : this[key];
      if (this[key] instanceof Array)
        out[key] = new ASTArray(this[key]);
    }, this);
    return out;
  },
  function replaceWith(replacement) {
    var myParent = this.getParent();
    if (myParent) {
      for (var k in myParent) {
        if (myParent[k] === this) {
          myParent[k] = replacement;
          unparent(this);
          parent(replacement, myParent);
          return this;
        }
      }
      for (var k in myParent) {
        if (isNode(myParent[k])) {
          for (var j in myParent[k]) {
            if (myParent[k][j] === this) {
              myParent[k][j] = replacement;
              unparent(this);
              parent(replacement, myParent[k]);
              return this;
            }
          }
        }
      }
    }
    console.log('replaceWith failed for '+this.type);
  },
  function parentScope(){
    var parent = this.getParent();
    while (parent) {
      if (parent.matches('function') || parent instanceof Program)
        return parent;

      parent = parent.getParent();
    }
  }
]);

// ################
// ### ASTArray ###
// ################

function ASTArray(array){
  define(this, 'length', 0);
  if (array && !(array instanceof Array))
    array = [array];

  array && array.forEach(function(item){
    if (isNode(item) && !item.getParent())
      parent(item, this);
    this.push(item);
  }, this);
}
define(ASTArray, [
  function fromJSON(json){
    if (json instanceof Array) {
      var out = new ASTArray;
      for (var i=0; i < json.length; i++)
        out.push(parent(jsonToAST(json[i]), out));
      return out;
    }
  }
]);
inherit(ASTArray, Array, [
  function map(callback, context){
    var out = new ASTArray;
    context = context || this;
    for (var i=0; i < this.length; i++)
      out.push(callback.call(context, this[i], i, this));
    return out;
  },
  function prepend(o){
    if (!isNode(o))
      o = $(o);
    this.unshift(parent(o, this));
    return this;
  },
  function append(o){
    if (!isNode(o))
      o = $(o);
    this.push(parent(o, this));
    return this;
  },
  function getParent(){
    return _(this).parent;
  },
  function remove(item){
    var index = this.indexOf(item);
    if (~index) {
      if (isNode(item) && item.getParent() === this)
        unparent(item);
      this.splice(index, 1);
    }
    return this;
  },
  function clone(){
    var out = new ASTArray;
    this.forEach(function(item){
      if (isNode(item))
        item = item.getParent() === this ? parent(item.clone(), out) : item.clone();

      out.push(item);
    });
    return out;
  },
  function toSource(){
    return this.map(function(node){
      return node.toSource();
    }).join('\n');
  },
  function toJSON(){
    return this.map(function(item){
      return item.toJSON();
    });
  },
  function visit(callback){
    return new Visitor(this, callback, isNode).next();
  },
  function find(selector){
    var filter = compileSelector(selector);
    return filter(this);
  },
  function matches(){
    return false;
  },
  function firstChild(){
    for (var i=0; i < this.length; i++)
      if (isNode(this[i]))
        return this[i];
  },
  function lastChild(){
    for (var i=this.length - 1; i > -1; i--)
      if (isNode(this[i]))
        return this[i];
  },
]);

function jsonToAST(item){
  if (item instanceof Array) {
    return ASTArray.fromJSON(item);
  } else if (item && item.type) {
    var Type = nodeTypes.lookup(item.type);
    if (Type)
      return Type.fromJSON(item);
  }
  return item;
}

function fromJSON(json){
  var params = this.fields.map(function(field){
    return jsonToAST(json[field]);
  });
  var ret = new this(params[0], params[1], params[2], params[3], params[4], params[5]);
  if ('loc' in json) sourceLocations.set(ret, new Location(json.loc, json.range));
  return ret;
}

var nodeTypes = new Registry;
var sourceLocations = new WeakMap;

define(ASTNode, 'registry', nodeTypes);
ASTNode.types = {};


nodeTypes.on('register', function(name, Ctor, args){
  var Super = args[0],
      props = args[2],
      shortnames = [].concat(args[1]),
      src = Ctor+'';

  inherit(Ctor, Super, props);
  define(Ctor.prototype, { type: name });
  define(Ctor, {
    fields: src.slice(src.indexOf('(') + 1, src.indexOf(')')).split(/\s*,\s*/).filter(Boolean),
    fromJSON: fromJSON
  });
  shortnames.forEach(function(shortname){
    if (!(shortname in ASTNode.types))
      ASTNode.types[shortname] = [];
    ASTNode.types[shortname].push(Ctor);
  });
});




function parent(o, p){
  if (isNode(o))
    _(o).parent = p;
  return o;
}

function unparent(o){
  if (isNode(o))
    _(o).parent = null;
  return o;
}

function prep(o){
  Object.keys(o).forEach(function(key){
    if (isNode(o[key]))
      _(o[key]).parent = o;
  });
}

function parse(s){
  if (typeof s === 'function')
    return jsonToAST(esprima.parse('('+s+')').body[0].expression);
  else
    return jsonToAST(esprima.parse(s).body[0].expression);
}


function functionAST(f){
  return jsonToAST(esprima.parse('('+f+')').body[0].expression);
}

function makeIdentifier(o){
  if (typeof o === 'string')
    return new Identifier(o);
  else if (o instanceof Literal)
    return new Identifier(o.value);
  else if (o instanceof Identifier)
    return new Identifier(o.name);
  else
    return assertInstance(o, Identifier);
}

function isValidIdentifier(string) {
  return /^[a-zA-Z_\$][a-zA-Z0-9_\$]*$/.test(string);
}

function keyNeedsQuotes(key){
  return !/^[a-zA-Z0-9_\$]+$/.test(key);
}

function _hoist(from, to){
  var decls = new VariableDeclaration;
  var seen = {};

  from.visit(function(node, parent){
    if (node.matches('function'))
      return Visitor.CONTINUE;
    if (node instanceof VariableDeclaration) {
      var leftover = node.declarations.filter(function(decl){
        if (decl.id.name in seen)
          return true;
        decls.declarations.push(decl);
        seen[decl.id.name] = true;
      });
      parent.remove(node);
      return Visitor.CONTINUE;
    }
    return Visitor.RECURSE;
  });

  if (decls.declarations.length)
    to.prepend(decls);
}

function assertInstance(o, types){
  var err;
  if (typeof o === 'string' || typeof o === 'number' && isFinite(o))
    o = new Identifier(o+'');

  if (typeof types === 'function') {
    if (types === Statement && o.toStatement)
        return o.toStatement();

    if (o instanceof types)
      return o;

  } else if (types instanceof Array) {
    for (var i=0; i < types.length; i++) {
      if (types[i] === null && o == null)
        return null;

      if (types[i] === Statement && o.toStatement)
        return o.toStatement();

      if (typeof types[i] === 'function' && o instanceof types[i])
        return o;
    }
    err = new TypeError('Item must be one of ['+types.map(function(t){ return t ? t.name : t }).join(', ')+'], got '+inspect(o));
  }
  err = err || new TypeError('Wanted '+(types ? types.name : types)+', got '+inspect(o));
  throw err;
}



Mixin.create('functions', function(o){
  define(o, [
    function declare(vars){
      if (arguments.length > 1)
        vars = new ASTArray(_slice.call(arguments));

      var decls = this.body.select('VariableDeclaration');
      if (decls.length) {
        var decl = decls[0];
      } else {
        var decl = new VariableDeclaration('var');
        this.body.prepend(decl)
      }
      decl.declare(vars);
      return this;
    },
    function hoist(){
      _hoist(this, this.body);
    },
    function call(args){
      return new CallExpression(this, args);
    },
    function visitLocal(visitor){
      return this.visit(function(node, parent){
        if (node.matches('function'))
          return Visitor.CONTINUE;
        else
          return visitor.apply(this, arguments);
      });
    },
    function selectLocal(filter){
      var nodes = new ASTArray;
      this.visit(function(node, parent){
        if (node.matches(filter))
          nodes.push(node);
        return Visitor.RECURSE;
      });
      return nodes;
    },
    function declaration(name){
      if (this instanceof FunctionDeclaration)
        return this.clone();

      if (!name) name = this.id ? this.id.name : this.identity;
      var decl = new VariableDeclaration;
      decl.declare(name, this instanceof Expression ? this : this.toExpression());
      return decl;
    },
    function scopedDeclaration(name){
      var scope = new FunctionExpression;

      if (name || !this.id)
        var decl = this.declaration(name);
      else
        var decl = this.toDeclaration();

      scope.body.append(decl);
      scope.body.append(new ReturnStatement(decl.id));
      var iife = new ImmediatelyInvokedFunctionExpression(scope);
      iife.identity = this.identity;
      prep(scope.body);
      return iife;
    },
    function returns(expr){
      this.body.append(parent(new ReturnStatement(expr), this.body));
      return this;
    }
  ]);
});


Mixin.create('arrays', function(o, args){
  var type = args.type,
      prop = args.property;

  if (!type) {
    var checkType = function checkType(o){
      return o;
    }
  } else {
    var checkType = function checkType(o){
      return assertInstance(o, type);
    };
  }

  define(o, [
    function append(items){
      if (!(items instanceof Array))
        items = [items];
      items = items.map(function(item){
        return parent(checkType(item), this);
      }, this);
      _push.apply(this[prop], items);
      return this;
    },
    function prepend(items){
      if (!(items instanceof Array))
        items = [items];
      items = items.map(function(item){
        return parent(checkType(item), this);
      }, this);
      _unshift.apply(this[prop], items);
      return this;
    },
    function insert(index, items){
      if (!(items instanceof Array))
        items = [items];
      items = items.map(function(item){
        return parent(checkType(item), this);
      }, this);
      this[prop].splice(index, items.length, item);
      return this;
    },
    function empty(){
      while (this[prop].length)
        this.pop();
      return this;
    },
    function pop(){
      return unparent(this[prop].pop());
    },
    function shift(){
      return unparent(this[prop].shift())
    },
    function forEach(callback, context){
      context = context || this;
      for (var i=0; i < this[prop].length; i++)
        callback.call(context, this[prop][i], i, this[prop]);
    },
    function select(filter){
      return this.filter(function(node){
        return node.matches(filter);
      });
    },
    function first(){
      return this[prop][0];
    },
    function last(){
      return this[prop][this[prop].length - 1];
    },
    function filter(callback){
      var out = new ASTArray;
      for (var i=0; i < this[prop].length; i++)
        if (callback.call(this, this[prop][i], i, this[prop]))
          out.push[this[prop][i]];

      return out;
    },
    function map(callback, context){
      var out = Object.create(Object.getPrototypeOf(this));
      for (var key in this)
        out[key] = this[key];

      out[prop] = new ASTArray;
      context = context || this;
      for (var i=0; i < this[prop].length; i++) {
        var item = callback.call(context, this[prop][i], i, this[prop]);
        if (item !== undefined)
          out[prop].push(checkType(item));
      }
      return out;
    }
  ]);

  if (typeof type === 'function') {
    define(o, [
      function createNode(){
        var a = arguments;
        a = new type(a[0], a[1], a[2], a[3], a[4]);
        this.append(a);
        return a;
      }
    ]);
  }
});




// ##################
// ### Expression ###
// ##################

function Expression(type){
  if (type in Expression)
    type = Expression[type];
  else if (type + 'Expression' in Expression)
    type = Expression[type + 'Expression'];
  else if (type[0].toUpperCase() + type.slice(1) + 'Expression' in Expression)
    type = Expression[type[0].toUpperCase() + type.slice(1) + 'Expression'];

  if (type) {
    var a = arguments;
    return new type(a[1], a[2], a[3], [4], a[5]);
  }
}

inherit(Expression, ASTNode, [
  function toStatement(){
    return new ExpressionStatement(this);
  },
  function assignTo(obj, key){
    if (key == null) {
      return this.declaration(obj);
    }
    if (typeof key === 'number' || typeof key === 'string')
      key = new Identifier(key+'');

    if (typeof obj === 'string')
      obj = new MemberExpression(obj, key);

    if (obj instanceof MemberExpression)
      return new AssignmentExpression('=', obj, this);
  },
  function set(key, value){
    if (typeof key === 'number' || typeof key === 'string')
      key = new Identifier(key+'');
    var self = new MemberExpression(this, key);
    return new AssignmentExpression('=', self, value);
  },
  function get(key){
    if (typeof key === 'number' || typeof key === 'string')
      key = new Identifier(key+'');
    return new MemberExpression(this, key);
  },
  function call(args){
    return new CallExpression(this, args);
  },
  function declaration(name){
    if (typeof name === 'string')
      this.identity = name;
    else if (name instanceof Identifier)
      this.identity = name.name;

    var decl = new VariableDeclaration;
    decl.declare(this.identity, this);
    return decl;
  },
  function scopedDeclaration(name){
    var scope = new FunctionExpression;
    scope.body.append(this.declaration(name));
    scope.body.append(new ReturnStatement(this.identity));
    var iife = new ImmediatelyInvokedFunctionExpression(scope);
    iife.identity = this.identity;
    return iife;
  }
]);

define(Expression.prototype, {
  get identity(){
    var self = _(this);
    if (!self.identity)
      self.identity = gensym();
    return self.identity;
  },
  set identity(v){
    _(this).identity = v;
  }
});




// #################
// ### Statement ###
// #################

function Statement(type){
  if (type === 'function')
    type = FunctionDeclaration;
  else if (type in Statement)
    type = Statement[type];
  else if (type + 'Statement' in Statement)
    type = Statement[type + 'Statement'];
  else if (type[0].toUpperCase() + type.slice(1) + 'Statement' in Statement)
    type = Statement[type[0].toUpperCase() + type.slice(1) + 'Statement'];

  if (type) {
    var a = arguments;
    return new type(a[1], a[2], a[3], [4], a[5]);
  }
}

inherit(Statement, ASTNode);


// ###################
// ### Declaration ###
// ###################

function Declaration(type){
  if (type === 'var' || type === 'VariableDeclaration' || type == 'Variable')
    return new VariableDeclaration(arguments[1], arguments[2]);
  else
    return new FunctionDeclaration(arguments[1], arguments[2], arguments[3]);
}

inherit(Declaration, Statement);




// ############################
// ### AssignmentExpression ###
// ############################

function AssignmentExpression(operator, left, right){
  this.operator = operator;
  this.left = assertInstance(left, Expression);
  this.right = assertInstance(right, Expression);
  prep(this);
}
nodeTypes.register(AssignmentExpression, Expression, 'assignTo', []);
AssignmentExpression.operators = ['=', '+=', '-=', '*=', '/=', '%=',
                                  '<<=', '>>=', '>>>=', '|=', '^=', '&='];


// #######################
// ### ArrayExpression ###
// #######################

function ArrayExpression(elements){
  this.elements = new ASTArray(elements);
  prep(this);
}
nodeTypes.register(ArrayExpression, Expression, 'array', []);
Mixin.use('arrays', ArrayExpression.prototype, {
  property: 'elements',
  type: [null, Expression]
});


// ######################
// ### BlockStatement ###
// ######################

function BlockStatement(body){
  this.body = new ASTArray;
  body && this.append(body);
  prep(this);
}
define(BlockStatement, [
  function createBlock(from){
    if (from instanceof BlockStatement)
      return from;
    else if (!from || from instanceof ASTArray) {
      var out = new BlockStatement;
      out.body = from;
      prep(out);
      return out;
    } else if (!from || from instanceof Array) {
      return new BlockStatement(from);
    } else {
      var out = new BlockStatement;
      out.append(from);
      return out;
    }
  }
]);
nodeTypes.register(BlockStatement, Statement, 'block', []);
Mixin.use('arrays', BlockStatement.prototype, {
  property: 'body',
  type: [Declaration, Statement]
});


// ########################
// ### BinaryExpression ###
// ########################

function BinaryExpression(operator, left, right){
  this.operator = operator;
  this.left = assertInstance(left, Expression);
  this.right = assertInstance(right, Expression);
  prep(this);
}
nodeTypes.register(BinaryExpression, Expression, 'binary', []);
BinaryExpression.operators = ['==' , '!=', '===', '!==', '<' , '<=' , '>', '>=',
                              '<<', '>>', '>>>', '+' , '-' , '*', '/', '%', '|' ,
                              '^' , 'in', 'instanceof'];



// ######################
// ### BreakStatement ###
// ######################

function BreakStatement(label){
  this.label = label == null ? null : makeIdentifier(label);
  prep(this);
}
nodeTypes.register(BreakStatement, Statement, 'break', []);


// ######################
// ### CallExpression ###
// ######################

function CallExpression(callee, arguments){
  if (callee instanceof FunctionExpression && !(this instanceof ImmediatelyInvokedFunctionExpression))
    return new ImmediatelyInvokedFunctionExpression(callee, arguments)

  this.callee = assertInstance(callee, Expression);
  if (arguments instanceof Array) {
    arguments = arguments.map(function(arg){
      if (!isObject(arg))
        return new Literal(arg);
      else if ('type' in arg)
        return arg;
      else if (typeof arg === 'function')
        return functionAST(arg);
      else
        return new ObjectExpression(arg);
    });
  }
  this.arguments = new ASTArray(arguments);
  prep(this);
}
nodeTypes.register(CallExpression, Expression, 'call', [
  function call(receiver){
    this.receiver = receiver;
    if (_(this).type === 'apply')
      this.callee.property.name = 'call';
    else if (_(this).type !== 'call')
      this.callee = this.callee.get('call');
    return this
  },
  function apply(receiver){
    this.receiver = receiver;
    if (_(this).type === 'call')
      this.callee.property.name = 'apply';
    else if (_(this).type !== 'apply')
      this.callee = this.callee.get('apply');
    prep(this);
    return this;
  }
]);
Mixin.use('arrays', CallExpression.prototype, {
  property: 'arguments',
  type: ASTNode
});
define(CallExpression.prototype, {
  get receiver(){
    return _(this).receiver;
  },
  set receiver(v){
    if (!v || v === 'this')
      v = new ThisExpression;
    else if (!isNode(v))
      v = $(v);

    var self = _(this);
    if ('receiver' in self)
      this.arguments[0] = v;
    else
      this.arguments.unshift(v);
    self.receiver = v;
    prep(this.arguments);
  }
});

// ###################
// ### CatchClause ###
// ###################

function CatchClause(param, body){
  this.param = assertInstance(param, Identifier);
  if (!body || body instanceof Array)
    body = new BlockStatement(body);
  this.body = assertInstance(body, BlockStatement);
  prep(this);
}
nodeTypes.register(CatchClause, ASTNode, 'catch', []);


// #############################
// ### ConditionalExpression ###
// #############################

function ConditionalExpression(test, consequent, alternate){
  this.test = assertInstance(test, Expression);
  this.consequent = assertInstance(consequent, Expression);
  this.alternate = assertInstance(alternate, Expression);
  prep(this);
}
nodeTypes.register(ConditionalExpression, Expression, 'conditional', []);



// #########################
// ### ContinueStatement ###
// #########################

function ContinueStatement(label){
  this.label = label === null ? null : makeIdentifier(label);
  prep(this);
}
nodeTypes.register(ContinueStatement, Statement, 'continue', []);


// ########################
// ### DoWhileStatement ###
// ########################

function DoWhileStatement(test, body){
  this.test = assertInstance(test, Expression);
  if (!body || body instanceof Array)
    body = new BlockStatement(body);
  this.body = assertInstance(body, Statement);
  prep(this);
}
nodeTypes.register(DoWhileStatement, Statement, 'dowhile', []);


// #########################
// ### DebuggerStatement ###
// #########################

function DebuggerStatement(){}
nodeTypes.register(DebuggerStatement, Statement, 'debugger');


// ######################
// ### EmptyStatement ###
// ######################

function EmptyStatement(){}
nodeTypes.register(EmptyStatement, Statement, 'empty');


// ###########################
// ### ExpressionStatement ###
// ###########################

function ExpressionStatement(expression){
  this.expression = assertInstance(expression, Expression);
  prep(this);
}
nodeTypes.register(ExpressionStatement, Statement, 'expression', []);


// ####################
// ### ForStatement ###
// ####################

function ForStatement(init, test, update, body){
  this.init = assertInstance(init, [null, VariableDeclaration, Expression]);
  this.test = assertInstance(test, [null, Expression]);
  this.update = assertInstance(update, [null, Expression]);
  if (!body || body instanceof Array)
    body = new BlockStatement(body);
  this.body = assertInstance(body, Statement);
  prep(this);
}
nodeTypes.register(ForStatement, Statement, 'for', []);



// ######################
// ### ForInStatement ###
// ######################

function ForInStatement(left, right, body){
  this.left = assertInstance(left, [VariableDeclaration, Expression]);
  this.right = assertInstance(right, Expression);
  if (!body || body instanceof Array)
    body = new BlockStatement(body);
  this.body = assertInstance(body, Statement);
  prep(this);
}
nodeTypes.register(ForInStatement, Statement, 'forin', []);


// ###########################
// ### FunctionDeclaration ###
// ###########################

function FunctionDeclaration(id, params, body){ //generator, rest, defaults
  if (id == null)
    return new FunctionExpression(id, params, body);
  if (params instanceof Array)
    params = params.map(makeIdentifier);
  this.params = new ASTArray(params);
  this.id = makeIdentifier(id);
  if (!body || body instanceof Array)
    body = new BlockStatement(body);
  this.body = assertInstance(body, [BlockStatement, Expression]);
  prep(this);
}
nodeTypes.register(FunctionDeclaration, Statement, ['function', 'functiondecl'], [
  function toExpression(){
    var out = Object.create(FunctionExpression.prototype);
    Object.keys(this).forEach(function(key){
      out[key] = this[key];
    }, this);
    out.params = new ASTArray(this.params);
    prep(out);
    return out;
  },
  function toDeclaration(){
    return this.clone();
  }
]);
Mixin.use('functions', FunctionDeclaration.prototype);
Mixin.use('arrays', FunctionDeclaration.prototype, {
  property: 'params',
  type: Identifier
});


// ##########################
// ### FunctionExpression ###
// ##########################

function FunctionExpression(id, params, body){
  FunctionDeclaration.call(this, id || '', params, body);
  if (id == null)
    this.id = null;
  prep(this);
}
nodeTypes.register(FunctionExpression, Expression, ['function', 'functionexpr'], [
  function toDeclaration(){
    var out = Object.create(FunctionDeclaration.prototype);
    Object.keys(this).forEach(function(key){
      out[key] = this[key];
    }, this);
    out.params = new ASTArray(this.params);
    prep(out);
    return out;
  },
  function toStatement(){
    return this.toDeclaration();
  },
  function toExpression(){
    return this.clone();
  }
]);
Mixin.use('functions', FunctionExpression.prototype);
Mixin.use('arrays', FunctionExpression.prototype, {
  property: 'params',
  type: Identifier
});



// ##################
// ### Identifier ###
// ##################

function Identifier(name){
  if (name instanceof Identifier)
    this.name = name.name;
  else
    this.name = name;
  prep(this);
}
nodeTypes.register(Identifier, Expression, 'ident', [
  function isSame(value){
    return this.name === value;
  },
  function isSimilar(value){
    return this.name == value;
  },
  function isDifferent(value){
    return this.name != value;
  },
  function SET(value){
    return new AssignmentExpression('=', this.clone(), value);
  },
  function OR(right){
    return new LogicalExpression('||', this.clone(), right);
  },
  function AND(right){
    return new LogicalExpression('&&', this.clone(), right);
  },
  function IN(right){
    return new BinaryExpression('in', this.clone(), right);
  },
  function keyOf(object){
    return new MemberExpression(object, this.clone(), true);
  },
  function DELETE(from){
    return new UnaryExpression('delete', this.keyOf(object));
  }
]);


// ###################
// ### IfStatement ###
// ###################

function IfStatement(test, consequent, alternate){
  this.test = assertInstance(test, Expression);
  if (!consequent || consequent instanceof Array)
    consequent = new BlockStatement(consequent);
  this.consequent = assertInstance(consequent, Statement);
  this.alternate = assertInstance(alternate, [null, Statement]);
  prep(this);
}
nodeTypes.register(IfStatement, Statement, 'if', []);


// ###############
// ### Literal ###
// ###############

function Literal(value){
  this.value = value;
  prep(this);
}
nodeTypes.register(Literal, Expression, 'literal', [
  function isSame(value){
    return this.value === value;
  },
  function isSimilar(value){
    return this.value == value;
  },
  function isDifferent(value){
    return this.value != value;
  }
]);



// ########################
// ### LabeledStatement ###
// ########################

function LabeledStatement(label, body){
  this.label = makeIdentifier(label);
  if (!body || body instanceof Array)
    body = new BlockStatement(body);
  this.body = assertInstance(body, Statement);
  prep(this);
}
nodeTypes.register(LabeledStatement, Statement, 'labeled', []);


// #########################
// ### LogicalExpression ###
// #########################

function LogicalExpression(operator, left, right){
  this.operator = operator;
  this.left = assertInstance(left, Expression);
  this.right = assertInstance(right, Expression);
  prep(this);
}
nodeTypes.register(LogicalExpression, Expression, 'logical', []);
LogicalExpression.operators = ['&&', '||'];


// ########################
// ### MemberExpression ###
// ########################

function MemberExpression(object, property, computed){
  this.object = assertInstance(object, Expression);
  this.property = assertInstance(property, Expression);
  if (computed == null)
    computed = !(this.property instanceof Literal
              || this.property instanceof Identifier)
              || isFinite(this.property.name);
  this.computed = computed
  prep(this);
}
nodeTypes.register(MemberExpression, Expression, 'member', [
  function assignTo(value){
    return new AssignmentExpression('=', this, value);
  },
  function call(params){
    return new CallExpression(this, params);
  }
]);


// #####################
// ### NewExpression ###
// #####################

function NewExpression(callee, arguments){
  this.callee = assertInstance(callee, Expression);
  this.arguments = new ASTArray;
  if (arguments)
    this.append(arguments);
  prep(this);
}
nodeTypes.register(NewExpression, Expression, 'new', []);
Mixin.use('arrays', NewExpression.prototype, {
  property: 'arguments',
  type: Expression
});

Mixin.create('object', function(o){
  define(o, [
    function set(key, value){
      if (ASTNode.isFunction(key)) {
        value = key;
        key = value.id;
      }

      if (key instanceof Identifier)
        key = key.name;

      if (isObject(key)) {
        var o = key;
        Object.keys(o).forEach(function(key){
          var desc = Object.getOwnPropertyDescriptor(o, key);
          if (desc) {
            if (desc.set) this.append(new Property('set', key, functionAST(desc.set)));
            if (desc.get) this.append(new Property('get', key, functionAST(desc.get)))
            if ('value' in desc) this.set(key, desc.value);
          }
        }, this);
        return this;
      } else if (typeof key === 'string') {
        if (!isObject(value))
          value = new Literal(value);
        else if (typeof value === 'function')
          value = functionAST(value);
        if (value instanceof ASTNode && !(value instanceof Property))
          value = new Property('init', key, value);

        if (value instanceof Property)
          this.append(value)
      }
      return this;
    }
  ]);
});

// ########################
// ### ObjectExpression ###
// ########################

function ObjectExpression(properties){
  this.properties = new ASTArray;
  if (properties instanceof Array)
    this.append(properties);
  else if (isObject(properties))
    this.set(properties);
  prep(this);
}
nodeTypes.register(ObjectExpression, Expression, 'object', [
  function nameMethods(){
    this.forEach(function(prop){
      prop.nameMethod();
    });
    return this;
  },

]);
Mixin.use('object', ObjectExpression.prototype);
Mixin.use('arrays', ObjectExpression.prototype, {
  property: 'properties',
  type: Property
});


// ###############
// ### Program ###
// ###############

function Program(body, comments){
  this.body = new ASTArray;
  if (body instanceof Array)
    this.append(body);
  else
    this.append([body]);
  prep(this);

}
nodeTypes.register(Program, ASTNode, 'program', [
  function hoist(){
    _hoist(this, this);
  }
]);
Mixin.use('arrays', Program.prototype, {
  property: 'body',
  type: Statement
});


// ################
// ### Property ###
// ################

function Property(kind, key, value){
  if (typeof key === 'string')
    this.key = keyNeedsQuotes(key) ? new Literal(key) : new Identifier(key);
  else
    this.key = key;
  if (!isObject(value))
    value = new Literal(value);

  this.value = assertInstance(value, [Expression, Literal]);
  if (!_(this.value).identity)
    this.value.identity = this.key;

  this.kind = typeof kind === 'number' ? Property.kinds[kind] : kind;
  prep(this);
}
nodeTypes.register(Property, ASTNode, 'property', [
  function nameMethod(){
    if (this.kind === 'init' && ASTNode.isFunction(this.value))
      this.value.id = this.key;
    return this;
  },
  function rename(name){
    this.key = new Identifier(name);
    if (this.kind === 'init') {
      if (this.value) {
        if (this.value.id)
          this.value.id = this.key;
        this.value.identity = this.key.name;
      }
    } else {
      this.value.id = this.key;
      this.value.identity = this.key.name;
    }
    return this;
  }
]);
define(Property.prototype, {
  kinds: ['init', 'get', 'set'],
  INIT: 0,
  GET: 1,
  SET: 2
});


// #######################
// ### ReturnStatement ###
// #######################

function ReturnStatement(argument){
  this.argument = assertInstance(argument, [null, Expression]);
  prep(this);
}
nodeTypes.register(ReturnStatement, Statement, 'return', []);



// ##########################
// ### SequenceExpression ###
// ##########################

function SequenceExpression(expressions){
  this.expressions = new ASTArray(expressions);
  prep(this);
}
nodeTypes.register(SequenceExpression, Expression, 'sequence', []);
Mixin.use('arrays', SequenceExpression.prototype, {
  property: 'expressions',
  type: Expression
});


// #######################
// ### SwitchStatement ###
// #######################

function SwitchStatement(descriminant, cases){
  this.descriminant = assertInstance(descriminant, Expression);
  this.cases = new ASTArray(cases);
  prep(this);
}
nodeTypes.register(SwitchStatement, Statement, 'switch', []);
Mixin.use('arrays', SwitchStatement.prototype, {
  property: 'cases',
  type: SwitchCase
});


// ##################
// ### SwitchCase ###
// ##################

function SwitchCase(test, consequent){
  this.test = assertInstance(test, [null, Expression]);
  this.consequent = new ASTArray(consequent);
  prep(this);
}
nodeTypes.register(SwitchCase, ASTNode, 'case', []);
Mixin.use('arrays', SwitchCase.prototype, {
  property: 'cases',
  type: Statement
});



// ######################
// ### ThisExpression ###
// ######################

function ThisExpression(){}
nodeTypes.register(ThisExpression, Expression, 'this');


// ######################
// ### ThrowStatement ###
// ######################

function ThrowStatement(argument){
  this.argument = assertInstance(argument, Expression);
  prep(this);
}
nodeTypes.register(ThrowStatement, Statement, 'throw', []);


// ####################
// ### TryStatement ###
// ####################

function TryStatement(block, handlers, finalizer){
  if (!block || block instanceof Array)
    block = new BlockStatement(block);
  this.block = assertInstance(block, BlockStatement);
  this.handlers = new ASTArray(handlers);
  prep(this);
}
nodeTypes.register(TryStatement, Statement, 'try', []);
Mixin.use('arrays', TryStatement.prototype, {
  property: 'handlers',
  type: CatchClause
});


// #######################
// ### UnaryExpression ###
// #######################

function UnaryExpression(operator, argument, prefix){
  this.operator = operator;
  this.argument = assertInstance(argument, Expression);
  this.prefix = !!prefix;
  prep(this);
}
nodeTypes.register(UnaryExpression, Expression, 'unary', []);
UnaryExpression.operators = ['+', '-', '~', '!', 'typeof', 'void', 'delete'];


// ########################
// ### UpdateExpression ###
// ########################

function UpdateExpression(operator, argument, prefix){
  this.operator = operator;
  this.argument = assertInstance(argument, Expression);
  this.prefix = !!prefix;
  prep(this);
}
nodeTypes.register(UpdateExpression, Expression, 'update', []);
UpdateExpression.operators = ['++', '--'];


// ###########################
// ### VariableDeclaration ###
// ###########################

function VariableDeclaration(kind, declarations){
  if (typeof kind === 'number')
    kind = VariableDeclaration.kinds[kind];
  else if (typeof kind !== 'string') {
    declarations = kind;
    kind = 'var';
  }

  this.kind = kind;
  this.declarations = new ASTArray(declarations);
  prep(this);
}
nodeTypes.register(VariableDeclaration, Declaration, 'var', [
  function declare(vars){
    if (arguments.length > 1) {
      if (typeof arguments[1] !== 'string') {
        var t = vars;
        vars = {};
        vars[t] = arguments[1];
      } else {
        vars = _slice.call(arguments);
      }
    }

    if (vars instanceof Array) {
      for (var i=0; i < vars.length; i++)
        this.append(new VariableDeclarator(vars[i]));
    } else if (isObject(vars)) {
      for (var k in vars) {
        if (vars[k] instanceof ASTNode)
          var item = vars[k]
        else if (vars[k] === undefined)
          var item = null
        else if (!isObject(vars[k]))
          var item = new Literal(vars[k])
        else if (typeof vars[k] === 'function')
          var item = functionAST(vars[k]);
        else if (Object.getPrototypeOf(vars[k]) === Object.prototype)
          var item = new ObjectExpression(vars[k]);
        if (item === null || item instanceof ASTNode)
          this.append(new VariableDeclarator(k, item));
      }
    } else if (typeof vars === 'string') {
      this.append(new VariableDeclarator(vars));
    }
    return this;
  }
]);
define(VariableDeclaration.prototype, {
  kinds: ['var', 'let', 'const'],
  VAR: 0,
  LET: 1,
  CONST: 2
});
Mixin.use('arrays', VariableDeclaration.prototype, {
  property: 'declarations',
  type: VariableDeclarator
});


// ##########################
// ### VariableDeclarator ###
// ##########################

function VariableDeclarator(id, init){
  this.id = makeIdentifier(id);
  this.init = assertInstance(init, [null, Expression]);
  prep(this);
}
nodeTypes.register(VariableDeclarator, ASTNode, 'decl', []);



// ######################
// ### WhileStatement ###
// ######################

function WhileStatement(test, body){
  this.test = assertInstance(test, Expression);
  if (!body || body instanceof Array)
    body = new BlockStatement(body);
  this.body = assertInstance(body, Statement);
  prep(this);
}
nodeTypes.register(WhileStatement, Statement, 'while', []);



// #####################
// ### WithStatement ###
// #####################

function WithStatement(object, body){
  this.object = assertInstance(object, Expression);
  if (!body || body instanceof Array)
    body = new BlockStatement(body);
  this.body = assertInstance(body, Statement);
  prep(this);
}
nodeTypes.register(WithStatement, Statement, 'with', []);




// ############################################
// ### ImmediatelyInvokedFunctionExpression ###
// ############################################

function ImmediatelyInvokedFunctionExpression(func, arguments){
  if (!arguments && func instanceof Array) {
    arguments = func;
    func = null;
  }
  if (!func)
    func = new FunctionExpression;

  CallExpression.call(this, func, arguments);
}
nodeTypes.register(ImmediatelyInvokedFunctionExpression, CallExpression, ['function', 'iife'], [
  function toSource(){
    return '('+CallExpression.prototype.toSource.call(this)+')';
  },
  function prepend(statement){
    this.callee.body.prepend(statement);
    return this;
  },
  function append(statement){
    this.callee.body.append(statement);
    return this;
  },
  function remove(item){
    return this.callee.body.remove(item);
  },
  function pop(){
    return this.callee.body.pop();
  },
  function declare(decls){
    this.callee.declare(decls);
    return this;
  },
  function addArgument(arg){
    if (typeof arg === 'string') {
      arg = new Identifier(arg);
    } else if (!isObject(arg)) {
      arg = new Literal(arg);
      this.callee.params.append(arg.identity);
      this.arguments.append(new Literal(arg));
      return this;
    }
    this.callee.params.append(arg);
    this.arguments.append(arg);
    return this;
  },
  function returns(name){
    this.callee.body.append(new ReturnStatement(name));
    return this;
  }
]);
define(ImmediatelyInvokedFunctionExpression.prototype, {
  type: 'CallExpression',
});


function ArrayPattern(elements){
  if (elements instanceof ASTArray)
    this.elements = elements;
  else if (elements instanceof Array)
    this.elements = new ASTArray(elements);
  else {
    this.elements = new ASTArray;
    if (elements)
      this.append(elements);
  }
  prep(this);
}
nodeTypes.register(ArrayPattern, ASTNode, 'arraypattern', []);
Mixin.use('arrays', ArrayPattern.prototype, {
  property: 'elements'
});




// ###############################
// ### ArrowFunctionExpression ###
// ###############################

function ArrowFunctionExpression(params, body){
  this.params = new ASTArray(params);
  if (!body || body instanceof Array)
    body = new BlockStatement(body);
  this.body = assertInstance(body, [BlockStatement, Expression]);
  prep(this);
}
nodeTypes.register(ArrowFunctionExpression, Expression, ['function', 'arrow'], [
  function toDeclaration(){
    return new FunctionDeclaration(this.identity, this.params, this.body);
  },
  function toExpression(){
    if (!(this.body instanceof BlockStatement)) {
      var body = new BlockStatement;
      body.append(new ReturnStatement(this.body.clone()));

    } else {
      var body = this.body.clone();
    }
    var self = new FunctionExpression(null, this.params, body);
    return self.get('bind').call([new ThisExpression]);
  },
  function desugar(){
    this.replaceWith(this.toExpression());
    return this;
  }
]);

Mixin.use('functions', ArrowFunctionExpression.prototype);
define(ArrowFunctionExpression.prototype, {
  get id(){ return null },
  set id(v){ if (v) this.identity = typeof v === 'string' ? v : v.name }
});





Mixin.create('classes', function(o){
  define(o, {
    get inherits(){
      return _(this).inherits;
    },
    set inherits(v){
      if (typeof v === 'string')
        v = new Identifier(v);
      if (isNode(v)) {
        if (v instanceof Identifier) {
          this.superClass = v;
        } else if (from.matches('class')) {
          this.superClass = from.id;
          _(this).inherits = from;
        }
      }
    }
  });

  define(o, [
    function findConstructor(){
      return this.find('method[key = "constructor"].value:first');
    },
    function findMethods(){
      return this.find('method[kind = ""][key != "constructor"].value');
    },
    function findAccessors(){
      return this.find('method[kind != ""]');
    },
    function generatePrototype(){
      var prototype = new ObjectExpression({ constructor: this.id });
      this.findAccessors().forEach(function(accessor){
        prototype.append(accessor.toProperty());
      });
      this.findMethods().forEach(function(method){
        prototype.set(method);
      });
      return this.id.set('prototype', prototype);
    },
    function desugarSuper(){
      var superclass = this.superClass;
      this.find('member[object=super]').forEach(function(superCall){
        var call = superCall.getParent();
        call.callee = superclass.get('prototype').get(superCall.property);
        call.call();
      });
      this.find('call[callee=super]').forEach(function(superCall){
        superCall.callee = superclass.clone();
        superCall.call();
      });
      return this;
    },
    function toFunction(){
      var self = this.clone(),
          ctor = self.findConstructor();

      ctor.id = self.id || this.identity;

      if (self.superClass)
        self.desugarSuper();

      var closure = ctor.scopedDeclaration();
      var ret = closure.pop();

      if (self.superClass)
        closure.addArgument(self.superClass);

      closure.append(self.generatePrototype());
      closure.append(ret);

      prep(closure.callee);
      if (this instanceof ClassDeclaration) {
        var decl = closure.declaration(ctor.id);
        decl.identity = ctor.id.name;
        return decl;
      } else {
        return closure;
      }
    },
    function desugar(){
      this.replaceWith(this.toFunction());
      return this;
    }
  ]);
});



// #################
// ### ClassBody ###
// #################

function ClassBody(body){
  this.body = new ASTArray(body);
  prep(this);
}
nodeTypes.register(ClassBody, BlockStatement, 'classbody', []);
Mixin.use('arrays', ClassBody.prototype, {
  property: 'body',
  type: MethodDefinition
});


// ########################
// ### ClassDeclaration ###
// ########################

function ClassDeclaration(id, body, superClass){
  this.id = makeIdentifier(id);
  if (!body || body instanceof Array)
    body = new ClassBody(body);
  this.body = assertInstance(body, ClassBody);
  this.superClass = superClass == null ? null : makeIdentifier(superClass);
  prep(this);
}
nodeTypes.register(ClassDeclaration, Declaration, ['class', 'classdecl'], []);
Mixin.use('classes', ClassDeclaration.prototype);




// #######################
// ### ClassExpression ###
// #######################

function ClassExpression(id, body, superClass){
  ClassDeclaration.call(this, id || '', body, superClass);
  if (id == null)
    this.id = null;
  prep(this);
}
nodeTypes.register(ClassExpression, Expression, ['class', 'classexpr'], []);
Mixin.use('classes', ClassExpression.prototype);




// ########################
// ### MethodDefinition ###
// ########################

function MethodDefinition(key, value, kind){
  if (ASTNode.isFunction(key)) {
    kind = value;
    value = key;
    key = value.id;
  }
  this.key = makeIdentifier(key || '');
  this.value = assertInstance(value, [FunctionDeclaration, FunctionExpression]);
  this.kind = typeof kind === 'number' ? MethodDefinition.kinds[kind] : kind || '';
  if (this.value.id == null)
    this.value.id = this.key;
  prep(this);
}
nodeTypes.register(MethodDefinition, ASTNode, 'method', [
  function toProperty(){
    return new Property(this.kind || 'get', this.key.clone(), this.value.clone());
  }
]);

define(MethodDefinition, {
  kinds: ['', 'get', 'set'],
  METHOD: 0,
  GET: 1,
  SET: 2
});




// #####################
// ### ClassHeritage ###
// #####################

function ClassHeritage(){console.log(arguments)}
nodeTypes.register(ClassHeritage, ASTNode, 'heritage', []);




// #########################
// ### ExportDeclaration ###
// #########################

function ExportDeclaration(declaration){
  this.declaration = assertInstance(declaration, Declaration);
  prep(this);
}
nodeTypes.register(ExportDeclaration, Declaration, 'export', [
  function desugar(){
    var decl = this.declaration.declarations[0];
    var exports = $('exports').set(decl.id, decl.init.clone());
    decl.init.replaceWith(exports);
    return this.replaceWith(this.declaration);
  }
]);



// #######################
// ### ExportSpecifier ###
// #######################

function ExportSpecifier(id, from){
  this.id = makeIdentifier(id);
  this.from = assertInstance(from, [null, Literal, Path]);
  prep(this);
}
nodeTypes.register(ExportSpecifier, ASTNode, 'exportspec', []);




// ##########################
// ### ExportSpecifierSet ###
// ##########################

function ExportSpecifierSet(specifiers){
  this.specifiers = new ASTArray;
  if (specifiers)
    this.append(specifiers);
  this.from = from;
  prep(this);
}
nodeTypes.register(ExportSpecifierSet, ASTNode, 'exportspecs', []);
Mixin.use('arrays', ExportSpecifierSet.prototype, {
  property: 'specifiers',
  type: ExportSpecifier
});



// ######################
// ### ForOfStatement ###
// ######################

function ForOfStatement(left, right, body){
  this.left = assertInstance(left, [VariableDeclaration, Expression]);
  this.right = assertInstance(right, Expression);
  if (!body || body instanceof Array)
    body = new BlockStatement(body);
  this.body = assertInstance(body, Statement);
  prep(this);
}
nodeTypes.register(ForOfStatement, Statement, 'forof', []);



// ############
// ### Glob ###
// ############

function Glob(){}
nodeTypes.register(Glob, ASTNode, 'glob', []);




// #########################
// ### ImportDeclaration ###
// #########################

function ImportDeclaration(specifiers, from){
  this.specifiers = new ASTArray;
  if (specifiers)
    this.append(specifiers);
  this.from = from;
  prep(this);
}
nodeTypes.register(ImportDeclaration, Declaration, 'import', []);
Mixin.use('arrays', ImportDeclaration.prototype, {
  property: 'specifiers'
});




// #######################
// ### ImportSpecifier ###
// #######################

function ImportSpecifier(id, from){
  this.id = makeIdentifier(id);
  this.from = assertInstance(from, [null, Literal, Path]);
  prep(this);
}
nodeTypes.register(ImportSpecifier, ASTNode, 'importspec', []);



// #########################
// ### ModuleDeclaration ###
// #########################

function ModuleDeclaration(id, body){
  this.id = makeIdentifier(id);
  this.body = BlockStatement.createBlock(body);
  prep(this);
}
nodeTypes.register(ModuleDeclaration, Declaration, 'module', [
  function desugar(){
    this.find('export').forEach(function(item){
      item.desugar();
    });
    var closure = new FunctionExpression(null, ['global', 'exports'], this.body);
    var args = [$('#this'), $('#this'), parse('typeof exports === "undefined" ? {} : exports')];
    closure.returns('exports');
    return this.replaceWith(freeze.call(closure.get('call').call(args)).declaration(this.id));
  }
]);




// #####################
// ### ObjectPattern ###
// #####################

function ObjectPattern(properties){
  this.properties = new ASTArray;
  if (properties instanceof Array)
    this.append(properties);
  else if (isObject(properties))
    this.set(properties);
  prep(this);
}
nodeTypes.register(ObjectPattern, ASTNode, 'objectpattern', []);
Mixin.use('object', ObjectPattern.prototype);
Mixin.use('arrays', ObjectPattern.prototype, {
  property: 'properties',
  type: Property
});




// ############
// ### Path ###
// ############

function Path(body){
  this.body = BlockStatement.createBlock(body);
  prep(this);
}
nodeTypes.register(Path, ASTNode, 'path', []);
Mixin.use('arrays', Path.prototype, {
  property: 'body'
});




// ####################
// ### QuasiElement ###
// ####################

function QuasiElement(value, tail){
  this.value = typeof value === 'string' ? { raw: value, cooked: value } : value;
  this.tail = !!tail;
  prep(this);
}
nodeTypes.register(QuasiElement, ASTNode, 'quasielement', []);



// ####################
// ### QuasiLiteral ###
// ####################

function QuasiLiteral(quasis, expressions){
  if (quasis instanceof Array) {
    this.quasis = new ASTArray(quasis.map(function(item, i){
      if (typeof item === 'string')
        return new QuasiElement(item, i === quasis.length - 1);
      else if (item instanceof QuasiElement)
        return item;
      else if (item && item.value)
        return new QuasiElement(item.value, i === quasis.length - 1);
    }));
  }
  this.quasis = quasis instanceof ASTArray ? quasis : new ASTArray(quasis);
  this.expressions = new ASTArray(expressions).map(function(expr){
    return new Identifier(expr.name);
  });
  prep(this);
}
nodeTypes.register(QuasiLiteral, Expression, ['quasi', 'quasiliteral'], [
  function toFunction(tag){
    var components = new ArrayExpression,
        params = new ASTArray(this.expressions);


    for (var i=0; i < this.quasis.length; i++) {
      components.append(freeze.call(new ObjectExpression(this.quasis[i].value)));
    }

    var identity = $(this.identity);
    params.unshift(identity.OR(identity.SET(freeze.call(components))));
    this.parentScope().parentScope().declare(this.identity);
    return (tag || QUASI).clone().call(params);
  },
  function desugar(tag){
    this.replaceWith(this.toFunction(tag));
    return this;
  }
]);

var freeze = $('Object').get('freeze');


var QUASI = functionAST(function(r){
  for (var i = arguments.length - 1, o=''; o += r[--i].raw + arguments[i+1];);
  return o;
});


function TaggedQuasiExpression(tag, quasi){
  this.tag = makeIdentifier(tag);
  this.quasi = assertInstance(quasi, QuasiLiteral);
  prep(this);
}

nodeTypes.register(TaggedQuasiExpression, Expression, ['quasi', 'taggedquasi'], [
  function desugar(){
    this.replaceWith(this.quasi.toFunction(this.tag));
    return this;
  }
]);




// #######################
// ### YieldExpression ###
// #######################

function YieldExpression(argument, delegate){
  this.argument = argument;
  this.delegate = !!delegate;
}
nodeTypes.register(YieldExpression, Expression, 'yield', []);



var compileSelector = require('./compile-selector')
