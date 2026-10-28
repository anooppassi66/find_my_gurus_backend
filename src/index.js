require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const categoriesRoutes = require('./routes/categories');
const gurusRoutes = require('./routes/gurus');
const requirementsRoutes = require('./routes/requirements');
const proposalsRoutes = require('./routes/proposals');
const contractsRoutes = require('./routes/contracts');
const milestonesRoutes = require('./routes/milestones');
const commissionRoutes = require('./routes/commission');
const walletRoutes = require('./routes/wallet');
const conversationsRoutes = require('./routes/conversations');
const meetingsRoutes = require('./routes/meetings');
const googleMeet = require('./services/googleMeet');

const app = express();

const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
  })
);
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/gurus', gurusRoutes);
app.use('/api/requirements', requirementsRoutes);
app.use('/api/proposals', proposalsRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/milestones', milestonesRoutes);
app.use('/api/commission', commissionRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/meetings', meetingsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Find My Gurus API listening on port ${PORT}`);
    if (googleMeet.isMockMode()) {
      console.warn('GOOGLE_MEET_MOCK=true — meetings get placeholder Meet links, not real ones.');
    } else if (!googleMeet.isConfigured()) {
      console.warn('Google Meet is not configured — scheduling meetings will fail until GOOGLE_* env vars are set.');
    }
  });
}

module.exports = app;
