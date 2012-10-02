var ASTNode = require('astify').ASTNode,
    $ = ASTNode.createNode,
    converters = {},
    freeze = $('Object').get('freeze'),
    defaultQuasi = ASTNode.parse(function(r){
      for (var i=0, o=''; r[i]; o += r[i].raw + (++i === r.length ? '' : arguments[i]));
      return o;
    });


module.exports = function(ast){
  [ 'arrow', 'class', 'module', 'taggedtemplate', 'template', 'arraypattern', 'objectpattern'].forEach(function(selector){
    ast.find(selector).forEach(function(item){
      converters[selector](item);
    });
  });
  //console.log(require('util').inspect(ast.toJSON(), null, 10))
  return ast;
}

var define = $('Object').get('defineProperty'),
    constructor = $('#literal', 'constructor'),
    hidden = $('#object', { enumerable: false });

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
  closure.append(define.call([ctor.id.get('prototype'), constructor, hidden]));
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
  var args = [$('#this'), $('#this'), ASTNode.parse('typeof exports === "undefined" ? {} : exports')];
  closure.returns('exports');
  node.replaceWith(freeze.call(closure.get('call').call(args)).declaration(node.id));
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
  this.root = $(ASTNode.gensym());
}

Destructurer.prototype = new process.EventEmitter;

Destructurer.prototype.run = function run(node){
  this.emit('begin');
  this.emit('declare', this.root.name, this.value);
  this.handle(node, []);
  this.container.insertAfter(this.root.set($('#literal', null)).toStatement(), this.parent);
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
  if (node.nearest('pattern'))
    return;

  if (node.parent.matches('decl')) {
    var handler = new Destructurer(node.parent.parent.parent, node.parent.init);

    handler.on('declare', function(name, value){
      this.parent.declare(name, value);
    });

    handler.on('add', function(name, value){
      this.parent.declare(name.name, value);
    });

    handler.on('complete', function(){
      node.parent.parent.remove(node.parent);
    });

  } else if (node.parent.matches('assign')) {
    var handler = new Destructurer(node.parent.parent, node.parent.right);

    handler.on('declare', function(name, value){
      this.container.insertBefore($('#var').declare(name, value), this.parent);
    });

    handler.on('add', function(name, value){
      this.container.insertBefore(name.set(value).toStatement(), this.parent);
    });

    handler.on('complete', function(){
      this.container.remove(this.parent);
    });

  } else {
    return console.log(node);
  }

  handler.run(node);
}

