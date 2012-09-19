var esprima = require('esprima'),
    escodegen = require('escodegen');

var Visitor       = require('./Visitor'),
    AST           = require('./AST'),
    Registry      = require('./utility').Registry,
    options       = require('./options'),
    Mixin         = require('./utility').Mixin,
    createStorage = require('./utility').createStorage,
    isObject      = require('./utility').isObject,
    define        = require('./utility').define,
    inherit       = require('./utility').inherit,
    gensym        = require('./utility').gensym;

var _push = [].push,
    _unshift = [].unshift,
    _slice = [].slice;

var _ = createStorage();


module.exports = ASTNode;




function assertInstance(o, types){
  var err;
  if (typeof o === 'string')
    o = new Identifier(o);

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
      return vars;
    },
    function hoist(){
      _hoist(this, this.body);
    },
    function call(args){
      return new CallExpression(this, args);
    },
    function matches(filter){
      if (ASTNode.prototype.matches.call(this, filter))
        return true;
      if (filter === 'function')
        return true;
      return false;
    },
    function visitLocal(visitor){
      return this.visit(function(node, parent){
        if (node instanceof FunctionDeclaration || node instanceof FunctionExpression)
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
        return this;

      if (!name) name = this.id ? this.id.name : this.identity;
      var decl = new VariableDeclaration;
      decl.declare(name, this instanceof Expression ? this : this.toExpression());
      return decl;
    },
    function scopedDeclaration(name){
      var decl = this.declaration(name),
          id = decl instanceof FunctionDeclaration ? decl.id : decl.first().id,
          scope = new FunctionExpression;

      scope.body.append(decl);
      scope.body.append(new ReturnStatement(id));
      var iife = new ImmediatelyInvokedFunctionExpression(scope);
      iife.identity = this.identity;
      return iife;
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
      items = [].concat(items).map(checkType);
      _push.apply(this[prop], items);
      return this;
    },
    function prepend(items){
      items = [].concat(items).map(checkType);
      _unshift.apply(this[prop], items);
      return this;
    },
    function insert(index, items){
      items = [].concat(items).map(checkType);
      this[prop].splice(index, items.length, item);
      return this;
    },
    function empty(){
      this[prop].length = 0;
      return this;
    },
    function pop(){
      return this[prop].pop();
    },
    function shift(){
      return this[prop].shift();
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
        if (callback.call(context, this[prop][i], i, this[prop]))
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




function makeIdentifier(o){
  if (typeof o === 'string')
    return new Identifier(o);
  else if (o instanceof Literal)
    return new Identifier(o.value);
  else
    return assertInstance(o, Identifier);
}



function _hoist(from, to){
  var decls = new VariableDeclaration;
  var seen = {};

  from.visit(function(node, parent){
    if (node instanceof FunctionDeclaration || node instanceof FunctionExpression)
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


function Location(loc, range){
  this.startColumn = loc.start.column;
  this.startLine = loc.start.line;
  this.endColumn = loc.end.column;
  this.endLine = loc.end.line;
  this.rangeStart = range[0];
  this.rangeEnd = range[1];
}



// ################
// ### ASTArray ###
// ################

function ASTArray(array){
  this.length = 0;
  this.push.apply(this, array);
}

inherit(ASTArray, Array, [
  Array.prototype.push,
  Array.prototype.pop,
  Array.prototype.forEach,
  Array.prototype.map,
  Array.prototype.filter,
  Array.prototype.concat,
  Array.prototype.reduce,
  Array.prototype.every,
  Array.prototype.some,
  Array.prototype.indexOf,
  Array.prototype.splice,
  function remove(item){
    var index = this.indexOf(item);
    if (~index) {
      this.splice(index, 1);
    }
    return this;
  },
  function clone(){
    var out = Object.create(Object.getPrototypeOf(this));
    Object.keys(this).forEach(function(key){
      out[key] = this[key] instanceof ASTNode || this[key] instanceof ASTArray ? this[key].clone() : this[key];
    }, this);
    return out;
  }
]);








// ###############
// ### ASTNode ###
// ###############

function ASTNode(json){
  if (!json) return
  nodeTypes.lookup(json.type).fromJSON(json);

  if (json.loc) {
    define(json, 'location', new Location(json.loc, json.range));
    delete json.loc;
    delete json.range;
  }

  if ('rest' in json) {
    delete json.rest;
    delete json.generator;
    delete json.expression;
    delete json.defaults;
  }

  for (var k in json) {
    if (json[k]) {
      if (json[k].type)
        ASTNode(json[k]);
      else if (json[k] instanceof Array) {
        json[k].__proto__ = ASTArray.prototype;
        json[k].forEach(function(item){
          if (item.type)
            ASTNode(item);
        });
      }
    }
  }

  return json;
}


var nodeTypes = ASTNode.nodeTypes = new Registry;

nodeTypes.on('register', function(name, Ctor, args){
  var Super = args[0],
      props = args[1];
  inherit(Ctor, Super, props);
  define(Ctor.prototype, { type: name });
  define(Ctor, [
    function fromJSON(json){
      json.__proto__ = Ctor.prototype;
      delete json.type;
      return json;
    }
  ]);
});


define(ASTNode, [
  function isFunction(o){
    return o instanceof FunctionExpression || o instanceof FunctionDeclaration;
  },
  function createNode(type){
    var Ctor = nodeTypes.lookup(type);
    if (Ctor)
      return new Ctor(arguments[1], arguments[2], arguments[3], arguments[4], arguments[5]);
  }
]);


define(ASTNode.prototype, [
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
    return new Visitor(this, callback).next();
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
      if (!callback.apply(this, arguments) === Visitor.BREAK)
        return Visitor.RECURSE;
    });
  },
  function remove(child){
    for (var k in this) {
      if (this[k] === child) {
        this[k] = null;
        return k;
      }
    }
  },
  function matches(filter){
    if (typeof filter === 'string') {
      if (filter.toLowerCase() === this.type.toLowerCase())
        return true;
    }
    if (typeof filter === 'function') {
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
  }
]);



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
  function declaration(name){
    if (name)
      this.identity = name;
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
}
nodeTypes.register(AssignmentExpression, Expression, []);
AssignmentExpression.operators = ['=', '+=', '-=', '*=', '/=', '%=',
                                  '<<=', '>>=', '>>>=', '|=', '^=', '&='];


// #######################
// ### ArrayExpression ###
// #######################

function ArrayExpression(elements){
  this.elements = new ASTArray(elements);
}
nodeTypes.register(ArrayExpression, Expression, []);
Mixin.use('arrays', ArrayExpression.prototype, {
  property: 'elements',
  type: [null, Expression]
});


// ######################
// ### BlockStatement ###
// ######################

function BlockStatement(body){
  this.body = new ASTArray(body);
}
nodeTypes.register(BlockStatement, Statement, []);
Mixin.use('arrays', BlockStatement.prototype, {
  property: 'body',
  type: Statement
});


// ########################
// ### BinaryExpression ###
// ########################

function BinaryExpression(operator, left, right){
  this.operator = operator;
  this.left = assertInstance(left, Expression);
  this.right = assertInstance(right, Expression);
}
nodeTypes.register(BinaryExpression, Expression, []);
BinaryExpression.operators = ['==' , '!=', '===', '!==', '<' , '<=' , '>', '>=',
                              '<<', '>>', '>>>', '+' , '-' , '*', '/', '%', '|' ,
                              '^' , 'in', 'instanceof'];



// ######################
// ### BreakStatement ###
// ######################

function BreakStatement(label){
  this.label = label == null ? null : makeIdentifier(label);
}
nodeTypes.register(BreakStatement, Statement, []);


// ######################
// ### CallExpression ###
// ######################

function CallExpression(callee, args){
  if (callee instanceof FunctionExpression && !(this instanceof ImmediatelyInvokedFunctionExpression))
    return new ImmediatelyInvokedFunctionExpression(callee, args)

  this.callee = assertInstance(callee, Expression);
  this.arguments = new ASTArray(args);
}
nodeTypes.register(CallExpression, Expression, []);
Mixin.use('arrays', CallExpression.prototype, {
  property: 'arguments',
  type: ASTNode
});

// ###################
// ### CatchClause ###
// ###################

function CatchClause(param, body){
  this.param = assertInstance(param, Identifier);
  this.body = assertInstance(body, BlockStatement);
}
nodeTypes.register(CatchClause, ASTNode, []);


// #############################
// ### ConditionalExpression ###
// #############################

function ConditionalExpression(test, consequent, alternate){
  this.test = assertInstance(test, Expression);
  this.consequent = assertInstance(consequent, Expression);
  this.alternate = assertInstance(alternate, Expression);
}
nodeTypes.register(ConditionalExpression, Expression, []);



// #########################
// ### ContinueStatement ###
// #########################

function ContinueStatement(label){
  this.label = label === null ? null : makeIdentifier(label);
}
nodeTypes.register(ContinueStatement, Statement, []);


// ########################
// ### DoWhileStatement ###
// ########################

function DoWhileStatement(test, body){
  this.test = assertInstance(test, Expression);
  this.body = assertInstance(body, Statement);
}
nodeTypes.register(DoWhileStatement, Statement, []);


// #########################
// ### DebuggerStatement ###
// #########################

function DebuggerStatement(){}
nodeTypes.register(DebuggerStatement, Statement);


// ######################
// ### EmptyStatement ###
// ######################

function EmptyStatement(){}
nodeTypes.register(EmptyStatement, Statement);


// ###########################
// ### ExpressionStatement ###
// ###########################

function ExpressionStatement(expression){
  this.expression = assertInstance(expression, Expression);
}
nodeTypes.register(ExpressionStatement, Statement, []);


// ####################
// ### ForStatement ###
// ####################

function ForStatement(init, test, update, body){
  this.init = assertInstance(init, [null, VariableDeclaration, Expression]);
  this.test = assertInstance(test, [null, Expression]);
  this.update = assertInstance(update, [null, Expression]);
  this.body = assertInstance(body, Statement);
}
nodeTypes.register(ForStatement, Statement, []);



// ######################
// ### ForInStatement ###
// ######################

function ForInStatement(left, right, body){
  this.body = assertInstance(body, Statement);
  this.left = assertInstance(left, [VariableDeclaration, Expression]);
  this.right = assertInstance(right, Expression);
}
nodeTypes.register(ForInStatement, Statement, []);


// ###########################
// ### FunctionDeclaration ###
// ###########################

function FunctionDeclaration(id, body, params){ //generator, rest, defaults
  this.params = new ASTArray(params);
  this.id = makeIdentifier(id);
  if (body instanceof Array || !body)
    body = new BlockStatement(body);
  this.body = assertInstance(body, [BlockStatement, Expression]);;
}
nodeTypes.register(FunctionDeclaration, Statement, [
  function toExpression(){
    var out = Object.create(FunctionExpression.prototype);
    Object.keys(this).forEach(function(key){
      out[key] = this[key];
    }, this);
    out.params = new ASTArray(this.params);
    return out;
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

function FunctionExpression(id, body, params){
  FunctionDeclaration.call(this, id || '', body, params);
  if (id == null)
    this.id = null;
}
nodeTypes.register(FunctionExpression, Expression, [
  function toDeclaration(){
    var out = Object.create(FunctionExpression.prototype);
    Object.keys(this).forEach(function(key){
      out[key] = this[key];
    }, this);
    out.params = new ASTArray(this.params);
    return out;
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
    return name;
  this.name = name;
}
nodeTypes.register(Identifier, Expression, []);


// ###################
// ### IfStatement ###
// ###################

function IfStatement(test, consequent, alternate){
  this.test = assertInstance(test, Expression);
  this.consequent = assertInstance(consequent, Statement);
  this.alternate = assertInstance(alternate, [null, Statement]);
}
nodeTypes.register(IfStatement, Statement, []);


// ###############
// ### Literal ###
// ###############

function Literal(value){
  this.value = value;
}
nodeTypes.register(Literal, Expression, []);



// ########################
// ### LabeledStatement ###
// ########################

function LabeledStatement(label, body){
  this.label = makeIdentifier(label);
  this.body = assertInstance(body, Statement);
}
nodeTypes.register(LabeledStatement, Statement, []);


// #########################
// ### LogicalExpression ###
// #########################

function LogicalExpression(operator, left, right){
  this.operator = operator;
  this.left = assertInstance(left, Expression);
  this.right = assertInstance(right, Expression);
}
nodeTypes.register(LogicalExpression, Expression, []);
LogicalExpression.operators = ['&&', '||'];


// ########################
// ### MemberExpression ###
// ########################

function MemberExpression(object, property){
  this.object = assertInstance(object, Expression);
  this.property = assertInstance(property, Expression);
  this.computed = !(this.property instanceof Literal || this.property instanceof Identifier);
}
nodeTypes.register(MemberExpression, Expression, [
  function assign(value){
    return new AssignmentExpression('=', this, value);
  }
]);


// #####################
// ### NewExpression ###
// #####################

function NewExpression(callee, args){
  this.callee = assertInstance(callee, Expression);
  this.arguments = new ASTArray;
  if (args)
    this.append(args);
}
nodeTypes.register(NewExpression, Expression, []);
Mixin.use('arrays', NewExpression.prototype, {
  property: 'arguments',
  type: Expression
});


// ########################
// ### ObjectExpression ###
// ########################

function ObjectExpression(properties){
  this.properties = new ASTArray;
  if (properties)
    this.append(properties);
}
nodeTypes.register(ObjectExpression, Expression, [
  function nameMethods(){
    this.forEach(function(prop){
      prop.nameMethod();
    });
    return this;
  }
]);
Mixin.use('arrays', ObjectExpression.prototype, {
  property: 'properties',
  type: Property
});


// ###############
// ### Program ###
// ###############

function Program(body, comments){
  this.body = new ASTArray;
  body && this.append(body);
}
nodeTypes.register(Program, ASTNode, [
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
  this.key = makeIdentifier(key);
  if (!isObject(value))
    value = new Literal(value);

  this.value = assertInstance(value, [Expression, Literal]);
  if (!_(this.value).identity)
    this.value.identity = this.key;

  this.kind = typeof kind === 'number' ? Property.kinds[kind] : kind;
  if (this.kind !== 'init')
    this.value.body.body.__proto__ = ASTArray.prototype;
}
nodeTypes.register(Property, ASTNode, [
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
}
nodeTypes.register(ReturnStatement, Statement, []);



// ##########################
// ### SequenceExpression ###
// ##########################

function SequenceExpression(expressions){
  this.expressions = new ASTArray(expressions);
}
nodeTypes.register(SequenceExpression, Expression, []);
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
}
nodeTypes.register(SwitchStatement, Statement, []);
Mixin.use('arrays', SwitchStatement.prototype, {
  property: 'cases',
  type: SwitchCase
});


// ##################
// ### SwitchCase ###
// ##################

function SwitchCase(test, consequent){
  this.test = assertInstance(test, [null, Expression]);
  this.consequent = new ASTArray;
  if (consequent)
    this.append(consequent);
}
nodeTypes.register(SwitchCase, ASTNode, []);
Mixin.use('arrays', SwitchCase.prototype, {
  property: 'cases',
  type: Statement
});



// ######################
// ### ThisExpression ###
// ######################

function ThisExpression(){}
nodeTypes.register(ThisExpression, Expression);


// ######################
// ### ThrowStatement ###
// ######################

function ThrowStatement(argument){
  this.argument = assertInstance(argument, Expression);
}
nodeTypes.register(ThrowStatement, Statement, []);


// ####################
// ### TryStatement ###
// ####################

function TryStatement(block, handlers, finalizer){
  this.block = assertInstance(block, BlockStatement);
  this.handlers = new ASTArray(handlers);
}
nodeTypes.register(TryStatement, Statement, []);
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
}
nodeTypes.register(UnaryExpression, Expression, []);
UnaryExpression.operators = ['+', '-', '~', '!', 'typeof', 'void', 'delete'];


// ########################
// ### UpdateExpression ###
// ########################

function UpdateExpression(operator, argument, prefix){
  this.operator = operator;
  this.argument = assertInstance(argument, Expression);
  this.prefix = !!prefix;
}
nodeTypes.register(UpdateExpression, Expression, []);
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
}
nodeTypes.register(VariableDeclaration, Declaration, [
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
      for (var k in vars)
        this.append(new VariableDeclarator(k, vars[k]));
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
}
nodeTypes.register(VariableDeclarator, ASTNode, []);



// ######################
// ### WhileStatement ###
// ######################

function WhileStatement(test, body){
  this.test = assertInstance(test, Expression);
  this.body = assertInstance(body, Statement);
}
nodeTypes.register(WhileStatement, Statement, []);



// #####################
// ### WithStatement ###
// #####################

function WithStatement(object, body){
  this.object = assertInstance(object, Expression);
  this.body = assertInstance(body, Statement);
}
nodeTypes.register(WithStatement, Statement, []);




// ############################################
// ### ImmediatelyInvokedFunctionExpression ###
// ############################################

function ImmediatelyInvokedFunctionExpression(func, args){
  if (!args && func instanceof Array) {
    args = func;
    func = null;
  }
  if (!func)
    func = new FunctionExpression;

  CallExpression.call(this, func, args);
}
nodeTypes.register(ImmediatelyInvokedFunctionExpression, CallExpression, [
  function toSource(){
    return '('+CallExpression.prototype.toSource.call(this)+')';
  }
]);
define(ImmediatelyInvokedFunctionExpression.prototype, {
  type: 'CallExpression',
});



