var descriptor = require('./descriptor'),
    inherit = require('./utility').inherit,
    define = require('./utility').define,
    AST = require('./AST'),
    hasOwn = {}.hasOwnProperty,
    create = Object.create,
    defineProperty = Object.defineProperty,
    defineProperties = Object.defineProperties;




module.exports = Interpretor;

// ###################
// ### Interpretor ###
// ###################

function Interpretor(subject){
  var self = this;

  if (typeof subject === 'string') {
    this.ast = new AST(0, 0, subject).toJSON();
    this.src = subject;
  } else if (isObject(subject)) {
    this.ast = subject;
  }

  define(this, '_events', {});

  this.context = interpretors.Program(this.ast, null, function(result){
    if (result instanceof Thrown) {
      self.emit('uncaughtException', result.thrown);
    } else {
      self.emit('complete', result);
    }
  }, function(result){
    if (result instanceof Thrown) {
      self.emit('uncaughtException', result.thrown);
    } else {
      self.emit('halted', result);
    }
  });

  this.context.on('pause', function(context){
    self.emit('pause', context);
  });

  this.context.on('resume', function(){
    self.emit('resume');
  });
}

define(Interpretor, [
  function interpret(origin){
    if (typeof origin === 'function')
      return new Interpretor(origin + '');
    else if (typeof origin === 'string' && fs.existsSync(origin))
      return new Interpretor(fs.readFileSync(origin, 'utf8'));
    else if (typeof origin === 'string' || isObject(origin))
      return new Interpretor(origin)
  }
]);


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
  }
]);




var functions = new WeakMap,
    primitiveWrappers = new WeakMap,
    argumentObjects = new WeakMap;


var nextTick = typeof process !== 'undefined' ? process.nextTick : function(f){ setTimeout(f, 1) };


function parse(src){
  return new AST(0, 0, src).toJSON().body[0];
}

function isObject(v){
  return typeof v === 'object' ? v !== null : typeof v === 'function';
}

function noop(){}


function method(object, func){
  defineProperty(object, func.name, {
    configurable: true,
    enumerable: true,
    writable: true,
    value: func
  });
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

  return node.thunk = new Thunk(name, node.params.length, call, construct);
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
        enumerable: true,
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
  name: null,
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
  process.EventEmitter.call(this);
  this.type = 'global';
  define(this, 'global', this);
  define(this, 'ObjectPrototype', create(null));

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

  }

  this.record = record;
  this.receiver = this.record;
  define(this, 'environ', this.record);
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

function SwitchScope(discriminant, parent){
  this.type = 'switch';
  this.discriminant = discriminant;
  Scope.call(this, parent);
}

inherit(SwitchScope, Scope);



// ##################
// ### CatchScope ###
// ##################

function CatchScope(name, value, parent){
  this.type = 'catch';
  Scope.call(this, parent);
  this.declare('catch', name, value);
}

inherit(CatchScope, Scope);


// ##########
// ### ID ###
// ##########

function ID(name){
  this.name = name;
}

ID.prototype.type = 'Identifier';










function ToObject(context, subject, complete) {
  switch (typeof subject) {
    case 'boolean': return complete(BuiltinBoolean.construct(context, [subject]));
    case 'number': return complete(BuiltinNumber.construct(context, [subject]));
    case 'string': return complete(BuiltinString.construct(context, [subject]));
    case 'function': return complete(subject);
    case 'object': if (subject !== null) return complete(subject);
    default: return complete(BuiltinObject.construct(context, [subject]));
  }
}



// #####################
// ### Builtin Types ###
// #####################

var BuiltinArray, BuiltinBoolean, BuiltinFunction, BuiltinObject,
    BuiltinMap, BuiltinNumber, BuiltinRegExp, BuiltinSet, BuiltinWeakMap;

var builtins = (function(builtins){
  function BuiltinType(options){
    this.name = options.name;
    this.call = options.call || options.construct;
    this.construct = options.construct;
    this.methods = options.methods || [];
    this.descriptor = {
      name: { value: this.name },
      length: { value: this.length }
    };
  }

  inherit(BuiltinType, Thunk, {
    type: Thunk.BUILTIN_TYPE,
    length: 1
  });

  function BuiltinFunction(options){
    this.name = options.name;
    this.length = options.length || 0;
    this.call = options.call;
    this.construct = this.call;
    this.descriptor = {
      name: { value: this.name },
      length: { value: this.length }
    };
  }

  inherit(BuiltinFunction, Thunk, {
    type: Thunk.BUILTIN_FUNCTION
  });

  function register(def){
    return builtins[def.name] = new BuiltinType(def);
  }

  function makeCollection(Ctor){
    var collections = new WeakMap,
        prototype = Ctor.name + 'Prototype',
        Builtin;

    return Builtin = register({
      name: Ctor.name,
      call: function(context, args, complete){
        if (args.receiver == null)
          return complete(Builtin.construct(context, args));

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
  }

  function makePrimitive(Ctor){
    var primitives = new WeakMap,
        prototype = Ctor.name + 'Prototype';

    return register({
      name: Ctor.name,
      call: function(context, args, complete){
        complete(Ctor(args[0]));
      },
      construct: function(context, args, complete){
        var self = create(context.global[prototype]);
        primitives.set(self, Ctor(args[0]));
        complete(self);
      }
    });
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
      defineProperty(self, 'length', descriptor('length', args.length));
      complete(self);
    }
  });

  BuiltinBoolean = makePrimitive(Boolean);

  BuiltinFunction = register({
    name: 'Function',
    construct: function(context, args, complete){
      var body = args.pop();
      var src = 'function anonymous('+args+') {\n'+body+'\n}';
      var self = new Thunk('anonymous', args.length, parse(src), null, Thunk.NORMAL_FUNCTION).instantiate(context);
      complete(self);
    },
    methods: [
      new BuiltinFunction({
        name: 'bind',
        call: function(context, args, complete){
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
        }
      })
    ]
  });

  BuiltinMap = makeCollection(Map);

  BuiltinNumber = makePrimitive(String);

  BuiltinObject = register({
    name: 'Object',
    call: function(context, args, complete){
      ToObject(context, args[0], complete);
    },
    construct: function(context, args, complete){
      complete(create(context.global.ObjectPrototype));
    }
  });

  BuiltinRegExp = register({
    name: 'RegExp',
    construct: function(context, args, complete){}
  });

  BuiltinSet = makeCollection(Set);

  BuiltinWeakMap = makeCollection(WeakMap);

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
      interpret(node.property, context, function(property){
        complete(new Reference(object, property));
      });
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
    var count = node.elements.length;

    BuiltinArray.construct(context, [count], function(array){
      if (!count) return complete(array);

      for (var i=0; i < count; i++) {
        interpret(node.elements[i], context, function(value){
          array[i] = value;
          if (i === count - 1) complete(array);
        });
      }
    });
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

    complete(thunk.instantiate(context));
  },
  AssignmentExpression: function(node, context, complete){
    reference(node.left, context, function(ref){
      interpret(node.right, context, function(value){
        switch (node.operator) {
          case '=': break;
          case '*=':   value = ref.get() * value; break;
          case '/=':   value = ref.get() / value; break;
          case '%=':   value = ref.get() % value; break;
          case '+=':   value = ref.get() + value; break;
          case '-=':   value = ref.get() - value; break;
          case '<<=':  value = ref.get() << value; break;
          case '>>=':  value = ref.get() >> value; break;
          case '>>>=': value = ref.get() >>> value; break;
          case '&=':   value = ref.get() & value; break;
          case '^=':   value = ref.get() ^ value; break;
          case '|=':   value = ref.get() | value; break;
        }
        ref.set(value);
        complete(value);
      });
    });
  },
  BinaryExpression: function(node, context, complete){
    interpret(node.left, context, function(left){
      interpret(node.right, context, function(right){
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
      });
    });
  },
  BlockStatement: function(node, context, complete, quit){
    var body = node.body,
        count = body.length,
        statement,
        done = false;

    context = context.child(BlockScope);

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
  CallExpression: function(node, context, complete){
    var argv = node.arguments,
        argc = argv.length,
        args = [],
        arg;

    for (var i=0; arg = argv[i]; i++) {
      interpret(arg, context, function(result){
        args.push(result);
      });
    }

    interpret(node.callee, context, function(result){
      context = context.child(FunctionScope);
      context.environ = result;
      functions.get(result).call(context, args, complete);
    });
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
      context.receiver = object;
      if (node.property.type === 'Identifier')
        complete(object[node.property.name]);
      else if (node.proprrty.type === 'Literal')
        complete(object[node.property.value])
      else
        interpret(node.property, context, function(property){
          complete(object[property]);
        });
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

    nextTick(function next(i){
      i = i || 0;
      if (done) return;
      var isDone = i === body.length - 1
          ? function(value){ complete([value, context]) }
          : function(){ next(++i) }
      interpret(body[i], context, isDone, quit);
    });

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
      context = new SwitchScope(discriminant, context);
      (function next(i){
        interpret(node.cases[i], context, function(result){
          if (++i < node.cases.length)
            next(i);
        }, complete);
      })(0);
    });
  },
  TaggedTemplateExpression: function(node, context){},
  TemplateElement: function(node, context){},
  TemplateLiteral: function(node, context){},
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
            var catchContext = new CatchScope(node.handlers[i].param.name, result.thrown, context);

          interpret(node.handlers[i], catchContext, isDone);
        })(0);
      }
    })
  },
  UnaryExpression: function(node, context, complete){
    interpret(node.argument, context, function(value){
      switch (node.operator) {
        case '!': return complete(!value);
        case '~': return complete(~value);
        case '+': return complete(+value);
        case '-': return complete(-value);
        case 'void': return complete();
        case 'typeof':
          if (value === null) return complete('object');
          var type = typeof value;
          return complete(type === 'object' && functions.has(value) ? 'function' : type);
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
  WithStatement: function(node, context){},
  YieldExpression: function(node, context){},
};
