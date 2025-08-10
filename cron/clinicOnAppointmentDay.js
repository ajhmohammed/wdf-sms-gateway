const getFhirResource = require('../getFhirResource.js');
const sendSms = require('../sendsms.js');
const smsTemplate = require('../smsTemplate.js');
const logging = require('../logging.js');

async function processClinicOnAppointmentDay() {
  logging('Info', '[clinicOnAppointmentDay] Job started');

  try {
    // 1. Get tomorrow's date string in YYYY-MM-DD format
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    // const todayStr = '2025-08-27';

    logging('Info', `[clinicOnAppointmentDay] Checking appointments for date: ${todayStr}`);

    // 2. Fetch booked Appointments with start date == tomorrow
    const appointmentsResult = await getFhirResource(
      'GET',
      'Appointment',
      null,
      `status=booked&date=${todayStr}`,
      null
    );

    if (!appointmentsResult.status) {
      logging('Info', `[clinicOnAppointmentDay] No booked appointments found for ${todayStr}`);
      return;
    }

    const appointments = appointmentsResult.response.entry || [];
    if (appointments.length === 0) {
      logging('Info', `[clinicOnAppointmentDay] No appointments found for ${todayStr}`);
      return;
    }

    // 3. Process each appointment
    for (const apptEntry of appointments) {
      const appointment = apptEntry.resource;

      // Patient reference from participant
      const patientParticipant = appointment.participant?.find(
        p => p.actor?.reference?.startsWith('Patient/')
      );
      if (!patientParticipant) {
        logging('Error', `[clinicOnAppointmentDay] Missing patient reference in Appointment/${appointment.id}`);
        continue;
      }

      const patientRef = patientParticipant.actor.reference;
      const patientId = patientRef.split('/')[1];

      // 4. Fetch patient resource
      const patientResult = await getFhirResource('GET', 'Patient', patientId, null, null);
      if (!patientResult.status) {
        logging('Error', `[clinicOnAppointmentDay] Patient not found: ${patientId}`);
        continue;
      }
      const patient = patientResult.response;

      // Extract patient details
      const patientName = patient.name?.find(n => n.use === 'official')?.text
        || patient.name?.[0]?.text
        || 'Client';
      const patientPhone = patient.telecom?.find(t => t.system === 'phone' && t.use === 'mobile')?.value;
      // const patientPhone = '0775510500';
      if (!patientPhone) {
        logging('Error', `[clinicOnAppointmentDay] Missing phone number for patient ${patientId}`);
        continue;
      }

      const preferredComm = (patient.communication || []).find(c => c.preferred === true);
      const patientPreferredLanguage = preferredComm?.language?.coding?.find(
        code => code.system === 'urn:ietf:bcp:47'
      )?.code || '';

      // 5. Get facility name from meta.tag
      let facilityName = '';
      if (appointment.meta?.tag) {
        const locationTag = appointment.meta.tag.find(
          tag => tag.system === 'https://smartregister.org/location-tag-id'
        );
        if (locationTag) {
          const locationId = locationTag.code;
          const locationResult = await getFhirResource('GET', 'Location', locationId, null, null);
          if (locationResult.status) {
            facilityName = locationResult.response.name || '';
          }
        }
      }

      // 6. Prepare SMS
      const languageToUse = ['en', 'si', 'ta'].includes(patientPreferredLanguage)
        ? patientPreferredLanguage
        : 'en';

      const smsBody = smsTemplate('clinicOnAppointmentDay', languageToUse, {
        clientName: patientName,
        referralDate: todayStr,
        facilityName: facilityName
      });

      if (!smsBody) {
        logging('Error', `[clinicOnAppointmentDay] Failed to prepare SMS for patient ${patientId}`);
        continue;
      }

      // 7. Send SMS
      const isMultiLanguage = patientPreferredLanguage.toLowerCase() !== 'en';
      const smsSent = await sendSms(isMultiLanguage, smsBody, patientPhone);

      if (!smsSent) {
        logging('Error', `[clinicOnAppointmentDay] Failed to send SMS to patient ${patientId}`);
        continue;
      }

      logging('Info', `[clinicOnAppointmentDay] SMS sent to patient ${patientId}`);

      // Create Communication resource recording the SMS
      const communicationResource = {
        resourceType: 'Communication',
        status: 'completed',
        basedOn: [{ reference: `Appointment/${appointment.id}` }],
        priority: 'asap',
        reasonCode: [{
          coding: [{
            system: 'http://snomed.info/sct',
            code: '408732007',
            display: 'Appointment reminder'
          }],
          text: 'Appointment reminder'
        }],
        note: [{ text: 'Sent via automated appointment reminder system' }],
        subject: { reference: patientRef },
        recipient: [{ reference: patientRef }],
        sent: new Date().toISOString(),
        payload: [{ contentString: smsBody }],
        medium: [{
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode',
            code: 'SMS',
            display: 'Short Message Service'
          }]
        }]
      };

      const postResult = await getFhirResource('POST', 'Communication', null, null, JSON.stringify(communicationResource));

      if (!postResult.status) {
        logging('Error', `[clinicOnAppointmentDay] Failed to create Communication resource for patient ${patientId}`);
      } else {
        logging('Info', `[clinicOnAppointmentDay] Communication resource created for patient ${patientId}`);
      }
    }

    logging('Info', '[clinicOnAppointmentDay] Job finished');
  } catch (error) {
    logging('Error', `[clinicOnAppointmentDay] Exception: ${error.message || error}`);
  }
}

module.exports = { processClinicOnAppointmentDay };
