var define = require('./utility').define;

var parsed, i, j, reversed, cache = {}, rcache = {};


function escape(string){
  return string.replace(/(?=[\-\[\]{}()*+?.\\\^$|,#\s])/g, '\\');
}

function unescape(string){
  return (string || '').replace(/\\/g, '');
}

var regex = function(u){
  return new RegExp([ "^(?:\\s*(,)\\s*|\\s*"+
    "(<combo>+)\\s*|(\\s+)|(<U>+|\\*)|\\#(<U>+)|\\.(<U>+)|\\[\\s*"+
    "(<U1>+)(?:\\s*([*^$!~|]?=)(?:\\s*(?:([\"']?)(.*?)\\9)))?\\s*\\](?!\\])|(:+)"+
    "(<U>+)(?:\\((?:(?:([\"'])([^\\13]*)\\13)|((?:\\([^)]+\\)|[^()]*)+))\\))?)" ].join('')
      .replace(/<combo>/, '[' + escape(">+~`!@$%^&={}\\;</") + ']')
      .replace(/<U>/g, '(?:['+u)
      .replace(/<U1>/g, '(?:[:'+u));
}('\\w\\u00a1-\\uFFFF-]|\\\\[^\\s0-9a-f])');



function Selectors(selectors, raw){
  this.selectors = selectors;
  this.raw = raw;
}

define(Selectors.prototype, [
  function reverse(){
    return parseSelector(this.raw, true);
  },
]);

function Combinator(combinator, name){
  this.combinator = combinator;
  this.name = name;
}

function Filter(key, operator, quote, value){
  value = this.value = unescape(value);
  this.key = unescape(key);
  this.test = {
    '^=': 'startsWith',//tester(new RegExp('^'+escape(value))),
    '$=': 'endsWith',//tester(new RegExp(escape(value) +'$')),
    '~=': 'isSimilar',//tester(new RegExp('(^|\\s)'+escape(value) +'(\\s|$)')),
    //'|=': ,//tester(new RegExp('^'+escape(value)+'(-|$)')),
     '=': 'isSame',//function equal(v){ return value == v },
    '*=': 'contains',//function has(v){ return v && v.indexOf(value) > -1 },
    '!=': 'isDifferent',//function different(v){ return value != v }
  }[operator];
  this.operator = operator;
}

function ClassSelector(name){
  this.value = name;
  this.regex = new RegExp('(^|\\s)' + escape(name) + '(\\s|$)');
}

function Modifier(name, val, quoted, operator){
  val = unescape(val || quoted);
  this.name = unescape(name);
  val && (this.value = val);
  this.operator = operator;
}

module.exports = parseSelector;

function parseSelector(expression, isReversed){
  if (expression == null)
    return null;

  if (expression instanceof Selectors)
    return expression;

  expression = ('' + expression).replace(/^\s+|\s+$/g, '');
  reversed = !!isReversed;
  var currCache = reversed ? rcache : cache;

  if (currCache[expression])
    return currCache[expression];

  parsed = new Selectors([], expression, reversed);
  i = -1;
  while (expression != (expression = expression.replace(regex, handler)));
  parsed.length = parsed.selectors.length;
  return currCache[parsed.raw] = reversed ? reverse(parsed) : parsed;
}

function rcombo(combo){
  if (combo === '!')
    return ' ';
  else if (combo === ' ')
    return '!';
  else if ((/^!/).test(combo))
    return combo.replace(/^!/, '');
  else
    return '!' + combo;
}

function reverse(selectors){
  var exp, cexp
  for (var i = 0; exp = selectors[i]; i++){
    var last = {
      parts: [],
      name: '*',
      rcombinator: rcombo(exp[0].combinator)
    };

    for (var j = 0; cexp = exp[j]; j++){
      if (!cexp.rcombinator)
        cexp.rcombinator = ' ';
      cexp.rcombinator = cexp.rcombinator;
      delete cexp.rcombinator;
    }

    exp.reverse().push(last);
  }
  return selectors;
}

function tester(regex){
  return function(value){
    return regex.test(value + '');
  };
}


function handler(raw, sep, combo, subcombo, tag, id, name, attr, attrOp, attrQ, attrV, pseudoSep, pseudo, pseudoQ, pseudoQV, pseudoV){
  if (sep || !~i){
    parsed.selectors[++i] = [];
    j = -1;
    if (sep) return '';
  }

  if (combo || subcombo || !~j){
    combo = combo || ' ';
    var currSep = parsed.selectors[i];
    if (reversed && currSep[j])
      currSep[j].rcombinator = rcombo(combo);
    currSep[++j] = new Combinator(combo, '*');
  }

  var item = parsed.selectors[i][j];

  if (tag){
    item.name = unescape(tag);
  } else if (id) {
    item.id = unescape(id);
  } else if (name) {
    name = unescape(name);
    item.keys || (item.keys = []);
    item.keys.push(name);
  } else if (pseudo) {
    item.modifiers || (item.modifiers = []);
    item.modifiers.push(new Modifier(pseudo, pseudoV, pseudoQV, pseudoSep));
  } else if (attr) {
    item.filters || (item.filters = []);
    item.filters.push(new Filter(attr, attrOp, attrQ, attrV));
  }

  return '';
}
