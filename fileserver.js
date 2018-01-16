import { readdir, rename, mkdir, stat, rmdir, readFile, writeFileSync, unlink } from 'fs';
import { join, dirname } from 'path';
import EventEmitter from 'events';
import { promisify } from 'util.promisify';

/**
 * An instance of [Promise]{@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise}.
 * @typedef {Promise} Promise
 */

/**
 * Promisified fs.mkdir.
 * @return {Promise} promise - return a promise
 */
const pmMkdir = promisify(mkdir);

/**
 * Promisified fs.stat.
 * @return {Promise} promise - return a promise
 */
const pmStat = promisify(stat);

/**
 * Promisified fs.rename.
 * @return {Promise} promise - return a promise
 */
const pmRename = promisify(rename);

/**
 * Promisified fs.rmdir.
 * @return {Promise} promise - return a promise
 */
const pmRmdir = promisify(rmdir);

/**
 * Promisified fs.readdir
 * @return {Promise} promise - return a promise
 */
const pmReaddir = promisify(readdir);

/**
 * Promisified fs.readFile
 * @return {Promise} promise - return a promise
 */
const pmReadFile = promisify(readFile);

/**
 * Promisified fs.unlink
 * @return {Promise} promise - return a promise
 */
const pmUnlink = promisify(unlink);

/**
 * @module fs
 */

/**
 * Creates a file server to list, read, create, update or delete file.
 * @class
 */
class FileServer extends EventEmitter {
  /**
   * Create an instance of file server.
   * @param {string} dirpath - the root directory path, that belongs to db
   */
  constructor(dirpath) {
    super();
    if (typeof dirpath !== 'string' || !dirpath.length) {
      throw new Error('The `dirpath` parameter is missing.');
    }
    this.dirpath = dirpath;
  }

  /**
   * list all the files in a directory.
   * @param {string} dpath - the directory path, that should be read
   * @return {Promise} promise - return a promise
   */
  async list(dpath) {
    return (await pmReaddir(join(this.dirpath, dpath)))
      .filter(a => !a.startsWith('.') && (a.endsWith('.json') || a.endsWith('.js')));
  }

  /**
   * list all the directories in a directory.
   * @param {string} dpath - the directory path, that should be read
   * @return {Promise} promise - return a promise
   */
  async listdir(dpath) {
    return (await pmReaddir(join(this.dirpath, dpath))).filter(a => a.indexOf('.') === -1);
  }

  /**
   * read a file in a directory.
   * @param {string} fpath - the file path, that should be read
   * @return {Promise} promise - return a promise
   */
  async read(fpath) {
    let filejson = String(await pmReadFile(join(this.dirpath, fpath)));
    try {
      filejson = JSON.parse(filejson);
    } catch (er) {
      // not a json
    }
    this.emit('read', fpath, filejson);
    return filejson;
  }

  /**
   * create or update a file in a directory.
   * @param {string} fpath - the file path, that should be created/updated
   * @param {object} data - the file content in json format
   * @return {Promise} promise - return a promise
   */
  write(fpath, data) {
    this.emit('write', fpath, data);
    return new Promise((res, rej) => {
      try {
        const written = writeFileSync(join(this.dirpath, fpath),
          fpath.endsWith('.json') ? JSON.stringify(data, undefined, 2) : data);
        res(written);
      } catch (er) {
        rej(er);
      }
    });
  }

  /**
   * create if a file does not exists at a path
   * @param {string} fpath - the file path, that should be created/updated
   * @param {object} data={} - the file content in json format
   * @return {Promise} promise - return a promise
   */
  async writep(fpath, data = {}) {
    await this.mkdirp(dirname(fpath));
    let st;
    try {
      st = await this.stat(fpath);
    } catch (er) {
      switch (er.code) {
        case 'ENOENT':
          try {
            return this.write(fpath, data);
          } catch (ert) {
            return ert;
          }
        default:
          return er;
      }
    }
    if (st.isFile()) {
      return 1;
    }
    return this.write(fpath, data);
  }

  /**
   * rename a file in a directory.
   * @param {string} fpath - the file path, that should be rename
   * @param {string} fpath - the new file path
   * @return {Promise} promise - return a promise
   */
  rename(fpath, newpath) {
    return pmRename(join(this.dirpath, fpath), join(this.dirpath, newpath));
  }

  /**
   * delete a file in a directory.
   * @param {string} fpath - the file path, that should be deleted
   * @return {Promise} promise - return a promise
   */
  del(fpath) {
    this.emit('delete', fpath);
    return pmUnlink(join(this.dirpath, fpath));
  }

  /**
   * stat a path
   * @param {string} fdpath - the file or directory path, that should be stated
   * @return {Promise} promise - return a promise
   */
  stat(fdpath) {
    return pmStat(join(this.dirpath, fdpath));
  }

  /**
   * create a dir.
   * @param {string} dpath - the directory path, that should be created
   * @return {Promise} promise - return a promise
   */
  mkdir(dpath) {
    return pmMkdir(join(this.dirpath, dpath));
  }

  /**
   * remove a directory recursively
   * @param {string} dpath - the directory path, that should be deleted
   * @return {Promise} promise - return a promise
   */
  async rmrdir(dpath) {
    const stats = await this.stat(dpath);
    if(stats.isFile()){
      return this.del(dpath);
    } else if(stats.isDirectory()){
      await Promise.all((await pmReaddir(join(this.dirpath, dpath)))
        .map(dpth => this.rmrdir(join(dpath, dpth))));
      return this.rmdir(dpath);
    } else {
      return 1;
    }
  }

  /**
   * create a dir upto the path to create directories.
   * @param {string} dpath - the directory path, that should be created
   * @return {Promise} promise - return a promise
   */
  async mkdirp(dpath) {
    try {
      await this.mkdir(dpath);
      return 1;
    } catch (er) {
      switch (er.code) {
        case 'ENOENT':
          try {
            await this.mkdirp(dirname(dpath));
            return this.mkdirp(dpath);
          } catch (ert) {
            return ert;
          }
        default:
          try {
            const stt = await this.stat(dpath);
            return stt.isDirectory() ? 1 : er;
          } catch (er2) {
            return er2;
          }
      }
    }
  }

  /**
   * delete a dir.
   * @param {string} dpath - the directory path, that should be deleted
   * @return {Promise} promise - return a promise
   */
  rmdir(dpath) {
    return pmRmdir(join(this.dirpath, dpath));
  }
}

export default FileServer;
