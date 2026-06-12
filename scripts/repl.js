const fs   = require('fs');
const Shen = require('../lib/shen.js');

const InStream = class {
  constructor(stream, name) {
    this.name = name;
    this.stream = stream;
    this.iter = stream[Symbol.asyncIterator]();
    this.buf = '';
    this.pos = 0;
  }
  async read() {
    if (this.pos < this.buf.length) {
      return this.buf[this.pos] === 13 ? (this.pos++, this.read()) : this.buf[this.pos++];
    }
    const { value, done } = await this.iter.next();
    return done ? -1 : (this.buf = value, this.pos = 0, this.read());
  }
  close() {
    if (typeof this.stream.destroy === 'function') {
      this.stream.destroy();
    }
    return null;
  }
};

const OutStream = class {
  constructor(stream, name) {
    this.name = name;
    this.stream = stream;
  }
  write(b) { return this.stream.write(String.fromCharCode(b)); }
  close() {
    if (typeof this.stream.end === 'function') {
      this.stream.end();
    }
    return null;
  }
};

(async () => {
  const { caller, toList } = await new Shen({
    InStream,
    OutStream,
    openRead:  path => new InStream(fs.createReadStream(path), `filein=${path}`),
    openWrite: path => new OutStream(fs.createWriteStream(path), `fileout=${path}`),
    stinput:  new InStream(process.stdin, 'stinput'),
    stoutput: new OutStream(process.stdout, 'stoutput'),
    sterror:  new OutStream(process.stderr, 'sterror')
  });
  await caller('shen.x.launcher.main')(toList(['shen', 'repl']));
})();
