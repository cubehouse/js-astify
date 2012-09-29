var fs = require('fs'),
    path = require('path'),
    cache = require('module')._cache,
    natives = process.binding('natives');

var astify = require('astify').ASTNode,
    $ = astify.createNode;

function modulePaths(name){
  require(name);
  var mod = cache[require.resolve(name)];
  return [mod.filename].concat(childPaths(mod));
}

function childPaths(module){
  return [].concat.apply([], (module.children || []).map(function(module){
    return childPaths(module).concat(module.filename);
  }));
}

function open(file){
  return fs.readFileSync(file, 'utf8');
}

function toRelative(from, to){
  return './'+path.relative(from, to).replace(/\\/g, '/');
}

function findExports(ast){
  var idents = ast.find('ident[name=exports]').parent().map(function(node){
    if (node.matches('member')) {
      if (node.object.name === 'module')
        return node.parent.right;
      else if (node.object.name === 'exports')
        return node.right;
    }
  }).filter(Boolean);
  return idents.map(function(node){
    switch (node.type) {
      case 'CallExpression':
        return {
          func: node.callee.name,
          args: node.arguments.map(function(arg){
                  arg = Object(arg);
                  return 'name'  in arg ? arg.name
                       : 'value' in arg ? arg.value
                       : 'id'    in arg ? arg.id.name
                       : 'key'   in arg ? arg.key.name : arg;
                })
        };
    }
  });
}

function findRequires(ast){
  return ast.find('call[callee=require]').map(function(call){
    return call.arguments[0];
  });
}

var requests = {};

var graph = {};
var ids = 0;
function Dependencies(file){
  this.file = file;
  this.dir = path.dirname(file);
  this.nodes = [];
  Object.defineProperty(this, 'source', { writable: true, value: open(file) });
  Object.defineProperty(this, 'ast', { writable: true, value: astify.parse(this.source) });
  this.requires = findRequires(this.ast).map(function(request){
    var name = 'value' in request ? request.value : 'name' in request ? request.name : request;
    if (typeof name === 'string') {
      if (/^[.\/\\]/.test(name)) {
        request = requests[name] = path.resolve(this.dir, name);
        requests[request] = requests[name];
        return request;
      } else if (request in natives) {
        request = requests[name] = 'builtin/'+name;
        requests[request] = requests[name];
        return request;
      }
    }
    try {
      request = requests[name] = require.resolve(name);
      requests[request] = requests[name];
      return request;
    } catch (e){}
  }, this);

  this.extensions();
  if (this.file in Dependencies.graph)
    return Dependencies.graph[this.file];
  Dependencies.graph[this.file] = this;
  this.id = ids++;
  this.refs = 0;
}

Dependencies.graph = {}

Dependencies.prototype.extensions = function extensions(){
  this.requires.forEach(function(request, i){
    if (!/\.(js|json|node)^/.test(request)) {
      if (fs.existsSync(request+'.js'))
        this.requires[i] = requests[request] = request+'.js';
      else if (fs.existsSync(request+'.json'))
        this.requires[i] = requests[request] = request+'.json';
    }
  }, this);
}

Dependencies.prototype.link = function link(){
  if (this.requires instanceof Array) {
    var out = {};
    this.requires.forEach(function(name){
      if (name in Dependencies.graph) {
        out[name] = Dependencies.graph[name];
        out[name].refs++;
      }
    }, this);
    this.count = this.requires.length;
    this.req = this.requires;
    this.requires = out;
  }
}

Dependencies.prototype.transform = function transform(){
  this.ast.find('ident[name=exports]').forEach(function(node){
    node = node.parent;
    if (node.matches('member') && node.object.name === 'exports') {
      node.replaceWith($('module').get('exports').get(node.property));
    }
  });
  var closure = $('#iife');
  closure.pop();
  closure.append(this.ast);
  closure.returns($('module').get('exports'));
  closure.arguments.append($('#object').set('exports', $('#object')));
  closure.callee.params.append($('#ident', 'module'));
  this.ast = closure.declaration();
  this.identity = this.ast.declarations[0].id.name;
};

var mods = modulePaths('astify').map(function(file){
  try {
    return new Dependencies(file)
  } catch (e) {
  }
}).filter(Boolean);

mods.forEach(function(mod){
  mod.link();
});


var sorted = {};
Object.keys(Dependencies.graph).sort(function(a, b){
  return Dependencies.graph[a].count - Dependencies.graph[b].count;
}).forEach(function(dep){
  dep = Dependencies.graph[dep];
  sorted[dep.file] = dep.count;
});

Object.keys(sorted).forEach(function(name){
  Dependencies.graph[name].transform();
});


for (var k in requests) {
  if (requests[k] in requests)
    requests[k] = requests[requests[k]];
  if (requests[k] in Dependencies.graph)
    requests[k] = Dependencies.graph[requests[k]].identity
}
var done = [];

Object.keys(sorted).forEach(function(name){
  var deps = Dependencies.graph[name];
  deps.ast.find('call[callee=require].arguments').forEach(function(req){
    req.parent.replaceWith($(requests[req[0].value]));
  });
  deps.count = deps.req.reduce(function(count, dep){
    return dep.count > 0 ? count + 1 : count;
  }, 0);
  if (!deps.count) {
    Object.defineProperty(deps, 'compiled', { value:  deps.ast.toSource() });
    done.push(deps);
  }
});

console.log(done.map(function(d){ return d.compiled }).join('\n\n'))



/*
{ operator: '=',
  left:
   { object: { name: 'module' },
     property: { name: 'exports' },
     computed: false },
  right:
   { callee: { name: 'require' },
     arguments: [ { value: './lib/astify' } ] } }
*/
