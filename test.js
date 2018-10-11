context = {
 b: {
   foo: 1,
   bar: 2,
   ar: [0,1,2],
   are: []
 }, 
 ts: 3
}
function check(ctxt, ...args) {
  function rf (accum, val) {
    f = Function(`return this.${val} !== undefined`)
    return accum ? f.call(ctxt) : accum
   }
  return args.reduce(rf,true)
}

v = check(context, "b", "b.foo", "b.bar", "b.ar[0]", "ts")
console.log(`check() = ${v}`)
