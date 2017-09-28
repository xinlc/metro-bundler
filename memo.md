快速记录bundle化修改过程
=========

# 修改设涉及的部分
- git clone yanqiw/metro-bundler
- 在 metro-bundler/packages/metro-bundler/ 中运行 npm link, 链接npm global到本地项目
- 在 metro-bundler  运行 npm run build
- 在实际项目中使用 npm link metro-bundler， 链接项目中的metro-bundler到本地npm仓库
- 项目中`react-native/local-cli`下所有指向`metro-bundler/src`都修改为`metro-bundler/build`