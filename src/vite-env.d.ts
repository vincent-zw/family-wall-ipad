/// <reference types="vite/client" />

// 构建时间戳，由 vite.config.ts 的 inject-build-timestamp 插件注入
declare const __APP_BUILD_TS__: number;

interface ImportMetaEnv {
  readonly VITE_CLOUDBASE_ENV_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
