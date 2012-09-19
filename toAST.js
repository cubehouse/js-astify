var AST      = require('./AST'),
    create   = require('./ASTNode').createNode,
    options  = require('./options'),
    isObject = require('./utility').isObject,
    define   = require('./utility').define,
    gensym   = require('./utility').gensym,
    inherit  = require('./utility').inherit;


module.exports = astify;

function astify(ctx){
  ctx = ctx || global;
  function makeAST(o, showHidden, identity, seen){
    if (!isObject(o))
      return create('Literal', o);
    else if (seen && seen.has(o))
      return create('Identifier', seen.get(o));
    else if (typeof o.toAST === 'function')
      return o.toAST(showHidden, identity, seen);
    else
      return ctx.Object.prototype.toAST.call(o, showHidden, identity, seen);
  }
  var O = {
    defineProperty: create('MemberExpression', 'Object', 'defineProperty'),
    defineProperties: create('MemberExpression', 'Object', 'defineProperty'),
  };


  function definer(o, key, name, showHidden, seen){
    if (!name && typeof o === 'function')
      name = o.name;

    var args = [create('Identifier', name)];

    if (key instanceof Array) {
      if (key.length === 1) {
        key = key.pop();
      } else {
        var desc = {};
        var callee = O.defineProperties;
        key.forEach(function(key){
          desc[key] = ctx.Object.getOwnPropertyDescriptor(o, key);
        });
      }
    }

    if (typeof key === 'string') {
      var callee = O.defineProperty;
      var desc = ctx.Object.getOwnPropertyDescriptor(o, key);
      args.push(create('Literal', key));
    }


    if (desc) {
      args.push(makeAST(desc, showHidden, key, seen));
      return create('CallExpression', callee, args);
    } else {
      return create('Identifier');
    }
  }

  var primitiveToAST = function toAST(showHidden, identity, seen){
    var out = create('Literal', this);
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
      return create('Identifier', seen.get(this));

    var array = create('ArrayExpression');


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
    var scope = wrapper.callee;
    var ret = scope.body.pop();

    var descs = [];
    keys.forEach(function(key){
      var desc = ctx.Object.getOwnPropertyDescriptor(this, key);

      if (desc) {
        if ('get' in desc || 'set' in desc || !desc.enumerable || !desc.configurable || !desc.writable)
          descs.push(key);
        else
          scope.body.append(create('MemberExpression', ret.argument, key).assign(makeAST(desc.value, showHidden, key, seen)));
      }
    }, this);

    descs.length && scope.body.append(definer(this, descs, ret.argument, showHidden, seen));
    scope.body.append(ret);
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
      return create('Identifier', seen.get(this));

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
    var scope = wrapper.callee;
    var ret = scope.body.pop();

    var descs = [];
    keys.forEach(function(key){
      var desc = ctx.Object.getOwnPropertyDescriptor(this, key);
      if (desc) {
        if (key !== 'prototype' && ('get' in desc || 'set' in desc || !desc.enumerable || !desc.configurable || !desc.writable))
          descs.push(key);
        else {
          scope.body.append(create('MemberExpression', ret.argument, key).assign(makeAST(desc.value, showHidden, key, seen)));
        }
      }
    }, this);

    descs.length && scope.body.append(definer(this, descs, ret.argument, showHidden, seen));
    scope.body.append(ret);
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
      return create('Identifier', seen.get(this));


    var object = create('ObjectExpression');
    identity && (object.identity = identity);
    seen.set(this, object.identity);

    var keys = (showHidden ? ctx.Object.getOwnPropertyNames(this) : ctx.Object.keys(this)).filter(isNaN).sort();

    keys.forEach(function(key){
      if (key === 'toString') return;

      var desc = ctx.Object.getOwnPropertyDescriptor(this, key);
      if (desc) {
        desc.get && object.append(create('Property', 'get', key, makeAST(desc.get, showHidden, key, seen)));
        desc.set && object.append(create('Property', 'set', key, makeAST(desc.set, showHidden, key, seen)));
        if ('value' in desc && desc.value !== undefined) {
          object.append(create('Property', 'init', key, makeAST(desc.value, showHidden, key, seen)));
        }
      }
    }, this);

    return object;
  });
}

