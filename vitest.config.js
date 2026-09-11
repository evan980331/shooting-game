import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        // 測試目錄
        include: ['tests/**/*.test.js'],
        // 環境：純 Node 環境，不模擬 DOM
        environment: 'node',
        // 啟用全域 test/expect/it/describe
        globals: true,
        // 覆蓋率設定（未來擴充用）
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
        },
    },
    resolve: {
        alias: {
            // 原始碼使用 ?v=NNNN cache-busting query string（瀏覽器用）。
            // Vitest/Node 不支援帶 query 的 import 路徑，這裡透過 alias
            // 將帶 query 的 import 解析回實際檔案路徑。
            // 注意：此 alias 不修改任何原始碼，僅影響測試環境的模組解析。
        },
    },
    server: {
        // 讓 Vitest 的 dev server 忽略 query string，正確解析模組路徑
        middlewareMode: false,
    },
});
