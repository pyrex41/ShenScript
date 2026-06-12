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

// File streams are synchronous. read() must return a settled value wherever
// possible: compiled KL passes bytes straight into comparisons and trampoline
// arguments (read-byte inlines to stream.read()), so an async read() would
// leak Promises into kernel code - (= -1 byte) at EOF never holds and
// read-file-as-bytelist spins forever. Reading the whole file up front also
// turns the kernel reader's byte loop into array indexing instead of a
// promise round-trip per byte. NodeInStream/NodeOutStream remain async for
// genuinely incremental streams (stdin); the compiler settles read-byte
// results with a maybe-await, so both flavors are semantically safe, but the
// sync file streams keep file I/O off the microtask treadmill entirely.
export class FileInStream {
  constructor(path) {
    this.name = `filein=${path}`;
    this.buf = fs.readFileSync(path);
    this.pos = 0;
  }
  read() { return this.pos >= this.buf.length ? -1 : this.buf[this.pos++]; }
  close() { return null; }
}

// Writes are buffered and flushed with writeSync: written files are fully
// on disk as soon as close() returns, which programs that write a file and
// immediately read it back (e.g. Ratatoskr's bootstrap) depend on -
// fs.createWriteStream flushes asynchronously and breaks that contract.
export class FileOutStream {
  constructor(path) {
    this.name = `fileout=${path}`;
    this.fd = fs.openSync(path, 'w');
    this.chunks = [];
    this.size = 0;
  }
  push(chunk) {
    this.chunks.push(chunk);
    this.size += chunk.length;
    if (this.size >= 65536) {
      this.flush();
    }
  }
  flush() {
    if (this.size > 0) {
      fs.writeSync(this.fd, Buffer.concat(this.chunks));
      this.chunks = [];
      this.size = 0;
    }
  }
  write(b) { return (this.push(Buffer.from([b])), b); }
  writeString(s) { return (this.push(Buffer.from(s, 'utf-8')), s); }
  close() {
    this.flush();
    fs.closeSync(this.fd);
    return null;
  }
}

export const openRead = path => new FileInStream(path);
export const openWrite = path => new FileOutStream(path);

export const stdStreamOptions = () => ({
  isInStream:  x => x instanceof NodeInStream  || x instanceof FileInStream,
  isOutStream: x => x instanceof NodeOutStream || x instanceof FileOutStream,
  openRead,
  openWrite,
  stinput:  new NodeInStream(process.stdin, 'stinput'),
  stoutput: new NodeOutStream(process.stdout, 'stoutput'),
  sterror:  new NodeOutStream(process.stderr, 'sterror')
});
