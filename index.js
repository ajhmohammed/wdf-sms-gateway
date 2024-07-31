const express = require('express')
const app = express()
const axios = require('axios')
const soap = require('soap')
const dotenv = require('dotenv')
const cron = require('node-cron')
const Keycloak = require('keycloak-backend').Keycloak
var fs = require('node:fs')
dotenv.config();

const logFileName = 'logs.txt'
var logMessage = `Started Node app ${new Date().toLocaleString()} \n`;
console.log(logMessage)

fs.appendFile(logFileName, logMessage, function (err) {})


const keycloak = new Keycloak({
    "realm": process.env.KC_REALM,
    "keycloak_base_url": process.env.KC_BASE_URL,
    "client_id": process.env.KC_CLIENT_ID,
    "username": process.env.KC_USERNAME,
    "password": process.env.KC_PASSWORD,        
    "is_legacy_endpoint": process.env.KC_IS_LEGACY_ENDPOINT
});

app.use(express.json());

const getAllCommunicationRequest = async function(req, res) {

    const accessToken = await keycloak.accessToken.get();

    const options = {
        method: 'GET',
        headers: {
            Authorization: ` Bearer ${accessToken}`
        }
    }

    const url = process.env.HAPI_BASE_URL + '/CommunicationRequest?status=active';


    const commReqIds = [];

    try {
        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Checking active CommunicationRequest \n`
        console.log(logMessage)
        fs.appendFile(logFileName, logMessage, function (err) {})

        const response = await fetch(url, options)
        const jsonResponse = await response.json();

        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Total Returned Resources: ${jsonResponse.total} \n`
        console.log(logMessage)
        fs.appendFile(logFileName, logMessage, function (err) {})

        // const commReqArray = jsonResponse.entry;

        // const commReqCount = jsonResponse.entry.length;
        const commReqTotal = jsonResponse.total;
        // console.log(jsonResponse.total);

            // commReqArryItem = jsonResponse.entry

        if(commReqTotal > 0) {

            jsonResponse.entry.forEach(commReqArryItem => {
                
                //Limit the number of CommunicationRequests handled at a given time (20 request at a batch)
                // if (commReqIds.length === 21) {
                //     return false;
                // }

                // console.log(commReqIds.length)

                const commReqResourceId = commReqArryItem.resource.id;
                const patientId = commReqArryItem.resource.subject.reference;

                //Fetch Patient Resource
                const getPatientResource = async function(req, res) {

                    const url = process.env.HAPI_BASE_URL + '/' + patientId;

                    try {
                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Getting Patient Information \n`
                        console.log(logMessage)
                        fs.appendFile(logFileName, logMessage, function (err) {})
                
                        const patientResourceResponse = await fetch(url, options)
                        const patientJsonResponse = await patientResourceResponse.json();

                        // console.log(patientJsonResponse);
                        return patientJsonResponse;
                        
                        // const commReqArray = jsonResponse.entry;

                    } catch(err) {
                        logMessage = `ERROR (getAllComm_getPatientResource_99)', ${err} \n`
                        console.log(logMessage)
                        fs.appendFile(logFileName, logMessage, function (err) {})
                    }
                }

                //Fetch ServiceRequest Resource
                const getServiceRequestResource = async function(req, res) {

                    const url = process.env.HAPI_BASE_URL + '/ServiceRequest?subject=' + patientId;

                    try {
                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Getting ServiceRequest Information \n`
                        console.log(logMessage)
                        fs.appendFile(logFileName, logMessage, function (err) {})
                
                        const servReqResourceResponse = await fetch(url, options)
                        const servReqJsonResponse = await servReqResourceResponse.json();

                        // console.log(servReqJsonResponse);
                        return servReqJsonResponse;
                        
                        // const commReqArray = jsonResponse.entry;

                    } catch(err) {
                        logMessage = `ERROR (getAllComm_getServiceRequestResource_124), ${err} \n`
                        console.log(logMessage)
                        fs.appendFile(logFileName, logMessage, function (err) {})
                    }
                }

                const consolidatedData = async function(req, res) {

                    const patientData = await getPatientResource();
                    const serviceReqData = await getServiceRequestResource();

                    // console.log(patientData)

                    const prefLanguage = patientData.communication[0].language.coding[0].code;
                    const patientPhn = '('+patientData.identifier[0].value+')';
                    // const patientNic = patientData.identifier[1].value;
                    const patientName = patientData.name[0].given;
                    const patientPhoneNo = patientData.telecom[0].value;;
                    const facilityName = serviceReqData.entry[0].resource.locationReference[0].display;
                    const referralDate = (serviceReqData.entry[0].resource.occurrencePeriod.start).substring(0, 10);

                    if(patientData.identifier.find(o => o.use === 'usual')) {
                        patientNic = '('+patientData.identifier.find(o => o.use === 'usual').value+')';
                    } else {
                        patientNic = "";
                    }

                    console.log("PATIENT: ", patientData.telecom)
                    console.log("PATIENT PHONE NUMBER: ", patientPhoneNo)

                    const referralSmsTemplate = {
                        client_at_risk_and_referred: {
                            "en": "{clientName}, please visit the Healthy Lifestyle Centre at {facilityName} on {referralDate} for a full screening. Remember to bring this SMS with your NIC {nicNumber} and PHN {phnNumber} to the facility.",
                            "si": "{clientName}, කරුණාකර {facilityName} එකෙහි ඇති සුව දිවි මඩ්‍යස්ථා නය වෙත {referralDate} දින පූර්ණ සෞඛ්‍ය පරීක්ෂණයක් කිරීම සඳහා ඔබගේ හැ ඳුනුම්පත් අංකය වන {nicNumber}  සහ PHN අංකය වන {phnNumber} සමග පැ මිණ මෙම SMS පණිවිඩය ඉදිරිපත් කරන්න.",
                            "ta": "{clientName}, முழு சுகாதார பரிசோதனைக்காக {referralDate} அன்று {facilityName} இல் உள்ள ஆரோக்கியமான வாழ்க்கைமுறை நிலையத்திற்கு செல்லவும். உங்கள் தேசிய அடையாள அட்டை {nicNumber} மற்றும் தனிப்பட்ட சுகாதார எண் {phnNumber} உடன் இந்த குறுஞ்செய்தியை எடுத்து செல்ல மறக்காதீர்கள்.",
                        }
                    }

                    if (prefLanguage == 'en') {
                        smsMessage = referralSmsTemplate.client_at_risk_and_referred.en
                    } else if (prefLanguage == 'si') {
                        smsMessage = referralSmsTemplate.client_at_risk_and_referred.si
                    } else if (prefLanguage == 'ta') {
                        smsMessage = referralSmsTemplate.client_at_risk_and_referred.ta
                    } else {
                        smsMessage = "";
                    }

                    smsMessage = smsMessage.replace('{clientName}', patientName)
                    smsMessage = smsMessage.replace('{facilityName}', facilityName)
                    smsMessage = smsMessage.replace('{referralDate}', referralDate)
                    smsMessage = smsMessage.replace('{nicNumber}', patientNic)
                    smsMessage = smsMessage.replace('{phnNumber}', patientPhn)

                    const smsMessageBody = smsMessage;

                    // console.log(smsMessage);

                    // SEND SMS
                    
                    soap.createClient(process.env.SMS_GTWY_PROVIDER_URL, function(err, client) {
                        if(err) {
                            logMessage = `Error (getAllComm_consolidateData_createClient_186): ${err} \n`
                            console.log(logMessage)
                            fs.appendFile(logFileName, logMessage, function (err) {})
                        } else {
                            
                            const createSessionArgs = {user: {username: process.env.SMS_GTWY_USERNAME, password: process.env.SMS_GTWY_PASSWORD}}
                    
                            client.createSession(createSessionArgs, function(err, result) {
                                if(err) {
                                    logMessage = `Error (getAllComm_CreateSession_195): ${err} \n`
                                    console.log(logMessage)
                                    fs.appendFile(logFileName, logMessage, function (err) {})
                                } else {
                                    // console.log('createSession')
                                    logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS Session Initiated \n`
                                    console.log(logMessage)
                                    fs.appendFile(logFileName, logMessage, function (err) {})
                    
                                    const session =  result;
                                    console.log(session);

                                    console.log(smsMessageBody)                                
                                    
                                    if(prefLanguage === 'en') {

                                        // console.log('ENG Message')

                                        const sendMessagesArgs = {
                                            session: session.return,
                                            smsMessage: {
                                                sender: process.env.SMS_GTWY_SENDER_MASK,
                                                message: smsMessageBody,
                                                recipients: patientPhoneNo,                                                
                                                messageType: process.env.SMS_GTWY_MESSAGE_TYPE
                                            }
                                        }
                                
                                        client.sendMessages(sendMessagesArgs, function(err, result) {
                                            if(err) {
                                                logMessage = `Error (getAllComm_PreLang_EN_227): ${err} \n`
                                                console.log(logMessage)
                                                fs.appendFile(logFileName, logMessage, function (err) {})
                                            } else {
                                                // console.log('sendMessage')
                                                console.log(result.return); // <--- should get 200
        
                                                if(result.return == 200) {
                                                    // store in the db
                                                    // console.log("Sent");
                                                    logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS Sent to: ${patientPhoneNo} \n`
                                                    console.log(logMessage)
                                                    fs.appendFile(logFileName, logMessage, function (err) {})

                                                    logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS content: ${smsMessageBody} \n`
                                                    console.log(logMessage)
                                                    fs.appendFile(logFileName, logMessage, function (err) {})

                                                    //change CR status
                                                    const changeCommicationRequestStatus = async function(req, res) {

                                                        // console.log("Started closing CR");
                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Started Closing CR \n`
                                                        console.log(logMessage)
                                                        fs.appendFile(logFileName, logMessage, function (err) {})

                                                        const urlBody = '[{ "op": "replace", "path": "/status", "value": "active"},{ "op": "replace", "path": "/status", "value": "completed"}]'

                                                        const options = {
                                                            method: 'PATCH',
                                                            headers: {
                                                                'Content-Type': 'application/json-patch+json',
                                                                Authorization: ` Bearer ${accessToken}`
                                                            },
                                                            body: urlBody
                                                        }

                                                        const url = process.env.HAPI_BASE_URL + '/CommunicationRequest/' + commReqResourceId;

                                                        // console.log(url);
                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Updating CR on: ${url} \n`
                                                        console.log(logMessage)
                                                        fs.appendFile(logFileName, logMessage, function (err) {})

                                                        try {
                                                            logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Getting ServiceRequest Information \n`
                                                            console.log(logMessage)
                                                            fs.appendFile(logFileName, logMessage, function (err) {})
                                                    
                                                            const servReqCRResourceResponse = await fetch(url, options)
                                                            const servReqCRJsonResponse = await servReqCRResourceResponse.json();

                                                            console.log(servReqCRJsonResponse);
                                                            return servReqCRJsonResponse;
                                                            
                                                            // const commReqArray = jsonResponse.entry;

                                                        } catch(err) {
                                                            logMessage = `ERROR (getAllComm_PreLang_EN_285), ${err} \n`
                                                            console.log(logMessage)
                                                            fs.appendFile(logFileName, logMessage, function (err) {})
                                                        }
                                                    }

                                                    changeCommicationRequestStatus();

                                                } else {
                                                    logMessage = `Error (getAllComm_PreLang_EN_294): ${err} \n`
                                                    console.log(logMessage)
                                                    fs.appendFile(logFileName, logMessage, function (err) {})
                                                }
                                            }
                                        })

                                    } else {

                                        const sendMessagesArgs = {
                                            session: session.return,
                                            smsMessageMultiLang: {
                                                sender: process.env.SMS_GTWY_SENDER_MASK,
                                                message: smsMessageBody,
                                                recipients: patientPhoneNo,                                                
                                                messageType: process.env.SMS_GTWY_MESSAGE_TYPE
                                            }
                                        }
                                
                                        client.sendMessagesMultiLang(sendMessagesArgs, function(err, result) {
                                            if(err) {
                                                logMessage = `Error (getAllComm_PreLang_OTH_315): ${err} \n`
                                                console.log(logMessage)
                                                fs.appendFile(logFileName, logMessage, function (err) {})
                                            } else {
                                                // console.log('sendMessage')
                                                console.log(result.return); // <--- should get 200
        
                                                if(result.return == 200) {
                                                    // store in the db
                                                    // console.log("Sent");
                                                    logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS Sent to: ${patientPhoneNo} \n`
                                                    console.log(logMessage)
                                                    fs.appendFile(logFileName, logMessage, function (err) {})

                                                    logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS content: ${smsMessageBody} \n`
                                                    console.log(logMessage)
                                                    fs.appendFile(logFileName, logMessage, function (err) {})

                                                    //change CR status
                                                    const changeCommicationRequestStatus = async function(req, res) {

                                                        // console.log("Started closing CR");
                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Started Closing CR \n`
                                                        console.log(logMessage)
                                                        fs.appendFile(logFileName, logMessage, function (err) {})

                                                        const urlBody = '[{ "op": "replace", "path": "/status", "value": "active"},{ "op": "replace", "path": "/status", "value": "completed"}]'

                                                        const options = {
                                                            method: 'PATCH',
                                                            headers: {
                                                                'Content-Type': 'application/json-patch+json',
                                                                Authorization: ` Bearer ${accessToken}`
                                                            },
                                                            body: urlBody
                                                        }

                                                        const url = process.env.HAPI_BASE_URL + '/CommunicationRequest/' + commReqResourceId;

                                                        // console.log(url);
                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Updating CR on: ${url} \n`
                                                        console.log(logMessage)
                                                        fs.appendFile(logFileName, logMessage, function (err) {})

                                                        try {
                                                            logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Getting ServiceRequest Information \n`
                                                            console.log(logMessage)
                                                            fs.appendFile(logFileName, logMessage, function (err) {})
                                                    
                                                            const servReqCRResourceResponse = await fetch(url, options)
                                                            const servReqCRJsonResponse = await servReqCRResourceResponse.json();

                                                            console.log(servReqCRJsonResponse);
                                                            return servReqCRJsonResponse;
                                                            
                                                            // const commReqArray = jsonResponse.entry;

                                                        } catch(err) {
                                                            logMessage = `ERROR (getAllComm_PreLang_OTH_373), ${err} \n`
                                                            console.log(logMessage)
                                                            fs.appendFile(logFileName, logMessage, function (err) {})
                                                        }
                                                    }

                                                    changeCommicationRequestStatus();

                                                } else {
                                                    logMessage = `Error (getAllComm_PreLang_OTH_382): ${err} \n`
                                                    console.log(logMessage)
                                                    fs.appendFile(logFileName, logMessage, function (err) {})
                                                }
                                            }
                                        })

                                    }
                                    
                    
                                }
                            })
                        }
                    })
                }

                consolidatedData();


                // consolidatedData().then(x=>{
                //     console.log(x)
                // });


            });        

            // console.log(commReqIds);
            // return commReqIds;
        }

    } catch(err) {
        logMessage = `Error (getAllComm_getAllCommReq_411): ${err} \n`
        console.log(logMessage)
        fs.appendFile(logFileName, logMessage, function (err) {})
    }

}

/*
@TODO

Store the information on db (client name, facilityname, referraldate, nic, phn, phone number, smsgeneratedon, smsgenerateduser,  sessionId)

*/

const upcomingAppointmentReminder = async function(req, res) {

    const accessToken = await keycloak.accessToken.get();

    const options = {
        method: 'GET',
        headers: {
            Authorization: ` Bearer ${accessToken}`
        }
    }

    const url = process.env.HAPI_BASE_URL + '/ServiceRequest?status=active';


    // const commReqIds = [];

    try {
        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Checking active ServiceRequest \n`
        console.log(logMessage)
        fs.appendFile(logFileName, logMessage, function (err) {})

        const response = await fetch(url, options)
        const jsonResponse = await response.json();

        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Total Returned Resources: ${jsonResponse.total} \n`
        console.log(logMessage)
        fs.appendFile(logFileName, logMessage, function (err) {})

        if(jsonResponse.total > 0) {

            const servReqArray = jsonResponse.entry;

            // console.log(jsonResponse);

            servReqArray.forEach(servReqArrayItem => {

                let servReqStartDate = (servReqArrayItem.resource.occurrencePeriod.start).substring(0, 10);
                // console.log(servReqStartDate);

                process.env.TZ = 'Asia/Colombo'
                let tomorrowDate = new Date();
                tomorrowDate.setDate(tomorrowDate.getDate() + 1);
                tomorrowDate = tomorrowDate.toISOString().substring(0,10);

                // console.log(tomorrowDate);

                if(servReqStartDate == tomorrowDate) {
                    // console.log(servReqStartDate)
                    // console.log("true")

                    const servReqResourceId = servReqArrayItem.resource.id;
                    const facilityName = servReqArrayItem.resource.locationReference[0].display
                    const patientId = servReqArrayItem.resource.subject.reference;

                    // console.log(servReqResourceId);
                    // console.log(facilityName);

                    //Fetch Patient Resource
                    const getPatientResource = async function(req, res) {

                        const url = process.env.HAPI_BASE_URL + '/' + patientId;

                        try {
                            logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Getting Patient Information \n`
                            console.log(logMessage)
                            fs.appendFile(logFileName, logMessage, function (err) {})
                    
                            const patientResourceResponse = await fetch(url, options)
                            const patientJsonResponse = await patientResourceResponse.json();

                            // console.log(patientJsonResponse);
                            return patientJsonResponse;
                            
                            // const commReqArray = jsonResponse.entry;

                        } catch(err) {
                            logMessage = `Error (getAllComm_getPatientResource_501): ${err} \n`
                            console.log(logMessage)
                            fs.appendFile(logFileName, logMessage, function (err) {})
                        }
                    }

                    const consolidatedData = async function(req, res) {

                        const patientData = await getPatientResource();
                        // const serviceReqData = await getServiceRequestResource();
        
                        const prefLanguage = patientData.communication[0].language.coding[0].code;
                        const patientPhn = '('+patientData.identifier[0].value+')';
                        // const patientNic = patientData.identifier[1].value;
                        const patientName = patientData.name[0].given;
                        const patientPhoneNo = patientData.telecom[0].value;;
                        // const facilityName = serviceReqData.entry[0].resource.locationReference[0].display;
                        // const referralDate = (serviceReqData.entry[0].resource.occurrencePeriod.start).substring(0, 10);
        
                        if(patientData.identifier.find(o => o.use === 'usual')) {
                            patientNic = '('+patientData.identifier.find(o => o.use === 'usual').value+')';
                        } else {
                            patientNic = "";
                        }
        
                        const referralSmsTemplate = {
                            client_at_risk_and_referred: {
                                "en": "{clientName}, please visit the Healthy Lifestyle Centre at {facilityName} tomorrow for a full screening. Remember to bring this SMS with your NIC {nicNumber} and PHN {phnNumber} to the facility.",
                                "si": "{clientName}, කරුණාකර පූර්ණ සෞඛ්‍ය පරීක්ෂණය සඳහා හෙට දින {facilityName} එකෙහි ඇති සුව දිවි මධ්‍යස්ථානය වෙත යන මෙන් කාරුණිකව මතක් කර සිටිමු. ඔබ පැමිණෙන විට ඔබගේ හැ ඳුනුම්පත් අංකය {nicNumber}  සහ PHN අංකය {phnNumber} සමග පැ මිණ මෙම SMS පණිවිඩය ඉදිරිපත් කරන්න.",
                                "ta": "{clientName}, முழு சுகாதார பரிசோதனைக்காக, நாளை {facilityName} இல் உள்ள ஆரோக்கியமான வாழ்க்கைமுறை நிலையத்திற்கு செல்லவும். உங்கள் தேசிய அடையாள அட்டை {nicNumber} மற்றும் தனிப்பட்ட சுகாதார எண் {phnNumber} உடன் இந்த குறுஞ்செய்தியை எடுத்து செல்ல மறக்காதீர்கள்.",
                            }
                        }
        
                        if (prefLanguage == 'en') {
                            smsMessage = referralSmsTemplate.client_at_risk_and_referred.en
                        } else if (prefLanguage == 'si') {
                            smsMessage = referralSmsTemplate.client_at_risk_and_referred.si
                        } else if (prefLanguage == 'ta') {
                            smsMessage = referralSmsTemplate.client_at_risk_and_referred.ta
                        } else {
                            smsMessage = "";
                        }
        
                        smsMessage = smsMessage.replace('{clientName}', patientName)
                        smsMessage = smsMessage.replace('{facilityName}', facilityName)
                        // smsMessage = smsMessage.replace('{referralDate}', referralDate)
                        smsMessage = smsMessage.replace('{nicNumber}', patientNic)
                        smsMessage = smsMessage.replace('{phnNumber}', patientPhn)
        
                        const smsMessageBody = smsMessage;
        
                        // console.log(smsMessage);
        
                        // SEND SMS
                        
                        soap.createClient(process.env.SMS_GTWY_PROVIDER_URL, function(err, client) {
                            if(err) {
                                logMessage = `Error (getAllComm_Consolidate_Create_client_558): ${err} \n`
                                console.log(logMessage)
                                fs.appendFile(logFileName, logMessage, function (err) {})
                            } else {
                                
                                const createSessionArgs = {user: {username: process.env.SMS_GTWY_USERNAME, password: process.env.SMS_GTWY_PASSWORD}}
                        
                                client.createSession(createSessionArgs, function(err, result) {
                                    if(err) {
                                        logMessage = `Error (getAllComm_createSession_567): ${err} \n`
                                        console.log(logMessage)
                                        fs.appendFile(logFileName, logMessage, function (err) {})
                                    } else {
                                        // console.log('createSession')
                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS Session Initiated \n`
                                        console.log(logMessage)
                                        fs.appendFile(logFileName, logMessage, function (err) {})
                        
                                        const session =  result;
                                        // console.log(session);
        
                                        // console.log(smsMessageBody)
                                        
                                        
                                        if(prefLanguage === 'en') {

                                            const sendMessagesArgs = {
                                                session: session.return,
                                                smsMessage: {
                                                    sender: process.env.SMS_GTWY_SENDER_MASK,
                                                    message: smsMessageBody,
                                                    recipients: patientPhoneNo,                                                
                                                    messageType: process.env.SMS_GTWY_MESSAGE_TYPE
                                                }
                                            }
                                    
                                            client.sendMessages(sendMessagesArgs, function(err, result) {
                                                if(err) {
                                                    logMessage = `Error  (getAllComm_PreLang_EN_596): ${err} \n`
                                                    console.log(logMessage)
                                                    fs.appendFile(logFileName, logMessage, function (err) {})
                                                } else {
                                                    // console.log('sendMessage')
                                                    // console.log(result.return); // <--- should get 200
            
                                                    if(result.return == 200) {
                                                        // store in the db
                                                        // console.log("Sent");
                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS Sent to: ${patientPhoneNo} \n`
                                                        console.log(logMessage)
                                                        fs.appendFile(logFileName, logMessage, function (err) {})

                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS content: ${smsMessageBody} \n`
                                                        console.log(logMessage)
                                                        fs.appendFile(logFileName, logMessage, function (err) {})
                                                    } else {
                                                        logMessage = `Error (getAllComm_sendSMS_614): ${err} \n`
                                                        console.log(logMessage)
                                                        fs.appendFile(logFileName, logMessage, function (err) {})
                                                    }
                                                }
                                            })

                                        } else {

                                            const sendMessagesArgs = {
                                                session: session.return,
                                                smsMessageMultiLang: {
                                                    sender: process.env.SMS_GTWY_SENDER_MASK,
                                                    message: smsMessageBody,
                                                    recipients: patientPhoneNo,                                                
                                                    messageType: process.env.SMS_GTWY_MESSAGE_TYPE
                                                }
                                            }
                                    
                                            client.sendMessagesMultiLang(sendMessagesArgs, function(err, result) {
                                                if(err) {
                                                    logMessage = `Error  (getAllComm_PreLang_OTH_635): ${err} \n`
                                                    console.log(logMessage)
                                                    fs.appendFile(logFileName, logMessage, function (err) {})
                                                } else {
                                                    // console.log('sendMessage')
                                                    // console.log(result.return); // <--- should get 200
            
                                                    if(result.return == 200) {
                                                        // store in the db
                                                        // console.log("Sent");
                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS Sent to: ${patientPhoneNo} \n`
                                                        console.log(logMessage)
                                                        fs.appendFile(logFileName, logMessage, function (err) {})

                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS content: ${smsMessageBody} \n`
                                                        console.log(logMessage)
                                                        fs.appendFile(logFileName, logMessage, function (err) {})
                                                    } else {
                                                        logMessage = `Error (getAllComm_PreLang_OTH_653): \n`
                                                        console.log(logMessage)
                                                        fs.appendFile(logFileName, logMessage, function (err) {})
                                                    }
                                                }
                                            })

                                        }
                                    }
                                })
                            }
                        })
                    }
        
                    consolidatedData();

                }

            });

        }

    } catch(err) {
        logMessage = `Error (getAllComm_UpcomingApp_676): ${err} \n`
        console.log(logMessage)
        fs.appendFile(logFileName, logMessage, function (err) {})
    }

}


const missedAppointmentReminder = async function(req, res) {

    const accessToken = await keycloak.accessToken.get();

    const options = {
        method: 'GET',
        headers: {
            Authorization: ` Bearer ${accessToken}`
        }
    }

    const url = process.env.HAPI_BASE_URL + '/ServiceRequest?status=active';


    // const commReqIds = [];

    try {
        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Checking active ServiceRequest \n`
        console.log(logMessage)
        fs.appendFile(logFileName, logMessage, function (err) {})

        const response = await fetch(url, options)
        const jsonResponse = await response.json();

        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Total Returned Resources: ${jsonResponse.total} \n`
        console.log(logMessage)
        fs.appendFile(logFileName, logMessage, function (err) {})

        if(jsonResponse.total > 0) {

            const servReqArray = jsonResponse.entry;

            // console.log(jsonResponse);

            servReqArray.forEach(servReqArrayItem => {

                let servReqStartDate = (servReqArrayItem.resource.occurrencePeriod.start).substring(0, 10);
                // console.log(servReqStartDate);

                //Tomorrow mentioned here is yesterday... HAHAHAH -1
                // process.env.TZ = 'Asia/Colombo'
                // let tomorrowDate = new Date();
                // tomorrowDate.setDate(tomorrowDate.getDate() - 1);
                // tomorrowDate = tomorrowDate.toISOString().substring(0,10);


                process.env.TZ = 'Asia/Colombo';
                let tomorrowDate = new Date();
                // tomorrowDate.setDate(tomorrowDate.getDate());
                tomorrowDate = tomorrowDate.toISOString().substring(0,10);

                console.log(tomorrowDate)


                // console.log(tomorrowDate);
                
                if(servReqStartDate == tomorrowDate) {
                    console.log(servReqStartDate)
                    // console.log("true")

                    const servReqResourceId = servReqArrayItem.resource.id;
                    const facilityName = servReqArrayItem.resource.locationReference[0].display
                    const patientId = servReqArrayItem.resource.subject.reference;

                    // console.log(servReqResourceId);
                    // console.log(facilityName);

                    //Fetch Patient Resource
                    const getPatientResource = async function(req, res) {

                        const url = process.env.HAPI_BASE_URL + '/' + patientId;

                        try {
                            logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Getting Patient Information \n`
                            console.log(logMessage)
                            fs.appendFile(logFileName, logMessage, function (err) {})
                    
                            const patientResourceResponse = await fetch(url, options)
                            const patientJsonResponse = await patientResourceResponse.json();

                            // console.log(patientJsonResponse);
                            return patientJsonResponse;
                            
                            // const commReqArray = jsonResponse.entry;

                        } catch(err) {
                            logMessage = `Error (getAllComm_getPatRes_770): ${err} \n`
                            console.log(logMessage)
                            fs.appendFile(logFileName, logMessage, function (err) {})
                        }
                    }

                    const consolidatedData = async function(req, res) {

                        const patientData = await getPatientResource();
                        // const serviceReqData = await getServiceRequestResource();
        
                        const prefLanguage = patientData.communication[0].language.coding[0].code;
                        const patientPhn = '('+patientData.identifier[0].value+')';
                        // const patientNic = patientData.identifier[1].value;
                        const patientName = patientData.name[0].given;
                        const patientPhoneNo = patientData.telecom[0].value;;
                        // const facilityName = serviceReqData.entry[0].resource.locationReference[0].display;
                        // const referralDate = (serviceReqData.entry[0].resource.occurrencePeriod.start).substring(0, 10);
        
                        // console.log(prefLanguage);
                        // console.log(patientId);
                        // console.log(servReqResourceId);

                        if(patientData.identifier.find(o => o.use === 'usual')) {
                            patientNic = '('+patientData.identifier.find(o => o.use === 'usual').value+')';
                        } else {
                            patientNic = "";
                        }
        
                        const referralSmsTemplate = {
                            client_at_risk_and_referred: {
                                "en": "You are late for the full screening at the Healthy Lifestyle Centre. {clientName}, Please visit the Healthy Lifestyle Centre at {facilityName} soon for a full screening. Remember to bring this SMS with your NIC {nicNumber} and PHN {phnNumber} to the facility.",
                                "si": "ඔබට සුව දිවි මධ්‍යස්ථානයේ සංවිධානය කර තිබූ පූර්ණ සෞඛ්‍ය පරීක්ෂණයට සහභාගී වීමට නොහැකි වී ඇත. {clientName} කරුණාකර හැකි ඉක්මනින් සුව දිවි මධ්‍යස්ථානයේ පූර්ණ සෞඛ්‍ය පරීක්‍ෂණය සඳහා සහභාගී වන්න. ඔබ පැමිණෙන විට ඔබගේ හැ ඳුනුම්පත් අංකය {nicNumber}  සහ PHN අංකය {phnNumber} සමග පැ මිණ මෙම SMS පණිවිඩය ඉදිරිපත් කරන්න.",
                                "ta": " ஆரோக்கியமான வாழ்க்கைமுறை நிலையத்தில் முழு சுகாதார பரிசோதனைக்கு தாமதமாகிவிட்டீர்கள். {clientName}, முழு சுகாதார பரிசோதனைக்காக விரைவில் {facilityName} இல் உள்ள ஆரோக்கியமான வாழ்க்கைமுறை நிலையத்திற்கு செல்லவும். உங்கள் தேசிய அடையாள அட்டை {nicNumber} மற்றும் தனிப்பட்ட சுகாதார எண் {phnNumber} உடன் இந்த குறுஞ்செய்தியை எடுத்து செல்ல மறக்காதீர்கள்.",
                            }
                        }
        
                        if (prefLanguage == 'en') {
                            smsMessage = referralSmsTemplate.client_at_risk_and_referred.en
                        } else if (prefLanguage == 'si') {
                            smsMessage = referralSmsTemplate.client_at_risk_and_referred.si
                        } else if (prefLanguage == 'ta') {
                            smsMessage = referralSmsTemplate.client_at_risk_and_referred.ta
                        } else {
                            smsMessage = "";
                        }
        
                        smsMessage = smsMessage.replace('{clientName}', patientName)
                        smsMessage = smsMessage.replace('{facilityName}', facilityName)
                        // smsMessage = smsMessage.replace('{referralDate}', referralDate)
                        smsMessage = smsMessage.replace('{nicNumber}', patientNic)
                        smsMessage = smsMessage.replace('{phnNumber}', patientPhn)
        
                        const smsMessageBody = smsMessage;
        
                        // console.log(smsMessage);
        
                        // SEND SMS
                        
                        soap.createClient(process.env.SMS_GTWY_PROVIDER_URL, function(err, client) {
                            if(err) {
                                logMessage = `Error (getAllComm_conso_createClient_831): ${err} \n`
                                console.log(logMessage)
                                fs.appendFile(logFileName, logMessage, function (err) {})
                            } else {
                                
                                const createSessionArgs = {user: {username: process.env.SMS_GTWY_USERNAME, password: process.env.SMS_GTWY_PASSWORD}}
                        
                                client.createSession(createSessionArgs, function(err, result) {
                                    if(err) {
                                        logMessage = `Error (getAllComm_createSession_840): ${err} \n`
                                        console.log(logMessage)
                                        fs.appendFile(logFileName, logMessage, function (err) {})
                                    } else {
                                        // console.log('createSession')
                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS Session Initiated \n`
                                        console.log(logMessage)
                                        fs.appendFile(logFileName, logMessage, function (err) {})
                        
                                        const session =  result;
                                        // console.log(session);
        
                                        // console.log(smsMessageBody)

                                        if(prefLanguage === 'en') {

                                            const sendMessagesArgs = {
                                                session: session.return,
                                                smsMessage: {
                                                    sender: process.env.SMS_GTWY_SENDER_MASK,
                                                    message: smsMessageBody,
                                                    recipients: patientPhoneNo,                                                
                                                    messageType: process.env.SMS_GTWY_MESSAGE_TYPE
                                                }
                                            }
                                    
                                            client.sendMessages(sendMessagesArgs, function(err, result) {
                                                if(err) {
                                                    logMessage = `Error (getAllComm_PreLang_EN_868): ${err} \n`
                                                    console.log(logMessage)
                                                    fs.appendFile(logFileName, logMessage, function (err) {})
                                                } else {
                                                    // console.log('sendMessage')
                                                    // console.log(result.return); // <--- should get 200
            
                                                    if(result.return == 200) {
                                                        // store in the db
                                                        // console.log("Sent");
                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS Sent to: ${patientPhoneNo} \n`
                                                        console.log(logMessage)
                                                        fs.appendFile(logFileName, logMessage, function (err) {})

                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS content: ${smsMessageBody} \n`
                                                        console.log(logMessage)
                                                        fs.appendFile(logFileName, logMessage, function (err) {})
                                                    } else {
                                                        logMessage = `Error  (getAllComm_sendSMS_886) \n`
                                                        console.log(logMessage)
                                                        fs.appendFile(logFileName, logMessage, function (err) {})
                                                    }
                                                }
                                            })

                                        } else {

                                            const sendMessagesArgs = {
                                                session: session.return,
                                                smsMessageMultiLang: {
                                                    sender: process.env.SMS_GTWY_SENDER_MASK,
                                                    message: smsMessageBody,
                                                    recipients: patientPhoneNo,                                                
                                                    messageType: process.env.SMS_GTWY_MESSAGE_TYPE
                                                }
                                            }
                                    
                                            client.sendMessagesMultiLang(sendMessagesArgs, function(err, result) {
                                                if(err) {
                                                    logMessage = `Error (getAllComm_PreLang_OTH_907): ${err} \n`
                                                    console.log(logMessage)
                                                    fs.appendFile(logFileName, logMessage, function (err) {})
                                                } else {
                                                    // console.log('sendMessage')
                                                    // console.log(result.return); // <--- should get 200
            
                                                    if(result.return == 200) {
                                                        // store in the db
                                                        // console.log("Sent");
                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS Sent to: ${patientPhoneNo} \n`
                                                        console.log(logMessage)
                                                        fs.appendFile(logFileName, logMessage, function (err) {})

                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS content: ${smsMessageBody} \n`
                                                        console.log(logMessage)
                                                        fs.appendFile(logFileName, logMessage, function (err) {})
                                                    } else {
                                                        logMessage = `Error  (missedAPP_sendSMS_925): \n`
                                                        console.log(logMessage)
                                                        fs.appendFile(logFileName, logMessage, function (err) {})
                                                    }
                                                }
                                            })

                                        }
                        
                                    }
                                })
                            }
                        })
                    }
        
                    consolidatedData();

                }

            });            

        }

    } catch(err) {
        logMessage = `Error (missedApp_950): ${err} \n`
        console.log(logMessage)
        fs.appendFile(logFileName, logMessage, function (err) {})
    }

}

app.get('/referredClients', (req, res) => {   

    getAllCommunicationRequest().then(x => {
        // Send the sms
    })

    res.send('loaded referredClients');    
    
})

//client who has appointment tomorrow
app.get('/upcomingAppointment', (req, res) => {

    upcomingAppointmentReminder().then(x => {
        // Send the sms
    })

    res.send('loaded clientsWithUpcomingAppointment')

});

//client who has missed the appointment
app.get('/missedAppointment', (req, res) => {

    missedAppointmentReminder().then(x => {
        // Send the sms
    })

    res.send('loaded clientsWithmissedAppointment')

});



//clients who has missed the appointment yesterday

cron.schedule('* * * * *', () => {
    console.log('test')
    logMessage = `LIVE: NODE service live, ${new Date().toLocaleString()} \n`
    console.log(logMessage)
    fs.appendFile(logFileName, logMessage, function (err) {})
});


app.listen(process.env.PORT, () => {
    (process.env.NODE_ENV !== 'prod') ? console.log(`Listening on port ${process.env.PORT}`): ''
})