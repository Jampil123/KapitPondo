// The whole `routes/admin/*` tree and `middleware/requireSysAdmin.js` import
// `{ supabaseAdmin }` from here, but this module never existed — every file
// under routes/admin/ has been unimportable (and the whole tree unmountable
// in app.js) since it was written. `config/supabase.js` already IS the
// service-role client every other module in this app uses directly; this
// just re-exports it under the name admin code expects, instead of building
// a second client.
const supabaseAdmin = require('../config/supabase');

module.exports = { supabaseAdmin };
