/**
 * Configuration Metro :
 * - `vrm`, `vrma` et `glb` sont traites comme assets bundle (pas des modules
 *   JS) : requis pour embarquer le preview avatar natif (PLAN.md Phase 4).
 * Metro declare deja `gltf` ; les extensions ci-dessous manquent a la
 * configuration par defaut.
 */
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const MODEL_ASSET_EXTS = ['vrm', 'vrma', 'glb'];
for (const ext of MODEL_ASSET_EXTS) {
  if (!config.resolver.assetExts.includes(ext)) {
    config.resolver.assetExts.push(ext);
  }
}

module.exports = config;
