/* global global */
/* eslint no-param-reassign: 0, no-console:0 */
import DeepExtend from 'petu/deepExtend';
import { join } from 'path';
import ObjectId from 'uuid/v1';
import FileServer from './fileserver';

/**
 * @module index
 */

/**
 * An instance of [Error]{@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error}.
 * @typedef {Promise} Promise
 */

/**
 * An instance of [Response]{@link https://nodejs.org/api/http.html#http_class_http_serverresponse}.
 * @typedef {Response} Response
 */

/**
 * An instance of [Request]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage}.
 * @typedef {Request} Request
 */

/**
 * A common gateway to send back the error and logging.
 * @param {Response} res - the response instance.
 * @param {number} st - the status code to send.
 * @param {Error} error - the error found.
 * @private
 */
const sendError = function sendError(res, st, error) {
  res.json(st || (error.errno === -1 ? 404 : 400), { error: error.message });
  console.log(error);
};

/**
 * A common gateway to send back the result data.
 * @param {Response} res - the response instance.
 * @param {number} st=200 - the status code to send.
 * @param {Error} error - the error found.
 * @private
 */
const sendSuccess = function sendSuccess(res, st = 200, data) {
  if (data === undefined) {
    res.status(st);
    res.end();
  } else if (typeof data !== 'object') {
    res.writeHead(st, { 'Content-Type': 'application/json' });
    res.end(String(data));
  } else {
    res.json(st, data);
  }
};

/**
 * A common handler
 * @param {Request} req - the incoming request instance
 * @param {Response} res - the response instance to send
 * @param {string} method - which metho we need to call of file server.
 * @param {string} path - the path to query.
 * @param {object} data - data to save or update.
 * @param {number} st - the status code to send.
 * @param {*} [rdata] - the focefully response to send.
 * @private
 */
const handler = function handler(req, res, method, path, data, st, rdata) {
  const add = [undefined, res, st];
  if (rdata !== undefined) {
    add.push(rdata);
  }
  this.fs[method](path, data)
    .then(sendSuccess.bind(...add))
    .catch(sendError.bind(undefined, res, undefined));
};

/**
 * Handler to list all the files in a directory.
 * @param {Request} req - the incoming request instance
 * @param {Response} res - the response instance to send
 * @function
 */
const list = (req, res) => {
  handler(req, res, 'list', req.params[0]);
};

/**
 * Handler to create a file in a directory.
 * @param {Request} req - the incoming request instance
 * @param {Response} res - the response instance to send
 * @function
 */
const create = (req, res) => {
  const complete = req.headers['x-complete-record'] === '1';
  const fileName = String(req.headers['x-set-id'] || ObjectId());
  const ext = String(req.headers['x-file-extension'] || 'json');
  const pth = `${req.params[0]}/${fileName}.${ext}`;
  const toCreate = req.body || {};
  handler(req, res, 'write', pth, (req.body || {}), 201, complete
      ? Object.assign({ id: fileName }, (req.body || {}))
      : fileName);
};

/**
 * Handler to read a file in a directory.
 * @param {Request} req - the incoming request instance
 * @param {Response} res - the response instance to send
 * @function
 */
const read = (req, res) => {
  handler(req, res, 'read', `${req.params[0]}/${req.params[1]}`);
};

/**
 * Set id to document
 * @param {String} colName - the collection name for the document
 * @param {Object} dt - the incoming request instance
 * @function
 */
const setIdToDocument = function setIdToDocument(found, dt, ind) {
  if (typeof dt.id !== 'string' || !dt.id) {
    dt.id = found[ind].split('/').pop().split('.')[0];
  }
  return dt;
};

/**
 * Handler to search if a file satisfies a filter.
 * @param {Request} req - the incoming request instance
 * @param {Response} res - the response instance to send
 * @function
 */
const search = (req, res) => {
  if (req.params[1] !== 'search.json') {
    sendError(res, 404, { message: 'Invalid path. Search API must end with `search.json`.' });
  } else {
    const ids = req.body.ids;
    if ((Array.isArray(ids))) {
      const ln = ids.length;
      for (let z = 0; z < ln; z += 1) {
        if (typeof ids[z] !== 'string') {
          ids[z] = String(ids[z]);
        }
        if (!ids[z].endsWith('.json')) {
          ids[z] = `${ids[z].split('.')[0]}.json`;
        }
      }
    } else {
      return sendError(res, 400, { message: 'There must be an ids array.' });
    }
    let tot = req.body.ids.length;
    let count = parseInt(req.body.count, 10);
    if (isNaN(count)) count = 20;
    const found = [];
    let tcd;
    let z = 0;
    for (z = 0; z < tot; z += 1) {
      tcd = qk.findAMatch(`${req.params[0]}/${ids[z]}`, req.body.filter);
      if (tcd) {
        found.push(tcd.jsonFilePath);
      }
    }
    const prms = [];
    tot = found.length;
    for (z = 0; count && z < tot; z += 1) {
      prms.push(this.fs.read(found[z]));
      count -= 1;
    }
    Promise.all(prms)
      .then(ars => sendSuccess(res, 200, {
        total: tot,
        output: ars.map(setIdToDocument.bind(this, found)),
      }))
      .catch(sendError.bind(undefined, res, 400));
  }
  return false;
};

/**
 * Handler to update a file in a directory.
 * @param {Request} req - the incoming request instance
 * @param {Response} res - the response instance to send
 * @function
 */
const update = async (req, res) => {
  try {
    const fpath = `${req.params[0]}/${req.params[1]}`;
    const rename = req.headers['x-rename'];
    if (rename) {
      await this.fs.rename(fpath, `${req.params[0]}/${rename}.${req.params[1].split('.').pop()}`);
    } else {
      await this.fs.write(fpath, DeepExtend(await this.fs.read(fpath), req.body));
    }
    sendSuccess(res, undefined, 1);
  } catch (er) {
    sendError(res, undefined, er);
  }
};

/**
 * Handler to replace a file (the complete content) in a directory.
 * @param {Request} req - the incoming request instance
 * @param {Response} res - the response instance to send
 * @function
 */
const replace = async (req, res) => {
  try {
    const fpath = `${req.params[0]}/${req.params[1]}`;
    await this.fs.write(fpath, req.body);
    sendSuccess(res, undefined, 1);
  } catch (er) {
    sendError(res, undefined, er);
  }
};

/**
 * Handler to delete a file in a directory.
 * @param {Request} req - the incoming request instance
 * @param {Response} res - the response instance to send
 * @function
 */
const del = (req, res) => {
  handler(req, res, 'del', `${req.params[0]}/${req.params[1]}`);
};

/**
 * Handler to delete a directory.
 * @param {Request} req - the incoming request instance
 * @param {Response} res - the response instance to send
 * @function
 */
const rmdir = (req, res) => {
  handler(req, res, 'rmdir', req.params[0]);
};

/**
 * Handler to create a directory.
 * @param {Request} req - the incoming request instance
 * @param {Response} res - the response instance to send
 * @function
 */
const mkdir = (req, res) => {
  handler(req, res, 'mkdir', `${req.params[0]}/${req.params[1].slice(0, -4)}`, undefined, 201);
};

/**
 * Handler to list directories.
 * @param {Request} req - the incoming request instance
 * @param {Response} res - the response instance to send
 * @function
 */
const listdir = (req, res) => {
  handler(req, res, 'listdir', `${req.params[0]}/${req.params[1].slice(0, -4)}`);
};

/**
 * Handler to list directories.
 * @param {Request} req - the incoming request instance
 * @param {Response} res - the response instance to send
 * @function
 */
const rmrdir = (req, res) => {
  handler(req, res, 'rmrdir', `${req.params[0]}/${req.params[1].slice(0, -4)}`);
};

/**
 * Creates the instance of json2db
 * @class
 */
class Json2Db {
  /**
   * Create an instance of file server.
   * @param {string} dirpath - the root directory path, that belongs to db
   */
  constructor(dirpath) {
    const directoryPath = (typeof dirpath !== 'string' || !dirpath.length)
      ? join(process.cwd(),'json2db')
      : dirpath;
    this.fs = new FileServer(directoryPath);
  }

  list,

  read,

  create,

  update,

  del,

  mkdir,

  rmdir,

  listdir,

  search,

  replace,

  rmrdir
}

export default Json2Db;
