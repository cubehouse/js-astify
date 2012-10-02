var fs = require('fs'),
    path = require('path'),
    astify = require('astify');

module.exports = function load(){
  return new ExecutionProfile(arguments);
};

module.exports.Transform = Transform;
module.exports.ExecutionProfile = ExecutionProfile;


function Transform(directory, name){
  this.dirname = directory;
  this.filename = require.resolve(path.resolve(directory, name));
  this.name = path.basename(name);
  this.transform = require(this.filename);
}

Transform.location = path.resolve(__dirname, '..', 'transformers');

Transform.transformers = {};

Transform.load = function load(name){
  if (name in Transform.transformers) {
    if (!(Transform.transformers[name] instanceof Transform))
      Transform.transformers[name] = new Transform(Transform.location, name)
    return Transform.transformers[name];
  }
}

fs.readdirSync(Transform.location).map(function(name){
  if (path.extname(name) === '.js')
    Transform.transformers[name.slice(0, -3)] = true;
});



function ExecutionProfile(args){
  var paths = [];
  this.commands = [];
  this.transforms = [];
  [].forEach.call(args || [], function(arg){
    if (arg in ExecutionProfile.commands)
      return this.commands.push(ExecutionProfile.commands[arg])

    arg = path.resolve(arg);
    if (arg !== __filename && arg !== process.execPath) {
      if (fs.existsSync(arg))
        paths.push(arg);
      else
        this.addTransforms(item);
    }
  }, this);

  if (paths.length)
    this.input = paths.shift();
  if (paths.length)
    this.output = paths.shift();
}

ExecutionProfile.commands = {
  run: function(profile){
    profile.execute();
  },
  save: function(profile){
    profile.save();
  },
  log: function(profile){
    console.log(profile.transformed.toSource())
  }
};

ExecutionProfile.commands['-r'] = ExecutionProfile.commands.run;
ExecutionProfile.commands['-s'] = ExecutionProfile.commands.save;


ExecutionProfile.prototype.load = function load(file){
  file = file || this.input;
  this.src = fs.readFileSync(file, 'utf8');
  this.ast = astify.ASTNode.parse(this.src);
  var inline = this.src.match(/^\/\/!#(.*?)\n/);
  inline && this.addTransforms(inline[1].split('|'));
  return this;
};

ExecutionProfile.prototype.addTransforms = function addTransforms(transforms){
  if (typeof transforms === 'string' || typeof transforms === 'function')
    transforms = [transforms];

  if (transforms instanceof Array) {
    transforms.forEach(function(transform){
      if (typeof transform === 'string') {
        transform = Transform.load(transform);
        if (transform)
          this.transforms.push(transform);
      } else if (typeof transform === 'function') {
        this.transforms.push(transform);
      }
    }, this);
  }
  return this;
};

ExecutionProfile.prototype.transform = function transform(){
  return this.transformed = this.transforms.reduce(function(ast, transformer){
    return transformer.transform(ast.clone());
  }, this.ast);
};

ExecutionProfile.prototype.toSource = function toSource(){
  return (this.transformed || this.transform()).toSource();
};

ExecutionProfile.prototype.execute = function execute(){
  var temp = path.resolve('__temp.js');
  fs.writeFileSync(temp, this.toSource());
  this.child = require('child_process').spawn(process.execPath, [temp], { stdio: 'inherit' });
  this.child.on('close', function(){
    fs.unlinkSync(temp);
  });
  return this.child;
};

ExecutionProfile.prototype.save = function save(file){
  file = file || this.output;
  if (path.existsSync(path.dirname(file)))
    fs.writeFileSync(file, this.toSource());
  return this;
};


if (process.mainModule === module) {
  var exec = new ExecutionProfile(process.argv).load();
  if (!exec.commands.length)
    exec.commands.push(ExecutionProfile.commands.log);

  exec.transform();
  exec.commands.forEach(function(command){
    command(exec);
  });
}
