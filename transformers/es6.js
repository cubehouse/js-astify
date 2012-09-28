var ASTNode = require('astify').ASTNode,
    $ = ASTNode.createNode,
    converters = {},
    freeze = $('Object').get('freeze'),
    defaultQuasi = ASTNode.parse(function(r){
      for (var i=0, o=''; r[i]; o += r[i].raw + (++i === r.length ? '' : arguments[i]));
      return o;
    });


module.exports = function(ast){
  [ 'arrow','class', 'module', 'taggedtemplate', 'template', 'arraypattern', 'objectpattern'].forEach(function(selector){
    ast.find(selector).forEach(function(item){
      converters[selector](item);
    });
  });
  //.log(ast.find('function[id=set]').toJSON())
  return ast;
}



function addConverter(type, callback){
  converters[type] = callback;
}


addConverter('class', function(node){
  var ctor = node.findConstructor();

  ctor.id = node.id || node.identity;

  if (node.superClass) {
    var superclass = node.superClass && node.superClass.clone();
    node.find('member[object=super]').forEach(function(superCall){
      var call = superCall.parent;
      call.callee = superclass.get('prototype').get(superCall.property);
      call.call();
    });
    node.find('call[callee=super]').forEach(function(superCall){
      superCall.callee = superclass.clone();
      superCall.call();
    });
  }

  var closure = ctor.scopedDeclaration();
  var ret = closure.pop();

  if (node.superClass)
    closure.addArgument(node.superClass);


  var prototype = $('#object', { constructor: node.id.clone() });

  node.find('method[key != constructor]').forEach(function(method){
    prototype.append($('#property', method.kind || 'init', method.key.clone(), method.value.clone()));
  });


  closure.append(node.id.set('prototype', prototype));

  if (node.type === 'ClassDeclaration') {
    var decl = closure.declaration(ctor.id);
    decl.identity = ctor.id.name;
    node.replaceWith(decl);
  } else {
    node.replaceWith(closure);
  }
});

addConverter('arrow', function(node){
  node.replaceWith(node.toExpression());
});

addConverter('module', function(node){
  node.find('export').forEach(converters.export);
  var closure = $('#functionexpr', null, ['global', 'exports'], node.body.clone());
  var args = [$('#this'), $('#this'), ASTNode.parse('typeof exports === "undefined" ? {} : exports')];
  closure.returns('exports');
  node.replaceWith(freeze.call(closure.get('call').call(args)).declaration(node.id));
});

addConverter('template', function(node, tag){
  var components = $('#array'),
      identity = $(node.identity),
      params = node.expressions;

  for (var i=0; i < node.quasis.length; i++) {
    components.append(freeze.call($('#object', node.quasis[i].value)));
  }

  node.topScope().declare(node.identity);
  params.prepend(identity.OR(identity.SET(freeze.call(components))));
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
  this.value = value;
  this.add = onAdd;
  this.complete = onComplete;
  this.container = parent.parent;
}

Destructurer.prototype = new process.EventEmitter;

Destructurer.prototype.run = function run(node){
  this.emit('begin');
  this.handle(node, []);
  this.emit('complete');
}

Destructurer.prototype.handle = function handle(node, path){
  if (node.matches('arraypattern')) {
    node.elements.forEach(function(subnode, index){
      this.handle(subnode, path.concat(index));
    }, this);
  } else if (node.matches('objectpattern')) {
    node.properties.forEach(function(prop){
      this.handle(prop.value, path.concat(prop.key.name));
    }, this);
  } else if (!this.root) {
    this.root = node.clone();
    this.container.insertAfter(this.root.set(this.resolve(path)).toStatement(), this.parent);
    if (this.value.toSource() !== this.root.toSource())
      this.emit('add', this.root, this.value.clone());
  } else {
    this.emit('add', node, this.resolve(path));
  }
};

Destructurer.prototype.resolve = function resolve(path){
  var root = this.root;
  for (var i=0; i < path.length; i++)
    root = root.get(path[i]);
  return root;
}



function patterns(node){
  if (node.nearest('arraypattern') || node.nearest('objectpattern'))
    return;

  if (node.parent.matches('decl')) {
    var handler = new Destructurer(node.parent.parent.parent, node.parent.init);
    handler.on('add', function(name, value){
      this.parent.declare(name.name, value);
    });
    handler.on('complete', function(){
      node.parent.parent.remove(node.parent);
    });
  } else if (node.parent.right) {
    var handler = new Destructurer(node.parent.parent, node.parent.right);
    handler.on('add', function(name, v){
      this.container.insertBefore(name.set(v).toStatement(), this.parent);
    });
    handler.on('complete', function(){
      this.container.remove(this.parent);
    });
  } else {
    return console.log(node);
  }

  handler.run(node);
}

