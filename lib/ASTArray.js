var Visitor  = require('./Visitor'),
    options  = require('./options'),
    utility  = require('./utility'),
    compileSelector = require('./compile-selector'),
    isObject = utility.isObject,
    define   = utility.define,
    params   = utility.params,
    inherit  = utility.inherit,
    gensym   = utility.gensym;




function nodeFromJSON(o){
  nodeFromJSON = require('./ASTNode').fromJSON;
  return nodeFromJSON(o);
}

module.exports = ASTArray;

// ################
// ### ASTArray ###
// ################

function ASTArray(array){
  define(this, 'length', 0);
  if (array && !(array instanceof Array))
    array = [array];

  array && array.forEach(function(item){
    if (utility.isNode(item) && !item.parent)
      utility.parent(item, this);
    this.push(item);
  }, this);
}

define(ASTArray, [
  function fromJSON(json){
    if (json instanceof Array) {
      var out = new ASTArray;
      for (var i=0; i < json.length; i++)
        out.push(utility.parent(nodeFromJSON(json[i]), out));
      return out;
    }
  },
  ResultArray
]);

inherit(ASTArray, Array, [
  function map(callback, context){
    var out = new ResultArray;
    context = context || this;
    for (var i=0; i < this.length; i++)
      out.push(callback.call(context, this[i], i, this));
    return out;
  },
  function prepend(o){
    this.unshift(utility.parent(o, this));
    return this;
  },
  function append(o){
    this.push(utility.parent(o, this));
    return this;
  },
  function insert(o, index){
    this.splice(index, 0, utility.parent(o, this));
    return this;
  },
  function insertBefore(o, child){
    var index = this.indexOf(child);
    if (~index)
      this.insert(o, index);
    return this;
  },
  function insertAfter(o, child){
    var index = this.indexOf(child);
    if (~index)
      this.insert(o, index + 1);
    return this;
  },
  function remove(item){
    var index = this.indexOf(item);
    if (~index) {
      if (utility.isNode(item) && item.parent === this)
        utility.unparent(item);
      this.splice(index, 1);
    }
    return this;
  },
  function clone(){
    var out = new ASTArray;
    this.forEach(function(item){
      out.append(utility.isNode(item) ? item.clone() : item);
    });
    return out;
  },
  function toSource(){
    return this.map(function(node){
      return node.toSource();
    }).join('\n');
  },
  function toJSON(){
    return this.map(function(item){
      return item.toJSON();
    });
  },
  function visit(callback){
    return new Visitor(this, callback, utility.isNode).next();
  },
  function find(selector){
    var filter = compileSelector(selector);
    return new ResultArray(filter(this));
  },
  function filter(test, context){
    context = context || this;
    if (typeof test !== 'function') {
      var match = test;
      test = function(node){
        return node.matches(match);
      };
    }
    var out = new ResultArray;
    for (var i=0; i < this.length; i++)
      test.call(context, this[i], i, this) && out.push(this[i]);
    return out;
  },
  function matches(){
    return false;
  },
  function first(){
    for (var i=0; i < this.length; i++)
      if (utility.isNode(this[i]))
        return this[i];
  },
  function last(){
    for (var i=this.length - 1; i > -1; i--)
      if (utility.isNode(this[i]))
        return this[i];
  },
]);



function ResultArray(array){
  var i = this.length = array ? array.length : 0;
  while (i--)
    this[i] = array[i];
}

inherit(ResultArray, ASTArray, [
  function parent(){
    return this.map(function(node){
      return node.parent || node;
    });
  },
  function prepend(o){
    this.forEach(function(node){
      node.prepend && node.prepend(o.clone());
    });
    return this;
  },
  function append(o){
    this.forEach(function(node){
      utility.isNode(node) && node.append(o.clone());
    });
    return this;
  },
  function clone(){
    return this.map(function(item){
      return utility.isNode(item) ? item.clone() : item;
    });
  },
  function pluck(key){
    return this.map(function(item){
      return item[key]
    })
  }
]);




