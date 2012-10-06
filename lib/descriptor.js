var descriptor = (function(exports){
  function Descriptor(enumerable, configurable){
    this.enumerable = !!enumerable;
    this.configurable = !!configurable;
  }

  function Accessor(get, set, enumerable, configurable){
    this.get = typeof get === 'function' ? get : undefined;
    this.set = typeof set === 'function' ? set : undefined;
    this.enumerable = !!enumerable;
    this.configurable = !!configurable;
  }

  Accessor.prototype = new Descriptor;

  function Value(value, writable, enumerable, configurable){
    this.value = value;
    this.writable = !!writable;
    this.enumerable = !!enumerable;
    this.configurable = !!configurable;
  }

  Value.prototype = new Descriptor;


  function NormalValue(value){
    this.value = value;
  }

  NormalValue.prototype = new Value(undefined, true, true, true);

  function ReadonlyValue(value){
    this.value = value;
  }

  ReadonlyValue.prototype = new Value(undefined, false, true, true);

  function NormalGetter(get){
    this.get = get;
  }

  NormalGetter.prototype = new Accessor(undefined, undefined, true, true);

  function NormalSetter(set){
    this.set = set;
  }

  NormalSetter.prototype = new Accessor(undefined, undefined, true, true);


  function LengthDescriptor(value){
    this.value = value >>> 0;
  }

  LengthDescriptor.prototype = new Value(0, true, false, false);

  function LockedDescriptor(value){
    this.value = value;
  }

  LockedDescriptor.prototype = new Value(undefined, false, false, false);


  return exports(function descriptor(type, a, b, c, d){
    switch (type) {
      case 'init': return new NormalValue(a);
      case 'get': return new NormalGetter(a);
      case 'set': return new NormalSetter(a);
      case 'value': return new Value(a, b, c, d);
      case 'accessor': return new Accessor(a, b, c, d);
      case 'readonly': return new ReadonlyValue(a);
      case 'frozen': return new Value(a, true, b, true);
      case 'hidden': return new Value(a, b, false, c);
      case 'length': return new LengthDescriptor(a);
      case 'locked': return new LockedDescriptor(a);
    }
  });
})(typeof module !== 'undefined'
  ? function(x){ return module.exports = x }
  : function(x){ (0, eval)('this')[x.name] = x }
);
