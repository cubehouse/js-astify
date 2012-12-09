var Visitor       = require('./Visitor'),
    ASTNode       = require('./ASTNode'),
    ASTArray      = require('./ASTArray'),
    ResultArray   = require('./ASTArray').ResultArray,
    isNode        = require('./ASTNode').isNode,
    create        = require('./ASTNode').createNode,
    toIdent       = require('./ASTNode').toIdent,
    Mixin         = require('./utility').Mixin,
    createStorage = require('./utility').createStorage,
    isObject      = require('./utility').isObject,
    define        = require('./utility').define,
    inherit       = require('./utility').inherit,
    parent        = require('./utility').parent,
    unparent      = require('./utility').unparent,
    gensym        = require('./utility').gensym;

var inspect = require('util').inspect;

var _push    = [].push,
    _unshift = [].unshift,
    _slice   = [].slice,
    _pop     = [].pop,
    _shift   = [].shift;


var _ = createStorage()



module.exports = ASTNode;

function assertInstance(o, types){
  var err;
  if (typeof o === 'string' || typeof o === 'number' && isFinite(o))
    o = toIdent(o+'');

  if (!isNode(o) && isObject(o) && o.hasOwnProperty('type'))
    o = ASTNode.fromJSON(o);

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


function isValidIdentifier(string) {
  return /^[a-zA-Z_\$][a-zA-Z0-9_\$]*$/.test(string);
}

function keyNeedsQuotes(key){
  return !/^[a-zA-Z0-9_\$]+$/.test(key);
}



function prep(o){
  Object.keys(o).forEach(function(key){
    parent(o[key], o);
  });
}





Mixin.create('traversal', [
  function previousSibling(){
    var parent = this.parent;
    if (parent instanceof Array) {
      return parent[parent.indexOf(this) - 1];
    } else if (parent instanceof ASTNode) {
      var last;
      for (var k in parent) {
        if (parent[k] === this)
          return last;
        last = parent[k];
      }
    }
  },
  function nextSibling(){
    var parent = this.parent;
    if (parent instanceof Array) {
      return parent[parent.indexOf(this) + 1];
    } else if (parent instanceof ASTNode) {
      var next;
      for (var k in parent) {
        if (next)
          return parent[k];
        else if (parent[k] === this)
          next = true;
      }
    }
  },
]);

Mixin.use('traversal', ASTNode);
Mixin.use('traversal', ASTArray);




Mixin.create('object', function(o){
  define(o, [
    function set(key, value){
      if (isNode(key)) {
        if (key.matches('function')) {
          value = key;
          key = value.id;
          return this.append(create('#property', 'init', toIdent(key), value.clone()));
        } else if (key.matches('ident')) {
          key = key.name;
        }
      }

      if (isObject(key)) {
        var o = key;
        Object.keys(o).forEach(function(key){
          var desc = Object.getOwnPropertyDescriptor(o, key);
          if (desc) {
            if (desc.set) this.append(create('#property', 'set', key, ASTNode.parse(desc.set)));
            if (desc.get) this.append(create('#property', 'get', key, ASTNode.parse(desc.get)))
            if ('value' in desc) this.set(key, desc.value);
          }
        }, this);
        return this;
      } else if (typeof key === 'string') {
        if (!isObject(value))
          value = create('#literal', value);
        else if (typeof value === 'function')
          value = ASTNode.parse(value);
        if (value instanceof ASTNode && !(value instanceof Property))
          value = create('#property', 'init', key, value.clone());

        if (value instanceof Property)
          this.append(value.clone())
      }
      return this;
    }
  ]);
});



Mixin.create('scopes', [
  function hoist(){
    var decls = create('#var'),
        seen = {},
        to = this.matches('program') ? this : this.body;

    this.visit(function(node, parent){
      if (node.matches('function'))
        return Visitor.CONTINUE;

      if (node.matches('var')) {
        var leftover = node.declarations.filter(function(decl){
          if (decl.id.name in seen)
            return true;
          decls.append(decl);
          seen[decl.id.name] = true;
        });
        parent.remove(node);
        return Visitor.CONTINUE;
      }
      return Visitor.RECURSE;
    });

    if (decls.declarations.length)
      to.prepend(decls);

    return this;
  }
]);



Mixin.create('functions', function(o){
  Mixin.use('scopes', o);
  define(o, [
    function declare(vars){
      if (arguments.length > 1)
        vars = new ResultArray(_slice.call(arguments));

      var decl = this.find('var')[0];
      if (!decl) {
        decl = create('#var', 'var');
        this.body.prepend(decl);
      }
      decl.declare(vars);
      return this;
    },
    function call(args){
      return create('#call', this.clone(), args.clone());
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
      var nodes = new ResultArray;
      this.visit(function(node, parent){
        if (node.matches('function'))
          return Visitor.CONTINUE;

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
      var decl = create('#var');
      decl.declare(name, this instanceof Expression ? this.clone() : this.toExpression());
      return decl;
    },
    function scopedDeclaration(name){
      var decl = name || !this.id ? this.declaration(name) : this.toDeclaration();
      var scope = create('#functionexpr');
      scope.body.append(decl);
      scope.body.append(create('#return', toIdent(decl.id)));
      var iife = create('#iife', scope);
      iife.identity = this.identity;
      return iife;
    },
    function returns(expr){
      this.body.append(parent(create('#return', isNode(expr) ? expr.clone() : expr), this.body));
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
      (items instanceof Array ? items : [items]).forEach(function(item){
        this[prop].append(parent(checkType(item), this[prop]));
      }, this);
      return this;
    },
    function prepend(items){
      (items instanceof Array ? items : [items]).forEach(function(item){
        this[prop].prepend(parent(checkType(item), this[prop]));
      }, this);
      return this;
    },
    function empty(){
      while (this[prop].length)
        unparent(this[prop].pop());
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
      var out = new ResultArray;
      for (var i=0; i < this[prop].length; i++)
        if (callback.call(this, this[prop][i], i, this[prop]))
          out.push[this[prop][i]];

      return out;
    },
  ]);
});

Mixin.create('idents', function(o){
  define(o, [
    function isSame(value){
      return this.name === value;
    },
    function isSimilar(value){
      return this.name == value;
    },
    function isDifferent(value){
      return this.name != value;
    },
    function declare(value){
      return create('#decl', this, value);
    },
    function SET(value){
      return create('#assign', '=', this.clone(), value.clone());
    },
    function OR(right){
      return create('#logical', '||', this.clone(), right.clone());
    },
    function AND(right){
      return create('#logical', '&&', this.clone(), right.clone());
    },
    function IN(right){
      return create('#binary', 'in', this.clone(), right.clone());
    },
    function keyOf(object){
      return create('#member', object.clone(), this.clone(), true);
    },
    function DELETE(from){
      return create('#unary', 'delete', this.keyOf(object));
    }
  ]);
})

Mixin.create('classes', function(o){
  define(o, {
    get inherits(){
      return _(this).inherits;
    },
    set inherits(v){
      if (typeof v === 'string')
        v = toIdent(v);
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
      return this.find('method[kind = ""][key != "constructor"]');
    },
    function findAccessors(){
      return this.find('method[kind != ""]');
    },
  ]);
});




// ##################
// ### Expression ###
// ##################

function Expression(tags, properties){
  tags.push('expr');
  return ASTNode.call(this, tags, properties);
}

inherit(Expression, ASTNode, [
  function toStatement(){
    return new ExpressionStatement(this.clone());
  },
  function assignTo(obj, key){
    if (key == null) {
      return this.declaration(obj);
    }
    if (typeof key === 'number' || typeof key === 'string')
      key = toIdent(key+'');

    if (typeof obj === 'string')
      obj = create('#member', obj, key);

    if (obj instanceof MemberExpression)
      return create('#assign', '=', obj.clone(), this.clone());
  },
  function set(key, value){
    if (arguments.length === 1) {
      if (isNode(key))
        key = key.clone();
      return create('#assign', '=', this.clone(), key);
    }

    if (!isObject(value))
      value = create('#literal', value);
    else if (isNode(value))
      value = value.clone();

    return create('#assign', '=', create('#member', this.clone(), toIdent(key)), value);
  },
  function get(key){
    return create('#member', this.clone(), typeof key === 'number' ? key : toIdent(key));
  },
  function call(args){
    if (Array.isArray(args))
      args = new ASTArray(args);

    if (isNode(args))
      args = args.clone();

    return create('#call', this.clone(), args);
  },
  function declaration(name){
    if (typeof name === 'string')
      this.identity = name;
    else if (name instanceof Identifier)
      this.identity = name.name;

    var decl = create('#var');
    decl.declare(this.identity, this.clone());
    return decl;
  },
  function scopedDeclaration(name){
    var scope = create('#functionexpr');
    scope.body.append(this.declaration(name));
    scope.body.append(create('#return', this.identity));
    var iife = create('#iife', scope);
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

function Statement(tags, properties){
  tags.push('statement');
  return ASTNode.call(this, tags, properties);
}
inherit(Statement, ASTNode);


// ###################
// ### Declaration ###
// ###################

function Declaration(tags, properties){
  tags.push('declaration');
  return ASTNode.call(this, tags, properties);
}
inherit(Declaration, Statement);



// ###############
// ### Pattern ###
// ###############

function Pattern(tags, properties){
  tags.push('pattern');
  return ASTNode.call(this, tags, properties);
}
inherit(Pattern, ASTNode);


// ############################
// ### AssignmentExpression ###
// ############################

var AssignmentExpression = new Expression(['assign'], [
  function AssignmentExpression(operator, left, right){
    this.operator = operator;
    this.left = assertInstance(left, [Expression, Pattern]);
    this.right = assertInstance(right, Expression);
    prep(this);
  },
]);


// #######################
// ### ArrayExpression ###
// #######################

var ArrayExpression = new Expression(['array'], [
  function ArrayExpression(elements){
    this.elements = new ASTArray;
    elements && this.append(elements);
    prep(this);
  },
]);

Mixin.use('arrays', ArrayExpression.prototype, {
  property: 'elements',
  type: [null, Expression, SpreadElement]
});


// ######################
// ### BlockStatement ###
// ######################

var BlockStatement = new Statement(['block'], [
  function BlockStatement(body){
    this.body = new ASTArray;
    body && this.append(body);
    prep(this);
  },
]);

Mixin.use('arrays', BlockStatement.prototype, {
  property: 'body',
  type: [Declaration, Statement]
});


// ########################
// ### BinaryExpression ###
// ########################

var BinaryExpression = new Expression(['binary'], [
  function BinaryExpression(operator, left, right){
    this.operator = operator;
    this.left = assertInstance(left, Expression);
    this.right = assertInstance(right, Expression);
    prep(this);
  },
]);


// ######################
// ### BreakStatement ###
// ######################

var BreakStatement = new Statement(['break'], [
  function BreakStatement(label){
    this.label = label == null ? null : toIdent(label);
    prep(this);
  },
]);


// ######################
// ### CallExpression ###
// ######################

var CallExpression = new Expression(['call'], [
  function CallExpression(callee, arguments){
    this.callee = assertInstance(callee, Expression);
    if (arguments instanceof Array) {
      arguments = arguments.map(function(arg){
        if (isNode(arg))
          return arg;
        else if (!isObject(arg))
          return create('#literal', arg);
        else if ('type' in arg)
          return arg;
        else
          return create('#object', arg);
      });
    }
    this.arguments = new ASTArray;
    arguments && this.append(arguments);
    prep(this);
  },
  function call(receiver){
    var self = _(this);
    this.receiver = receiver;
    if (self.type === 'apply')
      this.callee.property.name = 'call';
    else if (self.type !== 'call')
      this.callee = this.callee.get('call');
    return this
  },
  function apply(receiver){
    var self = _(this);
    this.receiver = receiver;
    if (self.type === 'call')
      this.callee.property.name = 'apply';
    else if (self.type !== 'apply')
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
      v = create('#this');
    else if (!isNode(v))
      v = create(v);

    var self = _(this);
    parent(v, this.arguments);
    if ('receiver' in self)
      this.arguments[0] = v;
    else
      this.arguments.unshift(v);
    self.receiver = v;
  }
});

// ###################
// ### CatchClause ###
// ###################

var CatchClause = new ASTNode(['catch'], [
  function CatchClause(param, body){
    this.param = assertInstance(param, Identifier);
    if (!body || body instanceof Array)
      body = create('#block', body);
    this.body = assertInstance(body, BlockStatement);
    prep(this);
  }
]);


// #############################
// ### ConditionalExpression ###
// #############################

var ConditionalExpression = new Expression(['conditional'], [
  function ConditionalExpression(test, consequent, alternate){
    this.test = assertInstance(test, Expression);
    this.consequent = assertInstance(consequent, Expression);
    this.alternate = assertInstance(alternate, Expression);
    prep(this);
  }
]);


// #########################
// ### ContinueStatement ###
// #########################

var ContinueStatement = new Statement(['continue'], [
  function ContinueStatement(label){
    this.label = label === null ? null : toIdent(label);
    prep(this);
  }
]);


// ########################
// ### DoWhileStatement ###
// ########################

var DoWhileStatement = new Statement(['dowhile'], [
  function DoWhileStatement(test, body){
    this.test = assertInstance(test, Expression);
    if (!body || body instanceof Array)
      body = create('#block', body);
    this.body = assertInstance(body, Statement);
    prep(this);
  }
]);


// #########################
// ### DebuggerStatement ###
// #########################

var DebuggerStatement = new Statement(['debugger'], [
  function DebuggerStatement(){}
]);


// ######################
// ### EmptyStatement ###
// ######################

var EmptyStatement = new Statement(['empty'], [
  function EmptyStatement(){}
]);


// ###########################
// ### ExpressionStatement ###
// ###########################

var ExpressionStatement = new Statement(['expression'], [
  function ExpressionStatement(expression){
    this.expression = assertInstance(expression, Expression);
    prep(this);
  }
]);


// ####################
// ### ForStatement ###
// ####################

var ForStatement = new Statement(['for'], [
  function ForStatement(init, test, update, body){
    this.init = assertInstance(init, [null, VariableDeclaration, Expression]);
    this.test = assertInstance(test, [null, Expression]);
    this.update = assertInstance(update, [null, Expression]);
    if (!body || body instanceof Array)
      body = create('#block', body);
    this.body = assertInstance(body, Statement);
    prep(this);
  }
]);



// ######################
// ### ForInStatement ###
// ######################

var ForInStatement = new Statement(['forin'], [
  function ForInStatement(left, right, body){
    this.left = assertInstance(left, [VariableDeclaration, Expression]);
    this.right = assertInstance(right, Expression);
    if (!body || body instanceof Array)
      body = create('#block', body);
    this.body = assertInstance(body, Statement);
    prep(this);
  }
]);


// ###########################
// ### FunctionDeclaration ###
// ###########################

var FunctionDeclaration = new Declaration(['function', 'functiondecl'], [
  function FunctionDeclaration(id, params, body, rest, defaults, generator){
    if (id == null)
      return create('#functionexpr', id, params, body);
    if (params instanceof Array)
      params = params.map(toIdent);
    this.params = new ASTArray;
    params && this.append(params);
    this.id = toIdent(id);
    if (!(body instanceof BlockStatement))
      body = create('#block', body);
    this.body = assertInstance(body, [BlockStatement, Expression]);
    this.rest = assertInstance(rest, [null, Identifier, ArrayPattern]);
    this.defaults = defaults || new ASTArray;
    this.generator = !!generator;
    prep(this);
  },
  function toExpression(){
    var out = this.clone();
    out.__proto__ = FunctionExpression.prototype;
    return out;
  },
  function toDeclaration(){
    return this.clone();
  }
]);

Mixin.use('functions', FunctionDeclaration.prototype);
Mixin.use('arrays', FunctionDeclaration.prototype, {
  property: 'params'
});


// ##########################
// ### FunctionExpression ###
// ##########################

var FunctionExpression = new Expression(['function', 'functionexpr'], [
  function FunctionExpression(id, params, body, rest, defaults, generator){
    FunctionDeclaration.call(this, id || '', params, body, rest, defaults, generator);
    if (id == null)
      this.id = null;
    prep(this);
  },
  function toDeclaration(){
    var out = this.clone();
    out.__proto__ = FunctionDeclaration.prototype;
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
  property: 'params'
});



// ##################
// ### Identifier ###
// ##################

var Identifier = new Expression(['ident'], [
  function Identifier(name){
    this.name = name instanceof Identifier ? name.name : name;
  }
]);

Mixin.use('idents', Identifier.prototype);

// ###################
// ### IfStatement ###
// ###################

var IfStatement = new Statement(['if'], [
  function IfStatement(test, consequent, alternate){
    this.test = assertInstance(test, Expression);
    if (!consequent || consequent instanceof Array)
      consequent = create('#block', consequent);
    this.consequent = assertInstance(consequent, Statement);
    this.alternate = assertInstance(alternate, [null, Statement]);
    prep(this);
  }
]);


// ###############
// ### Literal ###
// ###############

var Literal = new Expression(['literal'], [
  function Literal(value){
    this.value = value;
    prep(this);
  },
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

var LabeledStatement = new Statement(['label'], [
  function LabeledStatement(label, body){
    this.label = toIdent(label);
    if (!body || body instanceof Array)
      body = create('#block', body);
    this.body = assertInstance(body, Statement);
    prep(this);
  }
]);

// #########################
// ### LogicalExpression ###
// #########################

var LogicalExpression = new Expression(['logical'], [
  function LogicalExpression(operator, left, right){
    this.operator = operator;
    this.left = assertInstance(left, Expression);
    this.right = assertInstance(right, Expression);
    prep(this);
  }
]);


// ########################
// ### MemberExpression ###
// ########################

var MemberExpression = new Expression(['member'], [
  function MemberExpression(object, property, computed){
    this.object = assertInstance(object, Expression);
    this.property = assertInstance(property, Expression);
    if (computed == null)
      computed = !(this.property instanceof Literal
                || this.property instanceof Identifier
                || this.property instanceof AtSymbol)
                || isFinite(this.property.name);
    this.computed = !!computed
    prep(this);
  },
  function assignTo(value){
    return create('#assign', '=', this,  isNode(value) ? value.clone() : value);
  },
  function call(params){
    return create('#call', this, isNode(params) ? params.clone() : params);
  }
]);


// #####################
// ### NewExpression ###
// #####################

var NewExpression = new Expression(['new'], [
  function NewExpression(callee, arguments){
    this.callee = assertInstance(callee, Expression);
    this.arguments = new ASTArray;
    if (arguments)
      this.append(arguments);
    prep(this);
  }
]);

Mixin.use('arrays', NewExpression.prototype, {
  property: 'arguments',
  type: Expression
});

// ########################
// ### ObjectExpression ###
// ########################

var ObjectExpression = new Expression(['object'], [
  function ObjectExpression(properties){
    this.properties = new ASTArray;
    if (properties instanceof Array)
      this.append(properties);
    else if (isObject(properties))
      this.set(properties);
    prep(this);
  },
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

var Program = new ASTNode(['program'], [
  function Program(body, comments){
    this.body = new ASTArray;
    this.append(body);
    prep(this);
  }
]);

Mixin.use('scopes', Program.prototype);
Mixin.use('arrays', Program.prototype, {
  property: 'body',
  type: Statement
});


// ################
// ### Property ###
// ################

var Property = new ASTNode(['property'], [
  function Property(kind, key, value, method){
    if (typeof key === 'string')
      this.key = keyNeedsQuotes(key) ? create('#literal', key) : toIdent(key);
    else
      this.key = key;
    if (!isObject(value))
      value = create('#literal', value);

    this.value = assertInstance(value, [Expression, Literal]);
    if (!_(this.value).identity)
      this.value.identity = this.key;

    this.kind = typeof kind === 'number' ? Property.kinds[kind] : kind;
    this.method = !!method;
    prep(this);
  },
  function nameMethod(){
    if (this.kind === 'init' && isNode(this.value) && this.value.matches('function'))
      this.value.id = this.key;
    return this;
  },
  function rename(name){
    this.key = toIdent(name);
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

var ReturnStatement = new Statement(['return'], [
  function ReturnStatement(argument){
    this.argument = assertInstance(argument, [null, Expression]);
    prep(this);
  }
]);



// ##########################
// ### SequenceExpression ###
// ##########################

var SequenceExpression = new Expression(['comma'], [
  function SequenceExpression(expressions){
    this.expressions = new ASTArray
    expressions && this.append(expressions);
    prep(this);
  }
]);

Mixin.use('arrays', SequenceExpression.prototype, {
  property: 'expressions',
  type: Expression
});



// #######################
// ### SwitchStatement ###
// #######################

var SwitchStatement = new Statement(['switch'], [
  function SwitchStatement(discriminant, cases){
    this.discriminant = assertInstance(discriminant, Expression);
    this.cases = new ASTArray;
    cases && this.append(cases);
    prep(this);
  }
]);

Mixin.use('arrays', SwitchStatement.prototype, {
  property: 'cases',
  type: SwitchCase
});


// ##################
// ### SwitchCase ###
// ##################

var SwitchCase = new ASTNode(['switch'], [
  function SwitchCase(test, consequent){
    this.test = assertInstance(test, [null, Expression]);
    this.consequent = new ASTArray;
    consequent && this.append(consequent);
    prep(this);
  }
]);

Mixin.use('arrays', SwitchCase.prototype, {
  property: 'consequent',
  type: Statement
});



// ######################
// ### ThisExpression ###
// ######################

var ThisExpression = new Expression(['this'], [
  function ThisExpression(){}
]);


// ######################
// ### ThrowStatement ###
// ######################

var ThrowStatement = new Statement(['throw'], [
  function ThrowStatement(argument){
    this.argument = assertInstance(argument, Expression);
    prep(this);
  }
]);


// ####################
// ### TryStatement ###
// ####################

var TryStatement = new Statement(['try'], [
  function TryStatement(block, handlers, finalizer){
    if (!block || block instanceof Array)
      block = create('#block', block);
    this.block = assertInstance(block, BlockStatement);
    this.handlers = new ASTArray;
    handlers && this.append(handlers);
    prep(this);
    this.finalizer = assertInstance(finalizer, [null, BlockStatement]);
  }
]);

Mixin.use('arrays', TryStatement.prototype, {
  property: 'handlers',
  type: CatchClause
});


// #######################
// ### UnaryExpression ###
// #######################

var UnaryExpression = new Expression(['unary'], [
  function UnaryExpression(operator, argument){
    this.operator = operator;
    this.argument = assertInstance(argument, Expression);
    prep(this);
  }
]);

// ########################
// ### UpdateExpression ###
// ########################

var UpdateExpression = new Expression(['update'], [
  function UpdateExpression(operator, argument, prefix){
    this.operator = operator;
    this.argument = assertInstance(argument, Expression);
    this.prefix = !!prefix;
    prep(this);
  }
]);

// ###########################
// ### VariableDeclaration ###
// ###########################

var VariableDeclaration = new Declaration(['var'], [
  function VariableDeclaration(kind, declarations){
    if (typeof kind === 'number')
      kind = VariableDeclaration.kinds[kind];
    else if (typeof kind !== 'string') {
      declarations = kind;
      kind = 'var';
    }

    this.kind = kind;
    this.declarations = new ASTArray;
    declarations && this.append(declarations);
    prep(this);
  },
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
          var item = vars[k].clone();
        else if (vars[k] === undefined)
          var item = null
        else if (!isObject(vars[k]))
          var item = create('#literal', vars[k])
        else if (typeof vars[k] === 'function')
          var item = ASTNode.parse(vars[k]);
        else if (Object.getPrototypeOf(vars[k]) === Object.prototype)
          var item = create('#object', vars[k]);
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


// #########################
// ### SymbolDeclaration ###
// #########################

var SymbolDeclaration = new Declaration(['symbol'], [
  function SymbolDeclaration(kind, declarations){
    if (typeof kind === 'number')
      kind = SymbolDeclaration.kinds[kind];
    else if (typeof kind !== 'string') {
      declarations = kind;
      kind = 'symbol';
    }

    this.kind = kind;
    this.declarations = new ASTArray;
    declarations && this.append(declarations);
    prep(this);
  },
  function declare(name){
    if (typeof name === 'string') {
      this.append(new SymbolDeclarator(new AtSymbol(name)));
    } else if (name instanceof SymbolDeclarator) {
      this.append(name);
    }
  }
]);

define(SymbolDeclaration.prototype, {
  kinds: ['symbol', 'private'],
  SYMBOL: 0,
  PRIVATE: 1
});

Mixin.use('arrays', SymbolDeclaration.prototype, {
  property: 'declarations',
  type: SymbolDeclarator
});




// ##########################
// ### VariableDeclarator ###
// ##########################

var VariableDeclarator = new ASTNode(['decl'], [
  function VariableDeclarator(id, init){
    this.id = typeof id === 'string' ? toIdent(id) : id;
    this.init = assertInstance(init, [null, Expression]);
    prep(this);
  }
]);



// ##########################
// ### VariableDeclarator ###
// ##########################

var SymbolDeclarator = new ASTNode(['symboldecl'], [
  function SymbolDeclarator(id, init){
    this.id = typeof id === 'string' ? toIdent(id) : id;
    this.init = assertInstance(init, [null, Expression]);
    prep(this);
  }
]);



// ######################
// ### WhileStatement ###
// ######################

var WhileStatement = new Statement(['while'], [
  function WhileStatement(test, body){
    this.test = assertInstance(test, Expression);
    if (!body || body instanceof Array)
      body = create('#block', body);
    this.body = assertInstance(body, Statement);
    prep(this);
  }
]);



// #####################
// ### WithStatement ###
// #####################

var WithStatement = new Statement(['with'], [
  function WithStatement(object, body){
    this.object = assertInstance(object, Expression);
    if (!body || body instanceof Array)
      body = create('#block', body);
    this.body = assertInstance(body, Statement);
    prep(this);
  }
]);




// ############################################
// ### ImmediatelyInvokedFunctionExpression ###
// ############################################

var ImmediatelyInvokedFunctionExpression = new Expression(['function', 'iife'], [
  function ImmediatelyInvokedFunctionExpression(func, arguments){
    if (!arguments && func instanceof Array) {
      arguments = func;
      func = null;
    }
    if (!func)
      func = create('#functionexpr');

    CallExpression.call(this, func, arguments, null);
  },
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
    return unparent(this.callee.body.pop());
  },
  function declare(decls){
    this.callee.declare(decls);
    return this;
  },
  function addParam(param){
    if (typeof param === 'string')
      param = toIdent(param);
    this.callee.append(param.clone());
    return this;
  },
  function addArgument(arg, value){
    if (typeof arg === 'string')
      arg = toIdent(arg);

    if (!isObject(arg)) {
      value = create('#literal', arg);
      arg = create(value.identity);
    } else if (!(1 in arguments))
      value = arg.clone();
    else if (typeof value === 'string')
      value = toIdent(value);
    else if (!isObject(value))
      value = create('#literal', value);

    this.arguments.append(value.clone());
    this.callee.append(arg.clone());
    return this;
  },
  function returns(name){
    this.callee.body.append(create('#return', isNode(name) ? name.clone() : name));
    return this;
  }
]);

define(ImmediatelyInvokedFunctionExpression.prototype, {
  type: 'CallExpression',
});



var AtSymbol = new Expression(['at'], [
  function AtSymbol(name){
    this.name = (name && name.name ? name.name : name);
    prep(this);
  }
]);


Mixin.use('idents', AtSymbol.prototype);


var ArrayPattern = new Pattern(['arraypattern'], [
  function ArrayPattern(elements){
    this.elements = new ASTArray;
    elements && this.append(elements);
    prep(this);
  }
]);

Mixin.use('arrays', ArrayPattern.prototype, {
  property: 'elements'
});




// ###############################
// ### ArrowFunctionExpression ###
// ###############################

var ArrowFunctionExpression = new Expression(['function', 'arrow'], [
  function ArrowFunctionExpression(params, body, rest, defaults, generator){
    if (!body || body instanceof Array)
      body = create('#block', body);
    this.params = new ASTArray;
    this.body = assertInstance(body, [BlockStatement, Expression]);
    this.rest = assertInstance(rest, [null, Identifier, ArrayPattern]);
    this.append(params);
    this.defaults = defaults || new ASTArray;
    this.generator = !!generator;
    prep(this);
  }
]);

Mixin.use('functions', ArrowFunctionExpression.prototype);
Mixin.use('arrays', ArrowFunctionExpression.prototype, {
  property: 'params'
});

define(ArrowFunctionExpression.prototype, {
  get toIdent(){ return null },
  set toIdent(v){ if (v) this.identity = typeof v === 'string' ? v : v.name }
});





// #################
// ### ClassBody ###
// #################

var ClassBody = new Statement(['classbody'], [
  function ClassBody(body){
    this.body = new ASTArray;
    body && this.append(body);
    prep(this);
  }
]);

Mixin.use('arrays', ClassBody.prototype, {
  property: 'body',
  type: MethodDefinition
});


// ########################
// ### ClassDeclaration ###
// ########################

var ClassDeclaration = new Declaration(['class', 'classdecl'], [
  function ClassDeclaration(id, body, superClass){
    this.id = toIdent(id);
    if (!body)
      body = new ClassBody;
    this.body = assertInstance(body, ClassBody);
    this.superClass = superClass == null ? null : toIdent(superClass);
    prep(this);
  }
]);

Mixin.use('classes', ClassDeclaration.prototype);




// #######################
// ### ClassExpression ###
// #######################

var ClassExpression = new Expression(['class', 'classexpr'], [
  function ClassExpression(id, body, superClass){
    ClassDeclaration.call(this, id || '', body, superClass);
    if (id == null)
      this.id = null;
    prep(this);
  }
]);

Mixin.use('classes', ClassExpression.prototype);




// #######################
// ### SpreadElement ###
// #######################

var SpreadElement = new Expression(['spread'], [
  function SpreadElement(argument){
    this.argument = assertInstance(argument, Expression);
  }
]);


// ########################
// ### MethodDefinition ###
// ########################

var MethodDefinition = new ASTNode(['method'], [
  function MethodDefinition(key, value, kind){
    if (isNode(key) && key.matches('function')) {
      kind = value;
      value = key;
      key = value.id;
    }
    this.key = toIdent(key || '');
    this.value = assertInstance(value, FunctionExpression);
    this.kind = kind || '';
    prep(this);
  }
]);

define(MethodDefinition, {
  kinds: ['', 'get', 'set'],
  METHOD: 0,
  GET: 1,
  SET: 2
});



// #########################
// ### ModuleDeclaration ###
// #########################

var ModuleDeclaration = new Declaration(['module'], [
  function ModuleDeclaration(id, body, from){
    this.id = toIdent(id);
    if (body) {
      body = create('#block', body);
      this.body = assertInstance(body, BlockStatement);
      this.from = null
    } else if (from) {
      this.body = null;
      this.from = assertInstance(from, [Literal, Path]);
    }
    prep(this);
  }
]);

Mixin.use('arrays', ModuleDeclaration.prototype, {
  property: 'body',
  type: Statement
});


// #####################
// ### ClassHeritage ###
// #####################

var ClassHeritage = new ASTNode(['heritage'], [
  function ClassHeritage(){console.log(arguments)}
]);




// #########################
// ### ExportDeclaration ###
// #########################

var ExportDeclaration = new Declaration(['export'], [
  function ExportDeclaration(declaration){
    this.declaration = assertInstance(declaration, Declaration);
    prep(this);
  }
]);



// #######################
// ### ExportSpecifier ###
// #######################

var ExportSpecifier = new ASTNode(['exportspec'], [
  function ExportSpecifier(id, from){
    this.id = toIdent(id);
    this.from = assertInstance(from, [null, Literal, Path]);
    prep(this);
  }
]);




// ##########################
// ### ExportSpecifierSet ###
// ##########################

var ExportSpecifierSet = new ASTNode(['exportspecs'], [
  function ExportSpecifierSet(specifiers){
    this.specifiers = new ASTArray;
    specifiers && this.append(specifiers);
    this.from = from;
    prep(this);
  }
]);

Mixin.use('arrays', ExportSpecifierSet.prototype, {
  property: 'specifiers',
  type: ExportSpecifier
});



// ######################
// ### ForOfStatement ###
// ######################

var ForOfStatement = new Statement(['forof'], [
  function ForOfStatement(left, right, body){
    this.left = assertInstance(left, [VariableDeclaration, Expression]);
    this.right = assertInstance(right, Expression);
    if (!body || body instanceof Array)
      body = create('#block', body);
    this.body = assertInstance(body, Statement);
    prep(this);
  }
]);



// ############
// ### Glob ###
// ############

var Glob = new ASTNode(['glob'], [
  function Glob(){}
]);




// #########################
// ### ImportDeclaration ###
// #########################

var ImportDeclaration = new Declaration(['import'], [
  function ImportDeclaration(specifiers, from){
    this.specifiers = new ASTArray;
    specifiers && this.append(specifiers);
    this.from = from;
    prep(this);
  }
]);

Mixin.use('arrays', ImportDeclaration.prototype, {
  property: 'specifiers'
});




// #######################
// ### ImportSpecifier ###
// #######################

var ImportSpecifier = new ASTNode(['importspec'], [
  function ImportSpecifier(id, from){
    this.id = toIdent(id);
    this.from = assertInstance(from, [null, Literal, Path]);
    prep(this);
  }
]);



// #########################
// ### ModuleDeclaration ###
// #########################

var ModuleDeclaration = new Declaration(['module'], [
  function ModuleDeclaration(id, body, from){
    this.id = toIdent(id);
    if (body) {
      this.body = assertInstance(body, [BlockStatement, Expression]);
      this.from = null;
    } else if (from) {
      this.body = null;
      this.from = assertInstance(from, Path);
    } else {
      this.body = create('#block', body);
      this.from = null;
    }
    prep(this);
  }
]);




// #####################
// ### ObjectPattern ###
// #####################

var ObjectPattern = new Pattern(['objectpattern'], [
  function ObjectPattern(properties){
    this.properties = new ASTArray;
    if (properties instanceof Array)
      this.append(properties);
    else if (isObject(properties))
      this.set(properties);
    prep(this);
  }
]);

Mixin.use('object', ObjectPattern.prototype);
Mixin.use('arrays', ObjectPattern.prototype, {
  property: 'properties',
  type: Property
});




// ############
// ### Path ###
// ############

var Path = new ASTNode(['path'], [
  function Path(body){
    this.body = new ASTArray;
    body && this.append(body);
    prep(this);
  }
]);

Mixin.use('arrays', Path.prototype, {
  property: 'body'
});




// #######################
// ### TemplateElement ###
// #######################

var TemplateElement = new ASTNode(['templateelement'], [
  function TemplateElement(value, tail){
    this.value = typeof value === 'string' ? { raw: value, cooked: value } : value;
    this.tail = !!tail;
    prep(this);
  }
]);



// #######################
// ### TemplateLiteral ###
// #######################

var TemplateLiteral = new Expression(['template', 'templateliteral'], [
  function TemplateLiteral(quasis, expressions){
    if (quasis instanceof Array) {
      quasis = new ASTArray(quasis.map(function(item, i){
        if (typeof item === 'string')
          return new TemplateElement(item, i === quasis.length - 1);
        else if (item instanceof TemplateElement)
          return item;
        else if (item && item.value)
          return new TemplateElement(item.value, i === quasis.length - 1);
      }));
    }
    this.quasis = quasis instanceof ASTArray ? quasis : new ASTArray(quasis);
    this.expressions = new ASTArray(expressions);
    prep(this.expressions);
    prep(this.quasis);
  }
]);



// ################################
// ### TaggedTemplateExpression ###
// ################################

var TaggedTemplateExpression = new Expression(['template', 'taggedtemplate'], [
  function TaggedTemplateExpression(tag, quasi){
    this.tag = toIdent(tag);
    this.quasi = assertInstance(quasi, TemplateLiteral);
    prep(this);
  }
]);


// #######################
// ### YieldExpression ###
// #######################

var YieldExpression = new Expression(['yield'], [
  function YieldExpression(argument, delegate){
    this.argument = argument;
    this.delegate = !!delegate;
  }
]);



AssignmentExpression.operators = ['=','*=','/=','%=','+=','-=','<<=','>>=','>>>=','&=','^=','|='];
BinaryExpression.operators     = ['+','-','/','*','%','^','&','|','>>', '<<', '>>>', '===',
                                   '==', '>', '<', '!==', '!=', '>=', '<=', 'in', 'delete', 'instanceof' ]
LogicalExpression.operators    = [ '||', '&&' ];
UnaryExpression.operators      = [ '!', '~', '+', '-', 'void', 'typeof' ];
UpdateExpression.operators     = [ '++', '--', '_++', '_--', '++_', '--_' ]



var freeze = create('Object').get('freeze');
var QUASI = ASTNode.parse(function(r){
  for (var i=0, o=''; r[i]; o += r[i].raw + (++i === r.length ? '' : arguments[i]));
  return o;
});


var compileSelector = require('./compile-selector');
