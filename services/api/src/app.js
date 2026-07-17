const express = require('express');
const cors = require('cors');
const healthRoute = require('./routes/health');
const meRoute = require('./routes/me');
const groupsRoutes = require('./modules/groups/groups.routes');
const membershipsRoutes = require('./modules/membership/memberships.routes');
const cyclesRoutes = require('./modules/cycles/cycles.routes');
const contributionsRoutes = require('./modules/contributions/contributions.routes');
const lendingRoutes = require('./modules/lending/lending.routes');
const identityRoutes = require('./modules/identity/identity.routes');
const notificationsRoutes = require('./modules/notifications/notifications.routes');
const expensesRoutes = require('./modules/expenses/expenses.routes');
const distributionsRoutes = require('./modules/distribution/distributions.routes');
const monitoringRoutes = require('./modules/monitoring/monitoring.routes');
const reportsRoutes = require('./modules/reporting/reporting.routes');
const ledgerRoutes = require('./modules/ledger/ledger.routes');
const chatRoutes = require('./modules/chat/chat.routes');
const adminSecurityRoutes = require('./modules/adminSecurity/adminSecurity.routes');
const recoveryRoutes = require('./modules/adminSecurity/recovery.routes');
const errorHandler = require('./middleware/errorHandler');
const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.send('KapitPondo API is running'));
app.use('/health', healthRoute);
app.use('/me', meRoute);
app.use('/api', contributionsRoutes);
app.use('/api', groupsRoutes);
app.use('/api', cyclesRoutes);
app.use('/api', lendingRoutes);
app.use('/api', expensesRoutes);
app.use('/api', membershipsRoutes);
app.use('/api', identityRoutes);
app.use('/api', notificationsRoutes);
app.use('/api', distributionsRoutes);
app.use('/api', monitoringRoutes);
app.use('/api', reportsRoutes);
app.use('/api', ledgerRoutes);
app.use('/api', chatRoutes);
app.use('/api', adminSecurityRoutes);
app.use('/api', recoveryRoutes);

// Error handler stays last.
app.use(errorHandler);

module.exports = app;