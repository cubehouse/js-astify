// include weakmap if not already available
if (!WeakMap) {
  var WeakMap = require("weakmap");
}

var x = module.exports = {
  createStorage: function createStorage(creator){
    creator = creator || Object.create.bind(null, null, {});
    var map = new WeakMap;
    return function storage(o, v){
      if (1 in arguments) {
        map.set(o, v);
      } else {
        v = map.get(o);
        if (v == null) {
          v = creator(o);
          map.set(o, v);
        }
      }
      return v;
    };
  },
  isObject: function isObject(o){
    return o != null && typeof o === 'object' || typeof o === 'function';
  },
  define: function define(o, p, v){
    o = Object(o);
    if (p instanceof Array) {
      p.forEach(function(f, i){
        if (typeof f === 'function' && f.name) {
          var name = f.name;
        } else if (typeof f === 'string' && typeof p[i+1] !== 'function' || !p[i+1].name) {
          var name = f;
          f = p[i+1];
        }
        if (name) {
          Object.defineProperty(o, name, { configurable: true, writable: true, value: f });
        }
      });
    } else if (typeof p === 'function') {
      Object.defineProperty(o, p.name, { configurable: true, writable: true, value: p });
    } else if (isObject(p)) {
      Object.keys(p).forEach(function(k){
        var desc = Object.getOwnPropertyDescriptor(p, k);
        if (desc) {
          desc.enumerable = 'get' in desc;
          Object.defineProperty(o, k, desc);
        }
      });
    } else if (typeof p === 'string') {
      Object.defineProperty(o, p, { configurable: true, writable: true, value: v });
    }
    return o;
  },
  inherit: function inherit(Ctor, Super, properties){
    define(Ctor, { super: Super });
    Ctor.prototype = Object.create(Super.prototype);
    define(Ctor.prototype, { constructor: Ctor, super: Super.prototype });
    properties && define(Ctor.prototype, properties);
    Ctor.__proto__ = Super;
    return Ctor;
  },
  gensym: function gensym(len){
    var name = Math.random().toString(36).slice(2);
    while (name.length && isFinite(name[0]))
      name = name.slice(1);
    name = name.slice(0, len = ++len || 5);
    return name && !(name in cache) ? name : gensym(len);
  },
  params: function params(fn){
    var src = fn+'';
    return src.slice(src.indexOf('(') + 1, src.indexOf(')')).split(/\s*,\s*/).filter(Boolean);
  },
  Mixin: Mixin,
  Registry: Registry
};


var isObject = x.isObject,
    define = x.define,
    inherit = x.inherit;

var cache = Object.create(null);


function Mixin(name, mixin){
  this.name = name;
  if (typeof mixin === 'function')
    this.addTo = mixin;
  else
    this.properties = mixin;
}

var mixins = {};

define(Mixin, [
  function create(name, properties){
    mixins[name] = new Mixin(name, properties);
  },
  function use(name, object, args){
    if (name in mixins)
      mixins[name].addTo(object, args);
    else
      throw new Error('Unknown mixin "'+name+'"');
  }
]);

define(Mixin.prototype, [
  function addTo(o){
    define(o, this.properties);
  }
]);



function Registry(){
  this.members = Object.create(null);
}

define(Registry.prototype, [
  function lookup(query){
    var result = null;
    if (typeof query === 'string') {
      if (query in this.members) {
        result = this.members[query];
      }
    } else if (typeof query === 'function') {
      if (query.name in this.members[query.name])
       result = query;
    }
    return result;
  },
  function register(name, value){
    var args = [].slice.call(arguments);
    if (typeof name === 'function') {
      value = args.shift();
      name = value.name;
    } else {
      args = args.slice(2);
    }

    if (name in this.members) {
      return false;
    } else {
      this.members[name] = value;
      this.onregister(name, value, args);
      return true;
    }
  }
]);



var nullDesc = { configurable: true, enumerable: false, writable: true, value: null },
    parentDesc = { configurable: true, enumerable: false, writable: true, value: null };

x.parent = function parent(o, p){
  if (isNode(o) && isNode(p)) {
    parentDesc.value = p;
    Object.defineProperty(o, 'parent', parentDesc);
  }
  return o;
}

x.unparent = function unparent(o){
  if (isNode(o))
    Object.defineProperty(o, 'parent', nullDesc);
  return o;
}

x.isNode = isNode;

function isNode(o){
  x.isNode = isNode = require('./ASTNode').isNode;
  return x.isNode(o);
}
