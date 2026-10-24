// Optional adaptive scheduling profile. Public async ABI remains Promise-based.
// Internal exact calls can complete without incidental async-function yields.
export default $ => {
  const workers = new WeakMap();
  const promise = async value => value;
  const ready = promise(undefined);
  let steps = 0;
  // A bounded checkpoint breaks head-call chains whose former incidental
  // awaits became synchronous. The await stays in the caller, before the call,
  // so opaque/foreign thenables retain their original settlement semantics.
  $.aotCheckpoint = () => { steps = (steps + 1) & 63; return steps === 0 ? ready : null; };
  const returned = value => value !== null && (typeof value === 'object' || typeof value === 'function') ? promise(value) : value;
  $.aotReturn = returned;
  $.aotError = async error => { throw error; };
  $.aotFunction = (worker, arity) => {
    const dispatch = (...args) => {
      const value = worker(...args);
      return value instanceof Promise ? value : promise(value);
    };
    dispatch.async = true;
    const f = $.l(dispatch, arity);
    workers.set(f, { worker, arity });
    return f;
  };
  $.aotDefine = (name, f) => {
    const result = $.d(name, f), entry = workers.get(f);
    if (entry) workers.set($.lookup(name).f, entry);
    return result;
  };
  $.aotCall = (receiver, f, ...args) => {
    const entry = workers.get(f);
    return entry && args.length === entry.arity ? entry.worker(...args) : Reflect.apply(f, receiver, args);
  };
  return $;
};
