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
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-pdf": ["jspdf", "html2canvas"],
          "vendor-xlsx": ["xlsx"]
        }
      }
    },
    chunkSizeWarningLimit: 600
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9wcm9qZWN0XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9wcm9qZWN0L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3Byb2plY3Qvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgbGVnYWN5IGZyb20gJ0B2aXRlanMvcGx1Z2luLWxlZ2FjeSc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIGxlZ2FjeSh7XG4gICAgICB0YXJnZXRzOiBbJ3NhZmFyaSA+PSAxMycsICdjaHJvbWUgPj0gNjQnLCAnZmlyZWZveCA+PSA2NycsICdlZGdlID49IDc5JywgJ2lvcyA+PSAxMyddLFxuICAgICAgbW9kZXJuUG9seWZpbGxzOiBbJ2VzLnByb21pc2UuYWxsLXNldHRsZWQnLCAnZXMuZ2xvYmFsLXRoaXMnLCAnZXMub2JqZWN0LmZyb20tZW50cmllcyddLFxuICAgICAgcmVuZGVyTGVnYWN5Q2h1bmtzOiB0cnVlLFxuICAgIH0pLFxuICBdLFxuICBvcHRpbWl6ZURlcHM6IHtcbiAgICBleGNsdWRlOiBbJ2x1Y2lkZS1yZWFjdCddLFxuICB9LFxuICBwdWJsaWNEaXI6ICdwdWJsaWMtY2xlYW4nLFxuICBidWlsZDoge1xuICAgIHRhcmdldDogWydlczIwMjAnLCAnc2FmYXJpMTMnLCAnY2hyb21lNjQnLCAnZmlyZWZveDY3J10sXG4gICAgc291cmNlbWFwOiBmYWxzZSxcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBvdXRwdXQ6IHtcbiAgICAgICAgbWFudWFsQ2h1bmtzOiB7XG4gICAgICAgICAgJ3ZlbmRvci1yZWFjdCc6IFsncmVhY3QnLCAncmVhY3QtZG9tJ10sXG4gICAgICAgICAgJ3ZlbmRvci1zdXBhYmFzZSc6IFsnQHN1cGFiYXNlL3N1cGFiYXNlLWpzJ10sXG4gICAgICAgICAgJ3ZlbmRvci1wZGYnOiBbJ2pzcGRmJywgJ2h0bWwyY2FudmFzJ10sXG4gICAgICAgICAgJ3ZlbmRvci14bHN4JzogWyd4bHN4J10sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAgY2h1bmtTaXplV2FybmluZ0xpbWl0OiA2MDAsXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBeU4sU0FBUyxvQkFBb0I7QUFDdFAsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sWUFBWTtBQUVuQixJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTO0FBQUEsSUFDUCxNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsTUFDTCxTQUFTLENBQUMsZ0JBQWdCLGdCQUFnQixpQkFBaUIsY0FBYyxXQUFXO0FBQUEsTUFDcEYsaUJBQWlCLENBQUMsMEJBQTBCLGtCQUFrQix3QkFBd0I7QUFBQSxNQUN0RixvQkFBb0I7QUFBQSxJQUN0QixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0EsY0FBYztBQUFBLElBQ1osU0FBUyxDQUFDLGNBQWM7QUFBQSxFQUMxQjtBQUFBLEVBQ0EsV0FBVztBQUFBLEVBQ1gsT0FBTztBQUFBLElBQ0wsUUFBUSxDQUFDLFVBQVUsWUFBWSxZQUFZLFdBQVc7QUFBQSxJQUN0RCxXQUFXO0FBQUEsSUFDWCxlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUEsUUFDTixjQUFjO0FBQUEsVUFDWixnQkFBZ0IsQ0FBQyxTQUFTLFdBQVc7QUFBQSxVQUNyQyxtQkFBbUIsQ0FBQyx1QkFBdUI7QUFBQSxVQUMzQyxjQUFjLENBQUMsU0FBUyxhQUFhO0FBQUEsVUFDckMsZUFBZSxDQUFDLE1BQU07QUFBQSxRQUN4QjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsSUFDQSx1QkFBdUI7QUFBQSxFQUN6QjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
