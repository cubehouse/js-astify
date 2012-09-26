var fs = require('fs'),
    path = require('path'),
    astify = require('astify');


var paths = [];
var selected = [];
var transformLocation = path.resolve(__dirname, '..', 'transformers');
var transformers = {};
fs.readdirSync(transformLocation).map(function(name){
  if (path.extname(name) === '.js')
    transformers[name.slice(0, -3)] = path.resolve(transformLocation, name);
});

function addTransforms(array){
  if (array instanceof Array && array.length) {
    array.forEach(function(item){
      if (item in transformers) {
        selected.push(require(transformers[item]));
      }
    });
  }
}

var run;

var args = process.argv.filter(function(arg){
  if (arg === '-r') {
    run = true;
    return;
  }
  arg = path.resolve(arg);
  if (arg !== __filename && arg !== process.execPath) {
    if (fs.existsSync(arg))
      paths.push(arg);
    else
      return true;
  }
});

if (!paths.length) return;

addTransforms(args);

var input = paths.shift(),
    output = paths.shift();

var src = fs.readFileSync(input, 'utf8'),
    ast = astify.ASTNode.parse(src),
    inline = src.match(/^\/\/!#(.*?)\n/);

inline && addTransforms(inline[1].split('|'));


selected.forEach(function(transform){
  ast = transform(ast);
});

src = ast.toSource();

if (output && path.extname(output) === '.js' && fs.existsSync(path.dirname(output))) {
  fs.writeFileSync(output, src);
} else if (run) {
  fs.writeFileSync('__temp.js', src);
  var child = require('child_process').spawn(process.execPath, [path.resolve('__temp.js')], { stdio: 'inherit' });
  child.on('close', function(){
    fs.unlinkSync('__temp.js');
  });
} else {
  console.log(src);
}
