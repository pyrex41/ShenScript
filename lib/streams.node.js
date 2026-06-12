import fs from 'node:fs';

export class NodeInStream {
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
}

export class NodeOutStream {
  constructor(stream, name) {
    this.name = name;
    this.stream = stream;
  }
  write(b) { return this.stream.write(String.fromCharCode(b)); }
  writeString(s) { return this.stream.write(s); }
  close() {
    if (typeof this.stream.end === 'function') {
      this.stream.end();
    }
    return null;
  }
}

export const openRead = path => new NodeInStream(fs.createReadStream(path), `filein=${path}`);
export const openWrite = path => new NodeOutStream(fs.createWriteStream(path), `fileout=${path}`);

export const stdStreamOptions = () => ({
  InStream: NodeInStream,
  OutStream: NodeOutStream,
  openRead,
  openWrite,
  stinput:  new NodeInStream(process.stdin, 'stinput'),
  stoutput: new NodeOutStream(process.stdout, 'stoutput'),
  sterror:  new NodeOutStream(process.stderr, 'sterror')
});
