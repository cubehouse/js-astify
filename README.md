# astify
Astify generates Abstract Syntax Trees from objects in live JS (as well as from source). Want to convert the entire global object to source? `global.toAST().toSource()`. Beyond adding `toAST`, astify also makes build AST (which is then convertable to code using `toSource`) super simple to do. Frankenstein different pieces of objects and functions together to make new ones.

This is still experimental and unfinished.

This is a fork of the original astify, with the dependancies included and uploaded to npm.

## Usage
It is currently set up for use in Node.js (will be combining for a browser build soon).

```javascript
var astify = require('astify');

astify.install(global); //the toAST functions must be explicitly installed on a global object
console.log(global.toAST().toSource()); // anything can be converted to AST
```

## API
* __astify.install(context)__: Install the `toAST` prototype functions on a given global object, defaulting to the main global.
* __*anything*.toAST(showHidden, identity)___: Builtins get specialized `toAST` methods. *showHidden* includes non-enumerable properties. *identity* labels an object which doesn't have a discernable name. By default a gensym is provided.
* __astify.parseFile(filename)__: creates AST from sourcecode.
* __astify.createNode(type, args...)__: creates an AST Node from scratch.

## Selectors
To select nodes you can use css-like syntax (work in progress) using __node.find(selector)__. Some examples:

* `function function function var` - descending selectors, this would filter to vars that are inside 3 nested functions.
* `function > id` - child selector requires nodes to be direct children
* `var.declarations` - select specific properties
* `function.params.id` - select multiple properties
* `function:scope` - select all the nodes in the current scope
* `method[kind = ""][key != "constructor"].value` - selects methods (es6) with no kind (normal) where key is notEqual to constructor, then selectos its value property (a function expression).
* `method[key = "constructor"].value:first` - selects the first method with the name "constructor" and returns its value (function expr)
* `ident:first-child` - selects all identifiers that are first-children
* `return:last-child` - select all return statements which are last children
* `call[callee = "super"]` - select functions calls where the function name is "super"
* `member[object=super]` - selects expressions that look like "super.prop"

### Node Creation
An intro example to manually assembling nodes

```javascript
var _ = astify.createNode;

// intermix explicit AST node definitions with regular functions, objects, and literals
var myAST = _('object', {
  a: 50,
  b: _('function').declare({
    somevar: 5,
    another: _('iife').append([
      _('return', _('function', 'another'))
    ])
  }),
  c: function hi(){
    return 'stuff';
  },
  get d(){ return this.b.name }
});
```
Which produces
```javascript
console.log(myAST.toSource());
// -->
var myAST = {
  a: 50,
  b: function () {
    var somevar = 5,
        another = function () {
          return function another() {
          };
        }();
  },
  c: function hi() {
    return 'stuff';
  },
  get d() {
    return this.b.name;
  }
};
```

And the AST:
```javascript
{ type: 'ObjectExpression',
  properties:
   [ { type: 'Property',
       key: { type: 'Identifier', name: 'a' },
       value: { type: 'Literal', value: 50 },
       kind: 'init' },
     { type: 'Property',
       key: { type: 'Identifier', name: 'b' },
       value:
        { type: 'FunctionExpression',
          params: [],
          id: null,
          body:
           { type: 'BlockStatement',
             body:
              [ { type: 'VariableDeclaration',
                  kind: 'var',
                  declarations:
                   [ { type: 'VariableDeclarator',
                       id: { type: 'Identifier', name: 'somevar' },
                       init: { type: 'Literal', value: 5 } },
                     { type: 'VariableDeclarator',
                       id: { type: 'Identifier', name: 'another' },
                       init:
                        { type: 'CallExpression',
                          callee:
                           { type: 'FunctionExpression',
                             params: [],
                             id: null,
                             body:
                              { type: 'BlockStatement',
                                body:
                                 [ { type: 'ReturnStatement',
                                     argument:
                                      { type: 'FunctionExpression',
                                        params: [],
                                        id: { type: 'Identifier', name: 'another' },
                                        body: { type: 'BlockStatement', body: [] } } } ] } },
                          arguments: [] } } ] } ] } },
       kind: 'init' },
     { type: 'Property',
       key: { type: 'Identifier', name: 'c' },
       value:
        { type: 'FunctionExpression',
          id: { type: 'Identifier', name: 'hi' },
          params: [],
          body:
           { type: 'BlockStatement',
             body:
              [ { type: 'ReturnStatement',
                  argument: { type: 'Literal', value: 'stuff' } } ] } },
       kind: 'init' },
     { type: 'Property',
       key: { type: 'Identifier', name: 'd' },
       value:
        { type: 'FunctionExpression',
          id: { type: 'Identifier', name: 'd' },
          params: [],
          body:
           { type: 'BlockStatement',
             body:
              [ { type: 'ReturnStatement',
                  argument:
                   { type: 'MemberExpression',
                     computed: false,
                     object:
                      { type: 'MemberExpression',
                        computed: false,
                        object: { type: 'Identifier', name: 'this' },
                        property: { type: 'Identifier', name: 'b' } },
                     property: { type: 'Identifier', name: 'name' } } } ] } },
       kind: 'get' } ] }

```


### Node Types
The short name can be used to identify the when using `astify.createNode`. Optional arguments are in [brackets].

* __"assign"__ - *AssignmentExpression(operator, left, right)*
* __"array"__ - *ArrayExpression([elementArray])*
* __"block"__ - *BlockStatement([bodyStatementsArray])*
* __"binary"__ - *BinaryExpression(operator, left, right)*
* __"break"__ - *BreakStatement([label])*
* __"call"__ - *CallExpression(callee, [argsExpressionsArray])*
* __"catch"__ - *CatchClause(param, [[bodyBlock])*
* __"conditional"__ - *ConditionalExpression(test, consequentExpression, alternateExpression)*
* __"continue"__ - *ContinueStatement([label])*
* __"dowhile"__ - *DoWhileStatement(test, [bodyBlock])*
* __"debugger"__ - *DebuggerStatement()*
* __"empty"__ - *EmptyStatement()*
* __"expression"__ - *ExpressionStatement(expression)*
* __"for"__ - *ForStatement([init, test, update, bodyBlock])*
* __"forin"__ - *ForInStatement(left, right, [bodyBlock])*
* __"functiondecl"__ - *FunctionDeclaration(id, [bodyBlock, params])*
* __"function"__ - *FunctionExpression([id, bodyBlock, params])*
* __"identifier"__ - *Identifier(name)*
* __"if"__ - *IfStatement(test, [consequentBlock, alternateBlock])*
* __"literal"__ - *Literal(value)*
* __"labeled"__ - *LabeledStatement(label, [bodyBlock])*
* __"logical"__ - *LogicalExpression(operator, left, right)*
* __"member"__ - *MemberExpression(object, property)*
* __"new"__ - *NewExpression(callee, [argsArray])*
* __"object"__ - *ObjectExpression([propertiesArray])*
* __"program"__ - *Program([bodyBlock, comments])*
* __"property"__ - *Property(kind, key, value)*
* __"return"__ - *ReturnStatement([argument])*
* __"sequence"__ - *SequenceExpression(expressionsArray)*
* __"switch"__ - *SwitchStatement(descriminant, [casesArray])*
* __"case"__ - *SwitchCase([test, consequent])*
* __"this"__ - *ThisExpression()*
* __"throw"__ - *ThrowStatement(argument)*
* __"try"__ - *TryStatement([block, handlers, finalizer])*
* __"unary"__ - *UnaryExpression(operator, argument)*
* __"update"__ - *UpdateExpression(operator, argument, [isPrefix])*
* __"var"__ - *VariableDeclaration(kind, [declarationsArray])*
* __"decl"__ - *VariableDeclarator(id, [init])*
* __"while"__ - *WhileStatement(test, [bodyBlock])*
* __"with"__ - *WithStatement(object, [bodyBlock])*
* __"iife"__ - *ImmediatelyInvokedFunctionExpression([func, argsArray])*
