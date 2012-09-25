var AST      = require('./AST'),
    options  = require('./options');

var utility  = require('./utility'),
    isObject = utility.isObject,
    define   = utility.define,
    gensym   = utility.gensym,
    inherit  = utility.inherit;

var ASTNode  = require('./ASTNode'),
    ASTArray = ASTNode.ASTArray,
    isNode   = ASTNode.isNode,
    _        = ASTNode.createNode;


module.exports = astify;

function astify(ctx){
  ctx = ctx || global;
  function makeAST(o, showHidden, identity, seen){
    if (!isObject(o))
      return _('literal', o);
    else if (seen && seen.has(o))
      return _('ident', seen.get(o));
    else if (typeof o.toAST === 'function')
      return o.toAST(showHidden, identity, seen);
    else
      return ctx.Object.prototype.toAST.call(o, showHidden, identity, seen);
  }

  function definer(o, key, name, showHidden, seen){
    if (!name && typeof o === 'function')
      name = o.name;

    var args = new ASTArray([_('ident', name)]);

    if (key instanceof Array) {
      if (key.length === 1) {
        key = key.pop();
      } else {
        var desc = {};
        var callee = _('Object').get('defineProperties');
        key.forEach(function(key){
          desc[key] = ctx.Object.getOwnPropertyDescriptor(o, key);
        });
      }
    }

    if (typeof key === 'string') {
      var callee = _('Object').get('defineProperty');
      var desc = ctx.Object.getOwnPropertyDescriptor(o, key);
      args.push(_('literal', key));
    }


    if (desc) {
      args.push(makeAST(desc, showHidden, key, seen));
      return callee.call(args);
    } else {
      return _('literal', undefined);
    }
  }

  var primitiveToAST = function toAST(showHidden, identity, seen){
    var out = _('literal', this);
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
    if (seen.has(this))
      return _('ident', seen.get(this));

    var array = _('array');


    identity && (array.identity = identity);
    seen.set(this, array.identity);

    this.forEach(function(item){
      array.append(makeAST(item, showHidden, identity, seen));
    });

    var keys = (showHidden ? ctx.Object.getOwnPropertyNames(this) : ctx.Object.keys(this)).filter(function(k){
      return isNaN(k) && k !== 'length';
    }).sort();
    if (!keys.length) return array;

    var wrapper = array.scopedDeclaration();
    var ret = wrapper.pop();

    var descs = [];
    keys.forEach(function(key){
      var desc = ctx.Object.getOwnPropertyDescriptor(this, key);

      if (desc) {
        if ('get' in desc || 'set' in desc || !desc.enumerable || !desc.configurable || !desc.writable)
          descs.push(key);
        else
          wrapper.append(ret.argument.set(key, makeAST(desc.value, showHidden, key, seen)));
      }
    }, this);

    descs.length && wrapper.append(definer(this, descs, ret.argument, showHidden, seen));
    wrapper.append(ret);
    return wrapper;
  });

  define(ctx.Function.prototype, function toAST(showHidden, identity, seen){
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
    if (seen.has(this))
      return _('ident', seen.get(this));

    var func = new AST(1, this).ast;

    identity && (func.identity = identity);
    if (!func.identity)
      func.identity = gensym();
    seen.set(this, func.identity);


    var skip = ctx.Function.prototype;
    var keys = (showHidden ? ctx.Object.getOwnPropertyNames(this) : ctx.Object.keys(this)).sort().filter(function(key){
      return key === 'constructor' ||
           !(key in skip || key === 'prototype' &&
            ctx.Object.getOwnPropertyNames(this.prototype).length == 'constructor' in this.prototype);
    }, this);
    if (!keys.length)
      return func.body[0].expression;

    var wrapper = func.body[0].expression.scopedDeclaration();
    var ret = wrapper.pop();

    var descs = [];
    keys.forEach(function(key){
      var desc = ctx.Object.getOwnPropertyDescriptor(this, key);
      if (desc) {
        if (key !== 'prototype' && ('get' in desc || 'set' in desc || !desc.enumerable || !desc.configurable || !desc.writable))
          descs.push(key);
        else
          wrapper.append(ret.argument.set(key, makeAST(desc.value, showHidden, key, seen)));
      }
    }, this);

    if (descs.length) {
      var defs = definer(this, descs, ret.argument, showHidden, seen);
      wrapper.append(defs);
    }
    wrapper.append(ret);
    return wrapper;
  });


  define(ctx.Object.prototype, function toAST(showHidden, identity, seen){
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
    if (seen.has(this))
      return _('ident', seen.get(this));


    var object = _('object');
    identity && (object.identity = identity);
    seen.set(this, object.identity);

    var keys = (showHidden ? ctx.Object.getOwnPropertyNames(this) : ctx.Object.keys(this)).filter(isNaN).sort();

    keys.forEach(function(key){
      if (key === 'toString') return;

      var desc = ctx.Object.getOwnPropertyDescriptor(this, key);
      if (desc) {
        desc.get && object.append(_('property', 'get', key, makeAST(desc.get, showHidden, key, seen)));
        desc.set && object.append(_('property', 'set', key, makeAST(desc.set, showHidden, key, seen)));
        if ('value' in desc && desc.value !== undefined && desc.value !== ASTNode) {
          try {
            object.append(_('property', 'init', key, makeAST(desc.value, showHidden, key, seen)));
          } catch (e) {
            console.log(desc.value)
          }
        }
      }
    }, this);

    return object;
  });
}

