var ASTNode = require('astify').ASTNode,
    $ = ASTNode.createNode,
    converters = {},
    freeze = $('Object').get('freeze'),
    defaultQuasi = ASTNode.parse(function(r){
      for (var i=0, o=''; r[i]; o += r[i].raw + (++i === r.length ? '' : arguments[i]));
      return o;
    });


module.exports = function(ast){
  ['class', 'module', 'arrow', 'taggedquasi', 'quasi'].forEach(function(selector){
    ast.find(selector).forEach(function(item){
      converters[selector](item);
    });
  });
  return ast;
}



function addConverter(type, callback){
  converters[type] = callback;
}


addConverter('class', function(node){
  var ctor = node.findConstructor();

  ctor.id = node.id || node.identity;

  if (node.superClass) {
    var superclass = node.superClass;
    node.find('member[object=super]').forEach(function(superCall){
      var call = superCall.getParent();
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


  var prototype = $('#object', { constructor: node.id });
  closure.append(node.id.set('prototype', prototype));

  node.findAccessors().forEach(function(accessor){
    prototype.append($('#property', accessor.kind, accessor.key, accessor.value));
  });
  node.findMethods().forEach(prototype.set.bind(prototype));


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
  var closure = $('#functionexpr', null, ['global', 'exports'], node.body);
  var args = [$('#this'), $('#this'), ASTNode.parse('typeof exports === "undefined" ? {} : exports')];
  closure.returns('exports');
  node.replaceWith(freeze.call(closure.get('call').call(args)).declaration(node.id));
});

addConverter('quasi', function(node, tag){
  var components = $('#array'),
      identity = $(node.identity),
      params = node.expressions.clone();

  for (var i=0; i < node.quasis.length; i++) {
    components.append(freeze.call($('#object', node.quasis[i].value)));
  }

  node.parentScope().declare(node.identity);
  params.unshift(identity.OR(identity.SET(freeze.call(components))));
  node.replaceWith((tag || defaultQuasi).clone().call(params));
});

addConverter('taggedquasi', function(node){
  converters.quasi(node.quasi, node.tag);
  node.replaceWith(node.quasi);
});

addConverter('export', function(node){
  var decl = node.declaration.declarations[0],
      exports = $('exports').set(decl.id, decl.init.clone());
  decl.init.replaceWith(exports);
  node.replaceWith(node.declaration);
});
