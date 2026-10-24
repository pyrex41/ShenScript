// Optional adaptive scheduling profile. Public async ABI remains Promise-based.
// Internal exact calls can complete without incidental async-function yields.
export default $ => {
  const workers = new WeakMap();
  const promise = async value => value;
  const returned = value => value !== null && (typeof value === 'object' || typeof value === 'function') ? promise(value) : value;
  const resume = async (iterator, value) => {
    for (;;) {
      let input, failed = false;
      try { input = await value; }
      catch (error) { input = error; failed = true; }
      const result = failed ? iterator.throw(input) : iterator.next(input);
      if (result.done) return result.value;
      value = result.value;
    }
  };
  // The first failure is an async rejection, as in the original async arrow.
  // Rejections are thrown back into the suspended frame by resume.
  $.aotStart = iterator => {
    try {
      const result = iterator.next();
      if (result.done) return returned(result.value);
      return resume(iterator, result.value);
    } catch (error) { return Promise.reject(error); }
  };
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
