var esprima = require('esprima');

var source = 'function* x(){ yield x }';

console.log(require('util').inspect(esprima.parse(source, {
  loc: false,
  range: false,
  raw: false,
  tokens: false,
  comment: false,
}), null, 20));
