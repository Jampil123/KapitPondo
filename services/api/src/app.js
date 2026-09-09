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
const penaltiesRoutes = require('./modules/penalties/penalties.routes');
const chatRoutes = require('./modules/chat/chat.routes');
const announcementsRoutes = require('./modules/announcements/announcements.routes');
const directMessagesRoutes = require('./modules/directMessages/directMessages.routes');
const paymentsRoutes = require('./modules/payments/payments.routes'); // PayMongo checkout + webhook — see payments.routes.js
const aiRoutes = require('./modules/ai/ai.routes'); // Gemini: proof-photo field extraction + support chatbot
const ocrRoutes = require('./modules/ocr/ocr.routes'); // Google Cloud Vision: plain OCR text extraction
const adminSecurityRoutes = require('./modules/adminSecurity/adminSecurity.routes');
const recoveryRoutes = require('./modules/adminSecurity/recovery.routes');
const auditLogRoutes = require('./modules/auditlog/auditlog.routes');
const errorHandler = require('./middleware/errorHandler');
const app = express();

app.use(cors());
// `verify` stashes the exact request bytes on req.rawBody — payments.routes.js's
// PayMongo webhook needs those (not the re-serialized JSON object) to check
// the Paymongo-Signature HMAC. Harmless for every other route, which never
// reads req.rawBody.
// `limit` raised from Express's 100kb default — ai.routes.js's proof-photo
// endpoint takes a base64-encoded image inline in the JSON body.
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => { req.rawBody = buf; },
}));

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
app.use('/api', penaltiesRoutes);
app.use('/api', chatRoutes);
app.use('/api', announcementsRoutes);
app.use('/api', directMessagesRoutes);
app.use('/api', paymentsRoutes);
app.use('/api', aiRoutes);
app.use('/api', ocrRoutes);
app.use('/api', adminSecurityRoutes);
app.use('/api', recoveryRoutes);
app.use('/api', auditLogRoutes);

// Error handler stays last.
app.use(errorHandler);

module.exports = app;