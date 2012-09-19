var EventEmitter = require('events').EventEmitter,
    util = require('util');


module.exports = {
  createStorage: createStorage,
  isObject: isObject,
  define: define,
  inherit: inherit,
  escape: escape,
  indent: indent,
  gensym: gensym,
  Mixin: Mixin,
  Registry: Registry
}

void function(LOG){
  console.log = function log(o){
    for (var k in arguments) {
      if (typeof arguments[k] === 'string')
        LOG(arguments[k]);
      else
        LOG(inspect(arguments[k]));
    }
  }
}(console.log);
var isArr = Array.isArray;

function inspect(o){
  if (o instanceof RegExp)
    return o;
  Array.isArray = function(o){ return isArr(o) || o instanceof Array }
  var out = util.inspect(o, null, 20, false);
  Array.isArray = isArr;
  return out;
}



function createStorage(creator){
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
}

function isObject(o){
  return o != null && typeof o === 'object' || typeof o === 'function';
}

function define(o, p, v){
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
}

function inherit(Ctor, Super, properties){
  define(Ctor, { super: Super });
  Ctor.prototype = Object.create(Super.prototype);
  define(Ctor.prototype, { constructor: Ctor, super: Super.prototype });
  properties && define(Ctor.prototype, properties);
  Ctor.__proto__ = Super;
  return Ctor;
}

function space(n){
  return new Array(++n || 1).join(' ');
}

var q = ["'", '"'];
var qMatch = [/(")/g, /(')/g];

function escape(s){
  s = (s+'').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  var qWith = +(s.match(qMatch[0]) === null);
  return q[qWith] + s.replace(qMatch[1-qWith], '\\$1') + q[qWith];
}


function indent(string, amount){
  if (amount == null)
    amount = '  ';
  if (typeof amount === 'number')
    amount = space(amount);
  return (string+'' || '').split('\n').map(function(s){ return amount + s }).join('\n');
}




var cache = Object.create(null);

function gensym(len){
  var name = Math.random().toString(36).slice(2);
  while (name.length && isFinite(name[0]))
    name = name.slice(1);
  name = name.slice(0, len = ++len || 5);
  return name && !(name in cache) ? name : gensym(len);
}




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
  EventEmitter.call(this);
}

inherit(Registry, EventEmitter, [
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
    this.emit('query', query, result)
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
      this.emit('duplicate', name, value, args);
      return false;
    } else {
      this.members[name] = value;
      this.emit('register', name, value, args);
      return true;
    }
  }
]);
