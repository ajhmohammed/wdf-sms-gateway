const getFhirResource = require('../getFhirResource.js');
const sendSms = require('../sendsms.js');
const smsTemplate = require('../smsTemplate.js');
const logging = require('../logging.js');

async function processCommunityUpcomingAppointments() {
  logging('Info', '[communityUpcomingAppointment] Job started');

  try {
    // 1. Get tomorrow's date string in YYYY-MM-DD format
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().substring(0, 10);
    // const tomorrowStr = '2025-07-25';

    // 2. Fetch ServiceRequests with status=active and occurrencePeriod.start date = tomorrow
    const serviceRequestsResult = await getFhirResource(
      'GET',
      'ServiceRequest',
      null,
      'status=active',
      null
    );

    if (!serviceRequestsResult.status) {
      logging('Info', '[communityUpcomingAppointment] No active ServiceRequests found.');
      return;
    }

    const serviceRequests = (serviceRequestsResult.response.entry || []).filter(entry => {
      const serviceRequest = entry.resource;
      const startDate = serviceRequest.occurrencePeriod?.start?.substring(0, 10);
      return startDate === tomorrowStr;
    });

    if (serviceRequests.length === 0) {
      logging('Info', `[communityUpcomingAppointment] No ServiceRequests for ${tomorrowStr}`);
      return;
    }

    // 3. Process each filtered ServiceRequest
    for (const srEntry of serviceRequests) {
      const serviceRequest = srEntry.resource;

      // Patient ref
      const patientRef = serviceRequest.subject?.reference;
      if (!patientRef) {
        logging('Error', `[communityUpcomingAppointment] ServiceRequest missing subject reference: ${serviceRequest.id}`);
        continue;
      }
      const patientId = patientRef.split('/')[1];

      // 4. Fetch patient resource
      const patientResult = await getFhirResource('GET', 'Patient', patientId, null, null);
      if (!patientResult.status) {
        logging('Error', `[communityUpcomingAppointment] Patient not found: ${patientId}`);
        continue;
      }
      const patient = patientResult.response;

      // Extract patient info
      const patientPhn = patient.identifier?.find(id => id.use === 'official')?.value || '';
      const patientNic = patient.identifier?.find(id => id.use === 'usual')?.value || '';
      const patientName = patient.name?.find(n => n.use === 'official')?.text || patient.name?.[0]?.text || 'Client';
      const patientPhone = patient.telecom?.find(t => t.system === 'phone' && t.use === 'mobile')?.value || '';
      // const patientPhone = '0775510500';
      const preferredComm = (patient.communication || []).find(c => c.preferred === true);
      const patientPreferredLanguage = preferredComm?.language?.coding?.find(code => code.system === 'urn:ietf:bcp:47')?.code || '';

      if (!patientPhone) {
        logging('Error', `[communityUpcomingAppointment] Missing mobile phone for patient ${patientId}`);
        continue;
      }

      // Facility name and referral date from ServiceRequest
      const referralFacility = serviceRequest.locationReference?.[0]?.display || '';
      const referralDate = serviceRequest.occurrencePeriod?.start?.substring(0, 10) || '';

      // 5. Prepare SMS body using the 'communityUpcomingAppointment' template
      const languageToUse = ['en', 'si', 'ta'].includes(patientPreferredLanguage) ? patientPreferredLanguage : 'en';

      const smsBody = smsTemplate('communityUpcomingAppointment', languageToUse, {
        clientName: patientName,
        facilityName: referralFacility,
        referralDate,
        nicNumber: patientNic,
        phnNumber: patientPhn
      });

      if (!smsBody) {
        logging('Error', `[communityUpcomingAppointment] Failed to prepare SMS template for patient ${patientId}`);
        continue;
      }

      // 6. Send SMS - language rule same as before
      const isMultiLanguage = patientPreferredLanguage.toLowerCase() !== 'en';
      const smsSent = await sendSms(isMultiLanguage, smsBody, patientPhone);

      if (!smsSent) {
        logging('Error', `[communityUpcomingAppointment] Failed to send SMS to patient ${patientId}`);
        continue;
      }

      logging('Info', `[communityUpcomingAppointment] SMS sent successfully to patient ${patientId}`);

      // 7. Create Communication resource recording the SMS
      const communicationResource = {
        resourceType: 'Communication',
        status: 'completed',
        basedOn: [{ reference: `ServiceRequest/${serviceRequest.id}` }],
        priority: 'asap',
        reasonCode: [{
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/appointmentreason',
            code: 'follow-up',
            display: 'Follow-up'
          }],
          text: 'Upcoming appointment reminder'
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
        logging('Error', `[communityUpcomingAppointment] Failed to create Communication resource for patient ${patientId}`);
      } else {
        logging('Info', `[communityUpcomingAppointment] Communication resource created for patient ${patientId}`);
      }
    }

    logging('Info', '[communityUpcomingAppointment] Job finished');
  } catch (error) {
    logging('Error', `[communityUpcomingAppointment] Exception: ${error.message || error}`);
  }
}

module.exports = { processCommunityUpcomingAppointments };
