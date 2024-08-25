const logging = require('./logging')

const smsTemplate = (template, language) => {

    const smsTemplate = {
        referredClient: {
            "en": "{clientName}, please visit the Healthy Lifestyle Centre at {facilityName} on {referralDate} for a full screening. Remember to bring this SMS with your NIC {nicNumber} and PHN {phnNumber} to the facility.",
            "si": "{clientName}, කරුණාකර {facilityName} එකෙහි ඇති සුව දිවි මඩ්‍යස්ථා නය වෙත {referralDate} දින පූර්ණ සෞඛ්‍ය පරීක්ෂණයක් කිරීම සඳහා ඔබගේ හැ ඳුනුම්පත් අංකය වන {nicNumber}  සහ PHN අංකය වන {phnNumber} සමග පැ මිණ මෙම SMS පණිවිඩය ඉදිරිපත් කරන්න.",
            "ta": "{clientName}, முழு சுகாதார பரிசோதனைக்காக {referralDate} அன்று {facilityName} இல் உள்ள ஆரோக்கியமான வாழ்க்கைமுறை நிலையத்திற்கு செல்லவும். உங்கள் தேசிய அடையாள அட்டை {nicNumber} மற்றும் தனிப்பட்ட சுகாதார எண் {phnNumber} உடன் இந்த குறுஞ்செய்தியை எடுத்து செல்ல மறக்காதீர்கள்.",
        },
        upcomingAppointement: {
            "en": "{clientName}, please visit the Healthy Lifestyle Centre at {facilityName} tomorrow for a full screening. Remember to bring this SMS with your NIC {nicNumber} and PHN {phnNumber} to the facility.",
            "si": "{clientName}, කරුණාකර පූර්ණ සෞඛ්‍ය පරීක්ෂණය සඳහා හෙට දින {facilityName} එකෙහි ඇති සුව දිවි මධ්‍යස්ථානය වෙත යන මෙන් කාරුණිකව මතක් කර සිටිමු. ඔබ පැමිණෙන විට ඔබගේ හැ ඳුනුම්පත් අංකය {nicNumber}  සහ PHN අංකය {phnNumber} සමග පැ මිණ මෙම SMS පණිවිඩය ඉදිරිපත් කරන්න.",
            "ta": "{clientName}, முழு சுகாதார பரிசோதனைக்காக, நாளை {facilityName} இல் உள்ள ஆரோக்கியமான வாழ்க்கைமுறை நிலையத்திற்கு செல்லவும். உங்கள் தேசிய அடையாள அட்டை {nicNumber} மற்றும் தனிப்பட்ட சுகாதார எண் {phnNumber} உடன் இந்த குறுஞ்செய்தியை எடுத்து செல்ல மறக்காதீர்கள்.",
        },
        missedAppointment: {
            "en": "You are late for the full screening at the Healthy Lifestyle Centre. {clientName}, Please visit the Healthy Lifestyle Centre at {facilityName} soon for a full screening. Remember to bring this SMS with your NIC {nicNumber} and PHN {phnNumber} to the facility.",
            "si": "ඔබට සුව දිවි මධ්‍යස්ථානයේ සංවිධානය කර තිබූ පූර්ණ සෞඛ්‍ය පරීක්ෂණයට සහභාගී වීමට නොහැකි වී ඇත. {clientName} කරුණාකර හැකි ඉක්මනින් සුව දිවි මධ්‍යස්ථානයේ පූර්ණ සෞඛ්‍ය පරීක්‍ෂණය සඳහා සහභාගී වන්න. ඔබ පැමිණෙන විට ඔබගේ හැ ඳුනුම්පත් අංකය {nicNumber}  සහ PHN අංකය {phnNumber} සමග පැ මිණ මෙම SMS පණිවිඩය ඉදිරිපත් කරන්න.",
            "ta": "ஆரோக்கியமான வாழ்க்கைமுறை நிலையத்தில் முழு சுகாதார பரிசோதனைக்கு தாமதமாகிவிட்டீர்கள். {clientName}, முழு சுகாதார பரிசோதனைக்காக விரைவில் {facilityName} இல் உள்ள ஆரோக்கியமான வாழ்க்கைமுறை நிலையத்திற்கு செல்லவும். உங்கள் தேசிய அடையாள அட்டை {nicNumber} மற்றும் தனிப்பட்ட சுகாதார எண் {phnNumber} உடன் இந்த குறுஞ்செய்தியை எடுத்து செல்ல மறக்காதீர்கள்.",
        }
    }

    if(template && (template == 'referredClient' || template == 'upcomingAppointement' || template == 'missedAppointment') 
        &&  language && (language == 'en' || language == 'si' || language == 'ta')) {

        return smsTemplate[template][language]

    } else {

        logging('Error', `Provided template or language is invalid or empty`)
        return false;

    }

}

module.exports = smsTemplate