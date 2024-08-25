const soap = require('soap')
const logging = require('./logging')
const dotenv = require('dotenv');
const { response } = require('express');
dotenv.config();

const sendsms = async (isMultiLanguage, smsBody, smsPhone) => {


    var client = await soap.createClientAsync(process.env.SMS_GTWY_PROVIDER_URL).catch(error=> { 

        logging('Error', `Unable to communicate with the SMS Gateway provider ${error}`)
        return false;

    });

    if(client) {

        logging('Info', `Communication to SMS Gateway successfully established.`)

        const createSessionArgs = {user: {username: process.env.SMS_GTWY_USERNAME, password: process.env.SMS_GTWY_PASSWORD}}

        var createSession = await client.createSessionAsync(createSessionArgs);

        if(createSession && createSession[0].return !== null) {

            logging('Info', `SMS session has been Successfully created.`)
    
                const session =  createSession[0];
                    
                logging('Info', `Session Id: ${session.return.sessionId}, user: ${session.return.user}, isActive: ${session.return.isActive}, expiry: ${session.return.expiryDate}`)

                smsInfo = {
                    sender: process.env.SMS_GTWY_SENDER_MASK,
                    message: smsBody,
                    recipients: smsPhone,                                                
                    messageType: process.env.SMS_GTWY_MESSAGE_TYPE
                }
                    
                //Check whether it is multi language SMS (Sinhala / tamil)
                if(!isMultiLanguage) {

                    logging('Info', `Preparing to send an sms in English`)
                    
                    const sendMessagesArgs = {
                        session: session.return,
                        smsMessage: smsInfo
                    }

                    var sendMessage = await client.sendMessagesAsync(sendMessagesArgs);

                    if(sendMessage && sendMessage[0].return == 200) {

                        logging('Info', `Sms succesfully sent`)
                        logging('Info', `Sms sent to: ${smsPhone}`)
                        logging('Info', `Sms Body: ${smsBody}`)

                        return true;
                        
                    } else {

                        logging('Error', `Sending English text sms failed. Error code: ${sendMessage[0].return}`)
                        return false;

                    }
                    
                } else {

                    logging('Info', `Preparing to send an sms in Sinhala / Tamil`)

                    const sendMessagesArgs = {
                        session: session.return,
                        smsMessageMultiLang: smsInfo
                    }

                    var sendMessage = await client.sendMessagesMultiLangAsync(sendMessagesArgs);

                    if(sendMessage && sendMessage[0].return == 200) {

                        logging('Info', `Sms succesfully sent`)
                        logging('Info', `Sms sent to: ${smsPhone}`)
                        logging('Info', `Sms Body: ${smsBody}`)

                        return true;
                        
                    } else {

                        logging('Error', `Sending Multi Lang text sms failed. Error code: ${sendMessage[0].return}`)
                        return false;

                    }

                }

        } else {

            logging('Error', `Unable to create a session for sending an SMS (username / password not valid)`)
            return false;

        }

    }

}

module.exports = sendsms