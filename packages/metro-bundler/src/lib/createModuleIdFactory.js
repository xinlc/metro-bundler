/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 */

'use strict';

const crypto = require('crypto');

function createModuleIdFactory(): ({path: string}) => number {
  const fileToIdMap = new Map();
  let nextId = 0;
  const usedIds = {};
  return ({path: modulePath}) => {
    if (!fileToIdMap.has(modulePath)) {
      // fileToIdMap.set(modulePath, nextId);
      fileToIdMap.set(modulePath, getModuleHashedPathId(modulePath, usedIds));
      nextId += 1;
    }
    return fileToIdMap.get(modulePath);
  };
}

function getModuleHashedPathId(path, usedIds){
  var len = 4;
  var hash = crypto.createHash("md5");
  hash.update(path);
  var id = hash.digest("hex");
  while(usedIds[id.substr(0, len)]){
    len++;
  }
  id = id.substr(0, len);
  usedIds[id] = path;
  return id;
}

module.exports = createModuleIdFactory;
