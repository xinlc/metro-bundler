/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 */
'use strict';

const MAGIC_UNBUNDLE_NUMBER = require('./magic-number');

const buildSourceMapWithMetaData = require('./build-unbundle-sourcemap-with-metadata');
const mkdirp = require('mkdirp');
const path = require('path');
const relativizeSourceMap = require('../../../lib/relativizeSourceMap');
const writeFile = require('../writeFile');
const writeSourceMap = require('./write-sourcemap');

const {joinModules} = require('./util');
const fs = require('fs');
const debug = require('debug')('metro-bundle.shared.bundle.as-assets');

import type Bundle from '../../../Bundler/Bundle';
import type {OutputOptions} from '../../types.flow';

// must not start with a dot, as that won't go into the apk
const MAGIC_UNBUNDLE_FILENAME = 'UNBUNDLE';
const MODULES_DIR = 'js-modules';
const COMMON_PACKAGE ='common';

/**
 * Saves all JS modules of an app as single files
 * The startup code (prelude, polyfills etc.) are written to the file
 * designated by the `bundleOuput` option.
 * All other modules go into a 'js-modules' folder that in the same parent
 * directory as the startup file.
 */
function saveAsAssets(
  bundle: Bundle,
  options: OutputOptions,
  log: (...args: Array<string>) => void,
): Promise<mixed> {
  const {
    bundleOutput,
    bundleEncoding: encoding,
    sourcemapOutput,
    sourcemapSourcesRoot,
    bundleConfig,
  } = options;

  let _bundleConfig;
  let _bundleWriteFileStream = {};
  let writeUnbundle;

  log('start');
  const {startupModules, lazyModules} = bundle.getUnbundle();
  log('finish');
  const startupCode = joinModules(startupModules);

  log('Writing bundle output to:', bundleOutput);

  // if the bundle config is set, read the config file
 if(bundleConfig){
  let config = fs.readFileSync(bundleConfig, 'utf8');
  _bundleConfig = JSON.parse(config);
 } 

  const modulesDir = path.join(path.dirname(bundleOutput), MODULES_DIR);

  if(bundleConfig){
    writeUnbundle = createDir(modulesDir).then(
      () => Promise.all([
        writeBundles(lazyModules, modulesDir, encoding, _bundleConfig, _bundleWriteFileStream, startupModules),
        // writeFile(bundleOutput, startupCode, encoding),
        writeMagicFlagFile(modulesDir),
      ])
    )
    writeUnbundle.then(() => {
      log('Done writing mutple bundles output')
    });
  }else{
    writeUnbundle =
    createDir(modulesDir).then( // create the modules directory first
      () => Promise.all([
        writeModules(lazyModules, modulesDir, encoding),
        writeFile(bundleOutput, startupCode, encoding),
        writeMagicFlagFile(modulesDir),
      ])
    );
  writeUnbundle.then(() => log('Done writing unbundle output'));
  }

  const sourceMap =
    relativizeSourceMap(
      buildSourceMapWithMetaData({
        fixWrapperOffset: true,
        lazyModules: lazyModules.concat(),
        moduleGroups: null,
        startupModules: startupModules.concat(),
      }),
      sourcemapSourcesRoot
    );


  return Promise.all([
    writeUnbundle,
    sourcemapOutput && writeSourceMap(sourcemapOutput, JSON.stringify(sourceMap), log),
  ]);
}

function createDir(dirName) {
  return new Promise((resolve, reject) =>
    mkdirp(dirName, error => error ? reject(error) : resolve()));
}

function writeModuleFile(module, modulesDir, encoding) {
  const {code, id}= module;
  return writeFile(path.join(modulesDir, id + '.js'), code, encoding);
}


function writeModules(modules, modulesDir, encoding) {
  const writeFiles =
    modules.map(module => writeModuleFile(module, modulesDir, encoding));
  return Promise.all(writeFiles);
}

function writeBundleFile(module, modulesDir, encoding, modules, bundleConfig: {bundleFolders:[string]}, bundleWriteFileStream) {
  const {code, id, name} = module;
  let isBundle = false;
  let fileName = id;
  const {bundleFolders} = bundleConfig;
  
  // adjest the module belong to bundle
  if(bundleFolders && bundleFolders.find){
    let bundleName = bundleFolders.find((path) => name.indexOf(path) > -1);
    if(bundleName){
      let bundleIndex = modules.find((module)=>module.name.indexOf(`${bundleName}/index.js`)>-1);
      if(bundleIndex){
        fileName = bundleIndex.id
      }
      isBundle = true
    }
  }

  // write to stream
  let createdStream;
  if(isBundle){
    if(!bundleWriteFileStream[fileName]){
      debug(`create ${fileName} file stream`);
      bundleWriteFileStream[fileName] = new Buffer(code);
    }else{
      debug(`write bundle ${name} to ${fileName} file stream`);
      bundleWriteFileStream[fileName] = Buffer.concat([ bundleWriteFileStream[fileName], new Buffer(code)]);
    }
  }else {
    debug(`write bundle ${name} to ${COMMON_PACKAGE} file stream`);
    if(!bundleWriteFileStream[COMMON_PACKAGE]){
      // debug(`create ${COMMON_PACKAGE} file stream`);
      // bundleWriteFileStream[COMMON_PACKAGE] = new Buffer(startupCode);
      // bundleWriteFileStream[COMMON_PACKAGE] = Buffer.concat([new Buffer(code), bundleWriteFileStream[COMMON_PACKAGE]]);
    }else{
      bundleWriteFileStream[COMMON_PACKAGE] = Buffer.concat([ bundleWriteFileStream[COMMON_PACKAGE], new Buffer(code)]);
    }
  }
}

function writeBundles(modules, modulesDir, encoding, bundleConfig, bundleWriteFileStream, startupModules:any) {
  const writeFiles = [];
    if(!bundleWriteFileStream[COMMON_PACKAGE]){
      debug(`create ${COMMON_PACKAGE} file stream`);
      // write react native js core code
      let RNCoreCode = joinModules(startupModules.slice(0, startupModules.length-2));
      bundleWriteFileStream[COMMON_PACKAGE] = new Buffer(RNCoreCode);
    }
  modules.map(module => writeBundleFile(module, modulesDir, encoding, modules, bundleConfig, bundleWriteFileStream));
  
  //write start up code
  let startupCode = joinModules(startupModules.slice(startupModules.length-2, startupModules.length));
  bundleWriteFileStream[COMMON_PACKAGE] = Buffer.concat([ bundleWriteFileStream[COMMON_PACKAGE], new Buffer(startupCode)]);

  for(let key in bundleWriteFileStream){
    debug(`close ${key} stream`);
    writeFiles.push(writeFile(path.join(modulesDir, key + '.js'), bundleWriteFileStream[key], 'utf8'))
  }
  return Promise.all(writeFiles);
}

function writeMagicFlagFile(outputDir) {
  /* global Buffer: true */
  const buffer = new Buffer(4);
  buffer.writeUInt32LE(MAGIC_UNBUNDLE_NUMBER, 0);
  return writeFile(path.join(outputDir, MAGIC_UNBUNDLE_FILENAME), buffer);
}

module.exports = saveAsAssets;
