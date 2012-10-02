"use strict";
var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    esprima = require('esprima'),
    escodegen = require('escodegen');

var ASTNode  = require('./asts'),
    opt      = require('./options'),
    isObject = require('./utility').isObject,
    define   = require('./utility').define,
    inherit  = require('./utility').inherit;


module.exports = AST;

function AST(type, origin, code, options){
  if (type in origins)
    this.type = origins[type];
  else if (type in AST)
    this.type = origins[AST[type]];
  else if (typeof type === 'string' && fs.existsSync(type)) {
    this.type = 'file';
    origin = type;
  } else
    this.type = 'unknown';

  this.origin = origin;
  if (code == null) {
    if (this.type === 'function') {
      this.code = ('('+origin+')').replace('[native code]', '');
    }
    else if (this.type === 'file' && fs.existsSync(origin))
      this.code = fs.readFileSync(origin, 'utf8');
    else if (this.type === 'generated')
      this.code = origin;
  } else
    this.code = code;

  if (!this.code)
    throw new Error('Unable to determine where the code is');

  var raw = esprima.parse(this.code, options || {
    loc: false,
    range: false,
    raw: false,
    tokens: false,
    comment: false,
  });
  this.options = opt.codegen();
  this.ast = ASTNode.fromJSON(raw);
}

define(AST, {
  createAST: function createAST(type, origin, code, options){
    return new AST(type, origin, code, options);
  },
  ORIGIN_UNKNOWN  : 0,
  ORIGIN_FUNCTION : 1,
  ORIGIN_FILE     : 2,
  ORIGIN_URL      : 3,
  ORIGIN_GENERATED: 4,
});

define(AST.prototype, [
  function toCode(){
    return escodegen.generate(this.ast, this.options);
  },
  function toJSON(){
    return this.ast.toJSON();
  },
  function saveJSON(file){
    fs.writeFileSync(file, this.toJSON());
    return this;
  },
  function saveCode(file){
    fs.writeFileSync(file, this.toCode());
  },
  function walk(visitor){
    if (typeof visitor === 'function')
      visitor = { enter: visitor };
    escodegen.traverse(this.ast.body, visitor);
  }
]);


var origins = ['unknown', 'function', 'file', 'url', 'generated'];


