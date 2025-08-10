const express = require('express')
const app = express()
app.use(express.json());
const cron = require('node-cron')

const { processCommunityReferredClients } = require('./cron/communityReferredClients.js');
const { processCommunityUpcomingAppointments } = require('./cron/communityUpcomingAppointment.js');
const { processCommunityMissedAppointments } = require('./cron/communityMissedAppointment.js');
const { processClinicBeforeAppointmentDay } = require('./cron/clinicBeforeAppointmentDay.js');
const { processClinicOnAppointmentDay } = require('./cron/clinicOnAppointmentDay.js');
const { processClinicMissedAppointment } = require('./cron/clinicMissedAppointment.js');

// Schedule to run every day at 6 PM
cron.schedule('0 18 * * *', async () => {
  console.log(`[${new Date().toLocaleString()}] Cron triggered: Processing Community Referred Clients`);
  await processCommunityReferredClients();

  console.log(`[${new Date().toLocaleString()}] Cron triggered: Processing Community Missed Appointments`);
  await processCommunityMissedAppointments();

  console.log(`[${new Date().toLocaleString()}] Cron triggered: Processing Clinic Missed Appointments`);
  await processClinicMissedAppointment();
});

// Schedule to run every day at 10 AM
cron.schedule('0 10 * * *', async () => {
  console.log(`[${new Date().toLocaleString()}] Cron triggered: Processing Community Upcoming Appointments`);
  await processCommunityUpcomingAppointments();

  onsole.log(`[${new Date().toLocaleString()}] Cron triggered: Processing Clinic Before Day Appointments`);
  await processClinicBeforeAppointmentDay();
});

// Schedule to run every day at 6 AM
cron.schedule('0 6 * * *', async () => {
    onsole.log(`[${new Date().toLocaleString()}] Cron triggered: Processing Clinic Today Appointments`);
    await processClinicOnAppointmentDay();
});


// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});


app.listen(process.env.PORT, () => {
    (process.env.NODE_ENV !== 'prod') ? console.log(`Listening on port ${process.env.PORT}`): ''
})