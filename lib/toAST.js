var ASTNode  = require('./asts'),
    options  = require('./options'),
    utility  = require('./utility'),
    isObject = utility.isObject,
    define   = utility.define,
    gensym   = utility.gensym,
    inherit  = utility.inherit,
    ASTArray = ASTNode.ASTArray,
    isNode   = ASTNode.isNode,
    ident    = ASTNode.ident,
    $        = ASTNode.createNode;

function isNormalDesc(o){
  return o && o.writable && o.configurable && o.enumerable;
}

module.exports = astify;

function astify(ctx){
  ctx = ctx || global;

  function handleArgs(showHidden, identity, seen){
    if (seen instanceof Map) {
      seen.identity = identity;
      return seen;
    }
    if (typeof seen === 'boolean') {
      identity = showHidden;
      showHidden = seen;
      seen = null;
    }
    if (typeof showHidden === 'string') {
      identity = showHidden;
      showHidden = null;
    }
    seen = seen || new Map;
    seen.hidden = showHidden;
    seen.identity = identity;
    return seen;
  }

  function makeAST(o, showHidden, identity, seen){
    if (!isObject(o))
      return $('#literal', o);
    else if (seen && seen.has(o))
      return ident(seen.get(o));
    else if (typeof o.toAST === 'function')
      return o.toAST(showHidden, identity, seen);
    else
      return ctx.Object.prototype.toAST.call(o, showHidden, identity, seen);
  }

  var getProps = ctx.Object.getOwnPropertyNames,
      getKeys = ctx.Object.keys,
      describe = ctx.Object.getOwnPropertyDescriptor;

  function definer(o, key, name, showHidden, seen){
    if (!name && typeof o === 'function')
      name = o.name;

    var args = new ASTArray([ident(name)]);

    if (key instanceof Array) {
      if (key.length === 1) {
        key = key.pop();
      } else {
        var desc = {};
        var callee = $('Object').get('defineProperties');
        key.forEach(function(key){
          desc[key] = describe(o, key);
        });
      }
    }

    if (typeof key === 'string') {
      var callee = $('Object').get('defineProperty');
      var desc = describe(o, key);
      args.push($('#literal', key));
    }


    if (desc) {
      args.push(makeAST(desc, showHidden, key, seen));
      return callee.call(args);
    } else {
      return $('#literal', undefined);
    }
  }

  var primitiveToAST = function toAST(showHidden, identity, seen){
    var out = $('#literal', this);
    if (seen) {
      if (seen.has(this))
        return seen.get(this);
      seen.set(this, out);
    }
    return out;
  };

  define(ctx.String.prototype, primitiveToAST);
  define(ctx.Number.prototype, primitiveToAST);
  define(ctx.Boolean.prototype, primitiveToAST);
  define(ctx.RegExp.prototype, primitiveToAST);


  define(ctx.Array.prototype, function toAST(showHidden, identity, seen){
    seen = handleArgs(showHidden, identity, seen);
    if (seen.has(this))
      return ident(seen.get(this));

    var array = $('#array');
    identity = seen.identity;
    identity && (array.identity = identity);
    seen.set(this, array.identity);

    this.forEach(function(item){
      array.append(makeAST(item, seen.hidden, identity, seen));
    });

    var keys = (seen.hidden ? getProps : getKeys)(this).filter(function(k){
      return isNaN(k) && k !== 'length';
    }).sort();

    if (!keys.length)
      return array;

    var wrapper = array.scopedDeclaration(),
        ret = wrapper.pop(),
        descs = [];

    keys.forEach(function(key){
      var desc = describe(this, key);
      if (desc) {
        if (isNormalDesc(desc))
          wrapper.append(ret.argument.set(key, makeAST(desc.value, seen.hidden, key, seen)));
        else
          descs.push(key);
      }
    }, this);

    if (seen.hidden && this.__proto__ !== Array.prototype)
      wrapper.append(ret.argument.set('__proto__', makeAST(this.__proto__, seen.hidden, null, seen)));
    descs.length && wrapper.append(definer(this, descs, ret.argument, seen.hidden, seen));
    wrapper.append(ret);
    return wrapper;
  });
  var skip = ctx.Function.prototype;

  define(skip, function toAST(showHidden, identity, seen){
    seen = handleArgs(showHidden, identity, seen);
    if (seen.has(this))
      return ident(seen.get(this));

    var func = ASTNode.parse(this);
    identity = seen.identity;
    identity && (func.identity = identity);
    if (!func.identity)
      func.identity = gensym();
    seen.set(this, func.identity);

    var keys = (seen.hidden ? getProps : getKeys)(this).filter(function(key){
      return key === 'constructor' ||
           !(key in skip || key === 'prototype' &&
            getProps(this.prototype).length == 'constructor' in this.prototype);
    }, this).sort();

    if (!keys.length)
      return func;

    var wrapper = func.scopedDeclaration(),
        ret = wrapper.pop(),
        descs = [];

    keys.forEach(function(key){
      var desc = describe(this, key);
      if (desc) {
        if (isNormalDesc(desc))
          wrapper.append(ret.argument.set(key, makeAST(desc.value, seen.hidden, key, seen)));
        else
          descs.push(key);
      }
    }, this);

    if (seen.hidden && this.__proto__ !== Function.prototype)
      wrapper.append(ret.argument.set('__proto__', makeAST(this.__proto__, seen.hidden, null, seen)));

    descs.length && wrapper.append(definer(this, descs, ret.argument, seen.hidden, seen));
    wrapper.append(ret);
    return wrapper;
  });


  define(ctx.Object.prototype, function toAST(showHidden, identity, seen){
    seen = handleArgs(showHidden, identity, seen);
    if (seen.has(this))
      return ident(seen.get(this));

    var object = $('#object');
    identity = seen.identity;
    identity && (object.identity = identity);
    seen.set(this, object.identity);

    var keys = (seen.hidden ? getProps : getKeys)(this).sort();

    keys.forEach(function(key){
      if (key === 'toString') return;

      var desc = describe(this, key);
      if (desc) {
        desc.get && object.append($('#property', 'get', key, makeAST(desc.get, seen.hidden, key, seen)));
        desc.set && object.append($('#property', 'set', key, makeAST(desc.set, seen.hidden, key, seen)));
        if ('value' in desc && desc.value !== undefined && desc.value !== ASTNode && !(desc.value instanceof ASTNode)) {
          try {
            object.append($('#property', 'init', key, makeAST(desc.value, seen.hidden, key, seen)));
          } catch (e) {
            console.log(e.stack)
          }
        }
      }
    }, this);

    if (seen.hidden && this.__proto__ !== Object.prototype)
      object.append($('#property', 'init', '__proto__', makeAST(this.__proto__, seen.hidden, null, seen)));

    return object;
  });
}

