var define = require('./utility').define;

module.exports = Visitor;

function Visitor(ast, callback, filter){
  this.callback = callback;
  this.root = ast;
  this.stack = [];
  this.items = [];
  this.filter = filter || function(){ return true };
  this.queue(ast);
}

Visitor.BREAK = 0;
Visitor.CONTINUE = 1;
Visitor.RECURSE = 2;

define(Visitor.prototype, [
  function next(){
    var item = this.items.pop()
    if (item instanceof Array) {
      var result = Visitor.RECURSE;
    } else {
      var result = this.callback.call(this, item, this.cursor);
    }

    switch (result) {
      default:
      case Visitor.BREAK:
        return this;
      case Visitor.RECURSE:
        this.queue(item);
      case Visitor.CONTINUE:
        if (!this.items.length)
          this.popstack();
        if (this.cursor)
          this.next();
    }
    return this;
  },
  function queue(item){
    if (this.cursor && this.items.length)
      this.stack.push({ cursor: this.cursor, items: this.items });
    item = this.cursor = Object(item);
    this.items = Object.keys(Object(item)).map(function(s){ return item[s] }).filter(this.filter);
    return this;
  },
  function popstack(){
    var current = this.stack.pop();
    if (current) {
      this.cursor = current.cursor;
      this.items = current.items;
      if (!this.items.length)
        this.popstack();
    } else {
      this.cursor = null;
      this.items = [];
      this.depleted = true;
    }
    return this;
  }
]);
