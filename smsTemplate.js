/**
 * DOCS 
 * 
 * Use case example
 * 
    const smsTemplate = require('./smsTemplate');
    
    const message = smsTemplate('clinicDayBeforeAppointment', 'en', {
        clientName: 'John',
        facilityName: 'Healthy Centre',
        referralDate: '2025-08-07',
        nicNumber: '123456789V',
        phnNumber: 'PHN12345'
    });

    console.log(message);
    // Output: "John, please visit Healthy Centre on 2025-08-07 (tomorrow) for a blood pressure, sugar measure and medicines."
 */

const logging = require('./logging')

const smsTemplates = {
    communityReferredClient: {
        "en": "{clientName}, please visit the Healthy Lifestyle Centre at {facilityName} on {referralDate} for a full screening. Remember to bring this SMS with your NIC {nicNumber} and PHN {phnNumber} to the facility.",
        "si": "{clientName}, කරුණාකර {facilityName} එකෙහි ඇති සුව දිවි මඩ්‍යස්ථා නය වෙත {referralDate} දින පූර්ණ සෞඛ්‍ය පරීක්ෂණයක් කිරීම සඳහා ඔබගේ හැ ඳුනුම්පත් අංකය වන {nicNumber}  සහ PHN අංකය වන {phnNumber} සමග පැ මිණ මෙම SMS පණිවිඩය ඉදිරිපත් කරන්න.",
        "ta": "{clientName}, முழு சுகாதார பரிசோதனைக்காக {referralDate} அன்று {facilityName} இல் உள்ள ஆரோக்கியமான வாழ்க்கைமுறை நிலையத்திற்கு செல்லவும். உங்கள் தேசிய அடையாள அட்டை {nicNumber} மற்றும் தனிப்பட்ட சுகாதார எண் {phnNumber} உடன் இந்த குறுஞ்செய்தியை எடுத்து செல்ல மறக்காதீர்கள்.",
    },
    communityUpcomingAppointment: {
        "en": "{clientName}, please visit the Healthy Lifestyle Centre at {facilityName} tomorrow for a full screening. Remember to bring this SMS with your NIC {nicNumber} and PHN {phnNumber} to the facility.",
        "si": "{clientName}, කරුණාකර පූර්ණ සෞඛ්‍ය පරීක්ෂණය සඳහා හෙට දින {facilityName} එකෙහි ඇති සුව දිවි මධ්‍යස්ථානය වෙත යන මෙන් කාරුණිකව මතක් කර සිටිමු. ඔබ පැමිණෙන විට ඔබගේ හැ ඳුනුම්පත් අංකය {nicNumber}  සහ PHN අංකය {phnNumber} සමග පැ මිණ මෙම SMS පණිවිඩය ඉදිරිපත් කරන්න.",
        "ta": "{clientName}, முழு சுகாதார பரிசோதனைக்காக, நாளை {facilityName} இல் உள்ள ஆரோக்கியமான வாழ்க்கைமுறை நிலையத்திற்கு செல்லவும். உங்கள் தேசிய அடையாள அட்டை {nicNumber} மற்றும் தனிப்பட்ட சுகாதார எண் {phnNumber} உடன் இந்த குறுஞ்செய்தியை எடுத்து செல்ல மறக்காதீர்கள்.",
    },
    communityMissedAppointment: {
        "en": "You are late for the full screening at the Healthy Lifestyle Centre. {clientName}, Please visit the Healthy Lifestyle Centre at {facilityName} soon for a full screening. Remember to bring this SMS with your NIC {nicNumber} and PHN {phnNumber} to the facility.",
        "si": "ඔබට සුව දිවි මධ්‍යස්ථානයේ සංවිධානය කර තිබූ පූර්ණ සෞඛ්‍ය පරීක්ෂණයට සහභාගී වීමට නොහැකි වී ඇත. {clientName} කරුණාකර හැකි ඉක්මනින් සුව දිවි මධ්‍යස්ථානයේ පූර්ණ සෞඛ්‍ය පරීක්‍ෂණය සඳහා සහභාගී වන්න. ඔබ පැමිණෙන විට ඔබගේ හැ ඳුනුම්පත් අංකය {nicNumber}  සහ PHN අංකය {phnNumber} සමග පැ මිණ මෙම SMS පණිවිඩය ඉදිරිපත් කරන්න.",
        "ta": "ஆரோக்கியமான வாழ்க்கைமுறை நிலையத்தில் முழு சுகாதார பரிசோதனைக்கு தாமதமாகிவிட்டீர்கள். {clientName}, முழு சுகாதார பரிசோதனைக்காக விரைவில் {facilityName} இல் உள்ள ஆரோக்கியமான வாழ்க்கைமுறை நிலையத்திற்கு செல்லவும். உங்கள் தேசிய அடையாள அட்டை {nicNumber} மற்றும் தனிப்பட்ட சுகாதார எண் {phnNumber} உடன் இந்த குறுஞ்செய்தியை எடுத்து செல்ல மறக்காதீர்கள்.",
    },
    clinicBeforeAppointmentDay: {
        "en": "{clientName}, please visit {facilityName} on {referralDate} (tomorrow) for a blood pressure, sugar measure and medicines.",
        "si": "{clientName}, කරුණාකර {referralDate} (හෙට) දින {facilityName} වෙත පැමිණ රුධිර පීඩනය (BP), සීනි (Sugar) මැනීම සහ ඖෂධ ලබාගන්න.",
        "ta": "{clientName}, தயவுசெய்து நாளை ({referralDate}) {facilityName} இற்கு சென்று இரத்த அழுத்தம் (BP), சர்க்கரை அளவு பரிசோதனை மற்றும் மருந்துகளைப் பெறுங்கள்.",
    },
    clinicOnAppointmentDay: {
        "en": "We are expecting you today. {clientName}, please visit {facilityName} for a blood pressure, sugar measure and medicines.",
        "ta": "இன்று உங்களை எதிர்பார்க்கின்றோம். {clientName}, தயவுசெய்து {facilityName} சென்று இரத்த அழுத்தம் (BP), சக்கரை (Sugar) அளவு பரிசோதனை மற்றும் மருந்துகளைப் பெறுங்கள்.",
        "si": "අපි අද ඔබගේ පැමිණීම අපේක්ෂා කරමු. {clientName}, කරුණාකර {facilityName} වෙත පැමිණ රුධිර පීඩනය (BP), සීනි (Sugar) මැනීම සහ ඖෂධ ලබාගන්න.",
    },
    clinicMissedAppointment: {
        "en": "You are late for your medicines. {clientName}, please visit {facilityName} as soon as possible for a blood pressure, sugar measure and medicines.",
        "ta": "மருந்துகளுக்காக நீங்கள் தாமதமாகிவிட்டீர்கள். {clientName}, தயவுசெய்து விரைவாக {facilityName} சென்று இரத்த அழுத்தம் (BP), சக்கரை (Sugar) அளவு பரிசோதனை மற்றும் மருந்துகளைப் பெறுங்கள்.",
        "si": "ඔබේ ඖෂධ ලබා ගැනීම සඳහා ඔබ ප්‍රමාද වී ඇත. {clientName}, කරුණාකර ඉක්මනින් {facilityName} වෙත පැමිණ රුධිර පීඩනය (BP), සීනි (Sugar) මැනීම සහ ඖෂධ ලබාගන්න.",
    }
    
};

// Utility to render template with data
const renderTemplate = (templateStr, data = {}) => {
    return templateStr.replace(/\{(\w+)\}/g, (_, key) => data[key] || '');
};

const smsTemplate = (template, language, data = null) => {
    const templateObj = smsTemplates[template];

    if (!templateObj) {
        logging('Error', `Invalid template: ${template}`);
        return false;
    }

    // If language is valid, use that
    if (language && templateObj[language]) {
        const templateStr = templateObj[language];
        return data ? renderTemplate(templateStr, data) : templateStr;
    }

    // Otherwise, fallback: combine Sinhala + Tamil
    const combinedStr = `${templateObj['si']} ${templateObj['ta']}`;
    return data ? renderTemplate(combinedStr, data) : combinedStr;
};

module.exports = smsTemplate