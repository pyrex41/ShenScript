// Optional binding enforcement for explicitly sealed artifacts. No imports.
// Default runtime environments are left untouched.
export default $ => {
  const sealed = new Set(), globals = $.globals;
  const fail = name => { throw new Error(`cannot replace sealed function "${name}"`); };
  const register = $.d;
  $.d = $.defun = (name, f) => {
    if (sealed.has(name)) fail(name);
    return register(name, f);
  };
  const set = globals.set, remove = globals.delete, clear = globals.clear;
  Object.defineProperties(globals, {
    set: { value(name, cell) { if (this === globals && sealed.has(name)) fail(name); return set.call(this, name, cell); } },
    delete: { value(name) { if (this === globals && sealed.has(name)) fail(name); return remove.call(this, name); } },
    clear: { value() { if (this === globals && sealed.size) throw new Error('cannot clear sealed function bindings'); return clear.call(this); } }
  });
  $.sealFunction = name => {
    if (sealed.has(name)) return $.symbolOf(name);
    if (typeof name !== 'string') throw new Error('sealed function name must be a string');
    const cell = $.lookup(name), descriptor = Object.getOwnPropertyDescriptor(cell, 'f');
    const f = descriptor?.value;
    if (typeof f !== 'function' || !Number.isSafeInteger(f.arity) || f.arity < 0) throw new Error('cannot seal undefined function: ' + name);
    Object.freeze(f);
    Object.defineProperty(cell, 'f', { writable: false, configurable: false });
    sealed.add(name);
    return $.symbolOf(name);
  };
  return $;
};
