var descriptor = require('./descriptor'),
    inherit = require('./utility').inherit,
    define = require('./utility').define,
    ASTNode = require('./asts'),
    AST = require('./AST'),
    fs = require('fs'),
    hasOwn = {}.hasOwnProperty,
    create = Object.create,
    defineProperty = Object.defineProperty,
    defineProperties = Object.defineProperties;



// include weakmap if not already available
if (!WeakMap) {
  var WeakMap = require("weakmap");
}

var BRAND_ARGUMENTS = 'Arguments',
    BRAND_ARRAY     = 'Array',
    BRAND_BOOLEAN   = 'Boolean',
    BRAND_DATE      = 'Date',
    BRAND_ERROR     = 'Error',
    BRAND_FUNCTION  = 'Function',
    BRAND_JSON      = 'JSON',
    BRAND_MATH      = 'Math',
    BRAND_NUMBER    = 'Number',
    BRAND_OBJECT    = 'Object',
    BRAND_REGEXP    = 'RegExp',
    BRAND_STRING    = 'String';

var TYPE_BOOLEAN    = 'boolean',
    TYPE_FUNCTION   = 'function',
    TYPE_NUMBER     = 'number',
    TYPE_OBJECT     = 'object',
    TYPE_STRING     = 'string',
    TYPE_UNDEFINED  = 'undefined';



module.exports = Interpretor;

// ###################
// ### Interpretor ###
// ###################

function Interpretor(subject){
  var self = this;

  define(this, {
    _events: {},
    src: [],
    ast: []
  });

  this.context = new GlobalScope;
  this.context.on('pause', function(context){
    self.emit('pause', context);
  });
  this.context.on('resume', function(){
    self.emit('resume');
  });

  Interpretor.intializers.forEach(function(ast){
    this.execute(ast);
  }, this);
  subject && this.execute(subject);
}

define(Interpretor, [
  function interpret(origin){
    return new Interpretor(origin);
  },
  function registerInitializer(subject){
    Interpretor.intializers.push(Interpretor.toAST(subject));
  },
  function toAST(subject){
    var source = subject, ast;

    if (subject.ast && subject.src)
      return subject;

    if (typeof subject === 'function') {
      if (!subject.name)
        source = '('+subject+')()';
      else
        source = subject+'';
    }

    if (typeof source === 'string') {
      ast = parse(source);
    } else if (isObject(subject)) {
      if (subject instanceof ASTNode)
        ast = subject;
      else
        ast = ASTNode.fromJSON(subject);
    }

    source || (source = ast.toSource());

    return { ast: ast, src: source };
  }
]);

Interpretor.intializers = [];

var _emit = process.EventEmitter.prototype.emit;

inherit(Interpretor, process.EventEmitter, [
  function emit(event){
    if (this._events['*']) {
      this._events['*'].apply(this, arguments);
    }
    _emit.apply(this, arguments);
  },
  function pause(){
    this.context.pause();
    return this;
  },
  function resume(){
    this.context.resume();
    return this;
  },
  function execute(arg, callback){
    var self = this,
        ast = Interpretor.toAST(arg);

    this.ast.push(ast);

    interpretors.Program(ast.ast, this.context, finish, finish);

    function finish(result){
      if (result instanceof Thrown) {
        self.emit('uncaughtException', result.thrown);
        callback && callback(result.thrown);
      } else {
        self.emit('complete', result);
        callback && callback(result);
      }
    }
  }
]);



Interpretor.registerInitializer(function(){
  function define(o, v){
    Object.defineProperty(o, v.name, { configurable: true, writable: true, value: v });
  }

  define(Array.prototype, function forEach(callback, context){
    context = context || this;

    for (var i=0; i < this.length; i++) {
      callback.call(context, this[i], i, this);
    }
  });

  define(Array.prototype, function map(callback, context){
    var out = [];

    context = context || this;
    for (var i=0; i < this.length; i++) {
      out.push(callback.call(context, this[i], i, this));
    }

    return out;
  });

  define(Array.prototype, function reduce(callback, start){
    if (arguments.length < 2) {
      var index = 1;
      start = this[0];
    } else {
      var index = 0;
    }
    for (; index < this.length; index++) {
      start = callback.call(this, start, this[index], index, this);
    }
    return start;
  });
});







var functions = new WeakMap,
    argumentObjects = new WeakMap,
    primitives = new WeakMap;

var nextTick = typeof process !== 'undefined' ? process.nextTick : function(f){ setTimeout(f, 1) };


function parse(src){
  return new AST(0, 0, src).toJSON();
}

function isObject(v){
  return typeof v === 'object' ? v !== null : typeof v === 'function';
}

function noop(){}


function method(object, func){
  defineProperty(object, func.name, {
    configurable: true,
    enumerable: false,
    writable: true,
    value: func
  });
}

function template(r) {
  for (var i = 0, o = ''; r[i]; o += r[i].raw + (++i === r.length ? '' : arguments[i]));
  return o;
}






// ##############
// ### Signal ###
// ##############

function Signal(name){
  this.name = name;
}

define(Signal.prototype, [
  function toString(){
    return '[object Signal]';
  },
  function inspect(){
    return '[Signal: '+this.name+']';
  }
]);

var CONTINUE = new Signal('continue'),
    BREAK    = new Signal('break'),
    THROWN   = new Signal('thrown');


function Thrown(thrown){
  this.thrown = thrown;
}

Thrown.prototype = THROWN;




// #############
// ### Thunk ###
// #############

function Thunk(name, length, call, construct, type){
  if (isObject(name)) {
    length = name.length;
    call = name.call;
    construct = name.construct;
    type = name.type;
    name = name.name;
  }
  this.name = name || '';
  this.length = length >>> 0;
  this.call = call || construct;
  this.construct = construct || call;
  this.type = type || Thunk.NORMAL_FUNCTION;
  this.descriptor = {
    length: { value: length },
    name: { value: name }
  };
}

var prototypeTemplate = {
  constructor: {
    configurable: true,
    writable: true,
    value: undefined
  }
}

Thunk.NORMAL_FUNCTION  = 0;
Thunk.BUILTIN_TYPE     = 1;
Thunk.BUILTIN_FUNCTION = 2;
Thunk.ARROW_FUNCTION   = 3;


Thunk.from = function from(node){
  if (node.thunk) return node.thunk;

  var body = node.body,
      params = node.params;

  function defineParams(context, args){
    for (var i=0; i < params.length; i++)
      context.declare('var', params[i].name, args[i]);
  }

  var name = node.id ? node.id.name : '';

  function construct(context, args, complete){
    name && context.declare('var', name, context.environ);
    defineParams(context, args);
    context.declare('var', 'arguments', context.makeArguments(args));
    interpret(body, context, function(result){
      if (isObject(result))
        complete(result);
      else
        complete(context.receiver);
    });
  };

  function call(context, args, complete){
    name && context.declare('var', name, context.environ);
    defineParams(context, args);
    context.declare('var', 'arguments', context.makeArguments(args));
    interpret(body, context, complete);
  };

  var thunk = node.thunk = new Thunk(name, node.params.length, call, construct);
  thunk.ast = ASTNode.fromJSON(node);
  return thunk;
}

define(Thunk.prototype, [
  function instantiate(context){
    var functionObject = create(context.global.FunctionPrototype, this.descriptor);

    if (this.type === Thunk.NORMAL_FUNCTION) {
      prototypeTemplate.constructor.value = functionObject;
      defineProperty(functionObject, 'prototype', {
        writable: true,
        value: create(context.global.ObjectPrototype, prototypeTemplate)
      });
      prototypeTemplate.constructor.value = undefined;
    } else if (this.type === Thunk.BUILTIN_TYPE) {
      defineProperty(functionObject, 'prototype', {
        value: context.global[this.name+'Prototype']
      });
      defineProperty(functionObject.prototype, 'constructor', {
        value: functionObject
      });
    }

    if (this.type === Thunk.ARROW_FUNCTION) {
      var thunk = create(this);
      thunk.receiver = context.receiver;
    } else {
      var thunk = this;
    }

    functions.set(functionObject, thunk);
    return functionObject;
  }
]);


// ##################
// ### ArrowThunk ###
// ##################

function ArrowThunk(length, call){
  this.length = length >>> 0;
  this.call = call;
  this.descriptor = {
    length: { value: length }
  };
}

inherit(ArrowThunk, Thunk, {
  construct: function(context, args, complete){
    context.error('type', 'Arrow functions cannot be used as constructors');
  },
  name: '',
  type: Thunk.ARROW_FUNCTION
});




// #################
// ### Reference ###
// #################

function Reference(subject, key){
  this.subject = subject;
  this.key = key;
}

define(Reference.prototype, [
  function get(){
    return this.subject[this.key];
  },
  function set(value){
    return this.subject[this.key] = value;
  }
]);


// ######################
// ### ScopeReference ###
// ######################

function ScopeReference(scope, key){
  this.scope = scope;
  this.key = key;
}

inherit(ScopeReference, Reference, [
  function get(){
    return this.scope.get(this.key);
  },
  function set(value){
    return this.scope.set(this.key, value);
  },
]);




// #############
// ### Scope ###
// #############

function Scope(parent){
  this.parent = parent;
  this.record = create(parent.record);
  this.receiver = parent.receiver;
  this.environ = parent.environ;
  define(this, 'global', parent.global);
}

var types = {
  reference: ReferenceError,
  type: TypeError
};

inherit(Scope, process.EventEmitter, [
  function error(type, message){
    type = types[type];
    return new type(message);
  },
  function nearest(type){
    var current = this;
    while (current) {
      if (current instanceof type)
        return current;
      current = current.parent;
    }
  },
  function declare(type, name, init){
    if (hasOwn.call(this.record, name)) {
      if (init !== undefined)
        this.record[name] = init;
    } else {
      this.record[name] = init;
    }
  },
  function strictDeclare(type, name, init){
    if (hasOwn.call(this.record, name))
      this.error('reference', 'Duplicate declaration for "'+name+'"');
    else
      this.record[name] = init;
  },
  function set(name, value){
    var scope = this;
    while (scope && !hasOwn.call(scope.record, name))
      scope = scope.parent;
    scope || (scope = this.global);
    scope.record[name] = value;
  },
  function get(name){
    if (name in this.record)
      return this.record[name];
    else
      this.error('reference', 'Referenced undeclared identifier "'+name+'"');
  },
  function reference(name){
    return new ScopeReference(this, name);
  },
  function child(ScopeType){
    return new ScopeType(this);
  },
  function error(type, message){

  },
  function create(Type, args){
    return builtins[Type].construct(this, args ? args : []);
  },
  function makeArguments(args){
    var obj = create(this.global.ObjectPrototype);
    argumentObjects.set(obj, true);

    if (args) {
      for (var i=0; i < args.length; i++)
        obj[i] = args[i];
    }

    return defineProperty(obj, 'length', {
      value: i
    });
  }
]);


// ###################
// ### GlobalScope ###
// ###################

function GlobalScope(){
  this.type = 'global';

  define(this, {
    global: this,
    _events: {},
    ObjectPrototype: create(null)
  });

  for (var name in builtins)
    if (name !== 'Object')
      define(this, name+'Prototype', create(this.ObjectPrototype));

  var record = create(this.ObjectPrototype);

  for (var name in builtins) {
    define(this, name, builtins[name].instantiate(this));
    method(record, this[name]);

    var methods = builtins[name].methods;
    if (methods)
      for (var i=0; i < methods.length; i++)
        method(this[name+'Prototype'], methods[i].instantiate(this));

    var funcs = builtins[name].functions
    if (funcs)
      for (var i=0; i < funcs.length; i++)
        method(this[name], funcs[i].instantiate(this));
  }

  this.record = record;
  this.receiver = this.record;
  define(this, 'environ', this.record);

  define(this.FunctionPrototype, function inspect(){
    return ' [Function' + (this.name ? ': ' + this.name : '') + ']';
  })
}

inherit(GlobalScope, Scope, [
  function pause(context, complete){
    this.resume = function resume(){
      delete this.resume;
      this.emit('resume');
      complete();
    };

    this.emit('pause', context);
  }
]);



// #####################
// ### FunctionScope ###
// #####################

function FunctionScope(parent){
  this.type = 'function';
  Scope.call(this, parent);
}

inherit(FunctionScope, Scope);



// ##################
// ### ClassScope ###
// ##################

function ClassScope(parent){
  this.type = 'module';
  Scope.call(this, parent);
  this.record.super = function(){};
}

inherit(ClassScope, Scope);



// ##################
// ### BlockScope ###
// ##################

function BlockScope(parent){
  this.type = 'block';
  Scope.call(this, parent);
}

inherit(BlockScope, Scope, [
  function declare(type, name, init){
    if (type === 'let') {
      if (!hasOwn.call(this.record, name))
        this.record[name] = init;
      var scope = this;
    } else {
      var scope = this.nearest(FunctionScope) || this.global;
      scope.declare(type, name, init);
    }
  },
  function strictDeclare(type, name, init){
    if (type === 'let') {
      if (hasOwn.call(this.record, name))
        return this.error('reference', 'Duplicate declaration for "'+name+'"');
      this.record[name] = init;
      var scope = this;
    } else {
      var scope = this.nearest(FunctionScope) || this.global;
      scope.strictDeclare(type, name, init);
    }
  },
]);



// ###################
// ### SwitchScope ###
// ###################

function SwitchScope(parent, discriminant){
  this.type = 'switch';
  this.discriminant = discriminant;
  Scope.call(this, parent);
}

inherit(SwitchScope, Scope);



// ##################
// ### CatchScope ###
// ##################

function CatchScope(parent, name, value){
  this.type = 'catch';
  Scope.call(this, parent);
  this.declare('catch', name, value);
}

inherit(CatchScope, Scope);



// ##################
// ### WithScope ###
// ##################

function WithScope(parent, object){
  Scope.call(this, parent);
  this.object = object;
}

inherit(WithScope, Scope, [
  function declare(type, name, init){
    if (!(name in this.object) || init !== undefined)
      this.object[name] = init;
  },
  function set(name, value){
    this.object[name] = value;
  },
  function get(name){
    if (name in this.object)
      return this.object[name];
    else if (name in this.record)
      return this.record[name];
    else
      this.error('reference', 'Referenced undeclared identifier "'+name+'"');
  },
]);



// ##########
// ### ID ###
// ##########

function ID(name){
  this.name = name;
}

ID.prototype.type = 'Identifier';




function toProperty(node){
  if (node.type === 'Identifier')
    return node.name;
  else if (node.type === 'Property' || node.type === 'Method')
    return node.key.name;
  else if (node.type === 'Literal')
    return node.value;
  else if (node.type === 'ExpressionStatement')
    return toProperty(node.expression);
}



function DefaultValue(context, subject, complete){
  if (typeof subject === TYPE_STRING || isObject(subject))
    var func = subject.toString || subject.valueOf;
  else
    var func = subject.valueOf || subject.toString;

  var thunk = functions.get(func);
  if (thunk) {
    context = context.child(FunctionScope);
    context.environ = func;
    context.receiver = subject;
    thunk.call(context, [], complete);
  } else {
    contect.error('type', "Couldn't convert value to primitive type");
  }
};


function ToPrimitive(context, subject, complete){
  switch (typeof subject) {
    case 'undefined':
    case 'string':
    case 'number':
    case 'boolean': return complete(subject);
    case 'object': if (subject === null); return complete(subject);
    case 'function': DefaultValue(context, subject, complete);
  }
}

function ToBoolean(context, subject, complete){
  complete(subject ? true : false);
}

function ToNumber(context, subject, complete){
  if (typeof subject === 'number')
    return complete(subject);
  switch (subject) {
    case true: return complete(1);
    case false:
    case null: return complete(0);
    case undefined: return complete(NaN);
  }
  if (typeof subject === 'string') {
    subject = subject.trim();
    switch (subject) {
      case '0': return complete(0);
      case '-0': return complete(-0);
      case 'Infinity': return complete(Infinity);
      case '-Infinity': return complete(-Infinity);
    }
    if (subject[0] === '0' && subject[1] === 'x' || subject[1] === 'X')
      return complete(parseInt(subject, 16));
    if (~subject.indexOf('.'))
      return complete(parseFloat(subject));
    return complete(parseInt(subject, 10));
  }

  ToPrimitive(context, subject, function(result){
    ToNumber(context, subject, complete);
  });
}


function ToObject(context, subject, complete) {
  switch (typeof subject) {
    case 'boolean':  return BuiltinBoolean.construct(context, [subject], complete);
    case 'number':   return BuiltinNumber.construct(context, [subject], complete);
    case 'string':   return BuiltinString.construct(context, [subject], complete);
    case 'function': return complete(subject);
    case 'object': if (subject !== null) return complete(subject);
    default:         return BuiltinObject.construct(context, [subject], complete);
  }
}


function ToUint32(context, subject, complete) {
  complete(subject >> 0);
}

function ToInt32(context, subject, complete) {
  complete(subject >>> 0);
}

function ToString(context, subject, complete) {
  switch (subject) {
    case undefined: return complete('undefined');
    case null: return complete('null');
    case true: return complete('true');
    case false: return complete('false');
  }

  if (typeof subject === TYPE_STRING)
    return complete(subject);

  DefaultValue(context, subject, complete);
}

function isArrayIndex(context, subject, complete) {
  if (typeof subject === TYPE_STRING) {
    ToUint32(context, subject, function(subject){
      ToString(context, subject, function(result){
        subject === result
      });
    });
    return ToString(n) == s && n !== MAX_UINT32 - 1;
  }
  return false;
}



// #####################
// ### Builtin Types ###
// #####################

var BuiltinArray, BuiltinBoolean, BuiltinFunction, BuiltinObject,
    BuiltinMap, BuiltinNumber, BuiltinRegExp, BuiltinSet, BuiltinWeakMap;

var builtins = (function(builtins){
  var brandings = new Map;
  brandings.set(undefined, '[object Undefined]');
  brandings.set(null, '[object Null]');

  function BuiltinType(options){
    this.name = options.name;
    this.call = options.call || options.construct;
    this.construct = options.construct;
    this.methods = options.methods || [];
    this.functions = options.functions || [];
    this.descriptor = {
      name: { value: this.name },
      length: { value: this.length }
    };
  }


  inherit(BuiltinType, Thunk, {
    type: Thunk.BUILTIN_TYPE,
    length: 1
  });

  function BuiltinMethod(options){
    this.name = options.name;
    this.length = options.length || 0;
    this.call = options.call;
    this.construct = this.call;
    this.descriptor = {
      name: { value: this.name },
      length: { value: this.length }
    };
  }

  inherit(BuiltinMethod, Thunk, {
    type: Thunk.BUILTIN_FUNCTION
  });

  function register(def){
    return builtins[def.name] = new BuiltinType(def);
  }

  function api(name, call){
    return new BuiltinMethod({ name: name, call: call });
  }

  function bridgeBuiltinMethods(definition, prototype, methods){
    methods.forEach(function(name){
      var builtin = prototype[name];
      definition.methods.push(api(name, function(context, args, complete){
        complete(builtin.apply(context.receiver, args));
      }));
    })
  }

  function makeCollection(Ctor, methods){
    var collections = new WeakMap,
        prototype = Ctor.name + 'Prototype';

    var Builtin = register({
      name: Ctor.name,
      call: function(context, args, complete){
        if (args.receiver == null)
          return Builtin.construct(context, args, complete);

        ToObject(context, args.receiver, function(target){
          if (collections.has(target))
            return context.error('type', 'Object is already a Set');

          collections.set(target, new Ctor);
          complete(target);
        });
      },
      construct: function(context, args, complete){
        var self = create(context.global[prototype]);
        collections.set(self, new Ctor);
        complete(self);
      }
    });

    bridgeBuiltinMethods(Builtin, Ctor.prototype, methods);

    return Builtin;
  }

  function makePrimitive(Ctor, methods){
    var prototype = Ctor.name + 'Prototype';

    var Builtin = register({
      name: Ctor.name,
      call: function(context, args, complete){
        complete(Ctor(args[0]));
      },
      construct: function(context, args, complete){
        var self = create(context.global[prototype]);
        primitives.set(self, Ctor(args[0]));
        complete(self);
      },
      methods: [
        api('toString', function(context, args, complete){
          var self = primitives.get(context.receiver);
          if (!self)
            return context.error('type', Ctor.name+'.prototype.toString is not generic');
          complete(''+self);
        }),
        api('valueOf', function(context, args, complete){
          var self = primitives.get(context.receiver);
          if (!self)
            return context.error('type', Ctor.name+'.prototype.valueOf is not generic');
          complete(Ctor(self));
        })
      ]
    });

    bridgeBuiltinMethods(Builtin, Ctor.prototype, methods);
    return Builtin;
  }

  BuiltinArray = register({
    name: 'Array',
    construct: function(context, args, complete){
      var self = create(context.global.ArrayPrototype);
      if (args.length === 1 && typeof args[0] === 'number') {
        var len = args[0];
      } else {
        for (var i=0; i < args.length; i++)
          self[i] = args[i];
        var len = args.length;
      }
      defineProperty(self, 'length', descriptor('length', len));
      complete(self);
    },
    methods: []
  });


  bridgeBuiltinMethods(BuiltinArray, Array.prototype, [
    'toString', 'pop', 'shift','unshift', 'lastIndexOf','push',
    'splice', 'reverse','slice', 'concat', 'join', 'indexOf'
  ]);

  BuiltinBoolean = makePrimitive(Boolean, []);

  BuiltinFunction = register({
    name: 'Function',
    construct: function(context, args, complete){
      var body = args.length ? args.pop() : '';
      var src = 'function anonymous('+args+') {\n'+body+'\n}';
      var self = new Thunk('anonymous', args.length, parse(src), null, Thunk.NORMAL_FUNCTION);
      self.code = src;
      complete(self.instantiate(context));
    },
    methods: [
      api('bind', function(context, args, complete){
        var thisArg = args.shift(),
            thunk = functions.get(context.receiver);

        if (!thunk)
          return context.error('type', 'Bind must be called on a function');

        var bound = new Thunk({
          name: '',
          length: thunk.length,
          call: function(context, newargs, complete){
            if (thunk.type !== Thunk.ARROW_FUNCTION)
              context.receiver = thisArg;
            newargs = args.concat(newargs);
            thunk.call(context, newargs, complete);
          },
          construct: function(context, newargs, complete){
            newargs = args.concat(newargs);
            thunk.construct(context, newargs, complete);
          }
        });

        complete(bound.instantiate(context));
      }),
      api('call', function(context, args, complete){
        var thunk = functions.get(context.receiver);

        if (!thunk)
          return context.error('type', 'Call must be called on a function');

        context.receiver = args.shift();
        thunk.call(context, args, complete);
      }),
      api('apply', function(context, args, complete){
        var thunk = functions.get(context.receiver);

        if (!thunk)
          return context.error('type', 'Apply must be called on a function');

        context.receiver = args.shift();
        thunk.call(context, args.shift(), complete);
      }),
      api('toString', function(context, args, complete){
        var thunk = functions.get(context.receiver);

        if (!thunk)
          return context.error('type', 'Function.prototype.toString must be called on a function');

        if (!thunk.code) {
          if (thunk.ast) {
            thunk.code = thunk.ast.toSource();
          } else {
            thunk.code = 'function '+thunk.name + '(){ [native code] }';
          }
        }

        complete(thunk.code);
      })
    ]
  });

  BuiltinMap = makeCollection(Map, ['get', 'set', 'has', 'delete']);

  BuiltinNumber = makePrimitive(Number, ['toExponential', 'toFixed', 'toPrecision']);

  BuiltinObject = register({
    name: 'Object',
    call: function(context, args, complete){
      ToObject(context, args[0], complete);
    },
    construct: function(context, args, complete){
      complete(create(context.global.ObjectPrototype));
    },
    functions: [
      api('is', function(context, args, complete){
        var o = args[0],
            p = args[1];
        if (Object.is)
          complete(Object.is(a, b))
        else
          complete(o === p || (o === 0 && p === 0 && 1 / o === 1 / p) || (o !== o && p !== p))
      })
    ],
    methods: [
      api('valueOf', function(context, args, complete){
        complete(context.receiver);
      }),
      api('toString', function(context, args, complete){
        var o = this;
        brand || (brand = brandings.get(context.global.ObjectPrototype));
        complete(brand);
        return brand;
      })
    ]
  });

  // would prefer to not include these obsolete accessor functions
  bridgeBuiltinMethods(BuiltinObject, Object.prototype, [
    '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
    'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString'
  ]);

  ['getOwnPropertyNames', 'getOwnPropertyDescriptor', 'defineProperty',
   'defineProperties', 'keys', 'getPrototypeOf', 'create', 'freeze',
   'isExtensible', 'isFrozen', 'isSealed', 'preventExtensions', 'seal'].forEach(function(name) {
    var builtin = Object[name];
    BuiltinObject.functions.push(api(name, function(context, args, complete){
      complete(builtin.apply(null, args));
    }));
  });

  BuiltinRegExp = register({
    name: 'RegExp',
    construct: function(context, args, complete){}
  });

  BuiltinSet = makeCollection(Set, ['add', 'has', 'delete']);

  BuiltinString = makePrimitive(String, [
    'charAt', 'charCodeAt', 'concat', 'indexOf', 'lastIndexOf', 'localeCompare', 'match',
    'replace', 'search', 'slice', 'split', 'substr', 'substring', 'toLocaleLowerCase',
    'toLocaleUpperCase', 'toLowerCase', 'toUpperCase', 'trim', 'trimLeft', 'trimRight'
  ]);
  // ['anchor', 'big', 'blink', 'bold', 'fixed', 'fontcolor', 'fontsize', 'italics',
 // 'link', 'small', 'strike', 'sub', 'sup']


  BuiltinWeakMap = makeCollection(WeakMap, ['get', 'set', 'has', 'delete']);

  BuiltinGlobals = [
    api('eval', function(context, args, complete){
      interpretors.Program(parse(args[0]), context, complete, complete);
    })
  ];

  return builtins;
}({}));




var stack = 0;

function interpret(node, context, complete, quit){
  if (stack++ > 100) {
    stack = 0;
    return nextTick(function(){
      interpret(node, context, complete, quit);
    });
  }
  //console.log(node);
  if (!node) return complete(node);
  interpretors[node.type](node, context, complete, quit);
}


function reference(node, context, complete){
  if (node.type === 'MemberExpression') {
    interpret(node.object, context, function(object){
      if (node.computed) {
        interpret(node.property, context, function(prop){
          complete(new Reference(object, prop));
        })
      } else {
        complete(new Reference(object, toProperty(node.property)));
      }
    });
  } else if (node.type === 'Identifier') {
    complete(context.reference(node.name));
  } else if (node.type === 'VariableDeclaration') {
    interpret(node, context, function(){
      var decl = node.declarations[node.declarations.length - 1];
      if (decl.id)
        complete(context.reference(decl.id.name));
    });
  }
}

var interpretors = {
  ArrayExpression: function(node, context, complete){
    var output = [],
        len = node.elements.length;

    (function loop(i){
      if (!node.elements[i]) return construct(output);

      if (node.elements[i].type === 'Literal') {
        output.push(node.elements[i].value);
        if (i < len) loop(++i);
        else construct(output);
      } else {
        interpret(node.elements[i], context, function(value){
          output.push(value);
          if (i < len) loop(++i)
          else construct(output);
        });
      }
    })(0);

    function construct(array){
      BuiltinArray.construct(context, output, complete);
    }
  },
  ArrayPattern: function(node, context){},
  ArrowFunctionExpression: function(node, context, complete){
    var body = node.body,
        params = node.params;

    var thunk = new ArrowThunk(node.params.length, function(context, args, complete){
      context.receiver = functions.get(context.environ).receiver;

      for (var i=0; i < params.length; i++)
        context.declare('var', params[i].name, args[i]);

      interpret(body, context, complete);
    });

    thunk.ast = ASTNode.fromJSON(node);

    complete(thunk.instantiate(context));
  },
  AssignmentExpression: function(node, context, complete){
    reference(node.left, context, function(ref){
      interpret(node.right, context, function(value){
        if (node.operator === '=')
          ref.set(value); return complete(value);

        ToPrimitive(ref.get(), context, function(left){
          ToPrimitive(value, context, function(value){
            switch (node.operator) {
              case '*=':   value = left * value; break;
              case '/=':   value = left / value; break;
              case '%=':   value = left % value; break;
              case '+=':   value = left + value; break;
              case '-=':   value = left - value; break;
              case '<<=':  value = left << value; break;
              case '>>=':  value = left >> value; break;
              case '>>>=': value = left >>> value; break;
              case '&=':   value = left & value; break;
              case '^=':   value = left ^ value; break;
              case '|=':   value = left | value; break;
            }
            ref.set(value);
            complete(value);
          });
        });
      });
    });
  },
  BinaryExpression: function(node, context, complete){
    interpret(node.left, context, function(left){
      interpret(node.right, context, function(right){
        if (node.operator === '+' && left && typeof left === 'object') {
          ToString(context, left, function(left){
            if (right && typeof right === 'object') {
              ToString(context, right, function(right){
                finish(left, right);
              })
            } else {
              finish(left, right);
            }
          });
        } else {
          finish(left, right);
        }

        function finish(left, right) {
          switch (node.operator) {
            case '*':   complete(left * right); break;
            case '/':   complete(left / right); break;
            case '%':   complete(left % right); break;
            case '+':   complete(left + right); break;
            case '-':   complete(left - right); break;
            case '<<':  complete(left << right); break;
            case '>>':  complete(left >> right); break;
            case '>>>': complete(left >>> right); break;
            case '&':   complete(left & right); break;
            case '^':   complete(left ^ right); break;
            case '|':   complete(left | right); break;
            case '===': complete(left === right); break;
            case '==':  complete(left == right); break;
            case '>':   complete(left > right); break;
            case '<':   complete(left < right); break;
            case '!==': complete(left !== right); break;
            case '!=':  complete(left != right); break;
            case '>=':  complete(left >= right); break;
            case '<=':  complete(left <= right); break;
            case 'in':  complete(left in right); break;
            case 'instanceof': complete(left instanceof right); break;
          }
        }
      });
    });
  },
  BlockStatement: function(node, context, complete, quit){
    var body = node.body,
        count = body.length,
        statement,
        done = false;

    context = context.child(BlockScope);
    quit || (quit = complete);

    (function next(i){
      if (done) return;
      var isDone = i === body.length - 1
          ? function(value){ complete(value) }
          : function(){ next(++i) }
      interpret(body[i], context, isDone, function(result){
        done = true;
        quit(result);
      });
    })(0);
  },
  BreakStatement: function(node, context, complete, quit){
    if (node.label === null)
      quit(BREAK);
  },
  CallExpression: function(node, context, complete, quit){
    var argv = node.arguments,
        argc = argv.length,
        args = [];

    (function next(i){
      var isDone = i >= argc
          ? done
          : function(){ next(i + 1) };

      interpret(argv[i], context, function(result){
        result !== undefined && args.push(result);
        isDone();
      });
    })(0);

    function done(){
      interpret(node.callee, context, function(result){
        if (isObject(result)) {
          context = context.child(FunctionScope);
          context.environ = result;
          functions.get(result).call(context, args, complete);
        } else {
          console.log(context);
        }
      });
    }
  },
  CatchClause: function(node, context, complete, exit){
    interpret(node.body, context, complete, exit);
  },
  ClassBody: function(node, context, complete){
    var body = node.body,
        Ctor,
        property,
        descs = {};

    context = context.child(ClassScope);

    for (var i=0; property = body[i]; i++) {
      if (property.key.name === 'constructor') {
        property.value.id = new ID(node.name);
        interpret(property, context, function(desc){
          descs.constructor = desc;
          Ctor = desc.value;
        });
      } else {
        interpret(property, context, function(desc){
          if (property.key.name in descs)
            descs[name][property.kind] = desc[property.kind];
          else
            descs[name] = desc;
        });
      }
    }

    if (node.prototype)
      Ctor.prototype = node.prototype;

    defineProperties(Ctor.prototype, descs)
    complete(Ctor);
  },
  ClassDeclaration: function(node, context, complete, quit){
    node.body.name = node.id.name;
    if (node.superClass)
      node.body.prototype = create(context.get(node.superClass.name).prototype);

    interpret(node.body, context, function(Class){
      context.declare('class', Class.name, Class);
      complete(Class);
    });
  },
  ClassExpression: function(node, context, complete){
    node.body.name = node.id ? node.id.name : '';
    if (node.superClass)
      node.body.prototype = create(context.get(node.superClass.name).prototype);

    interpret(node.body, context, function(Class){
      context.declare('class', Class.name, Class);
      complete(Class);
    });
  },

  ClassHeritage: function(node, context){},
  ConditionalExpression: function(node, context, complete){
    interpret(node.test, context, function(result){
      interpret(result ? node.consequent : node.alternate, context, complete);
    });
  },
  ContinueStatement: function(node, context, complete, quit){
    quit(CONTINUE);
  },
  DebuggerStatement: function(node, context, complete, quit){
    context.global.pause(context, complete);
  },
  DoWhileStatement: function(node, context, complete, quit){
    (function loop(i){
      interpret(node.body, context, function(){
        interpret(node.test, context, function(test){
          if (!test) return complete();
          i > 100 ? nextTick(loop) : loop(++i || 0);
        });
      }, function(action){
        if (action === CONTINUE)
          i > 100 ? nextTick(loop) : loop(++i || 0);
        else if (action === BREAK)
          complete();
      });
    })();
  },
  EmptyStatement: function(node, context, complete, quit){
    complete();
  },
  ExportDeclaration: function(node, context, complete){
    var decl = node.declaration;
    interpret(node.declaration, context, function(decls){
      context.exports || (context.exports = {});
      if (node.declaration.declarations) {
        for (var k in decls) {
          context.exports[k] = decls[k];
        }
      } else {
        context.exports[node.declaration.id.name] = decls;
      }

      complete(decls);
    });

  },
  ExportSpecifier: function(node, context){},
  ExportSpecifierSet: function(node, context){},
  ExpressionStatement: function(node, context, complete, quit){
    interpret(node.expression, context, complete);
  },
  ForInStatement: function(node, context, complete, quit){
    reference(node.left, context, function(left){
      interpret(node.right, context, function(right){
        var stop = false;
        for (var k in right) {
          if (stop) break;
          left.set(k);
          interpret(node.body, context, function(){}, function(result){
            stop = true;
            complete(result);
            if (action === CONTINUE)
              i > 100 ? nextTick(loop) : loop(++i || 0);
            else if (action === BREAK)
              complete();
          });
        }
        complete();
      });
    });
  },
  ForOfStatement: function(node, context){},
  ForStatement: function(node, context, complete, quit){
    interpret(node.init, context, function(init){
      (function loop(i){
        interpret(node.test, context, function(test){
          if (!test) return complete();
          interpret(node.body, context, function(){
            interpret(node.update, context, function(){
              i > 100 ? nextTick(loop) : loop(++i || 0);
            });
          }, function(action){
            if (action === CONTINUE)
              i > 100 ? nextTick(loop) : loop(++i || 0);
            else if (action === BREAK)
              complete();
          });
        });
      })();
    });
  },
  FunctionDeclaration: function(node, context, complete, quit){
    var func = Thunk.from(node).instantiate(context);
    context.declare('function', node.id.name, func);
    complete(func);
  },
  FunctionExpression: function(node, context, complete){
    complete(Thunk.from(node).instantiate(context));
  },
  Glob: function(node, context){},
  Identifier: function(node, context, complete){
    complete(context.get(node.name));
  },
  IfStatement: function(node, context, complete, quit){
    interpret(node.test, context, function(result){
      var target = !!result ? node.consequent : node.alternate;
      target ? interpret(target, context, complete, quit) : complete();
    });
  },
  ImportDeclaration: function(node, context){},
  ImportSpecifier: function(node, context){},
  LabeledStatement: function(node, context){},
  Literal: function(node, context, complete){
    complete(node.value);
  },
  LogicalExpression: function(node, context, complete){
    interpret(node.left, context, function(left){
      interpret(node.right, context, function(right){
        node.operator === '&&' ? complete(left && right) : complete(left || right);
      });
    });
  },
  MemberExpression: function(node, context, complete){
    interpret(node.object, context, function(object){
      if (node.computed) {
        interpret(node.property, context, function(property){
          finish(property);
        })
      } else {
        finish(toProperty(node.property));
      }

      function finish(prop){
        context.receiver = object;
        complete(object[prop]);
      }
    });
  },
  MethodDefinition: function(node, context, complete){
    var name = node.key.name;
    if (node.kind === 'get' || node.kind === 'set') {
      node.value.id = new ID(node.kind+'_'+name);
      interpret(node.value, context, function(result){
        complete(descriptor(node.kind, result));
      });
    } else {
      node.value.id = new ID(name);
      interpret(node.value, context, function(result){
        complete(descriptor('init', result));
      });
    }
  },
  ModuleDeclaration: function(node, context){},
  NewExpression: function(node, context, complete){
    var argv = node.arguments,
        argc = argv.length,
        args = [],
        arg;

    for (var i=0; arg = argv[i]; i++) {
      interpret(arg, context, function(result){
        args.push(result);
      });
    }

    reference(node.callee, context, function(ref){
      context = context.child(FunctionScope);
      context.environ = ref = ref.get();
      var thunk = functions.get(ref);
      if (thunk.type === Thunk.ARROW_FUNCTION)
        throw new TypeError('Arrow functions cannot be used as constructors');

      ToObject(context, ref.prototype, function(receiver){
        context.receiver = create(receiver);
        thunk.construct(context, args, complete);
      });
    });
  },
  ObjectExpression: function(node, context, complete){
    var properties = {},
        property,
        count = node.properties.length;

    BuiltinObject.construct(context, null, function(object){
      if (!count) return complete(object);

      for (var i=0; property = node.properties[i]; i++) {
        var key = property.key.name || property.key.value;
        interpret(property.value, context, function(value){
          if (properties[key])
            properties[key][property.kind] = value;
          else
            properties[key] = descriptor(property.kind, value);

          if (!--count)
            complete(defineProperties(object, properties));
        });
      }
    });
  },
  ObjectPattern: function(node, context){},
  Path: function(node, context){},
  Program: function(node, context, complete){
    var body = node.body,
        done = false;

    context = context || new GlobalScope;

    function quit(result){
      done = true;
      complete(result);
    }

      (function next(i){
        if (done) return;
        var isDone = i === body.length - 1
            ? function(value){ complete(value) }
            : function(){ next(++i) }
        interpret(body[i], context, isDone, quit);
      })(0);

    return context;
  },
  Property: function(node, context, complete){
    interpret(node.value, context, complete);
  },
  ReturnStatement: function(node, context, complete, quit){
    interpret(node.argument, context, function(result){
      quit(result);
    });
  },
  SequenceExpression: function(node, context, complete){
   (function next(i){
      var isDone = i === node.expressions.length - 1
          ? complete
          : function(){ next(++i) }
      interpret(node.expressions[i], context, isDone);
    })(0);
  },
  SwitchCase: function(node, context, complete, quit){
    interpret(node.test, context, function(test){
      if (test === context.discriminant || test === null) {
        (function next(i){
          var isDone = i === node.consequent.length - 1
              ? function(result){ complete(result) }
              : function(){ next(++i) }
          interpret(node.consequent[i], context, isDone, quit);
        })(0);
      } else {
        complete();
      }
    });
  },
  SwitchStatement: function(node, context, complete, quit){
    interpret(node.discriminant, context, function(discriminant){
      context = new SwitchScope(context, discriminant);
      (function next(i){
        interpret(node.cases[i], context, function(result){
          if (++i < node.cases.length)
            next(i);
        }, complete);
      })(0);
    });
  },
  TaggedTemplateExpression: function(node, context, complete){
    node.quasi.tagged = context.get(node.tag.name);
    interpret(node.quasi, context, complete);
  },
  TemplateElement: function(node, context, complete){
    complete(node.value);
  },
  TemplateLiteral: function(node, context, complete){
    if (!node.converted) {
      node.converted = [];
      (function next(i){
        interpret(node.quasis[i], context, function(element){
          node.converted.push(Object.freeze(element));
          if (++i < node.quasis.length)
            next(i);
          else
            finish(Object.freeze(node.converted))
        });
      })(0);

    } else {
      finish();
    }

    function finish(){
      var args = [node.converted];
      (function next(i){
        interpret(node.expressions[i], context, function(result){
          args.push(result);

          if (++i < node.expressions.length)
            next(i);
          else
            complete(template.apply(null, args));
        });
      })(0);
    }
  },
  ThisExpression: function(node, context, complete){
    complete(context.receiver);
  },
  ThrowStatement: function(node, context, complete, exit){
    interpret(node.argument, context, function(argument){
      exit(new Thrown(argument));
    });
  },
  TryStatement: function(node, context, complete, exit){
    interpret(node.block, context, complete, function(result){
      if (result instanceof Thrown) {
        if (node.finalizer) {
          var finalize = function(result){
            interpret(node.finalizer, context, complete, exit);
          }
        } else {
          var finalize = complete;
        }

        if (!node.handlers.length)
          return finalize();

        (function next(i){
          var isDone = i === node.handlers.length - 1
              ? finalize
              : function(){ next(++i) }

          if (node.handlers[i])
            var catchContext = new CatchScope(context, node.handlers[i].param.name, result.thrown);

          interpret(node.handlers[i], catchContext, isDone);
        })(0);
      }
    })
  },
  UnaryExpression: function(node, context, complete){
    interpret(node.argument, context, function(value){
      if (node.operator === 'typeof') {
        if (value === null) return complete('object');

        var type = typeof value;
        complete(type === 'object' && functions.has(value) ? 'function' : type);

      } else if (node.operator === 'void') {
        complete(void 0);

      } else if (node.operator === '!') {
        complete(!value);

      } else {
        ToPrimitive(context, value, function(value){
          switch (node.operator) {
            case '~': complete(~value); break;
            case '+': complete(+value); break;
            case '-': complete(-value); break;
          }
        })
      }
    });
  },
  UpdateExpression: function(node, context, complete){
    reference(node.argument, context, function(ref){
      var val = ref.get(),
          newval = node.operator === '++' ? val + 1 : val - 1;

      ref.set(newval);
      complete(node.prefix ? newval : val);
    });
  },
  VariableDeclaration: function(node, context, complete, quit){
    var decls = node.declarations,
        count = decls.length,
        out = {},
        decl;

    for (var i=0; decl = decls[i]; i++) {
      interpret(decl, context, function(result){
        out[decl.id.name] = result;
        if (i === count - 1) complete(out);
      });
    }
  },
  VariableDeclarator: function(node, context, complete){
    function declare(result){
      if (node.id.type === 'Identifier')
        context.declare(node.kind, node.id.name, result);

      complete(result);
    }

    if (node.init)
      interpret(node.init, context, declare);
    else
      declare();
  },
  WhileStatement: function(node, context, complete, quit){
    (function loop(i){
      interpret(node.test, context, function(test){
        if (!test) return complete();
        interpret(node.body, context, function(){
          i > 100 ? nextTick(loop) : loop(++i || 0);
        }, function(action){
          if (action === CONTINUE)
            i > 100 ? nextTick(loop) : loop(++i || 0);
          else if (action === BREAK)
            complete();
        });
      });
    })();
  },
  WithStatement: function(node, context, complete, quit){
    interpret(node.object, context, function(object){
      context = new WithScope(context, object);
      interpret(node.body, context, complete, quit)
    });
  },
  YieldExpression: function(node, context, complete){},
};

//['filter', 'every', 'some', 'sort', 'reduceRight']

var x = new Interpretor
x.execute('y = a => { throw "wtf" }; y()', console.log)
