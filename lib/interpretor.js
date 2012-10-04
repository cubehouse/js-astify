function Descriptor(enumerable, configurable){
  this.enumerable = !!enumerable;
  this.configurable = !!configurable;
}

function Accessor(get, set, enumerable, configurable){
  this.get = typeof get === 'function' ? get : undefined;
  this.set = typeof set === 'function' ? set : undefined;
  this.enumerable = !!enumerable;
  this.configurable = !!configurable;
}

Accessor.prototype = new Descriptor;

function Value(value, writable, enumerable, configurable){
  this.value = value;
  this.writable = !!writable;
  this.enumerable = !!enumerable;
  this.configurable = !!configurable;
}

Value.prototype = new Descriptor;


function NormalValue(value){
  this.value = value;
}

NormalValue.prototype = new Value(undefined, true, true, true);

function NormalGetter(get){
  this.get = get;
}

NormalGetter.prototype = new Accessor(undefined, undefined, true, true);

function NormalSetter(set){
  this.set = set;
}

NormalSetter.prototype = new Accessor(undefined, undefined, true, true);

var descs = {
  init: NormalValue,
  get: NormalGetter,
  set: NormalSetter
};

function LengthDescriptor(value){
  this.value = value >>> 0;
}

LengthDescriptor.prototype = new Value(0, true, false, false);



function ToObject(context, args) {
  switch (typeof args[0]) {
    case 'boolean': return builtins.Boolean.construct(context, args);
    case 'number': return builtins.Number.construct(context, args);
    case 'string': return builtins.String.construct(context, args);
    case 'function': return args[0];
    case 'object': if (args[0] !== null) return args[0];
    default: return builtins.Object.construct(context, args);
  }
}

function isObject(v){
  return typeof v === 'object' ? v !== null : typeof v === 'function';
}

var create = Object.create;

function noop(){}

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



var builtins = {
  Array: {
    construct: function(context, args){
      var self = create(context.builtins.Array.prototype);
      for (var i=0; i < args.length; i++)
        self[i] = args[i];
      Object.defineProperty(self, 'length', new LengthDescriptor(args.length));
      return self;
    }
  },
  Boolean: {
    call: function(context, args){
      return !!args[0];
    },
    construct: function(context, args){
      var self = create(context.builtins.Boolean.prototype);
      primitiveWrappers.set(self, !!args[0]);
      return self;
    }
  },
  Function: {
    construct: function(context, args){}
  },
  Map: {
    construct: function(context, args){}
  },
  Number: {
    call: function(context, args){
      return +args[0];
    },
    construct: function(context, args){
      var self = create(context.builtins.Number.prototype);
      primitiveWrappers.set(self, ''+args[0]);
      return self;
    }
  },
  Object: {
    call: ToObject,
    construct: function(context, args){
      return create(context.builtins.Object.prototype);
    }
  },
  RegExp: {
    construct: function(context, args){}
  },
  Set: {
    construct: function(context, args){}
  },
  String: {
    call: function(context, args){
      return args[0]+'';
    },
    construct: function(context, args){
      var self = create(context.builtins.String.prototype);
      primitiveWrappers.set(self, ''+args[0]);
      return self;
    }
  },
  WeakMap: {
    construct: function(context, args){}
  }
};

builtins.Array.call = builtins.Array.construct;
builtins.Function.call = builtins.Function.construct;
builtins.Map.call = builtins.Map.construct;
builtins.RegExp.call = builtins.RegExp.construct;
builtins.Set.call = builtins.Set.construct;
builtins.WeakMap.call = builtins.WeakMap.construct;





function Thunk(context, name, length, prototypeless){
  this.context = context;
  this.name = name || '';
  this.length = length >> 0;
  this.prototypeless = prototypeless === true;
}

define(Thunk.prototype, [
  function instantiate(){
    var object = create(this.context.builtins.Function.prototype, {
      name: { value: this.name },
      length: { value: this.length }
    });

    if (!this.prototypeless) {
      Object.defineProperty(object, 'prototype', {
        writable: !this.locked,
        value: create(this.context.builtins.Object.prototype, {
          constructor: {
            configurable: true,
            writable: true,
            value: object
          }
        });
      });
    }

    functions.set(object, this);
    return object;
  }
]);


function Scope(parent){
  this.parent = parent;
  this.record = Object.create(parent ? parent.record : null);
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
  function declare(type, name){
    if (!hasOwn.call(this.record, name))
      this.record[name] = undefined;
    return this.ref(name);
  },
  function strictDeclare(type, name){
    if (hasOwn.call(this.record, name))
      throw new ReferenceError('Duplicate declaration for "'+name+'"');
    this.record[name] = undefined;
    return this.ref(name);
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
      throw new ReferenceError('Undefined identifier "'+name+'"');
  },
  function ref(name){
    return new Reference(this.record, name);
  }
]);


function GlobalScope(context){
  this.parent = null;
  this.global = this;

  var ObjectPrototype = create(null);
  var FunctionPrototype = create(ObjectPrototype, {
    name:   { value: 'Empty' },
    length: { value: 1 },
  });

  function builtin(name, prototype){
    var Ctor = create(FunctionPrototype, {
      name:      { value: name },
      length:    { value: 1 },
      prototype: { value: prototype || create(ObjectPrototype) }
    });
    define(Ctor.prototype, 'constructor', Ctor);
    functions.set(Ctor, builtins[name]);
    return Ctor;
  }


  this.builtins = {
    Array: builtin('Array'),
    Boolean: builtin('Boolean'),
    Function: builtin('Function', FunctionPrototype),
    Map: builtin('Map'),
    Number: builtin('Number'),
    Object: builtin('Object', ObjectPrototype),
    RegExp: builtin('RegExp'),
    Set: builtin('Set'),
    String: builtin('String'),
    WeakMap: builtin('WeakMap'),
  };

  this.record = create(ObjectPrototype);
  for (var k in this.builtins) {
    Object.defineProperty(this.record, k, {
      configurable: true,
      writable: true,
      value: this.builtins[k]
    });
  }
}

inherit(GlobalScope, Scope);


function FunctionScope(parent){
  Scope.call(this, parent);
}

inherit(FunctionScope, Scope);

function ModuleScope(parent){
  Scope.call(this, parent);
  this.record.super = function(){};
}

inherit(ModuleScope, Scope);


function BlockScope(parent){
  Scope.call(this, parent);
}

inherit(BlockScope, Scope, [
  function declare(type, name){
    if (type === 'let') {
      if (!hasOwn.call(this.record, name))
        this.record[name] = undefined;
      var scope = this;
    } else {
      var scope = this.nearest(FunctionScope) || this.global;
      scope.declare(type, name);
    }
    return scope.ref(name);
  },
  function strictDeclare(type, name){
    if (type === 'let') {
      if (hasOwn.call(this.record, name))
        throw new ReferenceError('Duplicate declaration for "'+name+'"');
      this.record[name] = undefined;
      var scope = this;
    } else {
      var scope = this.nearest(FunctionScope) || this.global;
      scope.strictDeclare(type, name);
    }
    return scope.ref(name);
  },
]);



var interpretors = {
  ArrayExpression: function(node, context, complete){
    var count = node.elements.length,
        array = new context.Array(count);

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
        count = node.properties.length;

    if (!count)
      return complete(new context.Object);

    function each(property, value){
      if (properties[property.key]) {
        properties[property.key][property.type] = value;
      } else {
        var Desc = descs[property.type];
        properties[property.key] = new Desc(value);
      }
      if (!--count)
        complete(Object.defineProperties(new context.Object, properties));
    }

    node.properties.forEach(function(property){
      properties[property.key] = null;
      interpret(property.value, context, each.bind(null, property));
    });
  },
  ObjectPattern: function(node, context){},
  Path: function(node, context){},
  Program: function(node, context){},
  Property: function(node, context){},
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
