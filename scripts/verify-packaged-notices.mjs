import { afterPack } from './package-notices.mjs';

// Separate exported hook keeps electron-builder's hook loading unambiguous.
export default afterPack;
