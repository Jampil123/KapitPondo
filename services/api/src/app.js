const express = require('express');
const cors = require('cors');
const healthRoute = require('./routes/health');
const meRoute = require('./routes/me');
const adminRouter = require('./routes/admin');
const groupsRoutes = require('./modules/groups/groups.routes');
const membershipsRoutes = require('./modules/membership/memberships.routes');
const cyclesRoutes = require('./modules/cycles/cycles.routes');
const contributionsRoutes = require('./modules/contributions/contributions.routes');
const lendingRoutes = require('./modules/lending/lending.routes');
const identityRoutes = require('./modules/identity/identity.routes');
const addressRoutes = require('./modules/address/address.routes'); // live PSGC proxy + zip-check for the identity wizard's address step
const notificationsRoutes = require('./modules/notifications/notifications.routes');
const notificationPreferencesRoutes = require('./modules/notificationPreferences/notificationPreferences.routes');
const loginActivityRoutes = require('./modules/loginActivity/loginActivity.routes');
const feedbackRoutes = require('./modules/feedback/feedback.routes');
const recordsRoutes = require('./modules/records/records.routes');
const profileUpdateRequestsRoutes = require('./modules/profileUpdateRequests/profileUpdateRequests.routes');
const distributionsRoutes = require('./modules/distribution/distributions.routes');
const monitoringRoutes = require('./modules/monitoring/monitoring.routes');
const reportsRoutes = require('./modules/reporting/reporting.routes');
const ledgerRoutes = require('./modules/ledger/ledger.routes');
const penaltiesRoutes = require('./modules/penalties/penalties.routes');
const chatRoutes = require('./modules/chat/chat.routes');
const announcementsRoutes = require('./modules/announcements/announcements.routes');
const directMessagesRoutes = require('./modules/directMessages/directMessages.routes');
const chatReadsRoutes = require('./modules/chatReads/chatReads.routes');
const aiRoutes = require('./modules/ai/ai.routes'); // Gemini: proof-photo field extraction
const ocrRoutes = require('./modules/ocr/ocr.routes'); // Google Cloud Vision: plain OCR text extraction
const adminSecurityRoutes = require('./modules/adminSecurity/adminSecurity.routes');
const recoveryRoutes = require('./modules/adminSecurity/recovery.routes');
const adminAccountRoutes = require('./modules/adminAccount/adminAccount.routes'); // admin's own profile, password, sessions
const auditLogRoutes = require('./modules/auditlog/auditlog.routes');
const adminReportsRoutes = require('./modules/adminReports/adminReports.routes'); // Reports & Analytics (sysadmin, read-only)
const problemReportsRoutes = require('./modules/problemReports/problemReports.routes'); // Problems / complaints workflow
const systemConfigRoutes = require('./modules/systemConfig/systemConfig.routes'); // System Configuration (sysadmin settings, announcements, policies)
const errorHandler = require('./middleware/errorHandler');
const app = express();

app.use(cors());
// `limit` raised from Express's 100kb default — ai.routes.js's proof-photo
// endpoint takes a base64-encoded image inline in the JSON body.
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => res.send('KapitPondo API is running'));
app.use('/health', healthRoute);
app.use('/me', meRoute);
app.use('/admin', adminRouter);
app.use('/api', contributionsRoutes);
app.use('/api', groupsRoutes);
app.use('/api', cyclesRoutes);
app.use('/api', lendingRoutes);
app.use('/api', membershipsRoutes);
app.use('/api', identityRoutes);
app.use('/api', addressRoutes);
app.use('/api', notificationsRoutes);
app.use('/api', notificationPreferencesRoutes);
app.use('/api', loginActivityRoutes);
app.use('/api', feedbackRoutes);
app.use('/api', recordsRoutes);
app.use('/api', profileUpdateRequestsRoutes);
app.use('/api', distributionsRoutes);
app.use('/api', monitoringRoutes);
app.use('/api', reportsRoutes);
app.use('/api', ledgerRoutes);
app.use('/api', penaltiesRoutes);
app.use('/api', chatRoutes);
app.use('/api', announcementsRoutes);
app.use('/api', directMessagesRoutes);
app.use('/api', chatReadsRoutes);
app.use('/api', aiRoutes);
app.use('/api', ocrRoutes);
app.use('/api', adminSecurityRoutes);
app.use('/api', recoveryRoutes);
app.use('/api', adminAccountRoutes);
app.use('/api', auditLogRoutes);
app.use('/api', adminReportsRoutes);
app.use('/api', problemReportsRoutes);
app.use('/api', systemConfigRoutes);

// Error handler stays last.
app.use(errorHandler);

module.exports = app;