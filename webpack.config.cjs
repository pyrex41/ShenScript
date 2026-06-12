const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = env => ({
  mode: env.mode,
  entry: env.mode === 'development' ? './index.development.js' : './index.js',
  optimization: {
    minimize: !!env.min,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          keep_classnames: true,
          keep_fnames: true
        }
      })
    ]
  },
  output: {
    path: path.resolve(__dirname, 'dist/'),
    filename: `shen-script${env.mode === 'development' ? '.dev' : env.min ? '.min' : ''}.js`
  },
  ignoreWarnings: [
    w => w.message.includes('the request of a dependency is an expression')
      || w.message.includes('exceed')
  ]
});
