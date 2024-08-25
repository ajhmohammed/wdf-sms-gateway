const express = require('express')
const app = express()
const axios = require('axios')
const soap = require('soap')
const cron = require('node-cron')
const sendsms = require('./sendsms')
const logging = require('./logging')
var fs = require('node:fs')
const dotenv = require('dotenv')
const getFhirResource = require('./getFhirResource')
const smsTemplate = require('./smsTemplate')
dotenv.config();

app.use(express.json());

const getAllReferredClients = async function(req, res) {

    // Get and return all active CommunicationRequests
    const getCommunicationResources = async function(req, res) {

        returnComResource = [];

        const fhirResponse = await getFhirResource("GET", "CommunicationRequest", "", "status=active")

        if(fhirResponse && fhirResponse.status == true) {

            logging('Info', `Returned all CommunicationRequest Resources`)

            fhirResponse.response.entry.forEach((item, index) => {

                logging('Info', `Returning CommunicationRequest id: ${item.resource.id} with patient refernce: ${item.resource.subject.reference}`)

                //Limit the number of resources handled at one go
                if(index <= 50) {

                    let retRes = "";

                    retRes = {
                        resourceId: item.resource.id,
                        patientId: item.resource.subject.reference
                    }

                    returnComResource.push(retRes);
                }

            });

            return returnComResource;

        } else {
            logging('Info', `No resource returned. Exitting with status: ${fhirResponse.status}`)
            return false;
        }

    }

    // Based on CommmunicationRequest the Patient resource fetched
    const fetchPatientInformation = async function(req, res) {

        returnPatResource = "";

        const commRequest = await getCommunicationResources();

        if(commRequest) {            

            logging('Info', `Getting ready to fetch patient data for each communicationRequest`)

            const promises = commRequest.map(async (item) => {

                logging('Info', `Fetching patient resource: ${item.patientId}`)

                var paitientReference = item.patientId.split('/');

                const patientResponse = await getFhirResource("GET", `${paitientReference[0]}`, `${paitientReference[1]}`, "")

                if(patientResponse && patientResponse.status == true) {

                    let patientData = patientResponse.response;
                    let patientPhn = patientData.identifier.find(o => o.use == 'official') && patientData.identifier.find(o => o.use == 'official').value ? patientData.identifier.find(o => o.use == 'official').value : null;
                    let patientNic = patientData.identifier.find(o => o.use == 'usual') && patientData.identifier.find(o => o.use == 'usual').value ? patientData.identifier.find(o => o.use == 'usual').value : null;
                    let patientName = patientData.name.find(o => o.use == 'official') && patientData.name.find(o => o.use == 'official').text ? patientData.name.find(o => o.use == 'official').text : patientData.name.find(o => o.use == 'official').given[0]
                    let patientPhone = patientData.telecom.find(o => o.use == 'mobile') && patientData.telecom.find(o => o.use == 'mobile').value ? patientData.telecom.find(o => o.use == 'mobile').value : null;
                    let patientPrefLang = patientData.communication.find(o => o.preferred == true) && patientData.communication.find(o => o.preferred == true).language.coding.find(o => o.system == 'urn:ietf:bcp:47').code ? patientData.communication.find(o => o.preferred == true).language.coding.find(o => o.system == 'urn:ietf:bcp:47').code : null

                    if(patientPhone == null) {

                        logging('Error', `Patient skipped as no phone number available. Patient id: ${paitientReference[1]}`)

                    } else {

                        let retRes = "";

                        retRes = {
                            communicationRequestId: item.resourceId,
                            communicationRequestPatientRefId: item.patientId,
                            patientId: paitientReference[1],
                            patientPhn: patientPhn,
                            patientNic: patientNic,
                            patientName: patientName,
                            patientPhone: patientPhone,
                            patientPrefLang: patientPrefLang
                        }

                        return retRes;
                        
                    }

                } else {
                    
                    logging('Error', `No resource returned. Exitting with status: ${patientResponse.status}`)
                    return false;

                }

            })

            const results = await Promise.all(promises);
            const returnPatResource = results.filter(item => item !== undefined);

            return returnPatResource;

        } else {
            logging('Info', `No resources fetched from CommunicationRequest`)
            return false;
        }

    }

    // Based on the Patients list returned, the service requests are fetched.
    const fetchServiceRequest = async function(req, res) {

        returnServReqResource = "";

        const patientsRequest = await fetchPatientInformation();

        if(patientsRequest) {

            logging('Info', `Getting ready to fetch ServiceRequest data for each Patient`)

            const promises = patientsRequest.map(async (item) => {

                logging('Info', `Fetching ServiceRequest for subject (patient): ${item.patientId}`)

                const servReqResponse = await getFhirResource("GET", `ServiceRequest`, ``, `subject=${item.patientId}`)

                if(servReqResponse && servReqResponse.status == true) {

                    servReqData = servReqResponse.response;
                    facilityName = servReqData.entry[0].resource.locationReference[0].display
                    referralDate = (servReqData.entry[0].resource.occurrencePeriod.start).substring(0,10)

                    let returnRes = "";

                    returnRes = {
                        communicationRequestId: item.communicationRequestId,
                        communicationRequestPatientRefId: item.communicationRequestPatientRefId,
                        patientId: item.patientId,
                        patientPhn: item.patientPhn,
                        patientNic: item.patientNic,
                        patientName: item.patientName,
                        patientPhone: item.patientPhone,
                        patientPrefLang: item.patientPrefLang,
                        facilityName: facilityName,
                        referralDate: referralDate
                    }

                    return returnRes;

                } else {
                    
                    logging('Error', `No resource returned. Exitting with status: ${servReqResponse.status}`)
                    return false;

                }

            })

            const results = await Promise.all(promises);
            const returnServReqResource = results;

            return returnServReqResource

        } else {
            logging('Info', `No resources fetched from Patients informaiton return`)
            return false;
        }

    }

    // Based on the final servicerequest return send the sms
    // update the communicationRequest resource status
    const sendSmsToPatient = async function(req, res) {

        const resources = await fetchServiceRequest();

        if(resources.length > 0) {

            logging('Info', `Getting ready to send sms for each Patient`)

            const promises = resources.map(async (item) => {

                logging('Info', `Preparing to send sms for, communicationRequest: ${item.communicationRequestId}, patient: ${item.patientId}`)

                item.patientPrefLang == 'en' ? isMultiLang = false : isMultiLang = true;

                item.patientNic != null ? patientNic = item.patientNic : patientNic = ''

                smsMessage = smsTemplate('referredClient', item.patientPrefLang)
                smsMessage = smsMessage.replace('{clientName}', item.patientName)
                smsMessage = smsMessage.replace('{facilityName}', item.facilityName)
                smsMessage = smsMessage.replace('{referralDate}', item.referralDate)
                smsMessage = smsMessage.replace('{nicNumber}', patientNic)
                smsMessage = smsMessage.replace('{phnNumber}', item.patientPhn)

                logging('Info', `Sms params, isMultiLang: ${isMultiLang}, Message: ${smsMessage}, Phone: ${item.patientPhone}`)

                smsResult = await sendsms(isMultiLang, smsMessage, item.patientPhone)

                // console.log(smsResult);

                if(smsResult && smsResult == true) {

                    logging('Info', `Initating to mark the CommunicationRequest to completed. ResId: ${item.communicationRequestId}`)


                    const urlBody = '[{ "op": "replace", "path": "/status", "value": "active"},{ "op": "replace", "path": "/status", "value": "completed"}]'

                    const closeCommReq = await getFhirResource("PATCH", `CommunicationRequest`, `${item.communicationRequestId}`, ``, `${urlBody}`)

                    if(closeCommReq && closeCommReq.status == true) {

                        logging('Info', `Succesfully updated and returned.`)

                    } else {
                    
                        logging('Error', `No resource returned. Exitting with status: ${servReqResponse.status}`)
                        return false;

                    }
                }

                //send sms and if sms return true the close the CR
            })

        } else {
            logging('Info', `No resources fetched from serviceRequest return`)
            return false;
        }

    } 

    return sendSmsToPatient();

}

const clientWithUpcomingAppointment = async function(req, res) {

    const getAllActiveServiceRequests = async function(req, res) {

        returnServReqResource = [];

        const fhirResponse = await getFhirResource("GET", "ServiceRequest", "", "status=active")

        if(fhirResponse && fhirResponse.status == true) {

            logging('Info', `Returned all ServiceRequest Resources`)

            fhirResponse.response.entry.forEach((item) => {

                logging('Info', `Processing ServiceRequest resource: ${item.resource.id}`)

                let servReqDate = (item.resource.occurrencePeriod.start).substring(0,10)
                let tomorrowDate = new Date();
                tomorrowDate.setDate(tomorrowDate.getDate() + 1);
                tomorrowDate = tomorrowDate.toISOString().substring(0, 10);

                if(servReqDate == tomorrowDate) {

                    let retRes = "";

                    retRes = {
                        servReqResourceId: item.resource.id,
                        facilityName: item.resource.locationReference[0].display,
                        patientReference: item.resource.subject.reference
                    }

                    returnServReqResource.push(retRes)

                } else {
                    logging('Info', `Skipped because of date. ServiceRequest resource: ${item.resource.id}, serviceRequest date: ${servReqDate}, tomorrow date: ${tomorrowDate}`)
                }

            })

            return returnServReqResource

        } else {
            logging('Info', `No resource returned. Exitting with status: ${fhirResponse.status}`)
            return false;
        }

    }

    // Based on CommmunicationRequest the Patient resource fetched
    const fetchPatientInformation = async function(req, res) {

        returnPatResource = "";

        const servReq = await getAllActiveServiceRequests();

        if(servReq) {            

            logging('Info', `Getting ready to fetch patient data for each ServiceRequest`)

            const promises = servReq.map(async (item) => {

                logging('Info', `Fetching patient resource: ${item.patientReference}`)

                var paitientReference = item.patientReference.split('/');

                const patientResponse = await getFhirResource("GET", `${paitientReference[0]}`, `${paitientReference[1]}`, "")

                if(patientResponse && patientResponse.status == true) {

                    let patientData = patientResponse.response;
                    let patientPhn = patientData.identifier.find(o => o.use == 'official') && patientData.identifier.find(o => o.use == 'official').value ? patientData.identifier.find(o => o.use == 'official').value : null;
                    let patientNic = patientData.identifier.find(o => o.use == 'usual') && patientData.identifier.find(o => o.use == 'usual').value ? patientData.identifier.find(o => o.use == 'usual').value : null;
                    let patientName = patientData.name.find(o => o.use == 'official') && patientData.name.find(o => o.use == 'official').text ? patientData.name.find(o => o.use == 'official').text : patientData.name.find(o => o.use == 'official').given[0]
                    let patientPhone = patientData.telecom.find(o => o.use == 'mobile') && patientData.telecom.find(o => o.use == 'mobile').value ? patientData.telecom.find(o => o.use == 'mobile').value : null;
                    let patientPrefLang = patientData.communication.find(o => o.preferred == true) && patientData.communication.find(o => o.preferred == true).language.coding.find(o => o.system == 'urn:ietf:bcp:47').code ? patientData.communication.find(o => o.preferred == true).language.coding.find(o => o.system == 'urn:ietf:bcp:47').code : null

                    if(patientPhone == null) {

                        logging('Error', `Patient skipped as no phone number available. Patient id: ${paitientReference[1]}`)

                    } else {

                        let retRes = "";

                        retRes = {
                            servReqResourceId: item.servReqResourceId,
                            patientReference: item.patientReference,
                            facilityName: item.facilityName,
                            patientId: paitientReference[1],
                            patientPhn: patientPhn,
                            patientNic: patientNic,
                            patientName: patientName,
                            patientPhone: patientPhone,
                            patientPrefLang: patientPrefLang
                        }

                        return retRes;
                        
                    }

                } else {
                    
                    logging('Error', `No resource returned. Exitting with status: ${patientResponse.status}`)
                    return false;

                }

            })

            const results = await Promise.all(promises);
            const returnPatResource = results.filter(item => item !== undefined);

            return returnPatResource;

        } else {
            logging('Info', `No resources fetched from CommunicationRequest`)
            return false;
        }

    }

    // Based on the final servicerequest return send the sms
    // update the communicationRequest resource status
    const sendSmsToPatient = async function(req, res) {

        const resources = await fetchPatientInformation();

        if(resources.length > 0) {

            logging('Info', `Getting ready to send sms for each Patient`)

            const promises = resources.map(async (item) => {

                logging('Info', `Preparing to send sms for, serviceRequest: ${item.servReqResourceId}, patient: ${item.patientId}`)

                item.patientPrefLang == 'en' ? isMultiLang = false : isMultiLang = true;

                item.patientNic != null ? patientNic = item.patientNic : patientNic = ''

                smsMessage = smsTemplate('upcomingAppointement', item.patientPrefLang)
                smsMessage = smsMessage.replace('{clientName}', item.patientName)
                smsMessage = smsMessage.replace('{facilityName}', item.facilityName)
                smsMessage = smsMessage.replace('{nicNumber}', patientNic)
                smsMessage = smsMessage.replace('{phnNumber}', item.patientPhn)

                logging('Info', `Sms params, isMultiLang: ${isMultiLang}, Message: ${smsMessage}, Phone: ${item.patientPhone}`)

                smsResult = await sendsms(isMultiLang, smsMessage, item.patientPhone)

                // console.log(smsResult);

                if(smsResult && smsResult == true) {

                    logging('Info', `SMS successfully sent`)

                } 
            })

        } else {
            logging('Info', `No resources fetched from serviceRequest return`)
            return false;
        }

    }

    return sendSmsToPatient();

}

const clientWithMissedAppointment = async function(req, res) {

    const getAllActiveServiceRequests = async function(req, res) {

        returnServReqResource = [];

        const fhirResponse = await getFhirResource("GET", "ServiceRequest", "", "status=active")

        if(fhirResponse && fhirResponse.status == true) {

            logging('Info', `Returned all ServiceRequest Resources`)

            fhirResponse.response.entry.forEach((item) => {

                logging('Info', `Processing ServiceRequest resource: ${item.resource.id}`)

                let servReqDate = (item.resource.occurrencePeriod.start).substring(0,10)
                let tomorrowDate = new Date();
                tomorrowDate.setDate(tomorrowDate.getDate());
                tomorrowDate = tomorrowDate.toISOString().substring(0, 10);

                if(servReqDate == tomorrowDate) {

                    let retRes = "";

                    retRes = {
                        servReqResourceId: item.resource.id,
                        facilityName: item.resource.locationReference[0].display,
                        patientReference: item.resource.subject.reference
                    }

                    returnServReqResource.push(retRes)

                } else {
                    logging('Info', `Skipped because of date. ServiceRequest resource: ${item.resource.id}, serviceRequest date: ${servReqDate}, tomorrow date: ${tomorrowDate}`)
                }

            })

            return returnServReqResource

        } else {
            logging('Info', `No resource returned. Exitting with status: ${fhirResponse.status}`)
            return false;
        }

    }

    // Based on CommmunicationRequest the Patient resource fetched
    const fetchPatientInformation = async function(req, res) {

        returnPatResource = "";

        const servReq = await getAllActiveServiceRequests();

        if(servReq) {            

            logging('Info', `Getting ready to fetch patient data for each ServiceRequest`)

            const promises = servReq.map(async (item) => {

                logging('Info', `Fetching patient resource: ${item.patientReference}`)

                var paitientReference = item.patientReference.split('/');

                const patientResponse = await getFhirResource("GET", `${paitientReference[0]}`, `${paitientReference[1]}`, "")

                if(patientResponse && patientResponse.status == true) {

                    let patientData = patientResponse.response;
                    let patientPhn = patientData.identifier.find(o => o.use == 'official') && patientData.identifier.find(o => o.use == 'official').value ? patientData.identifier.find(o => o.use == 'official').value : null;
                    let patientNic = patientData.identifier.find(o => o.use == 'usual') && patientData.identifier.find(o => o.use == 'usual').value ? patientData.identifier.find(o => o.use == 'usual').value : null;
                    let patientName = patientData.name.find(o => o.use == 'official') && patientData.name.find(o => o.use == 'official').text ? patientData.name.find(o => o.use == 'official').text : patientData.name.find(o => o.use == 'official').given[0]
                    let patientPhone = patientData.telecom.find(o => o.use == 'mobile') && patientData.telecom.find(o => o.use == 'mobile').value ? patientData.telecom.find(o => o.use == 'mobile').value : null;
                    let patientPrefLang = patientData.communication.find(o => o.preferred == true) && patientData.communication.find(o => o.preferred == true).language.coding.find(o => o.system == 'urn:ietf:bcp:47').code ? patientData.communication.find(o => o.preferred == true).language.coding.find(o => o.system == 'urn:ietf:bcp:47').code : null

                    if(patientPhone == null) {

                        logging('Error', `Patient skipped as no phone number available. Patient id: ${paitientReference[1]}`)

                    } else {

                        let retRes = "";

                        retRes = {
                            servReqResourceId: item.servReqResourceId,
                            patientReference: item.patientReference,
                            facilityName: item.facilityName,
                            patientId: paitientReference[1],
                            patientPhn: patientPhn,
                            patientNic: patientNic,
                            patientName: patientName,
                            patientPhone: patientPhone,
                            patientPrefLang: patientPrefLang
                        }

                        return retRes;
                        
                    }

                } else {
                    
                    logging('Error', `No resource returned. Exitting with status: ${patientResponse.status}`)
                    return false;

                }

            })

            const results = await Promise.all(promises);
            const returnPatResource = results.filter(item => item !== undefined);

            return returnPatResource;

        } else {
            logging('Info', `No resources fetched from CommunicationRequest`)
            return false;
        }

    }

    // Based on the final servicerequest return send the sms
    // update the communicationRequest resource status
    const sendSmsToPatient = async function(req, res) {

        const resources = await fetchPatientInformation();

        if(resources.length > 0) {

            logging('Info', `Getting ready to send sms for each Patient`)

            const promises = resources.map(async (item) => {

                logging('Info', `Preparing to send sms for, serviceRequest: ${item.servReqResourceId}, patient: ${item.patientId}`)

                item.patientPrefLang == 'en' ? isMultiLang = false : isMultiLang = true;

                item.patientNic != null ? patientNic = item.patientNic : patientNic = ''

                smsMessage = smsTemplate('missedAppointment', item.patientPrefLang)
                smsMessage = smsMessage.replace('{clientName}', item.patientName)
                smsMessage = smsMessage.replace('{facilityName}', item.facilityName)
                smsMessage = smsMessage.replace('{nicNumber}', patientNic)
                smsMessage = smsMessage.replace('{phnNumber}', item.patientPhn)

                logging('Info', `Sms params, isMultiLang: ${isMultiLang}, Message: ${smsMessage}, Phone: ${item.patientPhone}`)

                smsResult = await sendsms(isMultiLang, smsMessage, item.patientPhone)

                // console.log(smsResult);

                if(smsResult && smsResult == true) {

                    logging('Info', `SMS successfully sent`)

                } 
            })

        } else {
            logging('Info', `No resources fetched from serviceRequest return`)
            return false;
        }

    }

    return sendSmsToPatient();

}

app.get('/referredClients', (req, res) => {   

    getAllReferredClients().then(x => {
        // Send the sms
    })

    res.send('loaded referredClients');    
    
})

//client who has appointment tomorrow
app.get('/upcomingAppointment', (req, res) => {

    clientWithUpcomingAppointment().then(x => {
        // Send the sms
    })

    res.send('loaded clientsWithUpcomingAppointment')

});

//client who has missed the appointment
app.get('/missedAppointment', (req, res) => {

    clientWithMissedAppointment().then(x => {
        // Send the sms
    })

    res.send('loaded clientsWithmissedAppointment')

});

cron.schedule('* * * * *', () => {
    logging('SERVICE LIVE', `Service active status verified`)
});


app.listen(process.env.PORT, () => {
    (process.env.NODE_ENV !== 'prod') ? console.log(`Listening on port ${process.env.PORT}`): ''
})