const getFhirResource = require('../getFhirResource.js');
const sendSms = require('../sendsms.js');
const smsTemplate = require('../smsTemplate.js');
const logging = require('../logging.js');

async function processCommunityReferredClients() {
  logging('Info', '[communityReferredClients] Job started');

  try {
    // 1. Fetch CommunicationRequests with status=active
    const commReqsResult = await getFhirResource(
      'GET',
      'CommunicationRequest',
      null,
      'status=active',
      null
    );

    if (!commReqsResult.status) {
      logging('Info', '[communityReferredClients] No active CommunicationRequests found.');
      return;
    }

    const communicationRequests = commReqsResult.response.entry || [];

    for (const commReqEntry of communicationRequests) {
        const commReq = commReqEntry.resource;

        // 2. Fetch patient referenced in CommunicationRequest.subject.reference
        const patientRef = commReq.subject?.reference; // e.g. "Patient/123"
        if (!patientRef) {
            logging('Error', `[communityReferredClients] CommunicationRequest missing subject reference: ${commReq.id}`);
            continue;
        }
        const patientId = patientRef.split('/')[1];

        const patientResult = await getFhirResource('GET', 'Patient', patientId, null, null);
        
        if (!patientResult.status) {
            logging('Error', `[communityReferredClients] Patient not found: ${patientId}`);
            continue;
        }

        const patient = patientResult.response;

        // Extract patient data (phn, nic, name, phone, preferred language)
        const patientPhn = patient.identifier?.find(id => id.use === 'official')?.value || '';
        const patientNic = patient.identifier?.find(id => id.use === 'usual')?.value || '';
        const patientName = patient.name?.find(n => n.use === 'official')?.text || 
                          patient.name?.[0]?.text || 'Client';
          const patientPhone = patient.telecom?.find(t => t.system === 'phone' && t.use === 'mobile')?.value || '';
        // const patientPhone = '0775510500';
        const preferredComm = (patient.communication || []).find(c => c.preferred === true);
        const patientPreferredLanguage = preferredComm?.language?.coding?.find(code => code.system === 'urn:ietf:bcp:47')?.code || '';

        // 3. Fetch ServiceRequest(s) for this patient to get referralFacility and referralDate
        const serviceRequestResult = await getFhirResource(
            'GET',
            'ServiceRequest',
            null,
            `subject=Patient/${patientId}`,
            null
        );

        if (!serviceRequestResult.status || !serviceRequestResult.response.entry?.length) {
            logging('Error', `[communityReferredClients] No ServiceRequest found for patient: ${patientId}`);
            continue;
        }

        const serviceRequest = serviceRequestResult.response.entry[0].resource;
        const referralFacility = serviceRequest.locationReference?.[0]?.display || '';
        const referralDate = serviceRequest.occurrencePeriod?.start?.substring(0, 10) || '';

        // 4. Prepare SMS body using template, based on preferred language
        const languageToUse = ['en', 'si', 'ta'].includes(patientPreferredLanguage) ? patientPreferredLanguage : 'en';
        
        const smsBody = smsTemplate('communityReferredClient', languageToUse, {
          clientName: patientName,
          facilityName: referralFacility,
          referralDate,
          nicNumber: patientNic,
          phnNumber: patientPhn
        });

        if (!smsBody) {
          logging('Error', `Failed to prepare SMS template for patient ${patientId}`);
          continue;
        }

        if (!patientPhone) {
            logging('Error', `[communityReferredClients] Missing mobile phone for patient ${patientId}`);
            continue;
        }

        // 5. Send SMS: if language is 'en' => isMultiLanguage = false, else true
        const isMultiLanguage = patientPreferredLanguage.toLowerCase() !== 'en';
        const smsSent = await sendSms(isMultiLanguage, smsBody, patientPhone);

        if (!smsSent) {
            logging('Error', `[communityReferredClients] Failed to send SMS to patient ${patientId}`);
            continue;
        }

        logging('Info', `[communityReferredClients] SMS sent successfully to patient ${patientId}`);

        // 6. Update CommunicationRequest status to completed
        const patchBody = JSON.stringify([
            { op: 'replace', path: '/status', value: 'completed' }
        ]);
        const patchResult = await getFhirResource('PATCH', 'CommunicationRequest', commReq.id, null, patchBody);

        if (!patchResult.status) {
            logging('Error', `[communityReferredClients] Failed to update CommunicationRequest status: ${commReq.id}`);
            continue;
        }

        // 7. Create Communication resource recording the SMS
        const communicationResource = {
            resourceType: 'Communication',
            status: 'completed',
            basedOn: [{ reference: `CommunicationRequest/${commReq.id}` }],
            priority: 'asap',
            reasonCode: [{
              coding: [{
                system: 'http://snomed.info/sct',
                code: '408443003',
                display: 'Referral to Healthy Life Center'
              }],
              text: 'Referral to Healthy Life Center'
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
            logging('Error', `[communityReferredClients] Failed to create Communication resource for patient ${patientId}`);
        } else {
            logging('Info', `[communityReferredClients] Communication resource created for patient ${patientId}`);
        }
    }

    logging('Info', '[communityReferredClients] Job finished');
  } catch (error) {
    logging('Error', `[communityReferredClients] Exception: ${error.message || error}`);
  }
}

module.exports = { processCommunityReferredClients };