// Metro в pnpm-монорепо: следим за корнем репозитория и ищем модули
// как в apps/mobile/node_modules, так и в корневом node_modules.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// pnpm раскладывает пакеты через symlink-и — Metro должен идти по ним.
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
