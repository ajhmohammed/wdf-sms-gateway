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
        fs.appendFile(logFileName, logMessage, function (err) {})

        const response = await fetch(url, options)
        const jsonResponse = await response.json();

        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Total Returned Resources: ${jsonResponse.total} \n`
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
                    fs.appendFile(logFileName, logMessage, function (err) {})
            
                    const patientResourceResponse = await fetch(url, options)
                    const patientJsonResponse = await patientResourceResponse.json();

                    // console.log(patientJsonResponse);
                    return patientJsonResponse;
                    
                    // const commReqArray = jsonResponse.entry;

                } catch(err) {
                    logMessage = `ERROR ', ${err} \n`
                    fs.appendFile(logFileName, logMessage, function (err) {})
                }
            }

            //Fetch ServiceRequest Resource
            const getServiceRequestResource = async function(req, res) {

                const url = process.env.HAPI_BASE_URL + '/ServiceRequest?subject=' + patientId;

                try {
                    logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Getting ServiceRequest Information \n`
                    fs.appendFile(logFileName, logMessage, function (err) {})
            
                    const servReqResourceResponse = await fetch(url, options)
                    const servReqJsonResponse = await servReqResourceResponse.json();

                    // console.log(servReqJsonResponse);
                    return servReqJsonResponse;
                    
                    // const commReqArray = jsonResponse.entry;

                } catch(err) {
                    logMessage = `ERROR, ${err} \n`
                    fs.appendFile(logFileName, logMessage, function (err) {})
                }
            }

            const consolidatedData = async function(req, res) {

                const patientData = await getPatientResource();
                const serviceReqData = await getServiceRequestResource();

                const prefLanguage = patientData.communication[0].language.coding[0].code;
                const patientPhn = '('+patientData.identifier[0].value+')';
                // const patientNic = patientData.identifier[1].value;
                const patientName = patientData.name[0].given;
                const patientPhoneNo = patientData.telecom[0].value;;
                const facilityName = serviceReqData.entry[0].resource.locationReference[0].display;
                const referralDate = (serviceReqData.entry[0].resource.occurrencePeriod.start).substring(0, 10);

                if(patientData.identifier[1]) {
                    patientNic = '('+patientData.identifier[1].value+')';
                } else {
                    patientNic = "";
                }

                const referralSmsTemplate = {
                    client_at_risk_and_referred: {
                        "en": "{clientName}, please visit the Healthy Lifestyle Centre at {facilityName} on {referralDate} for a full screening. Remember to bring this SMS with your NIC {nicNumber} and PHN {phnNumber} to the facility.",
                        "si": "{clientName}, සම්පූර්ණ පරීක්‍ෂණයක් සඳහා කරුණාකර {referralDate} වන දින {facilityName} සෞඛ්‍ය සම්පන්න ජීවන රටා මධ්‍යස්ථානය වෙත පිවිසෙන්න. ඔබගේ NIC {nicNumber} සහ PHN {phnNumber} සමඟ මෙම SMS පහසුකම වෙත ගෙන ඒමට මතක තබා ගන්න.",
                        "ta": "{clientName}, முழுத் திரையிடலுக்கு {referralDate} அன்று {facilityName} உள்ள ஆரோக்கியமான வாழ்க்கை முறை மையத்தைப் பார்வையிடவும். உங்கள் NIC {nicNumber} மற்றும் PHN {phnNumber} உடன் இந்த SMS ஐ வசதிக்கு கொண்டு வர நினைவில் கொள்ளுங்கள்.",
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
                        logMessage = `Error: ${err} \n`
                        fs.appendFile(logFileName, logMessage, function (err) {})
                    } else {
                        
                        const createSessionArgs = {user: {username: process.env.SMS_GTWY_USERNAME, password: process.env.SMS_GTWY_PASSWORD}}
                
                        client.createSession(createSessionArgs, function(err, result) {
                            if(err) {
                                logMessage = `Error: ${err} \n`
                                fs.appendFile(logFileName, logMessage, function (err) {})
                            } else {
                                // console.log('createSession')
                                logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS Session Initiated \n`
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
                                            logMessage = `Error: ${err} \n`
                                            fs.appendFile(logFileName, logMessage, function (err) {})
                                        } else {
                                            // console.log('sendMessage')
                                            // console.log(result.return); // <--- should get 200
    
                                            if(result.return == 200) {
                                                // store in the db
                                                // console.log("Sent");
                                                logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS Sent to: ${patientPhoneNo} \n`
                                                fs.appendFile(logFileName, logMessage, function (err) {})

                                                logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS content: ${smsMessageBody} \n`
                                                fs.appendFile(logFileName, logMessage, function (err) {})

                                                //change CR status
                                                const changeCommicationRequestStatus = async function(req, res) {

                                                    const urlBody = [
                                                        { "op": "test", "path": "/status", "value": "active" },
                                                        { "op": "replace", "path": "/status", "value": "completed" }
                                                    ];

                                                    const options = {
                                                        method: 'PATCH',
                                                        headers: {
                                                            "Content-Type": `application/json-patch+json`,
                                                            Authorization: ` Bearer ${accessToken}`
                                                        },
                                                        body: {
                                                            urlBody
                                                        }
                                                    }

                                                    const url = process.env.HAPI_BASE_URL + '/CommunicationRequest/' + commReqResourceId;

                                                    try {
                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Getting ServiceRequest Information \n`
                                                        fs.appendFile(logFileName, logMessage, function (err) {})
                                                
                                                        const servReqResourceResponse = await fetch(url, options)
                                                        const servReqJsonResponse = await servReqResourceResponse.json();

                                                        // console.log(servReqJsonResponse);
                                                        return servReqJsonResponse;
                                                        
                                                        // const commReqArray = jsonResponse.entry;

                                                    } catch(err) {
                                                        logMessage = `ERROR, ${err} \n`
                                                        fs.appendFile(logFileName, logMessage, function (err) {})
                                                    }
                                                }

                                            } else {
                                                logMessage = `Error: ${err} \n`
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
                                            logMessage = `Error: ${err} \n`
                                            fs.appendFile(logFileName, logMessage, function (err) {})
                                        } else {
                                            // console.log('sendMessage')
                                            // console.log(result.return); // <--- should get 200
    
                                            if(result.return == 200) {
                                                // store in the db
                                                // console.log("Sent");
                                                logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS Sent to: ${patientPhoneNo} \n`
                                                fs.appendFile(logFileName, logMessage, function (err) {})

                                                logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS content: ${smsMessageBody} \n`
                                                fs.appendFile(logFileName, logMessage, function (err) {})

                                                //change CR status
                                                const changeCommicationRequestStatus = async function(req, res) {

                                                    const urlBody = [
                                                        { "op": "test", "path": "/status", "value": "active" },
                                                        { "op": "replace", "path": "/status", "value": "completed" }
                                                    ];

                                                    const options = {
                                                        method: 'PATCH',
                                                        headers: {
                                                            "Content-Type": `application/json-patch+json`,
                                                            Authorization: ` Bearer ${accessToken}`
                                                        },
                                                        body: {
                                                            urlBody
                                                        }
                                                    }

                                                    const url = process.env.HAPI_BASE_URL + '/CommunicationRequest/' + commReqResourceId;

                                                    try {
                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Getting ServiceRequest Information \n`
                                                        fs.appendFile(logFileName, logMessage, function (err) {})
                                                
                                                        const servReqResourceResponse = await fetch(url, options)
                                                        const servReqJsonResponse = await servReqResourceResponse.json();

                                                        // console.log(servReqJsonResponse);
                                                        return servReqJsonResponse;
                                                        
                                                        // const commReqArray = jsonResponse.entry;

                                                    } catch(err) {
                                                        logMessage = `ERROR, ${err} \n`
                                                        fs.appendFile(logFileName, logMessage, function (err) {})
                                                    }
                                                }
                                            } else {
                                                logMessage = `Error: ${err} \n`
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
        logMessage = `Error: ${err} \n`
        fs.appendFile(logFileName, logMessage, function (err) {})
    }

}

/*
@TODO

Store the information on db (client name, facilityname, referraldate, nic, phn, phone number, smsgeneratedon, smsgenerateduser,  sessionId)

*/

app.get('/referredClients', (req, res) => {   

    getAllCommunicationRequest().then(x => {
        // Send the sms
    })

    res.send('loaded referredClients');    
    
})


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
        fs.appendFile(logFileName, logMessage, function (err) {})

        const response = await fetch(url, options)
        const jsonResponse = await response.json();

        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Total Returned Resources: ${jsonResponse.total} \n`
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
                            fs.appendFile(logFileName, logMessage, function (err) {})
                    
                            const patientResourceResponse = await fetch(url, options)
                            const patientJsonResponse = await patientResourceResponse.json();

                            // console.log(patientJsonResponse);
                            return patientJsonResponse;
                            
                            // const commReqArray = jsonResponse.entry;

                        } catch(err) {
                            logMessage = `Error: ${err} \n`
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
        
                        if(patientData.identifier[1]) {
                            patientNic = '('+patientData.identifier[1].value+')';
                        } else {
                            patientNic = "";
                        }
        
                        const referralSmsTemplate = {
                            client_at_risk_and_referred: {
                                "en": "{clientName}, please visit the Healthy Lifestyle Centre at {facilityName} tomorrow for a full screening. Remember to bring this SMS with your NIC {nicNumber} and PHN {phnNumber} to the facility.",
                                "si": "{clientName}, කරුණාකර සම්පූර්ණ දර්ශනයක් සඳහා හෙට {facilityName} හි සෞඛ්‍ය සම්පන්න ජීවන රටා මධ්‍යස්ථානය වෙත පිවිසෙන්න. ඔබගේ NIC {nicNumber} සහ PHN {phnNumber} සමඟ මෙම SMS පහසුකම වෙත ගෙන ඒමට මතක තබා ගන්න.",
                                "ta": "{clientName}, முழுத் திரையிடலுக்கு, நாளை {facilityName} இல் உள்ள ஆரோக்கியமான வாழ்க்கை முறை மையத்தைப் பார்வையிடவும். உங்கள் NIC {nicNumber} மற்றும் PHN {phnNumber} உடன் இந்த SMS ஐ வசதிக்கு கொண்டு வர நினைவில் கொள்ளுங்கள்.",
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
                                logMessage = `Error: ${err} \n`
                                fs.appendFile(logFileName, logMessage, function (err) {})
                            } else {
                                
                                const createSessionArgs = {user: {username: process.env.SMS_GTWY_USERNAME, password: process.env.SMS_GTWY_PASSWORD}}
                        
                                client.createSession(createSessionArgs, function(err, result) {
                                    if(err) {
                                        logMessage = `Error: ${err} \n`
                                        fs.appendFile(logFileName, logMessage, function (err) {})
                                    } else {
                                        // console.log('createSession')
                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS Session Initiated \n`
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
                                                    logMessage = `Error: ${err} \n`
                                                    fs.appendFile(logFileName, logMessage, function (err) {})
                                                } else {
                                                    // console.log('sendMessage')
                                                    // console.log(result.return); // <--- should get 200
            
                                                    if(result.return == 200) {
                                                        // store in the db
                                                        // console.log("Sent");
                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS Sent to: ${patientPhoneNo} \n`
                                                        fs.appendFile(logFileName, logMessage, function (err) {})

                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS content: ${smsMessageBody} \n`
                                                        fs.appendFile(logFileName, logMessage, function (err) {})
                                                    } else {
                                                        logMessage = `Error: ${err} \n`
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
                                                    logMessage = `Error: ${err} \n`
                                                    fs.appendFile(logFileName, logMessage, function (err) {})
                                                } else {
                                                    // console.log('sendMessage')
                                                    // console.log(result.return); // <--- should get 200
            
                                                    if(result.return == 200) {
                                                        // store in the db
                                                        // console.log("Sent");
                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS Sent to: ${patientPhoneNo} \n`
                                                        fs.appendFile(logFileName, logMessage, function (err) {})

                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS content: ${smsMessageBody} \n`
                                                        fs.appendFile(logFileName, logMessage, function (err) {})
                                                    } else {
                                                        logMessage = `Error: \n`
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
        logMessage = `Error: ${err} \n`
        fs.appendFile(logFileName, logMessage, function (err) {})
    }

}

//client who has appointment tomorrow
app.get('/upcomingAppointment', (req, res) => {

    upcomingAppointmentReminder().then(x => {
        // Send the sms
    })

    res.send('loaded clientsWithUpcomingAppointment')

});



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
        fs.appendFile(logFileName, logMessage, function (err) {})

        const response = await fetch(url, options)
        const jsonResponse = await response.json();

        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t Total Returned Resources: ${jsonResponse.total} \n`
        fs.appendFile(logFileName, logMessage, function (err) {})

        if(jsonResponse.total > 0) {

            const servReqArray = jsonResponse.entry;

            // console.log(jsonResponse);

            servReqArray.forEach(servReqArrayItem => {

                let servReqStartDate = (servReqArrayItem.resource.occurrencePeriod.start).substring(0, 10);
                // console.log(servReqStartDate);

                //Tomorrow mentioned here is yesterday... HAHAHAH -1
                process.env.TZ = 'Asia/Colombo'
                let tomorrowDate = new Date();
                tomorrowDate.setDate(tomorrowDate.getDate() - 1);
                tomorrowDate = tomorrowDate.toISOString().substring(0,10);

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
                            fs.appendFile(logFileName, logMessage, function (err) {})
                    
                            const patientResourceResponse = await fetch(url, options)
                            const patientJsonResponse = await patientResourceResponse.json();

                            // console.log(patientJsonResponse);
                            return patientJsonResponse;
                            
                            // const commReqArray = jsonResponse.entry;

                        } catch(err) {
                            logMessage = `Error: ${err} \n`
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

                        if(patientData.identifier[1]) {
                            patientNic = '('+patientData.identifier[1].value+')';
                        } else {
                            patientNic = "";
                        }
        
                        const referralSmsTemplate = {
                            client_at_risk_and_referred: {
                                "en": "You are late for the full screening at the Healthy Lifestyle Centre. {clientName}, Please visit the Healthy Lifestyle Centre at {facilityName} soon for a full screening. Remember to bring this SMS with your NIC {nicNumber} and PHN {phnNumber} to the facility.",
                                "si": "සෞඛ්‍ය සම්පන්න ජීවන රටා මධ්‍යස්ථානයේ සම්පූර්ණ දර්ශනය සඳහා ඔබ ප්‍රමාදයි. {clientName}, සම්පූර්ණ පිරික්සීමක් සඳහා කරුණාකර ඉක්මනින් {facilityName} හි සෞඛ්‍ය සම්පන්න ජීවන රටා මධ්‍යස්ථානය වෙත පිවිසෙන්න. ඔබගේ NIC {nicNumber} සහ PHN {phnNumber} සමඟ මෙම SMS පහසුකම වෙත ගෙන ඒමට මතක තබා ගන්න.",
                                "ta": "ஆரோக்கியமான வாழ்க்கை முறை மையத்தில் முழுத் திரையிடலுக்கு தாமதமாகிவிட்டீர்கள். {clientName}, முழுத் திரையிடலுக்கு விரைவில் {facilityName} இல் உள்ள ஆரோக்கியமான வாழ்க்கை முறை மையத்தைப் பார்வையிடவும். உங்கள் NIC {nicNumber} மற்றும் PHN {phnNumber} உடன் இந்த SMS ஐ வசதிக்கு கொண்டு வர நினைவில் கொள்ளுங்கள்.",
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
                                logMessage = `Error: ${err} \n`
                                fs.appendFile(logFileName, logMessage, function (err) {})
                            } else {
                                
                                const createSessionArgs = {user: {username: process.env.SMS_GTWY_USERNAME, password: process.env.SMS_GTWY_PASSWORD}}
                        
                                client.createSession(createSessionArgs, function(err, result) {
                                    if(err) {
                                        logMessage = `Error: ${err} \n`
                                        fs.appendFile(logFileName, logMessage, function (err) {})
                                    } else {
                                        // console.log('createSession')
                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS Session Initiated \n`
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
                                                    logMessage = `Error: ${err} \n`
                                                    fs.appendFile(logFileName, logMessage, function (err) {})
                                                } else {
                                                    // console.log('sendMessage')
                                                    // console.log(result.return); // <--- should get 200
            
                                                    if(result.return == 200) {
                                                        // store in the db
                                                        // console.log("Sent");
                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS Sent to: ${patientPhoneNo} \n`
                                                        fs.appendFile(logFileName, logMessage, function (err) {})

                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS content: ${smsMessageBody} \n`
                                                        fs.appendFile(logFileName, logMessage, function (err) {})
                                                    } else {
                                                        logMessage = `Error \n`
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
                                                    logMessage = `Error: ${err} \n`
                                                    fs.appendFile(logFileName, logMessage, function (err) {})
                                                } else {
                                                    // console.log('sendMessage')
                                                    // console.log(result.return); // <--- should get 200
            
                                                    if(result.return == 200) {
                                                        // store in the db
                                                        // console.log("Sent");
                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS Sent to: ${patientPhoneNo} \n`
                                                        fs.appendFile(logFileName, logMessage, function (err) {})

                                                        logMessage = `PROCESS: \t ${new Date().toLocaleString()} \t SMS content: ${smsMessageBody} \n`
                                                        fs.appendFile(logFileName, logMessage, function (err) {})
                                                    } else {
                                                        logMessage = `Error: \n`
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
        logMessage = `Error: ${err} \n`
        fs.appendFile(logFileName, logMessage, function (err) {})
    }

}

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
    fs.appendFile(logFileName, logMessage, function (err) {})
});


app.listen(process.env.PORT, () => {
    (process.env.NODE_ENV !== 'prod') ? console.log(`Listening on port ${process.env.PORT}`): ''
})