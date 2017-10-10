快速记录bundle化修改过程
=========

# 修改设涉及的部分
- git clone yanqiw/metro-bundler
- 在 metro-bundler/packages/metro-bundler/ 中运行 npm link, 链接npm global到本地项目
- 在 metro-bundler  运行 npm run build
- 在实际项目中使用 npm link metro-bundler， 链接项目中的metro-bundler到本地npm仓库
- 项目中`react-native/local-cli`下所有指向`metro-bundler/src`都修改为`metro-bundler/build`
- 修改项目中`react-native/local-cli/bundle/unbundle`如下

```javascript
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */
'use strict';

const bundleWithOutput = require('./bundle').withOutput;
const bundleCommandLineArgs = require('./bundleCommandLineArgs');
const outputUnbundle = require('metro-bundler/build/shared/output/unbundle');
const debug = require('debug')('react-native.local-cli.bundle.unbundle');
/**
 * Builds the bundle starting to look for dependencies at the given entry path.
 */
function unbundle(argv, config, args, packagerInstance) {
  debug(args);
  return bundleWithOutput(argv, config, args, outputUnbundle, packagerInstance);
}

module.exports = {
  name: 'unbundle',
  description: 'builds javascript as "unbundle" for offline use',
  func: unbundle,
  options: bundleCommandLineArgs.concat({
    command: '--indexed-unbundle',
    description: 'Force indexed unbundle file format, even when building for android',
    default: false,
  },{
    command: '--bundle-config <path>',
    description: 'mutiple bundle config file, to split bundle by folder',
  }
),
};

```