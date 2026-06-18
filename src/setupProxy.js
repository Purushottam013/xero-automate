const { createProxyMiddleware } = require('http-proxy-middleware');
module.exports = function(app) {
  app.use(['/auth', '/xero', '/learn', '/close', '/accounts', '/health'],
    createProxyMiddleware({ target: 'http://localhost:3002', changeOrigin: true })
  );
};
