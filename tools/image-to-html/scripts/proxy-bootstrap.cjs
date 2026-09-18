const { EnvHttpProxyAgent, setGlobalDispatcher } = require('undici');
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}
