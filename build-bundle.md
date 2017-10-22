快速记录bundle化修改过程
=========

# 项目配置修改
- git clone yanqiw/metro-bundler
- 在 metro-bundler/packages/metro-bundler/ 中运行 npm link, 链接npm global到本地项目
- 在 metro-bundler  运行 npm run build
- 在实际项目中使用 npm link metro-bundler， 链接项目中的metro-bundler到本地npm仓库

# 对react native的破坏性修改
- 如果`react-native`文件夹中有`node_modules`文件夹， 删除其中的`metro-bundler`文件夹
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

- 注释掉`react-native/ios/scripts/react-native-xcode.sh` 最后部分打包bundle代码
```shell
# $NODE_BINARY $CLI_PATH bundle \
#   --entry-file "$ENTRY_FILE" \
#   --platform ios 
#   --dev $DEV \
#   --reset-cache \
#   --bundle-output "$BUNDLE_FILE" \
#   --assets-dest "$DEST"

# if [[ $DEV != true && ! -f "$BUNDLE_FILE" ]]; then
#   echo "error: File $BUNDLE_FILE does not exist. This must be a bug with" >&2
#   echo "React Native, please report it here: https://github.com/facebook/react-native/issues"
#   exit 2
# fi
```


# 使用方式
## 在项目中引用 bundle
引用bundle时需要创建一个容器component, 和调用如下加载代码。在项目中真正使用容器来加载模块
### requirebundle
从本地加载代码脚本， 兼容本地加载，和打包成一个bundle两种方式
```javascript
/*
* require the bundle js from local storage on demoned
* @flow
*/

import RNFS from 'react-native-fs';
import React from 'react';

// workaround for require must have a single string literal argument error
const _require = (moduleId) => {
  const _require = require;
  // require module
  const _module = _require(moduleId);
  return _module;
};

const requireBundle = async function (moduleName: string, props: any, fromDisk:boolean): any {
  // TODO: find module ID from the mapping

  const _moduleId = moduleName;

  const _global = (typeof global !== 'undefined') ? global : (typeof self != 'undefined') ? self : this; // eslint-disable-line
  if (_moduleId in _global.modules) {
    // prevent repeated calls to `global.nativeRequire` to overwrite modules
    // that are already loaded
    const _module = _require(_moduleId); // require the module at runtime, but not the init
    // $FlowFixMe: bablehelpres is defined in react natvie bundle
    _module = babelHelpers.interopRequireDefault(_module); // eslint-disable-line
    return React.createElement(_module.default, props);
  }
  // try to find the module from local
  if (fromDisk) {
    try {
      let _module;

      _module = await readFile(_moduleId);

      // wrap module with react
      // $FlowFixMe: bablehelpres is defined in react natvie bundle
      _module = babelHelpers.interopRequireDefault(_module); // esline-disable-line
      return React.createElement(_module.default, props);
    } catch (error) {
      return error;
    }
  } else {
    try {
      let _module = _require(_moduleId);
      _module = babelHelpers.interopRequireDefault(_module); // esline-disable-line
      return React.createElement(_module.default, props);
    } catch (e) {
      return null;
    }
  }
};

function readFile(moduleId) {
  return new Promise((resolve, reject) => {
    console.info('read file', moduleId);
    RNFS.readFile(`${RNFS.MainBundlePath}/js-modules/${moduleId}.js`)
            .then((contents) => {
              // console.info(contents);
              eval(contents);  // eslint-disable-line
              const _module = _require(moduleId); // require the module at runtime, but not the init
              console.info('down _require', _module.toString());
              resolve(_module);
            }).catch((e) => {
              reject(e);
            });
  });
}

export default requireBundle;

```
### 容器例子
简单的bundle容器例子, 在项目其他地方可以像正常rn component使用
```javascript

import React from 'react';
import { 
  View,
  Text,
 } from 'react-native';
// bundle helper
import requireBundle from '../Lib/requireBundle';
import BundleApp from '../BundleWorkerApp';

const BUNDLE_HASH_ID = 'b323'; // bundle hash ID
const LOAD_FROM_DISK = true; //load bundle from disk


// bundle container
class BundleContainer extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      HourlyWorkerApp: null
    };
  }
  componentDidMount() {
    requireBundle(BUNDLE_HASH_ID, this.props, LOAD_FROM_DISK).then((res) => {
      console.info(`${BUNDLE_HASH_ID} module`, res.toString());
      if (res) {
        this.setState({
          BundleApp: res
        }, () => {
          console.info(`${BUNDLE_HASH_ID} set to state`, this.state.BundleApp);
        });
      }
    });
  }
  render() {
    if (this.state.BundleApp) {
      return (
          this.state.BundleApp
      );
    }
    return (
      <View>
        <Text>Loading</Text>
      </View>
    );
  }
}

export default BundleContainer;
```

# 打包方式
## 打包配置
在项目根目录创建`metrobundler.json`. 模版如下:
```json
{
    "bundleFolders":[
        "App/BundleApp" // the path to bundle src code folder
    ]
}        
```

## 打来代码中控制是否从本地加载bundle的设置
例如在上面`容器例子`中的变量`LOAD_FROM_DISK`
```javascript

const LOAD_FROM_DISK = true; //load bundle from disk
```

## ios
### 代码修改
在`AppDelegate.m`中找到
```c
jsCodeLocation = [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
```
修改为
```c
jsCodeLocation = [[NSBundle mainBundle] URLForResource:@"common" withExtension:@"js" subdirectory:@"js-modules"];
```

### 打包脚本
使用如下脚本打包bundle， 打包项目。 打包后的bundle会输出到ios目录下
```shell
#!/bin/bash
DIST_IOS="ios"
BUNDLE_CONFIG="metrobundler.json"
DEV='ture'

# bundle ios 
react-native unbundle --entry-file index.ios.js --platform ios --dev $DEV --reset-cache --bundle-config "$BUNDLE_CONFIG" --bundle-output "$DIST_IOS/main.jsbundle" --assets-dest "$DIST_IOS/js-modules"
```

输出后， 在xcode中添加`js-modules`, `js-modules/assets`两个文件夹。 需要拖拽文件到xcode的项目名文件夹下，选在`create folder referance`（这个一定要选中，不然在项目中无法加载）.  
__注__：这步只需要做一次，两个文件添加到xcode项目中后,如没有新的文件生成，每次打包，不需要再次添加


打包后，记录好bundle的hashID，即bundle文件名。 打开`common.js`文件，找到bundle容器的代码，删掉对bundle的引用部分

例如：
bundle hash ID是b323. 我们在`common.js`中搜索`b323`, 找到如下两行代码， 删除即可
```javascript
var _BundleApp = require('b323'); //"b323" = ../BundleApp
var _BundleApp2 = babelHelpers.interopRequireDefault(_BundleApp)
```

## android
TBD

# 调试
## ios
- 开发时使用一个 bundle的模式开发， 关闭从本地加载。 
- 开发稳定后， 使用`打包方式`中的方法打包bundle， 并开启`AppDelegate.m`中本地加载代码。
- 重新在xcode中build app， 查看效果

# 发布
- 测试稳定后， 使用`打包方式`中的方法打包bundle，注意设置 `DEV=false`， 并开启`AppDelegate.m`中本地加载代码。
- 使用xcode archive项目

# 热更新
TBD
