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

  var toPoint = coercer(n => 'x' in n ? [n.x, n.y] : empty)
  var toLine = coercer(n => 'x1' in n ? [n.x1, n.y1, n.x2, n.y2] : empty)
  var toRect = coercer(n => 'left' in n ? [n.left, n.top, n.right, n.bottom] : empty)

  export class Point {
    constructor(x, y){
      this.length = 2;
      this.set(x, y);
    }
    get x(){ return this[0] }
    get y(){ return this[1] }
    set x(v){ this[0] = v }
    set y(v){ this[1] = v }
    get size(){ return this.distance([0, 0]) }
    get quadrant(){ return (this[0] < 0) << 1 | (this[1] < 0) }

    valueOf(){
      return this[1] << 16 | this[0];
    }
    set(v){
      v = toArray(v);
      [this[0], this[1]] = v;
      return this
    }
    empty(v){
      this[0] = this[1] = 0
      return this
    }
    isEqual(v){
      v = toArray(v)
      return this[0] === v[0] && this[1] === v[1]
    }
    distance(v){
      v = toArray(v)
      return sqrt(pow(this[0] - v[0], 2) + pow(this[1] - v[1], 2))
    }
    clone(){
      return new Point(this[0], this[1])
    }
    multiply(v){
      v = toArray(v)
      return new Point(this[0] * v[0], this[1] * v[1])
    }
    add(v){
      v = toArray(v)
      return new Point(this[0] + v[0], this[1] + v[1])
    }
    subtract(v){
      v = toArray(v)
      return new Point(this[0] - v[0], this[1] - v[1])
    }
    divide(v){
      v = toArray(v)
      return new Point(this[0] / v[0], this[1] / v[1])
    }
    average(v){
      v = toArray(v)
      return new Point((this[0] + v[0]) / 2, (this[1] + v[1]) / 2)
    }
    lineTo(v){
      v = toArray(v)
      return new Line(this[0], this[1], v[0], v[1])
    }
    toBytes(){
      return byteString(this)
    }
    toArray(){
      return [this[0], this[1]]
    }
    toObject(){
      return { x: this[0],
               y: this[1] }
    }
    toBuffer(Type){
      var array = [this[0], this[1]]
      Type || (Type = isInt(array) ? Uint32Array : Float64Array)
      return new Type(array)
    }
    toString(){
      var [x, y] = this;
      return `<Point ${x} ${y}>`
    }
  }


  export class Line {
    constructor(x1, y1, x2, y2){
      this.length = 4;
      this.set(x1, y1, x2, y2);
    }
    toString(){
      var [x1, y1, x2, y1] = this;
      return `<Line ${x1} ${y1} ${x2} ${y2}>`;
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
      if (typeof x1 === 'number' || x1 == null)
        return this.setValues(x1, y1, x2, y2);
      if  (typeof x1 === 'string')
        return this.setString(x1);
      if (x1 instanceof Point)
        return this.setPoints(x1, y1);
      if (x1.length === 4)
        return this.setIndexed(x1);
      if (isObject(x1) && 'x1' in x1)
        return this.setObject(x1);

      throw new TypeError('Line#set: Unrecognized value');
    }
    setValues(x1, y1, x2, y2){
      this[0] = toFinite(x1);
      this[1] = toFinite(y1);
      this[2] = toFinite(x2);
      this[3] = toFinite(y2);
      return this;
    }
    setIndexed(a){
      [this[0], this[1], this[2], this[3]] = a;
      return this;
    }
    setPoints(p1, p2){
      [this[0], this[1]] = p1;
      [this[2], this[3]] = p2;
      return this;
    }
    setObject(o){
      this[0] = o.x1;
      this[1] = o.y1;
      this[2] = o.x2;
      this[3] = o.y2;
      return this;
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
    constructor(left, top, width, height){
      this.length = 4;
      this.set(left, top, width, height);
    }
    get left(){ return this[0] }
    get top(){ return this[1] }
    get width(){ return this[2] }
    get height(){ return this[3] }
    get centerX(){ return (this[0] + this[2]) / 2 }
    get centerY(){ return (this[1] + this[3]) / 2 }
    get isEmpty(){ return this[2] <= 0 || this[3] <= 0 }
    center(){
      return new Point((this[0] + this[2]) / 2, (this[1] + this[3]) / 2);
    }
    setCenter(x, y){
      x == null && (x = 0);

      if (typeof x === 'number')
        y == null && (y = x);
      else
        y = x[1], x = x[0];

      this[0] = x + this[2] / 2;
      this[1] = y + this[3] / 2;
      return this;
    }
    topLeft(){
      return new Point(this[0], this[1]);
    }
    topRight(){
      return new Point(this[2], this[1]);
    }
    bottomLeft(){
      return new Point(this[0], this[3]);
    }
    bottomRight(){
      return new Point(this[2], this[3]);
    }
    topLine(){
      return new Line(this[0], this[1], this[2], this[1]);
    }
    rightLine(){
      return new Line(this[2], this[1], this[2], this[3]);
    }
    bottomLine(){
      return new Line(this[0], this[3], this[2], this[3]);
    }
    leftLine(){
      return new Line(this[0], this[1], this[0], this[3]);
    }
    diaganolTLBR(){
      return new Line(this[0], this[1], this[2], this[3]);
    }
    diaganolTRBL(){
      return new Line(this[2], this[1], this[0], this[3]);
    }
    set(left, top, width, height){
      if (typeof left === 'number' || left == null)
        return this.setValues(left, top, width, height);
      if  (typeof left === 'string')
        return this.setString(left);
      if (left instanceof Point)
        return this.setPoints(left, top);
      if (left.length === 4)
        return this.setIndexed(left);

      throw new TypeError('Rect#set: Unrecognized value');
    }
    setValues(left, top, width, height){
      if (left == null) left = 0;
      this[0] = toFinite(left);
      this[1] = toFinite(top);
      this[2] = toFinite(width);
      this[3] = toFinite(height);
      return this;
    }
    setString(v){
      this[0] = v.charCodeAt(0);
      this[1] = v.charCodeAt(1);
      this[2] = v.charCodeAt(2);
      this[3] = v.charCodeAt(3);
      return this;
    }
    setPoints(p1, p2){
      [this[0], this[1]] = p1;
      [this[2], this[3]] = p2;
      return this;
    }
    setIndexed(a){
      [this[0], this[1], this[2], this[3]] = a;
      return this;
    }
    centerIn(rect){
      this.setCenter(rect.centerX, rect.centerY);
      return this;
    }
    inflate(dx, dy){
      if (typeof dx === 'number') {
        dx = toFinite(dx);
        dy = dy == null ? dx : toFinite(dy);
      } else if (dx instanceof Point) {
        var [dx, dy] = dx;
      }
      return this.setValues(this[0] - dx, this[1] - dy, this[2] + dx, this[3] + dy);
    }
    offset(dx, dy){
      if (typeof dx === 'number') {
        dx = toFinite(dx);
        dy = dy == null ? dx : toFinite(dy);
      } else if (dx instanceof Point) {
        var { x: dx, y: dy } = dx;
      }
      return this.setValues(this[0] + dx, this[1] + dy, this[2] + dx, this[3] + dy);
    }
    empty(){
      return this.setValues(0, 0, 0, 0);
    }
    rotate(angle) {
      var dx, dy, a, cx, cy, d;
      angle = angle * PI / 180;
      cx = this.centerX;
      cy = this.centerY;
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
      if (x instanceof Point) {
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
    intersect(target){
      if (target instanceof Line)
        return this.intersectLine(target);
      if (target instanceof Rect)
        return this.intersectRect(target);
    }
    intersectLine(line) {
      return [line.intersect(this.leftLine()),
              line.intersect(this.topLine()),
              line.intersect(this.rightLine()),
              line.intersect(this.bottomLine())];
    }
    intersectRect(rect){
      return new Rect(max(this[0], rect[0]),
                      max(this[1], rect[1]),
                      min(this[2], rect[2]),
                      min(this[3], rect[3]));
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
    toPoints(){
      return [new Point(this[0], this[1]),
              new Point(this[2], this[3])];
    }
    toObject(){
      return { left:    this[0],
               top:     this[1],
               width:   this[2],
               height:  this[3],
               centerX: this.centerX,
               centerY: this.centerY };
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
    toString(){
      var [left, top, width, height] = this;
      return tag`<Rect ${left} ${top} ${width} ${height}>`;
    }
  }
}
