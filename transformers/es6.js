var ASTNode = require('astify').ASTNode,
    $ = ASTNode.createNode,
    converters = {},
    define = require('../lib/utility').define,
    freeze = $('Object').get('freeze'),
    defaultQuasi = ASTNode.parse(function(r){
      for (var i=0, o=''; r[i]; o += r[i].raw + (++i === r.length ? '' : arguments[i]));
      return o;
    });

module.exports = function(ast){
  for (var k in converters) {
    ast.find(k).forEach(function(item){
      converters[k](item);
    });
  }
  //console.log(require('util').inspect(ast.toJSON(), null, 10))
  return ast;
}

function typeOF(name, type){
  return $('#binary', '===', $('#unary', 'typeof', $(name)), $('#literal', type));
}

function ternary(check, either, or){
  return $('#conditional', check, either, or);
}

function object(){
  return $('#object');
}

function get(path){
  if (typeof path === 'string')
    path = path.split('.');
  var base = typeof path[0] === 'string' ? $(path[0]) : path[0];
  for (var i=1; i < path.length; i++)
    base = base.get(path[i]);
  return base;
}


var defineProperty = get('Object.defineProperty'),
    constructor = $('#literal', 'constructor'),
    hidden = $('#object', { enumerable: false }),
    arraySlice = get('Array.prototype.slice.call');



function addConverter(type, callback){
  converters[type] = callback;
}



addConverter('function[rest!=null]', function(node){
  var index = node.params.length;
  var decl = $('#var').declare(node.rest.name, arraySlice.call([$('#ident', 'arguments'), index]));
  node.body.prepend(decl);
  node.rest = null;
});

addConverter('class', function(node){
  var ctor = node.findConstructor();
  ctor.id = node.id || node.identity;

  if (node.superClass) {
    var superclass = node.superClass && node.superClass.clone();
    node.find('member[object=super]').forEach(function(superCall){
      var call = superCall.parent;
      call.callee = get(superclass, 'prototype', superCall.property);
      call.call();
    });
    node.find('call[callee=super]').forEach(function(superCall){
      superCall.callee = superclass.clone();
      superCall.call();
    });
  }

  var closure = ctor.scopedDeclaration();
  var ret = closure.pop();
  var prototype = $('#object');

  if (node.superClass) {
    closure.addArgument(node.superClass);
    prototype.set('__proto__', node.superClass.get('prototype'));
  }

  prototype.set('constructor', node.id);

  node.find('method[key != constructor]').forEach(function(method){
    prototype.append($('#property', method.kind || 'init', method.key.clone(), method.value.clone()));
  });

  closure.append(node.id.set('prototype', prototype));
  closure.append(defineProperty.call([ctor.id.get('prototype'), constructor, hidden]));
  closure.append(ret);

  if (node.matches('class')) {
    var decl = closure.declaration(ctor.id);
    decl.identity = ctor.id.name;
    node.replaceWith(decl);
  } else {
    node.replaceWith(closure);
  }
});

addConverter('arrow', function(node){
  var body = node.body.clone();
  if (!node.body.matches('block'))
    body = $('#block').append($('#return', body));

  var func = $('#function', null, node.params.clone(), body);

  if (node.find('this').length)
    func = func.get('bind').call([$('#this')]);

  node.replaceWith(func);
});

addConverter('module', function(node){
  node.find('export').forEach(converters.export);
  var closure = $('#functionexpr', null, ['global', 'exports'], node.body.clone());
  var args = [$('#this'), $('#this'), ternary(typeOF('exports', 'undefined'), object(), $('exports'))];
  closure.returns('exports');
  var decl = freeze.call(closure.get('call').call(args)).declaration(node.id);
  node.replaceWith(decl);
});

addConverter('template', function(node, tag){
  var components = $('#array'),
      identity = $(node.identity),
      params = node.expressions;

  for (var i=0; i < node.quasis.length; i++) {
    components.append($('#object', node.quasis[i].value));
  }

  node.topScope().declare(node.identity);
  params.prepend(identity.OR(identity.SET(freeze.call(components.get('map').call([freeze])))));
  node.replaceWith((tag || defaultQuasi).call(params));
});

addConverter('taggedtemplate', function(node){
  converters.template(node.quasi, node.tag);
  node.replaceWith(node.quasi);
});

addConverter('export', function(node){
  var decl = node.declaration.declarations[0],
      exports = $('exports').set(decl.id, decl.init);
  decl.init.replaceWith(exports);
  node.replaceWith(node.declaration);
});

addConverter('arraypattern', patterns);
addConverter('objectpattern', patterns);


function Destructurer(parent, value, onAdd, onComplete){
  this.parent = parent;
  this.container = parent.parent;
  this.value = value;
  this.add = onAdd;
  this.complete = onComplete;
  this.root = value.matches('ident') ? value.clone() : $('$arg');
  this.closure = $('#unary', 'void', $('#iife')).toStatement();
  this.decl = parent.matches('var') ? parent : $('#var');
  this.iife = this.closure.find('#iife')[0].parent.parent;
}

function destructure(node, parent, value){
  var handler = new Destructurer(parent, value);
  handler.run(node);
}

var interpretPattern = {
  ArrayPattern: function(node, index, array){
    this.handle(node, array.path.concat(index));
  },
  ObjectPattern: function(prop, index, array){
    this.handle(prop.value, array.path.concat(prop.key.name));
  }
};



define(Destructurer.prototype, [
  function run(node){
    this.iife.addArgument(this.root, this.value);
    this.handle(node, []);
    this.container.insertAfter(this.closure, this.parent);

    if (this.decl !== this.parent && this.decl.declarations.length)
      this.container.insertAfter(this.decl, this.parent);

    if (!this.parent.matches('var') || this.parent.declarations.length === 0)
      this.container.remove(this.parent);
  },
  function handle(node, path){
    if (node.matches('pattern')) {
      var components = node.elements || node.properties;
      components.path = path;
      components.forEach(interpretPattern[node.type], this);

      if (node.parent.matches('decl'))
      node.parent.parent.remove(node.parent);

    } else {
      var resolved = this.resolve(path);

      if (node.matches('ident'))
        this.decl.append($('#decl', node.clone()));
      else if (node.matches('member'))
        node = this.checkForThis(node)

      this.iife.append(node.set(resolved));
    }
  },
  function checkForThis(node){
    var obj = node;
    while (obj.parent && obj.parent.matches('member'))
      obj = obj.parent;

    if (obj.object.matches('this')) {
      this.usesThis();
      node = node.clone();
      node.object.replaceWith($('$this'));
    }
    return node;
  },
  function usesThis(){
    this.iife.addArgument($('$this'), $('#this'));
    this.usesThis = function(){}
  },
  function resolve(path){
    var root = this.root;
    for (var i=0; i < path.length; i++)
      root = root.get(path[i]);
    return root;
  }
]);


function patterns(node){
  if (!node.nearest('pattern')) {
    if (node.parent.matches('decl'))
      destructure(node, node.parent.parent.parent, node.parent.init);
    else if (node.parent.matches('assign'))
      destructure(node, node.parent.parent, node.parent.right);
  }
}
