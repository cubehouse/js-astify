//!#es6

module geometry {
  var byteString = Function.prototype.apply.bind(String.fromCharCode, null);

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


  function coercer(handler){
    return function(n){
      if (n == null) return empty
      switch (typeof n) {
        case 'boolean':
        case 'string': n /= 1
        case 'number': return n === n ? [n,n,n,n] : empty
        case 'object': if ('length' in n) return n
        case 'function': return handler(n)
      }
    }
  }

  var toVector2D = coercer(n => empty);
  var toPoint    = coercer(n => 'x' in n ? [n.x, n.y] : empty);
  var toSize     = coercer(n => 'w' in n ? [n.w, n.h] : empty);
  var toLine     = coercer(n => 'x1' in n ? [n.x1, n.y1, n.x2, n.y2] : empty);
  var toRect     = coercer(n => 'w' in n && 'x' in n ? [n.x, n.y, n.w, n.h] : empty);


  export class Vector2D {
    constructor(a, b){
      this[0] = a;
      this[1] = b;
    }
    toString(){
      return `<${this.constructor.name} ${this[0]} ${this[1]}>`;
    }
    valueOf(){
      return this[1] << 16 | this[0];
    }
    inspect(){
      return this.toString()
    }
    empty(v){
      this[0] = this[1] = 0
      return this
    }
    set(v){
      [this[0], this[1]] = toVector2D(v);
      return this
    }
    isEqual(v){
      v = toPoint(v)
      return this[0] === v[0] && this[1] === v[1]
    }
    clone(){
      return new this.constructor(this[0], this[1])
    }
    multiply(v){
      v = toPoint(v)
      return new this.constructor(this[0] * v[0], this[1] * v[1])
    }
    add(v){
      v = toPoint(v)
      return new this.constructor(this[0] + v[0], this[1] + v[1])
    }
    subtract(v){
      v = toPoint(v)
      return new this.constructor(this[0] - v[0], this[1] - v[1])
    }
    divide(v){
      v = toPoint(v)
      return new this.constructor(this[0] / v[0], this[1] / v[1])
    }
    average(v){
      v = toPoint(v)
      return new this.constructor((this[0] + v[0]) / 2, (this[1] + v[1]) / 2)
    }
    toBytes(){
      return byteString(this)
    }
    toArray(){
      return [this[0], this[1]]
    }
    toBuffer(Type){
      var array = [this[0], this[1]]
      Type || (Type = isInt(array) ? Uint32Array : Float64Array)
      return new Type(array)
    }
  }

  export class Point extends Vector2D {
    constructor(x, y){
      this.set(x, y);
    }
    get x(){ return this[0] }
    get y(){ return this[1] }
    set x(v){ this[0] = v }
    set y(v){ this[1] = v }
    get size(){ return this.distance([0, 0]) }
    get quadrant(){ return (this[0] < 0) << 1 | (this[1] < 0) }

    distance(v){
      v = toPoint(v)
      return sqrt(pow(this[0] - v[0], 2) + pow(this[1] - v[1], 2))
    }
    lineTo(v){
      v = toPoint(v)
      return new Line(this[0], this[1], v[0], v[1])
    }
    toObject(){
      return { x: this[0], y: this[1] }
    }
  }

  export class Size extends Vector2D {
    constructor(w, h){
      this.length = 2;
      this.set(w, h);
    }
    get w(){ return this[0] }
    get h(){ return this[1] }
    set w(v){ this[0] = v }
    set h(v){ this[1] = v }
    get area(){ return this[0] * this[1] }
    toObject(){
      return { w: this[0], h: this[1] }
    }
  }


  export class Line {
    constructor(x1, y1, x2, y2){
      this.set(x1, y1, x2, y2);
    }
    toString(){
      return `<Line ${this[0]}  ${this[1]} ${this[2]} ${this[3]}>`;
    }
    inspect(){
      return this.toString()
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
    get minY(){ return this[1] < this[3] ? this[1] : this[3] }
    get distance(){ return sqrt(pow(this[2] - this[0], 2) + pow(this[3] - this[1], 2)) }
    get slope(){ return (this[3] - this[1]) / (this[2] - this[0]) }
    max(){ return new Point(this.maxX, this.maxY) }
    min(){ return new Point(this.minX, this.minY) }
    set(x1, y1, x2, y2){
      [this[0], this[1], this[2], this[3]] = toLine(x1, y1, x2, y2);
    }
    intersect(line) {
      var ax = this[0] - this[2],
          ay = this[1] - this[3],
          bx = line[2] - line[0],
          by = line[3] - line[1],
           x = line[0] - this[2],
           y = line[1] - this[3];

      var dn = ay * bx - ax * by
          nx = (ax * y - ay * x) / dn;

      if (nx >= 0 && nx <= 1) {
        var ny = (bx * y - by * x) / dn;
        if (ny >= 0 && ny <= 1) {
          return new Point(this[0] + nx * ax, this[1] + nx * ay);
        }
      }
      return null;
    }
    contains(point){
      return point[0] > this.minX
          && point[0] < this.maxX
          && point[1] > this.minY
          && point[1] < this.maxY;
    }
    toBytes(){
      return byteString(this);
    }
    toPoints(){
      return [new Point(this[0], this[1]),
              new Point(this[2], this[3])];
    }
    toObject(){
      return { x1: this[0],
               y1: this[1],
               x2: this[2],
               y2: this[3] };
    }
    toArray(){
      return [this[0], this[1], this[2], this[3]];
    }
    toBuffer(Type){
      var array = this.toArray();
      if (!Type) {
        Type = isInt(array) ? Uint32Array : Float64Array;
      }
      return new Type(array);
    }
  }

  export class Rect {
    constructor(x, y, w, h){
      this.set(x, y, w, h);
    }
    toString(){
      return `<Rect ${this[0]} ${this[1]} ${this[2]} ${this[3]}>`;
    }
    inspect(){
      return this.toString()
    }
    get x(){ return this[0] }
    get y(){ return this[1] }
    get w(){ return this[2] }
    get h(){ return this[3] }
    get cx(){ return (this[0] + this[2]) / 2 }
    get cy(){ return (this[1] + this[3]) / 2 }

    set x(v){ this[0] = v }
    set y(v){ this[1] = v }
    set w(v){ this[2] = v }
    set h(v){ this[3] = v }
    set cx(v){ this[0] = v + this[2] / 2 }
    set cy(v){ this[1] = v + this[3] / 2 }

    getSize(){
      return new Size(this[2], this[3])
    }
    getPosition(){
      return new Point(this[0], this[1])
    }
    getCenter(){
      return new Point(this.cx, this.cy)
    }
    setPosition(v){
      [this[0], this[1]] = toPoint(v)
      return this
    }
    setSize(v){
      [this[2], this[3]] = toSize(v)
      return this
    }
    setCenter(cx, cy){
      this.cx = cx
      this.cy = cy
      return this
    }
    topLeft(){
      return new Point(this[0], this[1])
    }
    topRight(){
      return new Point(this[2], this[1])
    }
    bottomLeft(){
      return new Point(this[0], this[3])
    }
    bottomRight(){
      return new Point(this[2], this[3])
    }
    left(){
      return new Line(this[0], this[1], this[0], this[3])
    }
    top(){
      return new Line(this[0], this[1], this[2], this[1])
    }
    right(){
      return new Line(this[2], this[1], this[2], this[3])
    }
    bottom(){
      return new Line(this[0], this[3], this[2], this[3])
    }
    descender(){
      return new Line(this[0], this[1], this[2], this[3])
    }
    ascender(){
      return new Line(this[2], this[1], this[0], this[3])
    }
    isEmpty(){
      return this[2] <= 0 || this[3] <= 0
    }
    set(x, y, w, h){
      [this[0], this[1], this[2], this[3]] = toRect(x, y, w, h);
      return this;
    }
    inflate(dx, dy){
      if (typeof dx === 'number') {
        dx = toFinite(dx);
        dy = dy == null ? dx : toFinite(dy);
      } else if (dx.length === 2) {
        dy = dx[1];
        dx = dx[0];
      }
      return this.set(this[0] - dx, this[1] - dy, this[2] + dx, this[3] + dy);
    }
    offset(dx, dy){
      if (typeof dx === 'number') {
        dx = toFinite(dx);
        dy = dy == null ? dx : toFinite(dy);
      } else if (dx instanceof Point) {
        var { x: dx, y: dy } = dx;
      }
      return this.set(this[0] + dx, this[1] + dy, this[2] + dx, this[3] + dy);
    }
    empty(){
      this[0] = this[1] = this[2] = this[3] = 0;
    }
    rotate(angle) {
      var dx, dy, a, d;
      var { cx, cy } = this;

      angle *= PI / 180;

      for (var i=0; i < 4; i += 2) {
        dx = this[i] - cx;
        dy = this[i + 1] - cy;
        a = atan2(dy, dx) + angle;
        d = sqrt(dx * dx + dy * dy);
        this[i] = cos(angle) * pointX - sin(angle) * pointY;
        this[i + 1] = sin(angle) * pointX + cos(angle) * pointY;
      }
      return this;
    }
    isEqual(rect){
      return this[0] === rect[0]
          && this[1] === rect[1]
          && this[2] === rect[2]
          && this[3] === rect[3];
    }
    contains(x, y){
      if (x instanceof Rect || x.length >= 3) {
        return x[0] >= this[0]
            && x[1] >= this[1]
            && x[2] <= this[2]
            && x[3] <= this[3];
      }
      if (x instanceof Vector2D) {
        [x, y] = x;
      }
      return x >= this[0]
          && x <= this[2]
          && y >= this[1]
          && y <= this[3];
    }
    intersects(rect){
      return !(this[0] > rect[2]
            || this[1] > rect[3]
            || this[2] < rect[0]
            || this[3] < rect[1]);
    }
    intersect(line) {
      return [line.intersect(this.left()),
              line.intersect(this.top()),
              line.intersect(this.right()),
              line.intersect(this.bottom())];
    }
    clone(){
      return new Rect(this[0], this[1], this[2], this[3]);
    }
    average(rect){
      return new Rect((this[0] + rect[0]) / 2,
                      (this[1] + rect[1]) / 2,
                      (this[2] + rect[2]) / 2,
                      (this[3] + rect[3]) / 2);
    }
    union(rect){
      return new Rect(min(this[0], rect[0]),
                      min(this[1], rect[1]),
                      max(this[2], rect[2]),
                      max(this[3], rect[3]));
    }
    toBytes(){
      return byteString(this);
    }
    toComponents(){
      return [new Point(this[0], this[1]),
              new Size(this[2], this[3])];
    }
    toObject(){
      return { x:  this[0],
               y:  this[1],
               w:  this[2],
               h:  this[3],
               cx: this.cx,
               cy: this.cy };
    }
    toArray(){
      return [this[0], this[1], this[2], this[3]];
    }
    toBuffer(Type){
      Type || (Type = isInt(array) ? Uint32Array : Float64Array);
      return new Type(this.toArray());
    }
  }

  var desc = { configurable: true,
               writable: true,
               value: null };

  function attr(obj, key, value){
    desc.value = value
    Object.defineProperty(obj, key, desc)
    return obj
  }

  attr(Vector2D.prototype, 'length', 2)
  attr(Rect.prototype, 'length', 4)
  attr(Line.prototype, 'length', 4)
}


var x = new geometry.Point(200, 200);
console.log(geometry.Point.prototype);
