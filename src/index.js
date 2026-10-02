'use strict';
// Offline aggregate. For WeChat gameplay import runtime.js only, not this file.
module.exports={...require('./schema'),...require('./content-hash'),...require('./release'),...require('./layout'),...require('./random'),...require('./replay'),
  ...require('./runtime'),...require('./generator'),...require('./solver'),
  ...require('./policies'),...require('./analysis')};
