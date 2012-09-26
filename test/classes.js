module geometry {
  var byteString = Function.prototype.apply.bind(String.fromCharCode, null);


  var min   = Math.min,
      max   = Math.max,
      sqrt  = Math.sqrt,
      pow   = Math.pow,
      acos  = Math.acos,
      atan2 = Math.atan2,
      cos   = Math.cos,
      sin   = Math.sin,
      PI    = Math.PI;

  function isObject(o){
    return o != null && typeof o === 'object' || typeof o === 'function';
  }

  function toUint32(n){
    return n >>> 0;
  }

  function toInt32(n){
    return n >> 0;
  }

  function toInt(n){
    return n ? toFinite(n) + .5 | 0 : 0;
  }

  function toFinite(n){
    return typeof n === 'number' ? n || 0 : isFinite(n /= 1) ? n : 0;
  }

  function isInt(n){
    if (typeof n === 'number')
      return n | 0 === n;
    else if (Array.isArray(n))
      return n.every(isInt);
  }


  export var Point = class Point {
    constructor(x, y){
      this.length = 2;
      this.set(x, y);
    }
    get x(){ return this[0] }
    get y(){ return this[1] }
    set x(v){ this[0] = v }
    set y(v){ this[1] = v }
    clone(){
      return new Point(this[0], this[1]);
    }
    average(point){
      return new Point((this[0] + point[0]) / 2, (this[1] + point[1]) / 2);
    }
    multiply(point){
      return new Point(this[0] * point[0], this[1] * point[1]);
    }
    add(point){
      return new Point(this[0] + point[0], this[1] + point[1]);
    }
    subtract(point){
      return new Point(this[0] - point[0], this[1] - point[1]);
    }
    combine(point){
      return new Point(this[0], point[1]);
    }
    translate(n){
      return new Point(this[0] + n, this[1] + n);
    }
    scale(n){
      return new Point(this[0] * n, this[1] * n);
    }
    lineTo(point){
      return new Line(this[0], this[1], point[0], point[1]);
    }
    set(x, y){
      if (x == null) x = 0;
      if (typeof x === 'number') {
        this[0] = +x || 0;
        this[1] = y == null ? x : +y || 0;
      } else if (typeof x === 'string') {
        this[0] = x.charCodeAt(0);
        this[1] = x.charCodeAt(1);
      } else if (x.length === 2) {
        this[0] = x[0];
        this[1] = x[1];
      } else if ('x' in x && 'y' in x) {
        this[0] = x.x;
        this[1] = x.y;
      } else {
        throw new TypeError("Unable to determine type of "+x);
      }
      return this;
    }
    setString(v){
      this[0] = v.charCodeAt(0);
      this[1] = v.charCodeAt(1);
      return this;
    }
    setValues(x, y){
      this[0] = +x || 0;
      this[1] = +x || 0;
      return this;
    }
    setObject(p){
      this[0] = p.x,
      this[1] = p.y;
      return this;
    }
    setIndexed(a){
      this[0] = a[0];
      this[1] = a[1];
      return this;
    }
    offset(x, y){
      if (x == null) x = 0;
      if (typeof x === 'number') {
        this[0] += +x || 0;
        this[1] += y == null ? x : +y || 0;
      } else if (typeof x === 'string') {
        this[0] += x.charCodeAt(0);
        this[1] += x.charCodeAt(1);
      } else if (x.length === 2) {
        this[0] += x[0];
        this[1] += x[1];
      } else if ('x' in x && 'y' in x) {
        this[0] += x.x;
        this[1] += x.y;
      } else {
        throw new TypeError("Unable to determine type of "+x);
      }
      return this;
    }
    offsetString(v){
      this[0] += v.charCodeAt(0);
      this[1] += v.charCodeAt(1);
      return this;
    }
    offsetValues(x, y){
      this[0] += +x || 0;
      this[1] += +y || 0;
      return this;
    }
    offsetObject(p){
      this[0] += p.x,
      this[1] += p.y;
      return this;
    }
    offsetIndexed(a){
      this[0] += a[0];
      this[1] += a[1];
      return this;
    }
    empty(){
      this[0] = 0;
      this[1] = 0;
      return this;
    }
    distance(point) {
      var n;
      return sqrt((n = this[0] - point[0]) * n + (n = this[1] - point[1]) * n);
    }
    size(){
      return this.distance([0, 0]);
    }
    quadrant(){
      return (this[0] < 0) << 1 | (this[1] < 0);
    }
    isEmpty(){
      return !(this[0] && this[1]);
    }
    isEqual(point){
      return this[0] === point[0]
          && this[1] === point[1];
    }
    toBytes(){
      return byteString(this);
    }
    toArray(){
      return [this[0], this[1]];
    }
    toObject(){
      return { x: this[0],
               y: this[1] };
    }
    toBuffer(Type){
      var array = this.toArray();
      if (!Type)
        Type = isInt(array) ? Uint32Array : Float64Array;
      return new Type(array);
    }
    toString(){
      var x = this[0], y = this[1];
      return `<Point ${x} ${y}>`;
    }
  }


  export var Line = class Line {
    constructor(x1, y1, x2, y2){
      this.length = 4;
      this.set(x1, y1, x2, y2);
    }
    get x1(){ return this[0] }
    get y1(){ return this[1] }
    get x2(){ return this[2] }
    get y2(){ return this[3] }
    set x1(v){ this[0] = v }
    set y1(v){ this[1] = v }
    set x2(v){ this[2] = v }
    set y2(v){ this[3] = v }
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
      this[0] = a[0];
      this[1] = a[1];
      this[2] = a[2];
      this[3] = a[3];
      return this;
    }
    setPoints(p1, p2){
      this[0] = p1[0];
      this[1] = p1[1];
      this[2] = p2[0];
      this[3] = p2[1];
      return this;
    }
    setObject(o){
      this[0] = o.x1;
      this[1] = o.y1;
      this[2] = o.x2;
      this[3] = o.y2;
      return this;
    }
    distance(){
      var n;
      return sqrt((n = this[2] - this[0]) * n + (n = this[3] - this[1]) * n);
    }
    slope(){
      return (this[3] - this[1]) / (this[2] - this[0]);
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
      var x1, y1, x2, y2;

      this[0] < this[2] ? (x1 = 0, x2 = 2) : (x1 = 2, x2 = 0);
      if (point[0] < this[x1] || point[0] > this[x2])
        return false;

      this[1] < this[3] ? (y1 = 1, y2 = 3) : (y1 = 3, y2 = 1);
      if (point[1] < this[y1] || point[1] > this[y2])
        return false;

      return true;
    }
    maxX(){
      return this[0] > this[2] ? this[0] : this[2];
    }
    minX(){
      return this[0] < this[2] ? this[0] : this[2];
    }
    maxY(){
      return this[1] > this[2] ? this[1] : this[2];
    }
    minY(){
      return this[1] < this[2] ? this[1] : this[2];
    }
    max(){
      return new Point(this.maxX(), this.maxY());
    }
    min(){
      return new Point(this.minX(), this.minY());
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
    toString(){
      var x1 = this[0],
          y1 = this[1],
          x2 = this[2],
          y2 = this[3];
      return `<Line ${x1} ${y1} ${x2} ${y2}>`;
    }
  }

  export var Rect = class Rect {
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
      this[0] = p1[0];
      this[1] = p1[1];
      this[2] = p2[0];
      this[3] = p2[1];
      return this;
    }
    setIndexed(a){
      this[0] = a[0];
      this[1] = a[1];
      this[2] = a[2];
      this[3] = a[3];
      return this;
    }
    setWidth(v, side){
      v = toFinite(v);
      if (side > 0) {
        this[2] += v;
      } else if (side < 0) {
        this[0] -= v;
      } else {
        var center = (this[0] + this[2]) / 2;
        v /= 2;
        this[0] = center - v;
        this[2] = center + v;
      }
      return this;
    }
    setHeight(v, side){
      v = toFinite(v);
      if (side > 0) {
        this[3] += v;
      } else if (side < 0) {
        this[1] -= v;
      } else {
        this[3] += (v /= 2);
        this[1] -= v;
      }
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
        dy = dx[0];
        dx = dx[1];
      }
      return this.setValues(this[0] - dx, this[1] - dy, this[2] + dx, this[3] + dy);
    }
    offset(dx, dy){
      if (typeof dx === 'number') {
        dx = toFinite(dx);
        dy = dy == null ? dx : toFinite(dy);
      } else if (dx instanceof Point) {
        dy = dx.y;
        dx = dx.x;
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
    isEmpty(){
      return this.width <= 0 || this.height <= 0;
    }
    contains(x, y){
      if (x instanceof Rect || x.length >= 3) {
        return x[0] >= this[0]
            && x[1] >= this[1]
            && x[2] <= this[2]
            && x[3] <= this[3];
      }
      if (x instanceof Point) {
        y = x[0];
        x = x[1];
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
      return [
        line.intersect(this.leftLine()),
        line.intersect(this.topLine()),
        line.intersect(this.rightLine()),
        line.intersect(this.bottomLine()),
      ];
    }
    clone(){
      return new Rect(this[0], this[1], this[2], this[3]);
    }
    average(rect){
      return new Rect(
        (this[0] + rect[0]) / 2,
        (this[1] + rect[1]) / 2,
        (this[2] + rect[2]) / 2,
        (this[3] + rect[3]) / 2);
    }
    intersectRect(rect){
      return new Rect(
        max(this[0], rect[0]),
        max(this[1], rect[1]),
        min(this[2], rect[2]),
        min(this[3], rect[3]));
    }
    union(rect){
      return new Rect(
        min(this[0], rect[0]),
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
      var left = this[0],
          top = this[1],
          width = this[2],
          height = this[3];
      return `<Rect ${left} ${top} ${width} ${height}>`;
    }
  }
}
