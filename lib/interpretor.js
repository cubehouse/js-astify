var descriptor = require('./descriptor'),
    inherit = require('./utility').inherit,
    define = require('./utility').define,
    hasOwn = {}.hasOwnProperty,
    create = Object.create,
    defineProperty = Object.defineProperty;





function isObject(v){
  return typeof v === 'object' ? v !== null : typeof v === 'function';
}

function noop(){}

function ToObject(context, subject) {
  switch (typeof subject) {
    case 'boolean': return BuiltinBoolean.construct(context, [subject]);
    case 'number': return BuiltinNumber.construct(context, [subject]);
    case 'string': return BuiltinString.construct(context, [subject]);
    case 'function': return subject;
    case 'object': if (subject !== null) return subject;
    default: return BuiltinObject.construct(context, [subject]);
  }
}



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
  },
  function neuter(){
    this.get = this.set = noop;
    this.key = this.subject = null;
  }
]);


var functions = new WeakMap,
    primitiveWrappers = new WeakMap;


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
  this.type = type || Thunk.NORMAL;
  this.descriptor = {
    name: { value: name },
    length: { value: length }
  };
}

var prototypeTemplate = {
  constructor: {
    configurable: true,
    writable: true,
    value: undefined
  }
}

Thunk.NORMAL = 0;
Thunk.BUILTIN_TYPE = 1;
Thunk.BUILTIN_FUNCTION = 2;

define(Thunk.prototype, [
  function instantiate(context){
    var functionObject = create(context.global.FunctionPrototype, this.descriptor);

    if (this.type === Thunk.NORMAL) {
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

    functions.set(functionObject, this);
    return functionObject;
  }
]);




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
  }

  inherit(BuiltinType, Thunk, {
    type: Thunk.BUILTIN_TYPE,
    length: 1
  });

  function register(def){
    return builtins[def.name] = new BuiltinType(def);
  }

  function makeCollection(name, Ctor){
    var collections = new WeakMap,
        prototype = name + 'Prototype',
        Builtin;

    return Builtin = register({
      name: name,
      call: function(context, args){
        if (args.receiver == null)
          return Builtin.construct(context, args);

        var target = ToObject(context, args.receiver);
        if (collections.has(target))
          throw new TypeError('Object is already a Set');

        collections.set(target, new Ctor);
        return target;
      },
      construct: function(context, args){
        var self = create(context.global[prototype]);
        collections.set(self, new Ctor);
        return self;
      }
    });
  }

  function makePrimitive(name, coerce){
    var primitives = new WeakMap,
        prototype = name + 'Prototype';

    return register({
      name: name,
      call: function(context, args){
        return coerce(args[0]);
      },
      construct: function(context, args){
        var self = create(context.global[prototype]);
        primitives.set(self, coerce(args[0]));
        return self;
      }
    });
  }

  BuiltinArray = register({
    name: 'Array',
    construct: function(context, args){
      var self = create(context.global.ArrayPrototype);
      if (args.length === 1 && typeof args[0] === 'number') {
        var len = args[0];
      } else {
        for (var i=0; i < args.length; i++)
          self[i] = args[i];
        var len = args.length;
      }
      return defineProperty(self, 'length', descriptor('length', args.length));
    }
  });

  BuiltinBoolean = makePrimitive('Boolean', Boolean);

  BuiltinFunction = register({
    name: 'Function',
    construct: function(context, args){}
  });

  BuiltinMap = makeCollection('Map', Map);

  BuiltinNumber = makePrimitive('String', String);

  BuiltinObject = register({
    name: 'Object',
    call: function(context, args){
      return ToObject(context, args[0]);
    },
    construct: function(context, args){
      return create(context.global.ObjectPrototype);
    }
  });

  BuiltinRegExp = register({
    name: 'RegExp',
    construct: function(context, args){}
  });

  BuiltinSet = makeCollection('Set', Set);

  BuiltinWeakMap = makeCollection('WeakMap', WeakMap);

  return builtins;
}({}));


function Scope(parent){
  this.parent = parent;
  this.record = create(parent.record);
  define(this, 'global', parent.global);
}

define(Scope.prototype, [
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
    return new Reference(this.record, name);
  },
  function child(ScopeType){
    return new ScopeType(this);
  },
  function error(type, message){

  },
  function create(Type, args){
    return builtins[Type].construct(this, args ? args : []);
  }
]);



function GlobalScope(){
  this.type = 'global';
  define(this, 'global', this);
  this.ObjectPrototype = create(null);

  for (var name in builtins)
    if (name !== 'Object')
      this[name+'Prototype'] = create(this.ObjectPrototype);

  var record = create(this.ObjectPrototype);

  for (var name in builtins) {
    this[name] = builtins[name].instantiate(this);
    defineProperty(record, name, {
      configurable: true,
      writable: true,
      value: this[name]
    });
  }

  this.record = record;
}

inherit(GlobalScope, Scope);


function FunctionScope(parent){
  this.type = 'function';
  Scope.call(this, parent);
}

inherit(FunctionScope, Scope);



function ModuleScope(parent){
  this.type = 'module';
  Scope.call(this, parent);
  this.record.super = function(){};
}

inherit(ModuleScope, Scope);


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

var glob = new GlobalScope();
var block = glob.child(FunctionScope).child(BlockScope);
block.declare('let', 'Function', 'whetver')
block.declare('var', 'Function', 'x')
console.log(block);


var interpretors = {
  ArrayExpression: function(node, context, complete){
    var count = node.elements.length,
        array = BuiltinArray.construct(context, [count]);

    if (!count)
      return complete(array);

    function each(i, value){
      array[i] = value;
      if (!--count)
        complete(array);
    }

    for (var i=0; i < node.elements; i++)
      interpret(node.elements[i], context, each.bind(null, i));
  },
  ArrayPattern: function(node, context){},
  ArrowFunctionExpression: function(node, context){},
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
  BlockStatement: function(node, context){},
  BreakStatement: function(node, context){},
  CallExpression: function(node, context){},
  CatchClause: function(node, context){},
  ClassBody: function(node, context){},
  ClassDeclaration: function(node, context){},
  ClassExpression: function(node, context){},
  ClassHeritage: function(node, context){},
  ConditionalExpression: function(node, context){},
  ContinueStatement: function(node, context){},
  DebuggerStatement: function(node, context){},
  DoWhileStatement: function(node, context){},
  EmptyStatement: function(node, context){},
  ExportDeclaration: function(node, context){},
  ExportSpecifier: function(node, context){},
  ExportSpecifierSet: function(node, context){},
  ExpressionStatement: function(node, context){},
  ForInStatement: function(node, context){},
  ForOfStatement: function(node, context){},
  ForStatement: function(node, context){},
  FunctionDeclaration: function(node, context){},
  FunctionExpression: function(node, context){},
  Glob: function(node, context){},
  Identifier: function(node, context){},
  IfStatement: function(node, context){},
  ImmediatelyInvokedFunctionExpression: function(node, context){},
  ImportDeclaration: function(node, context){},
  ImportSpecifier: function(node, context){},
  LabeledStatement: function(node, context){},
  Literal: function(node, context, complete){
    complete(node.value);
  },
  LogicalExpression: function(node, context){},
  MemberExpression: function(node, context){},
  MethodDefinition: function(node, context){},
  ModuleDeclaration: function(node, context){},
  NewExpression: function(node, context){},
  ObjectExpression: function(node, context, complete){
    var properties = {},
        count = node.properties.length,
        object = BuiltinObject.construct(context);

    if (!count)
      return complete(object);

    function each(property, value){
      if (properties[property.key])
        properties[property.key][property.type] = value;
      else
        properties[property.key] = descriptor(property.type, value);

      if (!--count)
        complete(defineProperties(object, properties));
    }

    node.properties.forEach(function(property){
      properties[property.key] = null;
      interpret(property.value, context, each.bind(null, property));
    });
  },
  ObjectPattern: function(node, context){},
  Path: function(node, context){},
  Program: function(node, context, complete){
    context = context || new GlobalScope;
    for (var i=0; i < node.body.length; i++) {

    }
  },
  Property: function(node, context, complete){

  },
  ReturnStatement: function(node, context){},
  SequenceExpression: function(node, context){},
  SwitchCase: function(node, context){},
  SwitchStatement: function(node, context){},
  TaggedTemplateExpression: function(node, context){},
  TemplateElement: function(node, context){},
  TemplateLiteral: function(node, context){},
  ThisExpression: function(node, context){
    return context.receiver;
  },
  ThrowStatement: function(node, context){},
  TryStatement: function(node, context){},
  UnaryExpression: function(node, context){},
  UpdateExpression: function(node, context){},
  VariableDeclaration: function(node, context){},
  VariableDeclarator: function(node, context){},
  WhileStatement: function(node, context){},
  WithStatement: function(node, context){},
  YieldExpression: function(node, context){},
};
