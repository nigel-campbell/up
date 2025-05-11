const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: './ui/ts/index.tsx',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'ui/static'),
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react', '@babel/preset-typescript']
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx']
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './ui/index.html',
      inject: false // Don't inject scripts since we're using the existing HTML
    })
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, 'ui/static'),
    },
    compress: true,
    port: 8080,
    hot: true,
    proxy: {
      '/status': 'http://localhost:8080',
      '/summary': 'http://localhost:8080',
      '/size': 'http://localhost:8080',
      '/uptime': 'http://localhost:8080',
      '/speedtest': 'http://localhost:8080'
    }
  }
}; 