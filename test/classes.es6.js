//!#es6

module geometry {
  var { min, max, sqrt, pow, acos, atan2, cos, sin, PI } = Math;

  var empty = [0, 0, 0, 0];

  var isObject = o => o != o && typeof o === 'object' || typeof o === 'function'

  var toUint32 = n => n >>> 0

  var toInt32  = n => n >> 0

  var toInt    = n => toFinite(n) + .5 | 0

  var toFinite = n => typeof n === 'number'
                      ? n || 0
                      : isFinite(n /= 1)
                        ? n
                        : 0

  var isInt    = n => typeof n === 'number'
                      ? n | 0 === n
                      : n instanceof Array
                        ? n.every(isInt)
                        : false

  var toArray  = n => typeof n === 'number'
                      ? [n, n, n, n]
                      : n != null && n.length
                        ? n
                        : empty


  function coercer(Type, handler){
    Type.from = function from(args){
      if (args == null)         return empty
      if (args instanceof Type) return args
      var a = args[0], b;
      if (a instanceof Type)    return a

      switch (typeof a) {
        case 'boolean':
        case 'string':
          a /= 1 || 0
        case 'number':
          switch (args.length) {
            case 0: return empty
            case 1: return [a, a, a, a]
            case 2: return [a, b = args[1] / 1 || 0, a, b]
            case 3: return [a, b = args[1] / 1 || 0, args[2] / 1 || 0, b]
            default: return [a, args[1] / 1 || 0, args[2] / 1 || 0, args[3] / 1 || 0]
          }
        case 'object':
          if ('length' in a) return a
        case 'function':
          return handler(a)
      }
    }
  }

  class Vector {
    constructor(){
      var v = this.constructor.from(arguments)
      for (var i=0; i < this.length; i++)
        this[i] = v[i]
    }
    clone(){
      return new this.constructor(this)
    }
    set(v){
      this.constructor.apply(this, v)
      return this
    }
    empty(v){
      for (var i=0; i < this.length; i++)
        this[i] = 0
      return this
    }
    isEqual(v){
      v = this.constructor.from(v)
      for (var i=0; i < this.length; i++)
        if (this[i] !== v[i])
          return false;
      return true
    }
    isEmpty(v){
      for (var i=0; i < this.length; i++)
        if (this[0])
          return false;
      return true
    }
    toArray(){
      return Array.apply(null, this)
    }
    toBuffer(Type){
      var array = this.toArray()
      Type || (Type = isInt(array) ? Uint32Array : Float64Array)
      return new Type(array)
    }
  }
  Vector.from = n => n

  export class Vector2D extends Vector {
    constructor(){
      [this[0], this[1]] = this.constructor.from(arguments)
    }
    toString(){
      return `<${this.constructor.name} ${this[0]} ${this[1]}>`
    }
    multiply(v){
      v = this.constructor.from(v)
      return new this.constructor(this[0] * v[0], this[1] * v[1])
    }
    add(v){
      v = this.constructor.from(v)
      return new this.constructor(this[0] + v[0], this[1] + v[1])
    }
    subtract(v){
      v = this.constructor.from(v)
      return new this.constructor(this[0] - v[0], this[1] - v[1])
    }
    divide(v){
      v = this.constructor.from(v)
      return new this.constructor(this[0] / v[0], this[1] / v[1])
    }
    average(v){
      v = this.constructor.from(v)
      return new this.constructor((this[0] + v[0]) / 2, (this[1] + v[1]) / 2)
    }
  }
  coercer(Vector2D, n => empty)
  Object.defineProperty(Vector2D.prototype, 'length', { value: 2 })


  export class Vector4D extends Vector {
    constructor(){
      [this[0], this[1], this[2], this[3]] = this.constructor.from(arguments)
    }
    toString(){
      return `<${this.constructor.name} ${this[0]} ${this[1]} ${this[2]} ${this[3]}>`
    }
    multiply(v){
      v = this.constructor.from(v)
      return new this.constructor(this[0] * v[0], this[1] * v[1], this[2] * v[2], this[3] * v[3])
    }
    add(v){
      v = this.constructor.from(v)
      return new this.constructor(this[0] + v[0], this[1] + v[1], this[2] + v[2], this[3] + v[3])
    }
    subtract(v){
      v = this.constructor.from(v)
      return new this.constructor(this[0] - v[0], this[1] - v[1], this[2] - v[2], this[3] - v[3])
    }
    divide(v){
      v = this.constructor.from(v)
      return new this.constructor(this[0] / v[0], this[1] / v[1], this[2] / v[2], this[3] / v[3])
    }
    average(v){
      v = this.constructor.from(v)
      return new this.constructor((this[0] + v[0]) / 2, (this[1] + v[1]) / 2,
                                  (this[2] + v[2]) / 2, (this[3] + v[3]) / 2)
    }
    decompose(){
      return [new Vector2D(this[0], this[1]),
              new Vector2D(this[2], this[3])]
    }
  }
  coercer(Vector4D, n => empty)
  Object.defineProperty(Vector4D.prototype, 'length', { value: 4 })



  export class Point extends Vector2D {
    constructor(x, y){
      super(x, y)
    }
    get x(){ return this[0] }
    get y(){ return this[1] }
    set x(v){ this[0] = v }
    set y(v){ this[1] = v }
    get size(){ return this.distance([0, 0]) }
    get quadrant(){ return (this[0] < 0) << 1 | (this[1] < 0) }
    get originTangent(){ return this.lineTo([0, 0]) }
    distance(v){
      v = Point.from(v)
      return sqrt(pow(this[0] - v[0], 2) + pow(this[1] - v[1], 2))
    }
    lineTo(v){
      v = Point.from(v)
      return new Line(this[0], this[1], v[0], v[1])
    }
    restructure(){
      return { x: this[0], y: this[1] }
    }
  }
  coercer(Point, n => 'x' in n ? [n.x, n.y] : empty)


  export class Size extends Vector2D {
    constructor(w, h){
      super(w, h)
    }
    get w(){ return this[0] }
    get h(){ return this[1] }
    set w(v){ this[0] = v }
    set h(v){ this[1] = v }
    get area(){ return this[0] * this[1] }
    restructure(){
      return { w: this[0], h: this[1] }
    }
  }
  coercer(Size, n => 'w' in n ? [n.w, n.h] : empty)




  export class Line extends Vector4D {
    constructor(x1, y1, x2, y2){
      super(x1, y1, x2, y2)
    }
    get x1(){ return this[0] }
    get y1(){ return this[1] }
    get x2(){ return this[2] }
    get y2(){ return this[3] }
    set x1(v){ this[0] = v }
    set y1(v){ this[1] = v }
    set x2(v){ this[2] = v }
    set y2(v){ this[3] = v }
    get maxX(){ return this[0] > this[2] ? this[0] : this[2] }
    get minX(){ return this[0] < this[2] ? this[0] : this[2] }
    get maxY(){ return this[1] > this[3] ? this[1] : this[3] }
    get max(){ return new Point(this.maxX, this.maxY) }
    get min(){ return new Point(this.minX, this.minY) }
    get minY(){ return this[1] < this[3] ? this[1] : this[3] }
    get distance(){ return sqrt(pow(this[2] - this[0], 2) + pow(this[3] - this[1], 2)) }
    get slope(){ return (this[3] - this[1]) / (this[2] - this[0]) }
    intersect(line) {
      var ax = this[0] - this[2],
          ay = this[1] - this[3],
          bx = line[2] - line[0],
          by = line[3] - line[1],
           x = line[0] - this[2],
           y = line[1] - this[3]

      var dn = ay * bx - ax * by
          nx = (ax * y - ay * x) / dn

      if (nx >= 0 && nx <= 1) {
        var ny = (bx * y - by * x) / dn
        if (ny >= 0 && ny <= 1) {
          return new Point(this[0] + nx * ax, this[1] + nx * ay)
        }
      }
      return null;
    }
    contains(point){
      return point[0] > this.minX
          && point[0] < this.maxX
          && point[1] > this.minY
          && point[1] < this.maxY
    }
    restructure(){
      return { x1: this[0], y1: this[1], x2: this[2], y2: this[3] }
    }
  }
  coercer(Line, n => 'x1' in n ? [n.x1, n.y1, n.x2, n.y2] : empty);



  export class Rect extends Vector4D {
    constructor(x, y, w, h){
      super(x, y, w, h)
    }
    get x(){ return this[0] }
    get y(){ return this[1] }
    get w(){ return this[2] }
    get h(){ return this[3] }
    get cx(){ return (this[0] + this[2]) / 2 }
    get cy(){ return (this[1] + this[3]) / 2 }
    get center(){ return new Point(this.cx, this.cy) }
    get position(){ return new Point(this[0], this[1]) }
    get size(){ return new Size(this[2], this[3]) }
    get topLeft(){ return new Point(this[0], this[1]) }
    get topRight(){ return new Point(this[2], this[1]) }
    get bottomLeft(){ return new Point(this[0], this[3]) }
    get bottomRight(){ return new Point(this[2], this[3]) }
    get left(){ return new Line(this[0], this[1], this[0], this[3]) }
    get top(){ return new Line(this[0], this[1], this[2], this[1]) }
    get right(){ return new Line(this[2], this[1], this[2], this[3]) }
    get bottom(){ return new Line(this[0], this[3], this[2], this[3]) }
    get descender(){ return new Line(this[0], this[1], this[2], this[3]) }
    get ascender(){ return new Line(this[2], this[1], this[0], this[3]) }
    set x(v){ this[0] = v }
    set y(v){ this[1] = v }
    set w(v){ this[2] = v }
    set h(v){ this[3] = v }
    set cx(v){ this[0] = v + this[2] / 2 }
    set cy(v){ this[1] = v + this[3] / 2 }
    set center(v){ [this.cx, this.cy] = Point.from(v) }
    set position(v){ [this[0], this[1]] = Point.from(v) }
    set size(v){ [this[2], this[3]] = Size.from(v) }
    set topLeft(v){ [this[0], this[1]] = Point.from(v) }
    set topRight(v){ [this[2], this[1]] = Point.from(v) }
    set bottomLeft(v){ [this[0], this[3]] = Point.from(v) }
    set bottomRight(v){ [this[2], this[3]] = Point.from(v) }
    set left(v){ [this[0], this[1], this[0], this[3]] = Line.from(v) }
    set top(v){ [this[0], this[1], this[2], this[1]] = Line.from(v) }
    set right(v){ [this[2], this[1], this[2], this[3]] = Line.from(v) }
    set bottom(v){ [this[0], this[3], this[2], this[3]] = Line.from(v) }
    set descender(v){ [this[0], this[1], this[2], this[3]] = Line.from(v) }
    set ascender(v){ [this[2], this[1], this[0], this[3]] = Line.from(v) }
    components(){
      return [this.position, this.size]
    }
    restructure(){
      return { x: this[0], y: this[1], w: this[2], h: this[3] }
    }
    inflate(){
      var size = Size.from(arguments);
      return new Rect(this[0] - size[0],
                      this[1] - size[1],
                      this[2] + size[0],
                      this[3] + size[1])
    }
    offset(){
      var point = Point.from(arguments);
      return new Rect(this[0] + point[0],
                      this[1] + point[1],
                      this[2] + point[0],
                      this[3] + point[1])
    }
    rotate(angle) {
      var out = new Rect
      var dx, dy, a, d, { cx, cy } = this

      angle *= PI / 180;

      for (var i=0; i < 4; i += 2) {
        dx = this[i] - cx
        dy = this[i + 1] - cy
        a = atan2(dy, dx) + angle
        d = sqrt(dx * dx + dy * dy)
        out[i] = cos(angle) * a - sin(angle) * d
        out[i + 1] = sin(angle) * a + cos(angle) * d
      }

      return out
    }
    contains(){
      var rect = Rect.from(arguments)
      return rect[0] >= this[0]
          && rect[1] >= this[1]
          && rect[2] <= this[2]
          && rect[3] <= this[3];
    }
    intersects(){
      var rect = Rect.from(arguments)
      return !(this[0] > rect[2]
            || this[1] > rect[3]
            || this[2] < rect[0]
            || this[3] < rect[1])
    }
    intersect() {
      var line = Line.from(arguments)
      line instanceof Line || (line = new Line(line));
      return [line.intersect(this.left),
              line.intersect(this.top),
              line.intersect(this.right),
              line.intersect(this.bottom)]
    }
    union(){
      var rect = Rect.from(arguments)
      return new Rect(min(this[0], rect[0]),
                      min(this[1], rect[1]),
                      max(this[2], rect[2]),
                      max(this[3], rect[3]))
    }
  }
  coercer(Rect, n => 'w' in n && 'x' in n ? [n.x, n.y, n.w, n.h] : empty);
}


var { Rect, Point, Line, Size } = geometry
