var astify = require('astify'),
    ASTArray = astify.ASTArray,
    _ = astify.createNode;

function getter(key, returns){
  return _('property', 'get', key, _('function').returns(returns));
}
function setter(key, body){
  body = body instanceof Array ? body : [body];
  return _('property', 'set', key, _('function', null, ['v'], body));
}


function THIS(k, v){
  if (arguments.length === 1)
    return _('this').get(k);
  else
    return _('this').set(k, v);
}

var program = _('program');
program.append([
  _('function', 'Point', ['x', 'y'], [
    THIS(0, 'x'),
    THIS(1, 'y')
  ]),
   _('Point').set('prototype', _('object', [
    getter('x', THIS(0)),
    getter('y', THIS(1)),
    setter('x', THIS(0, 'v')),
    setter('y', THIS(1, 'v')),
  ]))
]);


console.log(program.toSource());
