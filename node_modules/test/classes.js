class Vector2D {
  constructor(a, b){
    this[0] = a;
    this[1] = b;
  }
  clone(){
    return new this.constructor(this[0], this[1]);
  }
}

class Point extends Vector2D {
  constructor(x, y){
    super(x, y);
  }
  get x(){ return this[0] }
  set x(v){ this[0] = v }
  get y(){ return this[1] }
  set y(v){ this[1] = v }
  set(point){
    super.clone(point);
  }
}
