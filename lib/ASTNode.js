var esprima   = require('esprima'),
    escodegen = require('escodegen');

var Visitor     = require('./Visitor'),
    ASTArray    = require('./ASTArray'),
    ResultArray = ASTArray.ResultArray,
    options     = require('./options'),
    compileSelector = require('./compile-selector'),
    utility     = require('./utility'),
    isObject    = utility.isObject,
    define      = utility.define,
    params      = utility.params,
    inherit     = utility.inherit,
    parent      = utility.parent,
    unparent    = utility.unparent,
    gensym      = utility.gensym;


var Literal,
    Identifier,
    AtSymbol;


// include weakmap if not already available
if (!WeakMap) {
  var WeakMap = require("weakmap");
}

function Location(loc, range){
  this.startColumn = loc.start.column;
  this.startLine = loc.start.line;
  this.endColumn = loc.end.column;
  this.endLine = loc.end.line;
  this.rangeStart = range[0];
  this.rangeEnd = range[1];
}

module.exports = ASTNode;

// ###############
// ### ASTNode ###
// ###############

function ASTNode(tagNames, properties){
  var Ctor = properties.shift(),
      fields = params(Ctor);

  types[Ctor.name] = Ctor;
  Ctor.prototype = this;
  if (Ctor.name === 'Literal')
    Literal = Ctor;
  else if (Ctor.name === 'Identifier')
    Identifier = Ctor;
  else if (Ctor.name === 'AtSymbol')
    AtSymbol = Ctor;

  define(Ctor, {
    fields: fields,
    fromJSON: function fromJSON(json){
      var args = fields.map(function(field){
        return ASTNode.fromJSON(json[field]);
      });
      var ret = new Ctor(args[0], args[1], args[2], args[3], args[4], args[5]);
      if ('loc' in json)
        sourceLocations.set(ret, new Location(json.loc, json.range));
      return ret;
    }
  });

  define(this, {
    constructor: Ctor,
    type: Ctor.name,
    tags: tagNames
  });

  define(this, properties);

  tagNames.forEach(function(tag){
    if (!(tag in tags))
      tags[tag] = [];
    tags[tag].push(Ctor);
  });

  return Ctor;
}

define(ASTNode, {
  types: {},
  tags: {},
});


define(ASTNode, [
  function isNode(o){
    return o instanceof ASTNode || o instanceof ASTArray;
  },
  function matches(subject, filter){
    return isNode(subject) && subject.matches(filter);
  },
  function toIdent(o){
    if (typeof o === 'string')
      return new Identifier(o);
    else if (o instanceof Literal)
      return new Identifier(o.value);
    else if (o instanceof Identifier)
      return new Identifier(o.name);
    else if (o instanceof AtSymbol)
      return new AtSymbol(o.name);
    else
      return new Identifier(gensym());
  },
  function createNode(type){
    if (type instanceof ASTNode)
      return type.clone();

    if (typeof type === 'string') {
      var a = arguments;
      if (type[0] === '#') {
        var Type = lookup(type.slice(1));
        if (Type)
          return new Type(a[1], a[2], a[3], a[4], a[5]);
      }
      if (type[0] === '.') {
        var Type = lookup('literal');
        return new Type(type.slice(1));
      }

      return ASTNode.toIdent(type)
    }

    var Type = lookup(isObject(type) ? 'object' : 'literal');
    return new Type(type);
  },
  function parse(s){
    if (typeof s === 'function')
      s = ('('+s+')').replace('[native code]', '');

    var result =  esprima.parse(s, {
      loc: false,
      range: false,
      raw: false,
      tokens: false,
      comment: false,
    });

    if (result.body[0].expression)
      return fromJSON(result.body[0].expression);
    else
      return fromJSON(result.body);
  },
  function lookup(query){
    if (typeof query === 'function')
      query = query.name;

    if (typeof query === 'string') {
      if (query in types)
        return types[query];
      else if (query in tags)
        return tags[query][0];
    }
  },
  function fromJSON(item){
    if (item instanceof Array) {
      return ASTArray.fromJSON(item);
    } else if (item && item.type) {
      var Type = lookup(item.type);
      if (Type)
        return Type.fromJSON(item);
    }
    return item;
  },
  function createArray(init){
    return new ASTArray(init);
  }
]);


var isNode = ASTNode.isNode,
    lookup = ASTNode.lookup,
    fromJSON = ASTNode.fromJSON,
    createNode = ASTNode.createNode,
    types = ASTNode.types,
    tags = ASTNode.tags;


var sourceLocations = new WeakMap;


define(ASTNode.prototype, [
  function toSource(){
    return escodegen.generate(this, options.codegen());
  },
  function toString(){
    return '[object '+this.constructor.name+']';
  },
  function toJSON(){
    var out = { type: this.type };
    Object.keys(this).forEach(function(key){
      if (this[key] && this[key].toJSON)
        out[key] = this[key].toJSON();
      else
        out[key] = this[key];
    }, this);
    return out;
  },
  function visit(callback){
    return new Visitor(this, callback, isNode).next();
  },
  function walk(callback){
    return this.visit(function(node, parent){
      if (callback.call(this, node, parent) !== Visitor.BREAK)
        return Visitor.RECURSE;
    });
  },
  function remove(child){
    for (var k in this) {
      if (this[k] === child) {
        unparent(child);
        this[k] = null;
        return k;
      }
    }
    return false;
  },
  function forEach(callback, context){
    context = context || this;
    Object.keys(this).forEach(function(k){
      callback.call(context, this[k], k, this)
    }, this);
    return this;
  },
  function find(selector){
    var filter = compileSelector(selector),
        result = filter(this);
    return result instanceof Array ? new ResultArray(result) : result;
  },
  function matches(filter){
    if (typeof filter === 'string') {
      var tagNames = tags[filter];
      if (tagNames) {
        for (var i=0; i < tagNames.length; i++)
          if (this.constructor === tagNames[i])
            return true;
      }
      if (filter.toLowerCase() === this.type.toLowerCase())
        return true;
    } else if (typeof filter === 'function') {
      if (this.constructor === filter)
        return true;
    }
    return false;
  },
  function clone(){
    var out = Object.create(Object.getPrototypeOf(this));
    Object.keys(this).forEach(function(key){
      out[key] = isNode(this[key]) ? parent(this[key].clone(), out) : this[key];
    }, this);
    return out;
  },
  function replace(child, replacement){
    for (var k in this) {
      if (this[k] === child) {
        this[k] = parent(replacement, this);
        return unparent(child);
      }
    }
    return false;
  },
  function replaceWith(replacement) {
    if (this.parent) {
      for (var k in this.parent) {
        if (this.parent[k] === this) {
          this.parent[k] = parent(replacement, this.parent);
          return unparent(this);
        }
      }
    }
    console.log('replaceWith failed for '+this.type);
  },
  function parents(){
    var out = new ResultArray,
        parent = this.parent;

    while (parent) {
      out.push(parent);
      parent = parent.parent;
    }
    return out;
  },
  function nearest(filter){
    var parent = this.parent;
    while (parent) {
      if (parent.matches(filter))
        return parent;
      parent = parent.parent;
    }
  },
  function parentScope(allowProgramScope){
    var parent = this.parent;
    while (parent) {
      if (parent.matches('function') || allowProgramScope && parent.matches('program'))
        return parent;
      parent = parent.parent;
    }
  },
  function topScope(){
    var scope = this.parentScope(false),
        last;
    while (scope) {
      last = scope;
      scope = scope.parentScope(false);
    }
    return last;
  }
]);


