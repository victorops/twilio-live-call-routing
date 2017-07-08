// ==========================================================================
// Copyright 2017 VictorOps, Inc.
// https://github.com/victorops/twilio-live-call-routing/blob/master/LICENSE
// ==========================================================================

const qs = require('qs');
const got = require('got');

module.exports = {
  assignTeam,
  buildOnCallList,
  call,
  callOrMessage,
  handler,
  isHuman,
  leaveAMessage,
  main,
  postToVictorOps,
  teamsMenu
};


function handler(context, event, callback) {

  const {API_ID, API_KEY, REST_ENDPOINT_API_KEY, TWILIO_URL, NUMBER_OF_MENUS} = context;
  const {payloadString, To} = event;
  const payload = typeof payloadString === 'undefined' ? {} : JSON.parse(payloadString);
  const {runFunction} = payload;
  let {ALERT_HOST, API_HOST, voice} = context;
  context.ALERT_HOST = typeof ALERT_HOST === 'undefined' ? 'alert.victorops.com' : ALERT_HOST;
  context.API_HOST = typeof API_HOST === 'undefined' ? 'api.victorops.com' : API_HOST;
  payload.voice = (voice === 'alice' || voice === 'man') ? voice : 'woman';
  let {callerId} = payload;
  payload.callerId = typeof callerId === 'undefined' ? To : callerId;

  let twiml = new Twilio.twiml.VoiceResponse();

  if (requiredConfigsExist(context)) {
    main(twiml, context, event, payload)
    .then(result => callback(null, result))
    .catch(err => console.log(err));
  } else {
    twiml.say({voice}, 'There is a missing configuration value. Please contact your administrator to fix the problem.');

    callback(null, twiml);
  }

}


function requiredConfigsExist(context) {

  const {API_ID, API_KEY, REST_ENDPOINT_API_KEY, TWILIO_URL} = context;

  if (typeof API_ID === 'undefined' || typeof API_KEY === 'undefined' || typeof REST_ENDPOINT_API_KEY === 'undefined' || typeof TWILIO_URL === 'undefined') {
    return false;
  } else {
    return true;
  }

}


function main(twiml, context, event, payload) {

  const {NUMBER_OF_MENUS} = context;
  const {runFunction} = payload;

  if (typeof runFunction === 'undefined') {
    switch (NUMBER_OF_MENUS) {
      case '0':
      case '1':
        return teamsMenu(twiml, context, event, payload);
        break;
      default:
        return callOrMessage(twiml, context, payload);
        break;
    }
  }

  switch (runFunction) {
    case 'teamsMenu':
      return teamsMenu(twiml, context, event, payload);
      break;
    case 'assignTeam':
      return assignTeam(twiml, context, event, payload);
      break;
    case 'buildOnCallList':
      return buildOnCallList(twiml, context, payload);
      break;
    case 'call':
      return call(twiml, context, event, payload);
      break;
    case 'isHuman':
      return isHuman(twiml, context, event, payload);
      break;
    case 'leaveAMessage':
      return leaveAMessage(twiml, context, event, payload);
      break;
    case 'postToVictorOps':
      return postToVictorOps(event, context, payload);
      break;
    default:
      return new Promise((resolve, reject) => reject('No function was called.'));
      break;
  }

}


function callOrMessage(twiml, context, payload) {

  return new Promise((resolve, reject) => {

    const {callerId, voice} = payload;

    twiml.gather({
      input: 'dtmf',
      timeout: 10,
      action: generateCallbackURI(context, {callerId, runFunction: 'teamsMenu'}),
      numDigits: 1
    })
    .say({voice}, 'Welcome to Victor Ops Live Call Routing. Please press 1 to reach an on-call representative or press 2 to leave a message. Press zero to repeat this menu.');
    twiml.say({voice}, 'We did not receive a response. Goodbye.');
    
    resolve(twiml);

  });

}


function generateCallbackURI(context, json) {

  const {TWILIO_URL} = context;
  const payloadString = JSON.stringify(json);

  return `${TWILIO_URL}/victorops?${qs.stringify({payloadString})}`;

}


function teamsMenu(twiml, context, event, payload) {

  return new Promise((resolve, reject) => {

    const {API_HOST, API_ID, API_KEY, NUMBER_OF_MENUS, TEAM_1} = context;
    const {Digits} = event;
    const {callerId, voice} = payload;
    let {goToVM} = payload;

    if (Digits === '0') {
      twiml.redirect(generateCallbackURI(context, {callerId}));
      resolve(twiml);
    } else {

      got(`https://${API_HOST}/api-public/v1/team`, {
        headers: {
          'Content-Type': 'application/json',
          'X-VO-Api-Key': API_KEY,
          'X-VO-Api-Id': API_ID
        }
      })
      .then(response => {

        let teamsArray;

        if (Digits === '2') {
          goToVM = 'yes';
        }

        if (typeof TEAM_1 === 'undefined') {
          teamsArray = JSON.parse(response.body).map(team => {return {name: team.name, slug: team.slug};});
        } else {
          teamsArray = buildManualTeamList(1);
        }

        if (teamsArray.length === 0) {
          twiml.say({voice}, 'There was an error retrieving the list of teams for your organization. Goodbye.');
        } else if (teamsArray.length === 1 || NUMBER_OF_MENUS === '0') {
          teamsArray = [teamsArray[0]];
          twiml.redirect(generateCallbackURI(context, {callerId, goToVM, runFunction: 'assignTeam', teamsArray}));
        } else {
          let menuPrompt = 'Please press';

          teamsArray.forEach((team, i, array) => {
            menuPrompt += ` ${i + 1} for ${team.name}.`;
          });

          if (NUMBER_OF_MENUS === '1') {
            menuPrompt = `Welcome to Victor Ops Live Call Routing. ${menuPrompt}`;
          }

          twiml.gather({
            input: 'dtmf',
            timeout: 5,
            action: generateCallbackURI(context, {callerId, goToVM, runFunction: 'assignTeam', teamsArray}),
            numDigits: teamsArray.length.toString().length
          })
          .say({voice}, `${menuPrompt} Press zero to repeat this menu.`);
          twiml.say({voice}, 'We did not receive a response. Goodbye.');
        }

        resolve(twiml);

      })
      .catch(err => {

        console.log(err);
        twiml.say({voice}, 'There was an error retrieving the list of teams for your organization. Goodbye.');
        
        resolve(twiml);

      });

    }

  });

}


function buildManualTeamList(teamNumber, arrayOfTeams = []) {

  const key = 'TEAM_' + teamNumber;

  if (typeof context[key] === 'undefined') {
    return arrayOfTeams;
  }

  const newArray = arrayOfTeams.slice();
  const name = context[key];
  const slug = context[key].toLowerCase().replace(/[^a-z0-9-~_]/g, '-');

  newArray.push({name, slug});

  return buildManualTeamList(teamNumber + 1, newArray);

}


function assignTeam(twiml, context, event, payload) {

  return new Promise((resolve, reject) => {

    const {Digits} = event;
    const {callerId, goToVM, voice} = payload;

    if (Digits === '0') {
      twiml.redirect(generateCallbackURI(context, {callerId, goToVM, runFunction: 'teamsMenu'}));
    } else {
      let {teamsArray} = payload;

      if (goToVM === 'yes') {

        if (teamsArray.length === 1) {
          twiml.redirect(generateCallbackURI(context, {callerId, goToVM, runFunction: 'leaveAMessage', teamsArray}));
        } else if (Digits <= teamsArray.length) {
          teamsArray = [teamsArray[Digits - 1]];
          twiml.redirect(generateCallbackURI(context, {callerId, goToVM, runFunction: 'leaveAMessage', teamsArray}));
        } else {
          twiml.say({voice}, 'We did not receive a valid response. Goodbye.');
        }

      } else if (teamsArray.length === 1) {
        twiml.redirect(generateCallbackURI(context, {callerId, goToVM, runFunction: 'buildOnCallList', teamsArray}));
      } else if (Digits <= teamsArray.length) {
        teamsArray = [teamsArray[Digits - 1]];
        twiml.redirect(generateCallbackURI(context, {callerId, goToVM, runFunction: 'buildOnCallList', teamsArray}));
      } else {
        twiml.say({voice}, 'We did not receive a valid response. Goodbye.');
      }

    }

    resolve(twiml);

  });

}


function buildOnCallList(twiml, context, payload) {

  return new Promise((resolve, reject) => {

    const {NUMBER_OF_MENUS} = context;
    const {callerId, teamsArray, voice} = payload;

    const escPolicyUrlArray = createEscPolicies(context, teamsArray[0].slug);
    const phoneNumberArray = escPolicyUrlArray.map(url => getPhoneNumbers(context, url));

    Promise.all(phoneNumberArray).then(phoneNumbers => {

      phoneNumbers = phoneNumbers.filter(phoneNumber => phoneNumber !== false);

      let message = `We are connecting you to the representative on-call for the ${teamsArray[0].name} team - Please hold`;

      if (NUMBER_OF_MENUS === '0') {
        message = `Welcome to Victor Ops Live Call Routing. ${message}`;
      }

      if (phoneNumbers.length === 0) {
        twiml.redirect(generateCallbackURI(context, {phoneNumbers, runFunction: 'leaveAMessage', teamsArray}));
      } else {
        twiml.say({voice}, message);
        twiml.redirect(generateCallbackURI(context, {callerId, firstCall: 'yes', phoneNumbers, runFunction: 'call', teamsArray}));
      }

      resolve(twiml);

    }).catch(err => {

      console.log(err);
      twiml.say({voice}, 'There was an error retrieving the on-call phone numbers. Please try again.');
      
      resolve(twiml);

    });

  });

}


function createEscPolicies(context, teamSlug) {

  const {API_HOST} = context;
  const onCallUrl = `https://${API_HOST}/api-public/v1/team/${teamSlug}/oncall/schedule?step=`;
  const arrayOfUrls = [];

  for (var i = 0; i <= 2; i++) {
    arrayOfUrls.push(`${onCallUrl}${i}`);
  }

  return arrayOfUrls;

}


function getPhoneNumbers(context, escPolicyUrl) {

  return new Promise((resolve, reject) => {

    const {API_HOST, API_ID, API_KEY} = context;

    got(escPolicyUrl, {
      headers: {
        'Content-Type': 'application/json',
        'X-VO-Api-Key': API_KEY,
        'X-VO-Api-Id': API_ID
      }
    })
    .then(response => {

      const body = JSON.parse(response.body);
      const {schedule} = body;
      const onCallArray = [];

      schedule.forEach((rotation, i, array) => {

        let user;

        if (typeof rotation.onCall !== 'undefined') {

          if (typeof rotation.overrideOnCall !== 'undefined') {
            onCallArray.push(rotation.overrideOnCall);
          } else {
            onCallArray.push(rotation.onCall);
          }

        }
        
      });

      if (onCallArray.length === 0) {
        return resolve(false);
      }

      const randomIndex = Math.floor(Math.random() * onCallArray.length);

      got(`https://${API_HOST}/api-public/v1/user/${onCallArray[randomIndex]}/contact-methods/phones`, {
        headers: {
          'Content-Type': 'application/json',
          'X-VO-Api-Key': API_KEY,
          'X-VO-Api-Id': API_ID
        }
      })
      .then(response => {

        const body = JSON.parse(response.body);

        if (body.contactMethods.length === 0) {
          return resolve(false);
        } else {
          return resolve({phone: body.contactMethods[0].value, user: onCallArray[randomIndex]});
        }

      })
      .catch(err => {

        console.log('err', err);
        return reject(err);

      });
                  
    })
    .catch(err => {

      console.log(err);
      return reject(err);

    });

  });

}


function call(twiml, context, event, payload) {

  return new Promise((resolve, reject) => {

    const {TWILIO_URL} = context;
    const {DialCallStatus, From} = event;
    const {callerId, firstCall, goToVM, phoneNumbers, teamsArray, voice} = payload;
    let {detailedLog, realCallerId} = payload;
    let phoneNumber;

    if (DialCallStatus === 'completed') {
      twiml.say({voice}, 'The other party has disconnected. Goodbye.');
    } else {

      if (firstCall !== 'yes') {
        twiml.say({voice}, 'Trying next on-call representative');
      } else {
        realCallerId = From;
      }

      if (phoneNumbers.length === 1) {
        phoneNumber = phoneNumbers[0];
        detailedLog = `\n\n${From} calling ${phoneNumber.user}...${detailedLog || ''}`;
        twiml.dial(
          {
            action: generateCallbackURI(context, {callerId, goToVM, detailedLog, phoneNumber, phoneNumbers, realCallerId, runFunction: 'leaveAMessage', teamsArray}),
            callerId
          }
        ).number(
          {
            url: generateCallbackURI(context, {callerId, detailedLog, phoneNumber, phoneNumbers, runFunction: 'isHuman', teamsArray}),
            statusCallback: generateCallbackURI(context, {callerId, detailedLog, goToVM, phoneNumber, phoneNumbers, runFunction: 'postToVictorOps', teamsArray}),
            statusCallbackEvent: 'completed'
          },
          phoneNumber.phone
        );
      } else {
        phoneNumber = phoneNumbers[0];
        phoneNumbers.shift();
        detailedLog = `\n\n${From} calling ${phoneNumber.user}...${detailedLog || ''}`;
        twiml.dial(
          {
            action: generateCallbackURI(context, {callerId, detailedLog, phoneNumber, phoneNumbers, realCallerId, runFunction: 'call', teamsArray}),
            callerId
          }
        ).number(
          {
            url: generateCallbackURI(context, {callerId, detailedLog, phoneNumber, phoneNumbers, realCallerId, runFunction: 'isHuman', teamsArray}),
            statusCallback: generateCallbackURI(context, {callerId, detailedLog, phoneNumber, phoneNumbers, realCallerId, runFunction: 'postToVictorOps', teamsArray}),
            statusCallbackEvent: 'completed'
          },
          phoneNumber.phone
        );
      }

    }

    resolve(twiml);

  });

}


function isHuman(twiml, context, event, payload) {

  return new Promise((resolve, reject) => {

    const {TWILIO_URL} = context;
    const {Digits} = event;
    const {detailedLog, phoneNumber, phoneNumbers, realCallerId, teamsArray, voice} = payload;

    if (typeof Digits === 'undefined') {
      twiml.gather({
        input: 'dtmf',
        timeout: 5,
        action: generateCallbackURI(context, {detailedLog, phoneNumber, phoneNumbers, realCallerId, runFunction: 'isHuman', teamsArray}),
        numDigits: 1
      })
      .say({voice}, 'This is Victor Ops Live Call Routing. Press any key to connect.');
      twiml.say({voice}, 'We did not receive a response. Goodbye.');
      twiml.hangup();
    } else {
      twiml.say({voice}, 'You are now connected.');
      twiml.redirect(generateCallbackURI(context, {callAnsweredByHuman: 'yes', detailedLog, phoneNumber, phoneNumbers, realCallerId, runFunction: 'postToVictorOps', teamsArray}));
    }

    resolve(twiml);

  });

}


function leaveAMessage(twiml, context, event, payload) {

  return new Promise((resolve, reject) => {

    const {DialCallStatus} = event;
    const {callerId, detailedLog, goToVM, teamsArray, sayGoodbye, voice} = payload;

    if (DialCallStatus === 'completed') {
      twiml.say({voice}, 'The other party has disconnected. Goodbye.');
    } else if (sayGoodbye === 'yes') {
      twiml.say({voice}, 'Twilio will try to transcribe your message and create an incident in Victor Ops. Goodbye.');
    } else {
      let message = `Please leave a message for the ${teamsArray[0].name} team and hang up when you are finished.`

      if (goToVM !== 'yes') {
        message = `We were unable to reach an on-call representative. ${message}`;
      }

      twiml.say({voice}, message);
      twiml.record({
          transcribe: true,
          transcribeCallback: generateCallbackURI(context, {callerId, detailedLog, goToVM, runFunction: 'postToVictorOps', teamsArray}),
          timeout: 10,
          action: generateCallbackURI(context, {callerId, detailedLog, runFunction: 'leaveAMessage', sayGoodbye: 'yes', teamsArray})
        });
    }

    resolve(twiml);

  });

}


function postToVictorOps(event, context, payload) {

  return new Promise((resolve, reject) => {

    const {ALERT_HOST, REST_ENDPOINT_API_KEY} = context;
    const {CallSid, CallStatus, CallDuration, TranscriptionStatus, TranscriptionText} = event;
    const {callAnsweredByHuman, detailedLog, goToVM, phoneNumber, phoneNumbers, realCallerId, teamsArray} = payload;

    const alert = {
      monitoring_tool: 'Twilio',
      entity_id: CallSid,
      entity_display_name: 'Twilio Live Call Routing Details'
    };

    if (typeof TranscriptionText !== 'undefined' && TranscriptionText !== '') {
      alert.message_type = 'critical';
      alert.entity_display_name = goToVM === 'yes' ? `Twilio: message left for the ${teamsArray[0].name} team` : `Twilio: unable to reach on-call for ${teamsArray[0].name}`;
      alert.state_message = `Transcribed message from Twilio:\n${TranscriptionText}${detailedLog || ''}`;
    } else if (typeof TranscriptionText !== 'undefined') {
      alert.message_type = 'critical';
      alert.entity_display_name = goToVM === 'yes' ? `Twilio: message left for the ${teamsArray[0].name} team` : `Twilio: unable to reach on-call for ${teamsArray[0].name}`;
      alert.state_message = `Twilio was unable to transcribe message.${detailedLog || ''}`;
    } else if (callAnsweredByHuman === 'yes') {
      alert.message_type = 'acknowledgement';
      alert.state_message = `${phoneNumber.user} answered a call from ${realCallerId}.${detailedLog}`;
      alert.ack_author = phoneNumbers[0].user;
    } else if (CallStatus === 'completed' && TranscriptionStatus !== 'failed') {
      alert.message_type = 'recovery';
      alert.state_message = `${phoneNumber.user} answered a call from ${realCallerId} that lasted ${CallDuration} seconds.${detailedLog}`;
      alert.ack_author = phoneNumbers[0].user;
    } else {
      
      resolve('');
      
      return;
    }

    got.post(`https://${ALERT_HOST}/integrations/generic/20131114/alert/${REST_ENDPOINT_API_KEY}/${teamsArray[0].slug}`,
      {
        json: true,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(alert)
      }
    ).then(response => {

      resolve('');

    }).catch(err => {

      console.log(err);
      
      resolve('');

    });

  });

}