// vite.config.ts
import { defineConfig } from "file:///home/project/node_modules/vite/dist/node/index.js";
import react from "file:///home/project/node_modules/@vitejs/plugin-react/dist/index.js";
import legacy from "file:///home/project/node_modules/@vitejs/plugin-legacy/dist/index.mjs";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ["safari >= 13", "chrome >= 64", "firefox >= 67", "edge >= 79", "ios >= 13"],
      modernPolyfills: ["es.promise.all-settled", "es.global-this", "es.object.from-entries"],
      renderLegacyChunks: true
    })
  ],
  optimizeDeps: {
    exclude: ["lucide-react"]
  },
  publicDir: "public-clean",
  build: {
    target: ["es2020", "safari13", "chrome64", "firefox67"],
    sourcemap: false
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9wcm9qZWN0XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9wcm9qZWN0L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3Byb2plY3Qvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgbGVnYWN5IGZyb20gJ0B2aXRlanMvcGx1Z2luLWxlZ2FjeSc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIGxlZ2FjeSh7XG4gICAgICB0YXJnZXRzOiBbJ3NhZmFyaSA+PSAxMycsICdjaHJvbWUgPj0gNjQnLCAnZmlyZWZveCA+PSA2NycsICdlZGdlID49IDc5JywgJ2lvcyA+PSAxMyddLFxuICAgICAgbW9kZXJuUG9seWZpbGxzOiBbJ2VzLnByb21pc2UuYWxsLXNldHRsZWQnLCAnZXMuZ2xvYmFsLXRoaXMnLCAnZXMub2JqZWN0LmZyb20tZW50cmllcyddLFxuICAgICAgcmVuZGVyTGVnYWN5Q2h1bmtzOiB0cnVlLFxuICAgIH0pLFxuICBdLFxuICBvcHRpbWl6ZURlcHM6IHtcbiAgICBleGNsdWRlOiBbJ2x1Y2lkZS1yZWFjdCddLFxuICB9LFxuICBwdWJsaWNEaXI6ICdwdWJsaWMtY2xlYW4nLFxuICBidWlsZDoge1xuICAgIHRhcmdldDogWydlczIwMjAnLCAnc2FmYXJpMTMnLCAnY2hyb21lNjQnLCAnZmlyZWZveDY3J10sXG4gICAgc291cmNlbWFwOiBmYWxzZSxcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUF5TixTQUFTLG9CQUFvQjtBQUN0UCxPQUFPLFdBQVc7QUFDbEIsT0FBTyxZQUFZO0FBRW5CLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxNQUNMLFNBQVMsQ0FBQyxnQkFBZ0IsZ0JBQWdCLGlCQUFpQixjQUFjLFdBQVc7QUFBQSxNQUNwRixpQkFBaUIsQ0FBQywwQkFBMEIsa0JBQWtCLHdCQUF3QjtBQUFBLE1BQ3RGLG9CQUFvQjtBQUFBLElBQ3RCLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQSxjQUFjO0FBQUEsSUFDWixTQUFTLENBQUMsY0FBYztBQUFBLEVBQzFCO0FBQUEsRUFDQSxXQUFXO0FBQUEsRUFDWCxPQUFPO0FBQUEsSUFDTCxRQUFRLENBQUMsVUFBVSxZQUFZLFlBQVksV0FBVztBQUFBLElBQ3RELFdBQVc7QUFBQSxFQUNiO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
