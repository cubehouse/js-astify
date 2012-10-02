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


var _ = createStorage()




function Location(loc, range){
  this.startColumn = loc.start.column;
  this.startLine = loc.start.line;
  this.endColumn = loc.end.column;
  this.endLine = loc.end.line;
  this.rangeStart = range[0];
  this.rangeEnd = range[1];
}




function jsonToAST(item){
  if (item instanceof Array) {
    return ASTArray.fromJSON(item);
  } else if (item && item.type) {
    var Type = lookup(item.type);
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

function isValidIdentifier(string) {
  return /^[a-zA-Z_\$][a-zA-Z0-9_\$]*$/.test(string);
}

function keyNeedsQuotes(key){
  return !/^[a-zA-Z0-9_\$]+$/.test(key);
}

var nullDesc = { configurable: true, enumerable: false, writable: true, value: null }
var parentDesc = { configurable: true, enumerable: false, writable: true, value: null }

function parent(o, p){
  if (isNode(o) && isNode(p)) {
    parentDesc.value = p;
    Object.defineProperty(o, 'parent', parentDesc);
  }
  return o;
}

function unparent(o){
  if (isNode(o))
    Object.defineProperty(o, 'parent', nullDesc);
  return o;
}

function prep(o){
  Object.keys(o).forEach(function(key){
    parent(o[key], o);
  });
}

function parse(s){
  if (typeof s === 'function')
    s = ('('+s+')').replace('[native code]', '');
  var result =  esprima.parse(s, {
    loc: false,
    range: false,
    raw: false,
    tokens: false,
    comment: false,
  });
  if (result.body[0].expression)
    return jsonToAST(result.body[0].expression);
  else
    return jsonToAST(result.body);
}

function isNode(o){
  return o instanceof ASTNode || o instanceof ASTArray;
}

function matches(subject, filter){
  return isNode(subject) && subject.matches(filter);
}


var $ = createNode;
function createNode(type){
  if (type instanceof ASTNode)
    return type.clone();

  if (typeof type === 'string') {
    var a = arguments;
    if (type[0] === '#') {
      var Type = lookup(type.slice(1));
      if (Type)
        return new Type(a[1], a[2], a[3], a[4], a[5]);
    }
    if (type[0] === '.')
      return new Literal(type.slice(1));

    return id(type)
  }
  else if (isObject(type))
    return $('#object', type);
  else
    return $('#literal', type);
}


function lookup(query){
  if (typeof query === 'function')
    query = query.name;

  if (typeof query === 'string') {
    if (query in ASTNode.types)
      return ASTNode.types[query];
    else if (query in ASTNode.tags)
      return ASTNode.tags[query][0];
  }
}


function id(o){
  if (typeof o === 'string')
    return new Identifier(o);
  else if (o instanceof Literal)
    return new Identifier(o.value);
  else if (o instanceof Identifier)
    return new Identifier(o.name);
  else
    return new Identifier('');
}


function assertInstance(o, types){
  var err;
  if (typeof o === 'string' || typeof o === 'number' && isFinite(o))
    o = id(o+'');

  if (!isNode(o) && isObject(o) && o.hasOwnProperty('type'))
    o = jsonToAST(o);

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




function params(fn){
  var src = fn+'';
  return src.slice(src.indexOf('(') + 1, src.indexOf(')')).split(/\s*,\s*/).filter(Boolean);
}


module.exports = ASTNode;

// ###############
// ### ASTNode ###
// ###############

function ASTNode(tags, properties){
  var Ctor = properties.shift();
  ASTNode.types[Ctor.name] = Ctor;
  Ctor.prototype = this;

  define(Ctor, {
    fields: params(Ctor),
    fromJSON: fromJSON
  });

  define(this, {
    constructor: Ctor,
    type: Ctor.name,
    tags: tags = [].concat(tags)
  });

  define(this, properties);

  tags.forEach(function(tag){
    if (!(tag in ASTNode.tags))
      ASTNode.tags[tag] = [];
    ASTNode.tags[tag].push(Ctor);
  });

  return Ctor;
}

define(ASTNode, {
  fromJSON: jsonToAST,
  types: {},
  tags: {},
});


define(ASTNode, [
  isNode,
  matches,
  id,
  createNode,
  ASTArray,
  parse,
  gensym,
  lookup,
  function createArray(init){
    return new ASTArray(init);
  }
]);

var sourceLocations = new WeakMap;


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
  function insertBefore(o, child){
    return this;
  },
  function insertAfter(o, child){
    return this;
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
    return false;
  },
  function forEach(callback, context){
    context = context || this;
    Object.keys(this).forEach(function(k){
      callback.call(context, this[k], k, this)
    }, this);
    return this;
  },
  function find(selector){
    var filter = compileSelector(selector),
        result = filter(this);
    return result instanceof Array ? new ResultArray(result) : result;
  },
  function matches(filter){
    if (typeof filter === 'string') {
      var tags = ASTNode.tags[filter];
      if (tags) {
        for (var i=0; i < tags.length; i++)
          if (this instanceof tags[i])
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
      if (isNode(this[key])) {
        out[key] = this[key].clone();
        parent(out[key], out);
      } else {
        out[key] = this[key];
      }
    }, this);
    return out;
  },
  function replaceWith(replacement) {
    if (this.parent) {
      for (var k in this.parent) {
        if (this.parent[k] === this) {
          this.parent[k] = replacement;
          parent(replacement, this.parent);
          return unparent(this);
        }
      }
    }
    console.log('replaceWith failed for '+this.type);
  },
  function parents(){
    var out = new ResultArray,
        parent = this.parent;

    while (parent) {
      out.push(parent);
      parent = parent.parent;
    }
    return out;
  },
  function nearest(filter){
    var parent = this.parent;
    while (parent) {
      if (parent.matches(filter))
        return parent;
      parent = parent.parent;
    }
  },
  function parentScope(allowProgramScope){
    var parent = this.parent;
    while (parent) {
      if (parent.matches('function') || allowProgramScope && parent instanceof Program)
        return parent;
      parent = parent.parent;
    }
  },
  function topScope(){
    var scope = this.parentScope(false),
        last;
    while (scope) {
      last = scope;
      scope = scope.parentScope(false);
    }
    return last;
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
    if (isNode(item) && !item.parent)
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
    var out = new ResultArray;
    context = context || this;
    for (var i=0; i < this.length; i++)
      out.push(callback.call(context, this[i], i, this));
    return out;
  },
  function prepend(o){
    this.unshift(parent(o, this));
    return this;
  },
  function append(o){
    this.push(parent(o, this));
    return this;
  },
  function insert(o, index){
    this.splice(index, 0, parent(o, this));
    return this;
  },
  function insertBefore(o, child){
    var index = this.indexOf(child);
    if (~index)
      this.insert(o, index);
    return this;
  },
  function insertAfter(o, child){
    var index = this.indexOf(child);
    if (~index)
      this.insert(o, index + 1);
    return this;
  },
  function remove(item){
    var index = this.indexOf(item);
    if (~index) {
      if (isNode(item) && item.parent === this)
        unparent(item);
      this.splice(index, 1);
    }
    return this;
  },
  function clone(){
    var out = new ASTArray;
    this.forEach(function(item){
      out.append(isNode(item) ? item.clone() : item);
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
    return new ResultArray(filter(this));
  },
  function filter(test, context){
    context = context || this;
    if (typeof test !== 'function') {
      var match = test;
      test = function(node){
        return node.matches(match);
      };
    }
    var out = new ResultArray;
    for (var i=0; i < this.length; i++)
      test.call(context, this[i], i, this) && out.push(this[i]);
    return out;
  },
  function matches(){
    return false;
  },
  function first(){
    for (var i=0; i < this.length; i++)
      if (isNode(this[i]))
        return this[i];
  },
  function last(){
    for (var i=this.length - 1; i > -1; i--)
      if (isNode(this[i]))
        return this[i];
  },
]);



function ResultArray(array){
  var i = this.length = array ? array.length : 0;
  while (i--)
    this[i] = array[i];
}

inherit(ResultArray, ASTArray, [
  function parent(){
    return this.map(function(node){
      return node.parent || node;
    });
  },
  function prepend(o){
    this.forEach(function(node){
      node.prepend && node.prepend(o.clone());
    });
    return this;
  },
  function append(o){
    this.forEach(function(node){
      isNode(node) && node.append(o.clone());
    });
    return this;
  },
  function clone(){
    return this.map(function(item){
      return isNode(item) ? item.clone() : item;
    });
  },
  function pluck(key){
    return this.map(function(item){
      return item[key]
    })
  }
]);


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
          return this.append($('#property', 'init', id(key), value.clone()));
        } else if (key.matches('ident')) {
          key = key.name;
        }
      }

      if (isObject(key)) {
        var o = key;
        Object.keys(o).forEach(function(key){
          var desc = Object.getOwnPropertyDescriptor(o, key);
          if (desc) {
            if (desc.set) this.append($('#property', 'set', key, parse(desc.set)));
            if (desc.get) this.append($('#property', 'get', key, parse(desc.get)))
            if ('value' in desc) this.set(key, desc.value);
          }
        }, this);
        return this;
      } else if (typeof key === 'string') {
        if (!isObject(value))
          value = $('#literal', value);
        else if (typeof value === 'function')
          value = parse(value);
        if (value instanceof ASTNode && !(value instanceof Property))
          value = $('#property', 'init', key, value.clone());

        if (value instanceof Property)
          this.append(value.clone())
      }
      return this;
    }
  ]);
});



Mixin.create('scopes', [
  function hoist(){
    var decls = $('#var'),
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
        decl = $('#var', 'var');
        this.body.prepend(decl);
      }
      decl.declare(vars);
      return this;
    },
    function call(args){
      return $('#call', this.clone(), args.clone());
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
      var decl = $('#var');
      decl.declare(name, this instanceof Expression ? this.clone() : this.toExpression());
      return decl;
    },
    function scopedDeclaration(name){
      var decl = name || !this.id ? this.declaration(name) : this.toDeclaration();
      var scope = $('#functionexpr');
      scope.body.append(decl);
      scope.body.append($('#return', id(decl.id)));
      var iife = $('#iife', scope);
      iife.identity = this.identity;
      return iife;
    },
    function returns(expr){
      this.body.append(parent($('#return', isNode(expr) ? expr.clone() : expr), this.body));
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



Mixin.create('classes', function(o){
  define(o, {
    get inherits(){
      return _(this).inherits;
    },
    set inherits(v){
      if (typeof v === 'string')
        v = id(v);
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
      key = id(key+'');

    if (typeof obj === 'string')
      obj = $('#member', obj, key);

    if (obj instanceof MemberExpression)
      return $('#assign', '=', obj.clone(), this.clone());
  },
  function set(key, value){
    if (arguments.length === 1) {
      if (isNode(key))
        key = key.clone();
      return $('#assign', '=', this.clone(), key);
    }

    if (!isObject(value))
      value = $('#literal', value);
    else if (isNode(value))
      value = value.clone();

    return $('#assign', '=', $('#member', this.clone(), id(key)), value);
  },
  function get(key){
    return $('#member', this.clone(), typeof key === 'number' ? key : id(key));
  },
  function call(args){
    if (Array.isArray(args))
      args = new ASTArray(args);

    if (isNode(args))
      args = args.clone();

    return $('#call', this.clone(), args);
  },
  function declaration(name){
    if (typeof name === 'string')
      this.identity = name;
    else if (name instanceof Identifier)
      this.identity = name.name;

    var decl = $('#var');
    decl.declare(this.identity, this.clone());
    return decl;
  },
  function scopedDeclaration(name){
    var scope = $('#functionexpr');
    scope.body.append(this.declaration(name));
    scope.body.append($('#return', this.identity));
    var iife = $('#iife', scope);
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
  tags.push('statement')
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
  type: [null, Expression]
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
    this.label = label == null ? null : id(label);
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
          return $('#literal', arg);
        else if ('type' in arg)
          return arg;
        else if (typeof arg === 'function')
          return parse(arg);
        else
          return $('#object', arg);
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
      v = $('#this');
    else if (!isNode(v))
      v = $(v);

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
      body = $('#block', body);
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
    this.label = label === null ? null : id(label);
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
      body = $('#block', body);
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
      body = $('#block', body);
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
      body = $('#block', body);
    this.body = assertInstance(body, Statement);
    prep(this);
  }
]);


// ###########################
// ### FunctionDeclaration ###
// ###########################

var FunctionDeclaration = new Declaration(['function', 'functiondecl'], [
  function FunctionDeclaration(id, params, body){ //generator, rest, defaults
    if (id == null)
      return $('#functionexpr', id, params, body);
    if (params instanceof Array)
      params = params.map(ASTNode.id);
    this.params = new ASTArray;
    params && this.append(params);
    this.id = ASTNode.id(id);
    if (!(body instanceof BlockStatement))
      body = $('#block', body);
    this.body = assertInstance(body, [BlockStatement, Expression]);
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
  property: 'params',
  type: Identifier
});


// ##########################
// ### FunctionExpression ###
// ##########################

var FunctionExpression = new Expression(['function', 'functionexpr'], [
  function FunctionExpression(id, params, body){
    FunctionDeclaration.call(this, id || '', params, body);
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
  property: 'params',
  type: Identifier
});



// ##################
// ### Identifier ###
// ##################

var Identifier = new Expression(['ident'], [
  function Identifier(name){
    this.name = name instanceof Identifier ? name.name : name;
  },
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
    return $('#decl', this, value);
  },
  function SET(value){
    return $('#assign', '=', this.clone(), value.clone());
  },
  function OR(right){
    return $('#logical', '||', this.clone(), right.clone());
  },
  function AND(right){
    return $('#logical', '&&', this.clone(), right.clone());
  },
  function IN(right){
    return $('#binary', 'in', this.clone(), right.clone());
  },
  function keyOf(object){
    return $('#member', object.clone(), this.clone(), true);
  },
  function DELETE(from){
    return $('#unary', 'delete', this.keyOf(object));
  }
]);


// ###################
// ### IfStatement ###
// ###################

var IfStatement = new Statement(['if'], [
  function IfStatement(test, consequent, alternate){
    this.test = assertInstance(test, Expression);
    if (!consequent || consequent instanceof Array)
      consequent = $('#block', consequent);
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
    this.label = id(label);
    if (!body || body instanceof Array)
      body = $('#block', body);
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
                || this.property instanceof Identifier)
                || isFinite(this.property.name);
    this.computed = !!computed
    prep(this);
  },
  function assignTo(value){
    return $('#assign', '=', this,  isNode(value) ? value.clone() : value);
  },
  function call(params){
    return $('#call', this, isNode(params) ? params.clone() : params);
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
  function Property(kind, key, value){
    if (typeof key === 'string')
      this.key = keyNeedsQuotes(key) ? $('#literal', key) : id(key);
    else
      this.key = key;
    if (!isObject(value))
      value = $('#literal', value);

    this.value = assertInstance(value, [Expression, Literal]);
    if (!_(this.value).identity)
      this.value.identity = this.key;

    this.kind = typeof kind === 'number' ? Property.kinds[kind] : kind;
    prep(this);
  },
  function nameMethod(){
    if (this.kind === 'init' && isNode(this.value) && this.value.matches('function'))
      this.value.id = this.key;
    return this;
  },
  function rename(name){
    this.key = id(name);
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
      block = $('#block', block);
    this.block = assertInstance(block, BlockStatement);
    this.handlers = new ASTArray;
    handlers && this.append(handlers);
    prep(this);
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
          var item = $('#literal', vars[k])
        else if (typeof vars[k] === 'function')
          var item = parse(vars[k]);
        else if (Object.getPrototypeOf(vars[k]) === Object.prototype)
          var item = $('#object', vars[k]);
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

var VariableDeclarator = new ASTNode(['decl'], [
  function VariableDeclarator(id, init){
    this.id = typeof id === 'string' ? ASTNode.id(id) : id;
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
      body = $('#block', body);
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
      body = $('#block', body);
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
      func = $('#functionexpr');

    CallExpression.call(this, func, arguments);
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
      param = id(param);
    this.callee.append(param.clone());
    return this;
  },
  function addArgument(arg, value){
    if (typeof arg === 'string')
      arg = id(arg);

    if (!isObject(arg)) {
      value = $('#literal', arg);
      arg = $(value.identity);
    } else if (!(1 in arguments))
      value = arg.clone();
    else if (typeof value === 'string')
      value = id(value);
    else if (!isObject(value))
      value = $('#literal', value);

    this.arguments.append(value.clone());
    this.callee.append(arg.clone());
    return this;
  },
  function returns(name){
    this.callee.body.append($('#return', isNode(name) ? name.clone() : name));
    return this;
  }
]);

define(ImmediatelyInvokedFunctionExpression.prototype, {
  type: 'CallExpression',
});


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
  function ArrowFunctionExpression(params, body){
    if (!body || body instanceof Array)
      body = $('#block', body);
    this.body = assertInstance(body, [BlockStatement, Expression]);
    this.params = new ASTArray;
    this.append(params);
    prep(this);
  }
]);

Mixin.use('functions', ArrowFunctionExpression.prototype);
Mixin.use('arrays', ArrowFunctionExpression.prototype, {
  property: 'params',
});

define(ArrowFunctionExpression.prototype, {
  get id(){ return null },
  set id(v){ if (v) this.identity = typeof v === 'string' ? v : v.name }
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
    this.id = ASTNode.id(id);
    if (!body)
      body = new ClassBody;
    this.body = assertInstance(body, ClassBody);
    this.superClass = superClass == null ? null : ASTNode.id(superClass);
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
    this.key = id(key || '');
    this.value = assertInstance(value, FunctionExpression);
    this.kind = typeof kind === 'number' ? MethodDefinition.kinds[kind] : kind || '';
    if (this.value.id == null)
      this.value.id = this.key.clone();
    prep(this);
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
    this.id = ASTNode.id(id);
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
      body = $('#block', body);
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
    this.id = ASTNode.id(id);
    this.from = assertInstance(from, [null, Literal, Path]);
    prep(this);
  }
]);



// #########################
// ### ModuleDeclaration ###
// #########################

var ModuleDeclaration = new Declaration(['module'], [
  function ModuleDeclaration(id, body){
    this.id = ASTNode.id(id);
    if (!body || body instanceof Array)
      body = $('#block', body);
    this.body = assertInstance(body, [BlockStatement, Expression]);
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
    this.tag = id(tag);
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



var freeze = $('Object').get('freeze');
var QUASI = parse(function(r){
  for (var i=0, o=''; r[i]; o += r[i].raw + (++i === r.length ? '' : arguments[i]));
  return o;
});


var compileSelector = require('./compile-selector');
